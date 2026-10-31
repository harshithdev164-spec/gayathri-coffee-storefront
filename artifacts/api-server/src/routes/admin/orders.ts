import { Router, type IRouter } from "express";
import { z } from "zod";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable } from "@workspace/db";
import { AdminListOrdersResponse, AdminUpdateOrderBody, AdminUpdateOrderResponse, AdminShipOrderResponse } from "@workspace/api-zod";
import { requireAdmin, requirePermission } from "../../middlewares/require-admin";
import { shapeOrder, nextOrderIdentifiers } from "../../lib/order-shape";
import { sendNotifications } from "../../lib/notify";
import { sendOrderConfirmationEmail } from "../../lib/email";
import { sendOrderConfirmedWhatsApp } from "../../lib/whatsapp";
import { getShiprocketLabelUrl, getShiprocketWalletBalance, isShiprocketConfigured } from "../../lib/shiprocket";
import { shipOrderViaShiprocket } from "../../lib/shiprocket-ship";
import { generateInvoicePdf } from "../../lib/invoice";
import { updateOrderStatus } from "../../lib/order-transitions";
import { indiaPostTrackingUrl } from "../../lib/india-post";
import { reconcileRazorpayPayments } from "../../lib/payment-reconcile";
import { isRazorpayConfigured } from "../../lib/razorpay";
import { PDFDocument } from "pdf-lib";
import { audit } from "../../lib/audit";
import { isEmailConfigured, sendShippingUpdateEmail } from "../../lib/email";
import { isWhatsAppConfigured, sendOrderShippedWhatsApp } from "../../lib/whatsapp";

const router: IRouter = Router();
router.use(requireAdmin);

router.get("/orders", requirePermission("orders.view"), async (_req, res) => {
  // Newest order number first. Orders added by hand carry the date they belong to, so sorting by date
  // alone scatters the numbers (19859, 19851, 19854, 19853...). Old "GC..." numbers sort by date, last.
  const isNumbered = sql`${ordersTable.orderNumber} ~ '^[0-9]+$'`;
  const orders = await db
    .select()
    .from(ordersTable)
    .orderBy(sql`case when ${isNumbered} then 0 else 1 end`, desc(sql`case when ${isNumbered} then ${ordersTable.orderNumber}::bigint end`), desc(ordersTable.createdAt));
  const orderIds = orders.map((order) => order.id);
  const items = orderIds.length ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)) : [];

  const shaped = orders.map((order) => shapeOrder(order, items.filter((item) => item.orderId === order.id)));
  res.json(AdminListOrdersResponse.parse(shaped));
});

router.patch("/orders/:id", requirePermission("orders.ship"), async (req, res) => {
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

  const order = await updateOrderStatus(existing, parsed.data);
  await audit(res, "order.updated", order.orderNumber, [parsed.data.status && `status ${existing.status} -> ${parsed.data.status}`, parsed.data.trackingNumber && `tracking ${parsed.data.trackingNumber}`].filter(Boolean).join(", ") || "details");

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  res.json(AdminUpdateOrderResponse.parse(shapeOrder(order, items)));
});

// "?copies=3" prints the document that many times in one PDF (capped so a typo can't make a huge file).
function parseCopies(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 20) : 1;
}

async function repeatPdf(bytes: Uint8Array, copies: number): Promise<Uint8Array> {
  if (copies <= 1) return bytes;
  const source = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const indices = source.getPageIndices();
  for (let i = 0; i < copies; i++) {
    for (const page of await out.copyPages(source, indices)) out.addPage(page);
  }
  return out.save();
}

router.get("/orders/:id/invoice", requirePermission("orders.invoice"), async (req, res) => {
  const { id } = req.params;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));

  const copies = parseCopies(req.query.copies);
  const pdfBytes = await generateInvoicePdf(order, items, copies);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${order.orderNumber}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

