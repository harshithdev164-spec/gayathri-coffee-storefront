import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ordersTable, whatsappEventsTable } from "@workspace/db";
import { updateOrderStatus, isForwardStatusTransition } from "../lib/order-transitions";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Razorpay — payment captured/failed. Configure this URL in Razorpay
// Dashboard > Settings > Webhooks, with the exact secret from
// RAZORPAY_WEBHOOK_SECRET (Razorpay lets you choose that secret yourself).
router.post("/webhooks/razorpay", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Razorpay webhook secret not configured" });
    return;
  }

  const signature = req.headers["x-razorpay-signature"];
  if (typeof signature !== "string" || !req.rawBody) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const signatureBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  const valid = signatureBuf.length === expectedBuf.length && crypto.timingSafeEqual(signatureBuf, expectedBuf);
  if (!valid) {
    logger.warn("Razorpay webhook signature mismatch");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body?.event as string | undefined;
  const payment = req.body?.payload?.payment?.entity as { order_id?: string; id?: string } | undefined;
  const razorpayOrderId = payment?.order_id;

  if (!event || !razorpayOrderId) {
    res.json({ ok: true });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.razorpayOrderId, razorpayOrderId)).limit(1);
  if (!order) {
    logger.warn({ razorpayOrderId, event }, "Razorpay webhook: no matching order");
    res.json({ ok: true });
    return;
  }

  if ((event === "payment.captured" || event === "order.paid") && order.paymentStatus !== "paid") {
    await db
      .update(ordersTable)
      .set({ paymentStatus: "paid", razorpayPaymentId: payment?.id ?? order.razorpayPaymentId })
      .where(eq(ordersTable.id, order.id));
  } else if (event === "payment.failed" && order.paymentStatus !== "paid") {
    await db.update(ordersTable).set({ paymentStatus: "failed" }).where(eq(ordersTable.id, order.id));
  } else {
    logger.info({ event, orderId: order.id }, "Unhandled/no-op Razorpay webhook event");
  }

  res.json({ ok: true });
});

// Shiprocket — shipment status updates (shipped/out for delivery/delivered/
// RTO/cancelled). Shiprocket doesn't sign webhook payloads, so the shared
// secret is passed as a query param on the URL you register with them:
// https://<your-domain>/api/webhooks/shiprocket?token=<SHIPROCKET_WEBHOOK_SECRET>
router.post("/webhooks/shiprocket", async (req, res) => {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET;
  const provided = (req.query.token as string | undefined) ?? (req.headers["x-api-key"] as string | undefined);
  if (!secret || provided !== secret) {
    res.status(401).json({ error: "Invalid or missing webhook token" });
    return;
  }

  const body = req.body as { awb?: string; current_status?: string };
  const awb = body.awb;
  const statusRaw = (body.current_status ?? "").toLowerCase();

  if (!awb) {
    res.json({ ok: true });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.trackingNumber, awb)).limit(1);
  if (!order) {
    logger.warn({ awb, statusRaw }, "Shiprocket webhook: no matching order");
    res.json({ ok: true });
    return;
  }

  let nextStatus: string | null = null;
  if (statusRaw.includes("deliver") && !statusRaw.includes("undeliver")) nextStatus = "delivered";
  else if (statusRaw.includes("cancel") || statusRaw.includes("rto")) nextStatus = "cancelled";
  else if (["shipped", "picked up", "in transit", "out for delivery", "pickup"].some((s) => statusRaw.includes(s))) nextStatus = "shipped";

  if (nextStatus && isForwardStatusTransition(order.status, nextStatus)) {
    await updateOrderStatus(order, { status: nextStatus });
  } else if (nextStatus) {
    logger.info({ awb, from: order.status, to: nextStatus }, "Shiprocket webhook: ignoring non-forward status transition");
  }

  res.json({ ok: true });
});

// Meta/WhatsApp — verification handshake. Configure this URL + verify token
// in Meta App Dashboard > WhatsApp > Configuration > Webhook, subscribed to
// "messages" and "message_template_status_update".
router.get("/webhooks/whatsapp", (req, res) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (verifyToken && mode === "subscribe" && token === verifyToken && typeof challenge === "string") {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

type WhatsAppStatus = { id: string; status: string };
type WhatsAppInboundMessage = { id: string; from: string; type: string; text?: { body?: string } };
type WhatsAppChange =
  | { field: "messages"; value: { statuses?: WhatsAppStatus[]; messages?: WhatsAppInboundMessage[] } }
  | {
      field: "message_template_status_update";
      value: { event: string; message_template_name: string; message_template_language?: string; reason?: string | null };
    };

router.post("/webhooks/whatsapp", async (req, res) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signatureHeader = req.headers["x-hub-signature-256"];
    if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=") || !req.rawBody) {
      res.sendStatus(401);
      return;
    }
    const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
    const sigBuf = Buffer.from(signatureHeader);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn("WhatsApp webhook signature mismatch");
      res.sendStatus(401);
      return;
    }
  }

  const entries = (req.body?.entry ?? []) as { changes?: WhatsAppChange[] }[];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field === "message_template_status_update") {
        const v = change.value;
        await db.insert(whatsappEventsTable).values({
          type: "template_status",
          templateName: v.message_template_name,
          status: v.event,
          body: v.reason ?? null,
          payload: v,
        });
      } else if (change.field === "messages") {
        const v = change.value;
        for (const status of v.statuses ?? []) {
          await db.update(whatsappEventsTable).set({ status: status.status }).where(eq(whatsappEventsTable.waMessageId, status.id));
        }
        for (const msg of v.messages ?? []) {
          await db.insert(whatsappEventsTable).values({
            type: "inbound_message",
            waMessageId: msg.id,
            fromPhone: msg.from,
            body: msg.text?.body ?? `[${msg.type}]`,
            payload: msg,
          });
        }
      }
    }
  }

  res.json({ ok: true });
});

export default router;
