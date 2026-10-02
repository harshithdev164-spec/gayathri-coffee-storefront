import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, lt, sql, sum, type SQL } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productVariantsTable, productsTable } from "@workspace/db";
import { AdminGetStatsQueryParams, AdminGetStatsResponse } from "@workspace/api-zod";
import { requireAdmin } from "../../middlewares/require-admin";

const router: IRouter = Router();
router.use(requireAdmin);

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LOW_STOCK_THRESHOLD = 10;

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function kpi(value: number, previousValue: number) {
  const deltaPct = previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : null;
  return { value, previousValue, deltaPct };
}

function nextDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d;
}

router.get("/stats", async (req, res) => {
  const parsed = AdminGetStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { from, to, granularity = "day" } = parsed.data;

  const fromDate = from ? new Date(from) : null;
  const toDateExclusive = to ? nextDay(to) : null;

  const rangeConditions: SQL[] = [];
  if (fromDate) rangeConditions.push(gte(ordersTable.createdAt, fromDate));
  if (toDateExclusive) rangeConditions.push(lt(ordersTable.createdAt, toDateExclusive));
  const rangeWhere = rangeConditions.length ? and(...rangeConditions) : undefined;

  // Previous period of equal length, immediately before `from` — only meaningful when both bounds are set.
  const prevWhere =
    fromDate && toDateExclusive
      ? and(
          gte(ordersTable.createdAt, new Date(fromDate.getTime() - (toDateExclusive.getTime() - fromDate.getTime()))),
          lt(ordersTable.createdAt, fromDate),
        )
      : undefined;

  const cityExpr = sql<string>`initcap(trim(${ordersTable.city}))`;
  const weekdayExpr = sql<number>`extract(dow from ${ordersTable.createdAt})`;
  const itemRevenueExpr = sql<number>`${orderItemsTable.priceSnapshot} * ${orderItemsTable.quantity}`;

  // Postgres requires a non-aggregated SELECT expression to match its GROUP BY /
  // ORDER BY expression exactly, and drizzle doesn't always render the same `sql`
  // fragment identically across select() vs groupBy()/orderBy() (column
  // qualification can differ). Bucketing through a subquery sidesteps that: the
  // outer query groups by a plain column reference, not a re-derived expression.
  const bucketSub = db
    .select({
      bucket: sql<string>`to_char(date_trunc(${granularity}, ${ordersTable.createdAt}), 'YYYY-MM-DD')`.as("bucket"),
      total: ordersTable.total,
    })
    .from(ordersTable)
    .where(rangeWhere)
    .as("bucketed_orders");

  const [
    [currentAgg],
    [prevAgg],
    [currentUnits],
    [prevUnits],
    timeSeriesRows,
    topProductsRows,
    statusRows,
    paymentRows,
    categoryRows,
    cityRows,
    weekdayRows,
    lowStockRows,
  ] = await Promise.all([
    db.select({ orders: count(), revenue: sum(ordersTable.total) }).from(ordersTable).where(rangeWhere),
    prevWhere
      ? db.select({ orders: count(), revenue: sum(ordersTable.total) }).from(ordersTable).where(prevWhere)
      : Promise.resolve([{ orders: 0, revenue: null }]),
    db
      .select({ units: sum(orderItemsTable.quantity) })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(rangeWhere),
    prevWhere
      ? db
          .select({ units: sum(orderItemsTable.quantity) })
          .from(orderItemsTable)
          .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
          .where(prevWhere)
      : Promise.resolve([{ units: null }]),
    db
      .select({ bucket: bucketSub.bucket, orders: count(), revenue: sum(bucketSub.total) })
      .from(bucketSub)
      .groupBy(bucketSub.bucket)
      .orderBy(asc(bucketSub.bucket)),
    db
      .select({ name: orderItemsTable.nameSnapshot, unitsSold: sum(orderItemsTable.quantity), revenue: sum(itemRevenueExpr) })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(rangeWhere)
      .groupBy(orderItemsTable.nameSnapshot)
      .orderBy(desc(sum(itemRevenueExpr)))
      .limit(10),
    db
      .select({ status: ordersTable.status, count: count() })
      .from(ordersTable)
      .where(rangeWhere)
      .groupBy(ordersTable.status)
      .orderBy(desc(count())),
    db
      .select({ method: ordersTable.paymentMethod, count: count(), revenue: sum(ordersTable.total) })
      .from(ordersTable)
      .where(rangeWhere)
      .groupBy(ordersTable.paymentMethod)
      .orderBy(desc(sum(ordersTable.total))),
    db
      .select({ category: productsTable.category, revenue: sum(itemRevenueExpr) })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .innerJoin(productVariantsTable, eq(orderItemsTable.productVariantId, productVariantsTable.id))
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(rangeWhere)
      .groupBy(productsTable.category)
      .orderBy(desc(sum(itemRevenueExpr))),
    db
      .select({ city: cityExpr, orders: count(), revenue: sum(ordersTable.total) })
      .from(ordersTable)
      .where(rangeWhere)
      .groupBy(cityExpr)
      .orderBy(desc(sum(ordersTable.total)))
      .limit(10),
    db.select({ dow: weekdayExpr, orders: count() }).from(ordersTable).where(rangeWhere).groupBy(weekdayExpr),
    db
      .select({ productName: productsTable.name, weightGrams: productVariantsTable.weightGrams, stockQty: productVariantsTable.stockQty })
      .from(productVariantsTable)
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(lt(productVariantsTable.stockQty, LOW_STOCK_THRESHOLD))
      .orderBy(asc(productVariantsTable.stockQty))
      .limit(20),
  ]);

  const currentOrders = num(currentAgg?.orders);
  const currentRevenue = num(currentAgg?.revenue);
  const prevOrders = num(prevAgg?.orders);
  const prevRevenue = num(prevAgg?.revenue);
  const currentUnitsNum = num(currentUnits?.units);
  const prevUnitsNum = num(prevUnits?.units);

  // Postgres extract(dow) is 0=Sunday..6=Saturday; reindex onto a Monday-first week for the response.
  const weekdayOrders = new Array(7).fill(0);
  for (const row of weekdayRows) {
    const pgDow = Math.round(num(row.dow)); // 0=Sun..6=Sat
    const mondayFirstIndex = (pgDow + 6) % 7; // 0=Mon..6=Sun
    weekdayOrders[mondayFirstIndex] = num(row.orders);
  }

  res.json(
    AdminGetStatsResponse.parse({
      kpis: {
        totalOrders: kpi(currentOrders, prevOrders),
        totalRevenue: kpi(currentRevenue, prevRevenue),
        avgOrderValue: kpi(currentOrders > 0 ? currentRevenue / currentOrders : 0, prevOrders > 0 ? prevRevenue / prevOrders : 0),
        totalUnitsSold: kpi(currentUnitsNum, prevUnitsNum),
      },
      timeSeries: timeSeriesRows.map((row) => ({ bucket: row.bucket, orders: num(row.orders), revenue: num(row.revenue) })),
      topProducts: topProductsRows.map((row) => ({ name: row.name, unitsSold: num(row.unitsSold), revenue: num(row.revenue) })),
      ordersByStatus: statusRows.map((row) => ({ status: row.status, count: num(row.count) })),
      paymentMethodBreakdown: paymentRows.map((row) => ({ method: row.method, count: num(row.count), revenue: num(row.revenue) })),
      categoryBreakdown: categoryRows.map((row) => ({ category: row.category, revenue: num(row.revenue) })),
      topCities: cityRows.filter((row) => row.city).map((row) => ({ city: row.city, orders: num(row.orders), revenue: num(row.revenue) })),
      ordersByWeekday: WEEKDAY_NAMES.map((weekday, i) => ({ weekday, orders: weekdayOrders[i] })),
      lowStock: lowStockRows.map((row) => ({ productName: row.productName, variantLabel: `${row.weightGrams}g`, stockQty: row.stockQty })),
    }),
  );
});

export default router;
