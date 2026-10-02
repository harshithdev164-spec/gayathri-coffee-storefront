import type { Order, OrderItem } from "@workspace/db";
import { logger } from "./logger";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed (HTTP ${res.status}): ${text}`);
  }
}

function money(paise: number): string {
  return `₹${paise.toLocaleString("en-IN")}`;
}

function itemsRows(items: OrderItem[]): string {
  return items
    .map(
      (item) =>
        `<tr><td style="padding:6px 12px">${item.nameSnapshot}</td><td style="padding:6px 12px">x${item.quantity}</td><td style="padding:6px 12px">${money(item.priceSnapshot * item.quantity)}</td></tr>`,
    )
    .join("");
}

export async function sendOrderConfirmationEmail(order: Order, items: OrderItem[]): Promise<void> {
  if (!isEmailConfigured() || !order.email) return;

  const html = `
    <div style="font-family:sans-serif;color:#2a160c">
      <h2>Thanks for your order, ${order.customerName}!</h2>
      <p>Order <strong>${order.orderNumber}</strong> is confirmed.</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px">${itemsRows(items)}</table>
      <p>Subtotal: ${money(order.subtotal)}<br/>Shipping: ${money(order.shippingFee)}<br/><strong>Total: ${money(order.total)}</strong></p>
      <p>Shipping to: ${order.address}, ${order.city} ${order.pincode}</p>
    </div>
  `;

  try {
    await sendEmail(order.email, `Order confirmed — ${order.orderNumber}`, html);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Failed to send order confirmation email");
  }
}

export async function sendShippingUpdateEmail(order: Order): Promise<void> {
  if (!isEmailConfigured() || !order.email) return;

  const trackingLine = order.trackingUrl
    ? `<p>Track it here: <a href="${order.trackingUrl}">${order.trackingNumber ?? order.trackingUrl}</a></p>`
    : order.trackingNumber
      ? `<p>Tracking number: ${order.trackingNumber}</p>`
      : "";

  const html = `
    <div style="font-family:sans-serif;color:#2a160c">
      <h2>Your order is on its way!</h2>
      <p>Order <strong>${order.orderNumber}</strong> has shipped.</p>
      ${trackingLine}
    </div>
  `;

  try {
    await sendEmail(order.email, `Order shipped — ${order.orderNumber}`, html);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Failed to send shipping update email");
  }
}