const ManualOrderBody = z.object({
  customerName: z.string().trim().min(1, "Enter the customer's name").max(120),
  phone: z.string().trim().max(20).default(""),
  email: z.string().trim().email().max(200).nullish(),
  address: z.string().trim().max(500).default(""),
  city: z.string().trim().max(120).default(""),
  state: z.string().trim().max(80).nullish(),
  pincode: z.string().trim().max(10).default(""),
  // "Bill to" - only filled when it differs from the delivery address above.
  billingAddress: z.string().trim().max(500).nullish(),
  billingCity: z.string().trim().max(120).nullish(),
  billingPincode: z.string().trim().max(10).nullish(),
  billingState: z.string().trim().max(80).nullish(),
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid().nullish(),
        name: z.string().trim().min(1, "Every item needs a name").max(200),
        price: z.number().int().min(0),
        quantity: z.number().int().min(1).max(10000),
      }),
    )
    .min(1, "Add at least one item"),
  // "pickup" = handed over in the shop, nothing to ship.
  shippingMethod: z.enum(["pickup", "india_post", "shiprocket"]),
  shippingFee: z.number().int().min(0).default(0),
  packagingFee: z.number().int().min(0).default(0),
  paymentMethod: z.string().trim().min(1).max(60),
  paymentStatus: z.enum(["paid", "pending"]).default("paid"),
  status: z.enum(["pending", "confirmed", "shipped", "delivered"]).default("delivered"),
  notes: z.string().trim().max(1000).nullish(),
  channel: z.string().trim().max(80).nullish(),
  // Lets a past sale be recorded on the day it happened (YYYY-MM-DD).
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  notifyCustomer: z.boolean().default(false),
});

// Records a sale made outside the website — walk-in at a shop, a phone call, WhatsApp — so it gets the
// same order number, bill number, invoice and tracking as online orders and shows up in the order list.
router.post("/orders/manual", requirePermission("orders.edit"), async (req, res) => {
  const parsed = ManualOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check the order details." });
    return;
  }
  const input = parsed.data;

  const subtotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + input.shippingFee + input.packagingFee;
  const noteParts = [input.channel ? `Offline order — ${input.channel}` : "Offline order", input.notes].filter(Boolean);

  // Today's date keeps the real time; a past date is stamped at midday so it sorts sensibly.
  const createdAt = input.orderDate ? new Date(`${input.orderDate}T12:00:00+05:30`) : undefined;

  const [order] = await db
    .insert(ordersTable)
    .values({
      ...(await nextOrderIdentifiers()),
      customerName: input.customerName,
      phone: input.phone,
      email: input.email ?? null,
      address: input.address,
      city: input.city,
      state: input.state ?? null,
      pincode: input.pincode,
      billingAddress: input.billingAddress || null,
      billingCity: input.billingAddress ? input.billingCity || null : null,
      billingPincode: input.billingAddress ? input.billingPincode || null : null,
      billingState: input.billingAddress ? input.billingState || null : null,
      notes: noteParts.join(" — "),
      subtotal,
      shippingMethod: input.shippingMethod,
      shippingFee: input.shippingFee,
      packagingFee: input.packagingFee,
      total,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      status: input.status,
      source: "offline",
      ...(createdAt ? { createdAt } : {}),
    })
    .returning();
  if (!order) {
    res.status(500).json({ error: "Could not save the order." });
    return;
  }

  const savedItems = await db
    .insert(orderItemsTable)
    .values(
      input.items.map((item) => ({
        orderId: order.id,
        productVariantId: item.productVariantId ?? null,
        nameSnapshot: item.name,
        priceSnapshot: item.price,
        quantity: item.quantity,
      })),
    )
    .returning();

  // Opt-in: the customer is standing in the shop or chatting with us already, so nothing is sent unless asked.
  if (input.notifyCustomer) {
    await sendNotifications(`offline order ${order.orderNumber}`, [
      sendOrderConfirmationEmail(order, savedItems),
      sendOrderConfirmedWhatsApp(order),
    ]);
  }

  await audit(res, "order.created", order.orderNumber, `offline order, total Rs ${order.total}`);
  res.status(201).json(shapeOrder(order, savedItems));
});

