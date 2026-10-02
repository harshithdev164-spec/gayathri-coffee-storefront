import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable } from "@workspace/db";
import { AdminListOrdersResponse, AdminUpdateOrderBody, AdminUpdateOrderResponse, AdminShipOrderResponse } from "@workspace/api-zod";
import { requireAdmin } from "../../middlewares/require-admin";
import { shapeOrder } from "../../lib/order-shape";
import { createShiprocketShipment, isShiprocketConfigured } from "../../lib/shiprocket";
import { sendShippingUpdateEmail } from "../../lib/email";
import { sendOrderShippedWhatsApp, sendAdminOrderShippedAlert, sendAdminOrderCancelledAlert } from "../../lib/whatsapp";

const router: IRouter = Router();
router.use(requireAdmin);

router.get("/orders", async (_req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
  const orderIds = orders.map((order) => order.id);
  const items = orderIds.length ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];

  const shaped = orders.map((order) => shapeOrder(order, items.filter((item) => item.orderId === order.id)));
  res.json(AdminListOrdersResponse.parse(shaped));
});

router.patch("/orders/:id", async (req, res) => {
  const { id } = req.params;
  const parsed = AdminUpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set(parsed.data)
    .where(eq(ordersTable.id, id))
    .returning();
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status === "shipped" && existing.status !== "shipped") {
    void sendShippingUpdateEmail(order);
    void sendOrderShippedWhatsApp(order);
    void sendAdminOrderShippedAlert(order);
  }

  if (order.status === "cancelled" && existing.status !== "cancelled") {
    void sendAdminOrderCancelledAlert(order);
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json(AdminUpdateOrderResponse.parse(shapeOrder(order, items)));
});

router.post("/orders/:id/ship", async (req, res) => {
  const { id } = req.params;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.shippingMethod !== "shiprocket") {
    res.status(400).json({ error: "This order isn't using Shiprocket — nothing to create." });
    return;
  }
  if (!isShiprocketConfigured()) {
    res.status(400).json({ error: "Shiprocket isn't connected yet. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to enable this." });
    return;
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));

  let shipment;
  try {
    shipment = await createShiprocketShipment({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      city: order.city,
      pincode: order.pincode,
      items: items.map((item) => ({
        name: item.nameSnapshot,
        price: item.priceSnapshot,
        quantity: item.quantity,
        // Shiprocket requires an SKU per line item; fall back to a slug of the
        // name for items with no linked variant (e.g. custom blends).
        sku: item.productVariantId ?? item.nameSnapshot.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      })),
      total: order.total,
      cod: order.paymentMethod === "Cash on Delivery",
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not create the Shiprocket shipment." });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({
      status: "confirmed",
      trackingNumber: shipment.awbCode,
      trackingUrl: shipment.awbCode ? `https://shiprocket.co/tracking/${shipment.awbCode}` : null,
    })
    .where(eq(ordersTable.id, id))
    .returning();
  if (!updated) {
    res.status(500).json({ error: "Shipment was created, but updating the order failed." });
    return;
  }

  res.json(AdminShipOrderResponse.parse(shapeOrder(updated, items)));
});

export default router;
