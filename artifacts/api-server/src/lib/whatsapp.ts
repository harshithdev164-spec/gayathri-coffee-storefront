import type { Order, OrderItem } from "@workspace/db";
import { db, packingRecipientsTable, whatsappEventsTable } from "@workspace/db";
import { logger } from "./logger";
import { carrierName, packingLines } from "./item-format";

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Checkout only collects a bare 10-digit Indian mobile number (no country code
// field) — default those to +91. Already-prefixed numbers pass through.
function normalizeIndianPhone(phone: string): string | null {
  // Customers often type a leading 0 (09962234866) or 00 — drop it, otherwise the number looks
  // 11 digits long and the message is silently never sent.
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

// `copyCodeButton` is for Meta's authentication (login code) templates: they need the code twice -
// once in the message body and once for the "Copy code" button.
async function sendWhatsAppTemplate(to: string, templateName: string, bodyParams: string[], orderId?: string, copyCodeButton?: string): Promise<void> {
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
        components: [
          { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) },
          ...(copyCodeButton ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: copyCodeButton }] }] : []),
        ],
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

// Free-form text reply. Only works inside the 24-hour window that opens when the customer messages us,
// which is exactly when the bot replies. `to` is the sender's WhatsApp id (country code + number).
export async function sendWhatsAppText(to: string, body: string, sentBy: "bot_reply" | "agent_reply" = "bot_reply"): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;

  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4000) },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WhatsApp text reply failed (HTTP ${res.status}): ${text}`);
  }

  const data = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
  await db
    .insert(whatsappEventsTable)
    .values({ type: sentBy, waMessageId: data?.messages?.[0]?.id ?? null, status: "sent", fromPhone: to, body: body.slice(0, 4000) })
    .catch((err) => logger.error({ err }, "Failed to log WhatsApp bot reply"));
}

// The only thing WhatsApp lets us send once a customer's 24-hour window has closed: an approved
// template. This one just invites them to reply, which opens a fresh 24-hour window.
export const FOLLOW_UP_TEMPLATE = "gc_follow_up_v1";

export async function sendFollowUpTemplate(to: string, customerName: string): Promise<void> {
  await sendWhatsAppTemplate(to, FOLLOW_UP_TEMPLATE, [customerName.trim() || "there"]);
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
    // India Post's page can't open a specific parcel, so the code goes alongside the link.
    const trackingText = order.shippingMethod === "india_post" && order.trackingNumber
      ? `${order.trackingUrl} (Tracking ID: ${order.trackingNumber})`
      : order.trackingUrl;
    await sendWhatsAppTemplate(order.phone, "gc_order_shipped_v1", [order.customerName, order.orderNumber, trackingText], order.id);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "WhatsApp order-shipped message failed");
  }
}

export async function sendAdminOtpWhatsApp(phone: string, code: string): Promise<boolean> {
  if (!isWhatsAppConfigured()) return false;
  try {
    await sendWhatsAppTemplate(phone, "gc_admin_otp_v1", [code], undefined, code);
    return true;
  } catch (err) {
    logger.error({ err }, "WhatsApp admin OTP send failed");
    return false;
  }
}

type AdminTopic = "order" | "shipping" | "items";

// ADMIN_WHATSAPP_NUMBERS entries look like "9141737288:order+shipping+items" or
// "8884079777:order". A bare number (no ":topics") receives every alert.
// "order" covers new-order and cancelled alerts; "shipping" covers shipped alerts;
// "items" only matters while the combined order template is unapproved: it keeps
// sending the separate item-list message as a fallback.
function getAdminWhatsAppNumbers(topic: AdminTopic): string[] {
  return (process.env.ADMIN_WHATSAPP_NUMBERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const [, topics] = entry.split(":");
      return !topics || topics.split("+").map((t) => t.trim()).includes(topic);
    })
    .map((entry) => entry.split(":")[0].trim());
}

async function sendAdminTemplate(topic: AdminTopic, templateName: string, bodyParams: string[], orderId: string): Promise<void> {
  for (const number of getAdminWhatsAppNumbers(topic)) {
    try {
      await sendWhatsAppTemplate(number, templateName, bodyParams, orderId);
    } catch (err) {
      logger.error({ err, orderId, number }, `WhatsApp admin alert (${templateName}) failed`);
    }
  }
}

function summarizeItems(items: OrderItem[]): string {
  return items.map((item) => `${item.quantity}x ${item.nameSnapshot}`).join(", ");
}

// Template values can't contain line breaks, so multi-line addresses are flattened to one line.
function orderAddress(order: Order): string {
  return `${order.address}, ${order.city} ${order.pincode}`.replace(/\s*[\r\n]+\s*/g, ", ");
}

// v2 adds the courier (Shiprocket / India Post) and lists every item as product, grind, size and
// quantity. v1 stays as a fallback until Meta approves v2.
export const ORDER_DETAILS_TEMPLATE_V2 = "gc_order_details_v2";
const ORDER_DETAILS_TEMPLATE_V1 = "gc_admin_order_details_v1";

// The single "everything about this order" message for admins and the packing team.
// Meta-approved templates can't hold line breaks in values, so the address and the item list are
// flattened onto one line each.
async function sendOrderDetails(number: string, order: Order, items: OrderItem[]): Promise<void> {
  const address = orderAddress(order);
  try {
    await sendWhatsAppTemplate(
      number,
      ORDER_DETAILS_TEMPLATE_V2,
      [
        order.orderNumber,
        carrierName(order.shippingMethod),
        order.customerName,
        order.phone || "-",
        `${order.paymentMethod} - ₹${order.total} (${order.paymentStatus})`,
        address,
        packingLines(items),
      ],
      order.id,
    );
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "Order details v2 template failed - falling back to v1");
    await sendWhatsAppTemplate(
      number,
      ORDER_DETAILS_TEMPLATE_V1,
      [order.orderNumber, order.customerName, order.phone, order.paymentMethod, `₹${order.total}`, address, summarizeItems(items)],
      order.id,
    );
  }
}

// Falls back to the older split messages while Meta hasn't approved the combined template,
// so admins and packers never miss an order.
export async function sendAdminNewOrderAlert(order: Order, items: OrderItem[]): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  const itemsSummary = summarizeItems(items);
  const address = orderAddress(order);

  for (const number of getAdminWhatsAppNumbers("order")) {
    try {
      await sendOrderDetails(number, order, items);
    } catch (err) {
      logger.warn({ err, orderId: order.id, number }, "Combined order template failed — falling back to split messages");
      try {
        await sendWhatsAppTemplate(number, "gc_admin_new_order_v1", [order.orderNumber, order.customerName, order.phone, `₹${order.total}`, address], order.id);
        if (getAdminWhatsAppNumbers("items").includes(number)) {
          await sendWhatsAppTemplate(number, "gc_packer_new_order_v1", [order.orderNumber, itemsSummary], order.id);
        }
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr, orderId: order.id, number }, "WhatsApp admin new-order alert failed");
      }
    }
  }
}

export async function sendAdminOrderShippedAlert(order: Order): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  await sendAdminTemplate(
    "shipping",
    "gc_admin_order_shipped_v1",
    [order.orderNumber, order.customerName, order.trackingNumber ?? order.trackingUrl ?? "N/A"],
    order.id,
  );
}

export async function sendAdminOrderCancelledAlert(order: Order): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  await sendAdminTemplate(
    "order",
    "gc_admin_order_cancelled_v1",
    [order.orderNumber, order.customerName, `₹${order.total}`],
    order.id,
  );
}

export async function sendPackingAlert(order: Order, items: OrderItem[]): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  const recipients = await db.select().from(packingRecipientsTable);
  if (recipients.length === 0) return;

  const itemsSummary = summarizeItems(items);
  for (const recipient of recipients) {
    try {
      await sendOrderDetails(recipient.phone, order, items);
    } catch (err) {
      logger.warn({ err, orderId: order.id, recipient: recipient.phone }, "Combined order template failed for packer — falling back to item list");
      try {
        await sendWhatsAppTemplate(recipient.phone, "gc_packer_new_order_v1", [order.orderNumber, itemsSummary], order.id);
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr, orderId: order.id, recipient: recipient.phone }, "WhatsApp packing alert failed");
      }
    }
  }
}
