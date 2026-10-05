import type { Order, OrderItem } from "@workspace/db";
import { logger } from "./logger";
import { generateInvoicePdf } from "./invoice";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.ZEPTOMAIL_API_KEY && process.env.EMAIL_FROM);
}

type Attachment = { name: string; content: string; mimeType: string };

async function sendEmail(to: string, toName: string, subject: string, html: string, attachments?: Attachment[]): Promise<void> {
  const apiKey = process.env.ZEPTOMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const apiUrl = process.env.ZEPTOMAIL_API_URL ?? "https://api.zeptomail.in/v1.1/email";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({
      from: { address: from, name: "Gayathri Coffee" },
      to: [{ email_address: { address: to, name: toName } }],
      subject,
      htmlbody: html,
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({ name: a.name, content: a.content, mime_type: a.mimeType })) }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ZeptoMail send failed (HTTP ${res.status}): ${text}`);
  }
}

function money(paise: number): string {
  return `₹${paise.toLocaleString("en-IN")}`;
}

const MAROON = "#67232d";
const RUST = "#b83a36";
const GOLD = "#c9a15a";
const CREAM = "#fdf8f1";
const CARD = "#ffffff";
const INK = "#2a160c";
const MUTED = "#8a6f61";
const BORDER = "#e8dcc8";

function logoUrl(): string {
  return process.env.EMAIL_LOGO_URL ?? "https://gayathricoffee.com/mysore-heritage-logo.jpeg";
}

function siteUrl(): string {
  return process.env.EMAIL_SITE_URL ?? "https://gayathricoffee.com";
}

// Table-based layout (not flex/grid) so this renders consistently across
// Outlook/Gmail/Apple Mail — email HTML doesn't get the CSS leniency the app does.
function wrapEmail(opts: { preheader: string; heading: string; subheading?: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Gayathri Coffee</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${CARD};border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">

          <tr>
            <td style="background-color:${MAROON};padding:28px 32px;text-align:center;">
              <img src="${logoUrl()}" alt="Gayathri Coffee" width="56" height="56" style="border-radius:50%;display:block;margin:0 auto 12px;border:2px solid ${GOLD};" />
              <p style="margin:0;font-family:Georgia,serif;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${GOLD};">Mysore Heritage Coffee</p>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;color:${MAROON};">${opts.heading}</h1>
              ${opts.subheading ? `<p style="margin:0;font-size:14px;color:${MUTED};">${opts.subheading}</p>` : ""}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 32px;font-size:14px;line-height:1.6;color:${INK};">
              ${opts.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="background-color:${CREAM};padding:24px 32px;text-align:center;border-top:1px solid ${BORDER};">
              <p style="margin:0 0 4px;font-size:12px;color:${MUTED};">Hand-roasted in Mysore since 1950</p>
              <p style="margin:0;font-size:11px;color:${MUTED};">
                <a href="${siteUrl()}" style="color:${RUST};text-decoration:none;">gayathricoffee.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function itemsTable(items: OrderItem[]): string {
  const rows = items
    .map(
      (item, i) => `
        <tr style="background-color:${i % 2 === 0 ? CARD : CREAM};">
          <td style="padding:10px 12px;font-size:13px;color:${INK};">${item.nameSnapshot}</td>
          <td style="padding:10px 12px;font-size:13px;color:${MUTED};text-align:center;">×${item.quantity}</td>
          <td style="padding:10px 12px;font-size:13px;color:${INK};text-align:right;">${money(item.priceSnapshot * item.quantity)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin:16px 0;">
      <tr style="background-color:${MAROON};">
        <td style="padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};">Item</td>
        <td style="padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};text-align:center;">Qty</td>
        <td style="padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};text-align:right;">Amount</td>
      </tr>
      ${rows}
    </table>`;
}

function summaryRows(order: Order): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td style="padding:3px 0;font-size:13px;color:${MUTED};">Subtotal</td>
        <td style="padding:3px 0;font-size:13px;color:${INK};text-align:right;">${money(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;font-size:13px;color:${MUTED};">Shipping</td>
        <td style="padding:3px 0;font-size:13px;color:${INK};text-align:right;">${order.shippingFee === 0 ? "Free" : money(order.shippingFee)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 0;font-size:15px;font-weight:bold;color:${MAROON};border-top:1px solid ${BORDER};">Total</td>
        <td style="padding:10px 0 0;font-size:15px;font-weight:bold;color:${MAROON};text-align:right;border-top:1px solid ${BORDER};">${money(order.total)}</td>
      </tr>
    </table>`;
}

function button(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
      <tr>
        <td style="border-radius:999px;background-color:${RUST};">
          <a href="${href}" style="display:inline-block;padding:12px 28px;font-family:Georgia,serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#fdf8f1;text-decoration:none;">${label}</a>
        </td>
      </tr>
    </table>`;
}

export async function sendOrderConfirmationEmail(order: Order, items: OrderItem[]): Promise<void> {
  if (!isEmailConfigured() || !order.email) return;

  const bodyHtml = `
    <p style="margin:0 0 4px;">Hi ${order.customerName},</p>
    <p style="margin:0 0 16px;">Thank you for your order — it's confirmed and being prepared for roasting and packing.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};border-radius:10px;padding:14px 16px;margin-bottom:4px;">
      <tr>
        <td style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">Order number</td>
        <td style="font-size:14px;font-weight:bold;color:${MAROON};text-align:right;">${order.orderNumber}</td>
      </tr>
    </table>
    ${itemsTable(items)}
    ${summaryRows(order)}
    <p style="margin:20px 0 0;font-size:13px;color:${MUTED};">Shipping to: ${order.address}, ${order.city} ${order.pincode}</p>
    <p style="margin:12px 0 0;font-size:12px;color:${MUTED};">Your tax invoice is attached as a PDF to this email.</p>
  `;

  const html = wrapEmail({
    preheader: `Order ${order.orderNumber} confirmed — ${money(order.total)}`,
    heading: "Your order is confirmed",
    subheading: `Order ${order.orderNumber}`,
    bodyHtml,
  });

  try {
    const pdfBytes = await generateInvoicePdf(order, items);
    const attachment: Attachment = {
      name: `invoice-${order.orderNumber}.pdf`,
      content: Buffer.from(pdfBytes).toString("base64"),
      mimeType: "application/pdf",
    };
    await sendEmail(order.email, order.customerName, `Order confirmed — ${order.orderNumber}`, html, [attachment]);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Failed to send order confirmation email");
  }
}

export async function sendShippingUpdateEmail(order: Order): Promise<void> {
  if (!isEmailConfigured() || !order.email) return;

  const trackingBlock = order.trackingUrl
    ? button("Track your order", order.trackingUrl)
    : order.trackingNumber
      ? `<p style="margin:16px 0 0;font-size:13px;color:${INK};">Tracking number: <strong>${order.trackingNumber}</strong></p>`
      : "";

  const bodyHtml = `
    <p style="margin:0 0 4px;">Hi ${order.customerName},</p>
    <p style="margin:0 0 16px;">Good news — your order has left our roastery and is on its way to you.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};border-radius:10px;padding:14px 16px;">
      <tr>
        <td style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">Order number</td>
        <td style="font-size:14px;font-weight:bold;color:${MAROON};text-align:right;">${order.orderNumber}</td>
      </tr>
    </table>
    ${trackingBlock}
  `;

  const html = wrapEmail({
    preheader: `Order ${order.orderNumber} has shipped`,
    heading: "Your order has shipped",
    subheading: `Order ${order.orderNumber}`,
    bodyHtml,
  });

  try {
    await sendEmail(order.email, order.customerName, `Order shipped — ${order.orderNumber}`, html);
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Failed to send shipping update email");
  }
}