// Edits an order before it ships. Orders added by hand can change everything; website orders keep their
// verified payment details and status, but the customer, address, items and charges can be corrected.
// The order number and bill number never change.
router.put("/orders/:id/manual", requirePermission("orders.edit"), async (req, res) => {
  const parsed = ManualOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check the order details." });
    return;
  }
  const input = parsed.data;

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const offline = existing.source === "offline";
  const shipped = ["shipped", "delivered", "cancelled"].includes(existing.status) || Boolean(existing.trackingNumber) || Boolean(existing.shiprocketShipmentId);
  if (!offline && shipped) {
    res.status(400).json({ error: "This order has already shipped or been cancelled, so it can no longer be edited." });
    return;
  }

  const subtotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + input.shippingFee + input.packagingFee;
  const noteParts = [input.channel ? `Offline order — ${input.channel}` : "Offline order", input.notes].filter(Boolean);
  const createdAt = offline && input.orderDate ? new Date(`${input.orderDate}T12:00:00+05:30`) : undefined;
  const hasBilling = Boolean(input.billingAddress);

  const { order, savedItems } = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(ordersTable)
      .set({
        customerName: input.customerName,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address,
        city: input.city,
        state: input.state ?? null,
        pincode: input.pincode,
        billingAddress: hasBilling ? input.billingAddress ?? null : null,
        billingCity: hasBilling ? input.billingCity || null : null,
        billingPincode: hasBilling ? input.billingPincode || null : null,
        billingState: hasBilling ? input.billingState || null : null,
        notes: offline ? noteParts.join(" — ") : input.notes || null,
        subtotal,
        shippingMethod: input.shippingMethod,
        shippingFee: input.shippingFee,
        packagingFee: input.packagingFee,
        total,
        ...(offline ? { paymentMethod: input.paymentMethod, paymentStatus: input.paymentStatus, status: input.status } : {}),
        ...(createdAt ? { createdAt } : {}),
      })
      .where(eq(ordersTable.id, existing.id))
      .returning();
    await tx.delete(orderItemsTable).where(eq(orderItemsTable.orderId, existing.id));
    const items = await tx
      .insert(orderItemsTable)
      .values(
        input.items.map((item) => ({
          orderId: existing.id,
          productVariantId: item.productVariantId ?? null,
          nameSnapshot: item.name,
          priceSnapshot: item.price,
          quantity: item.quantity,
        })),
      )
      .returning();
    return { order: updated, savedItems: items };
  });
  if (!order) {
    res.status(500).json({ error: "Could not save the order." });
    return;
  }

  await audit(res, "order.edited", order.orderNumber, `${order.source} order edited, total Rs ${existing.total} -> Rs ${order.total}`);
  res.json(shapeOrder(order, savedItems));
});

// Shiprocket wallet balance for the dashboard. Looked up live and remembered for a minute so a busy
// admin screen does not hammer Shiprocket.
let walletCache: { balance: number; at: number } | null = null;
router.get("/shiprocket/wallet", requirePermission("wallet", "orders.ship"), async (req, res) => {
  const threshold = Number(process.env.SHIPROCKET_LOW_BALANCE ?? 500);
  if (!isShiprocketConfigured()) {
    res.json({ connected: false, balance: null, lowBalanceAt: threshold, low: false, checkedAt: null });
    return;
  }
  try {
    if (!walletCache || Date.now() - walletCache.at > 60_000 || req.query.refresh === "1") {
      walletCache = { balance: await getShiprocketWalletBalance(), at: Date.now() };
    }
    res.json({ connected: true, balance: walletCache.balance, lowBalanceAt: threshold, low: walletCache.balance < threshold, checkedAt: new Date(walletCache.at).toISOString() });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not read the Shiprocket wallet." });
  }
});

// Checks recent Razorpay payments against our orders and creates any that are missing.
router.post("/orders/reconcile-payments", requirePermission("payments"), async (_req, res) => {
  if (!isRazorpayConfigured()) {
    res.json({ checked: 0, created: [], unmatched: [] });
    return;
  }
  try {
    const result = await reconcileRazorpayPayments(7);
    await audit(res, "payments.checked", null, `${result.checked} payments checked, ${result.created.length} orders recovered`);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not check Razorpay payments." });
  }
});

async function loadShiprocketOrder(id: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) return { ok: false as const, status: 404, message: "Order not found" };
  if (order.shippingMethod !== "shiprocket") {
    return { ok: false as const, status: 400, message: "This order isn't using Shiprocket." };
  }
  if (!isShiprocketConfigured()) {
    return { ok: false as const, status: 400, message: "Shiprocket isn't connected yet. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to enable this." };
  }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, id));
  return { ok: true as const, order, items };
}

