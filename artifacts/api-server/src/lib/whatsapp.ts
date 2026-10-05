import type { Order, OrderItem } from "@workspace/db";
import { db, packingRecipientsTable, whatsappEventsTable } from "@workspace/db";
import { logger } from "./logger";

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Checkout only collects a bare 10-digit Indian mobile number (no country code
// field) — default those to +91. Already-prefixed numbers pass through.
function normalizeIndianPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

async function sendWhatsAppTemplate(to: string, templateName: string, bodyParams: string[], orderId?: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;

  const normalized = normalizeIndianPhone(to);
  if (!normalized) return;

  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalized,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (HTTP ${res.status}): ${text}`);
  }

  const data = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
  const waMessageId = data?.messages?.[0]?.id;
  if (waMessageId) {
    await db
      .insert(whatsappEventsTable)
      .values({ type: "message_sent", templateName, waMessageId, orderId: orderId ?? null, status: "sent", fromPhone: normalized })
      .catch((err) => logger.error({ err }, "Failed to log WhatsApp message_sent event"));
  }
}

export async function sendOrderConfirmedWhatsApp(order: Order): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  try {
    await sendWhatsAppTemplate(order.phone, "gc_order_confirmed_v1", [order.customerName, order.orderNumber, `₹${order.total}`], order.id);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "WhatsApp order-confirmed message failed");
  }
}

export async function sendOrderShippedWhatsApp(order: Order): Promise<void> {
  if (!isWhatsAppConfigured() || !order.trackingUrl) return;
  try {
    await sendWhatsAppTemplate(order.phone, "gc_order_shipped_v1", [order.customerName, order.orderNumber, order.trackingUrl], order.id);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "WhatsApp order-shipped message failed");
  }
}

export async function sendAdminOtpWhatsApp(phone: string, code: string): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  try {
    await sendWhatsAppTemplate(phone, "gc_admin_otp_v1", [code]);
    return true;
  } catch (err) {
    logger.error({ err }, "WhatsApp admin OTP send failed");
    return false;
  }
}

function getAdminWhatsAppNumbers(): string[] {
  return (process.env.ADMIN_WHATSAPP_NUMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

async function sendAdminTemplate(templateName: string, bodyParams: string[], orderId: string): Promise<void> {
  for (const number of getAdminWhatsAppNumbers()) {
    try {
      await sendWhatsAppTemplate(number, templateName, bodyParams, orderId);
    } catch (err) {
      logger.error({ err, orderId, number }, `WhatsApp admin alert (${templateName}) failed`);
    }
  }
}

export async function sendAdminNewOrderAlert(order: Order): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  await sendAdminTemplate(
    "gc_admin_new_order_v1",
    [order.orderNumber, order.customerName, order.phone, `₹${order.total}`, `${order.address}, ${order.city} ${order.pincode}`],
    order.id,
  );
}

export async function sendAdminOrderShippedAlert(order: Order): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  await sendAdminTemplate(
    "gc_admin_order_shipped_v1",
    [order.orderNumber, order.customerName, order.trackingNumber ?? order.trackingUrl ?? "N/A"],
    order.id,
  );
}

export async function sendAdminOrderCancelledAlert(order: Order): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  await sendAdminTemplate(
    "gc_admin_order_cancelled_v1",
    [order.orderNumber, order.customerName, `₹${order.total}`],
    order.id,
  );
}

export async function sendPackingAlert(order: Order, items: OrderItem[]): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  const recipients = await db.select().from(packingRecipientsTable);
  if (recipients.length === 0) return;

  const itemsSummary = items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ");
  for (const recipient of recipients) {
    try {
      await sendWhatsAppTemplate(recipient.phone, "gc_packer_new_order_v1", [order.orderNumber, itemsSummary], order.id);
    } catch (err) {
      logger.error({ err, orderId: order.id, recipient: recipient.phone }, "WhatsApp packing alert failed");
    }
  }
}