// Creates the Shiprocket shipment and generates the AWB. Safe to press again after a failure —
// steps that already succeeded are not repeated.
router.post("/orders/:id/ship", requirePermission("orders.ship"), async (req, res) => {
  const loaded = await loadShiprocketOrder(req.params.id);
  if (!loaded.ok) {
    res.status(loaded.status).json({ error: loaded.message });
    return;
  }
  try {
    const order = await shipOrderViaShiprocket(loaded.order, loaded.items);
    await audit(res, "order.shiprocket", order.orderNumber, `shipment created${order.trackingNumber ? `, AWB ${order.trackingNumber}` : ""}`);
    res.json(AdminShipOrderResponse.parse(shapeOrder(order, loaded.items)));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not create the Shiprocket shipment." });
  }
});

router.post("/orders/:id/schedule-pickup", requirePermission("orders.ship"), async (req, res) => {
  const loaded = await loadShiprocketOrder(req.params.id);
  if (!loaded.ok) {
    res.status(loaded.status).json({ error: loaded.message });
    return;
  }
  if (!loaded.order.shiprocketShipmentId || !loaded.order.trackingNumber) {
    res.status(400).json({ error: "Create the shipment and AWB first." });
    return;
  }
  try {
    const order = await shipOrderViaShiprocket(loaded.order, loaded.items, { schedulePickup: true });
    await audit(res, "order.pickup", order.orderNumber, "pickup scheduled");
    res.json(AdminShipOrderResponse.parse(shapeOrder(order, loaded.items)));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not schedule the pickup." });
  }
});

// Sends the admin to a freshly generated AWB label PDF (Shiprocket's label links expire).
router.get("/orders/:id/awb-label", requirePermission("orders.ship"), async (req, res) => {
  const loaded = await loadShiprocketOrder(req.params.id);
  if (!loaded.ok) {
    res.status(loaded.status).json({ error: loaded.message });
    return;
  }
  if (!loaded.order.shiprocketShipmentId || !loaded.order.trackingNumber) {
    res.status(400).json({ error: "No AWB yet — create the shipment first." });
    return;
  }
  try {
    const labelUrl = await getShiprocketLabelUrl(loaded.order.shiprocketShipmentId);
    const copies = parseCopies(req.query.copies);
    if (copies <= 1) {
      res.redirect(labelUrl);
      return;
    }
    const labelRes = await fetch(labelUrl);
    if (!labelRes.ok) throw new Error("Could not download the AWB label to print copies.");
    const pdf = await repeatPdf(new Uint8Array(await labelRes.arrayBuffer()), copies);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="awb-${loaded.order.orderNumber}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not generate the AWB label." });
  }
});

const SendTrackingBody = z.object({
  trackingNumber: z.string().trim().min(5).max(40),
});

// Manual India Post flow: the admin books the parcel at the post office, then
// sends the customer their tracking details from the order card. Marks the
// order shipped on first send; sending again just re-notifies the customer.
router.post("/orders/:id/send-tracking", requirePermission("orders.ship"), async (req, res) => {
  const parsed = SendTrackingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid tracking number." });
    return;
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (existing.status === "cancelled") {
    res.status(400).json({ error: "This order is cancelled." });
    return;
  }

  const trackingNumber = parsed.data.trackingNumber.replace(/\s+/g, "").toUpperCase();
  const trackingUrl = indiaPostTrackingUrl(trackingNumber);

  let order;
  let resent = false;
  if (existing.status === "shipped" || existing.status === "delivered") {
    resent = true;
    [order] = await db.update(ordersTable).set({ trackingNumber, trackingUrl }).where(eq(ordersTable.id, existing.id)).returning();
    if (order) await Promise.all([sendShippingUpdateEmail(order), sendOrderShippedWhatsApp(order)]);
  } else {
    // Status change to "shipped" fires the customer email + WhatsApp and the admin alert.
    order = await updateOrderStatus(existing, { status: "shipped", trackingNumber, trackingUrl });
  }
  if (!order) {
    res.status(500).json({ error: "Could not save the tracking details." });
    return;
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  await audit(res, "order.tracking", order.orderNumber, `India Post ${trackingNumber}${resent ? " (re-sent)" : ""}`);
  res.json({
    order: shapeOrder(order, items),
    resent,
    notified: { whatsapp: isWhatsAppConfigured(), email: isEmailConfigured() && Boolean(order.email) },
  });
});

export default router;
