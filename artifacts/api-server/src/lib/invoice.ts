import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Order, OrderItem } from "@workspace/db";
import { computeGst, gstStateCode } from "./gst";
import { rupeesInWords } from "./number-to-words";
import { logger } from "./logger";

function money(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `Rs. ${rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadLogoBytes(): Promise<Uint8Array | null> {
  const url = process.env.EMAIL_LOGO_URL ?? "https://gayathricoffee.com/mysore-heritage-logo.jpeg";
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    logger.warn({ err }, "Could not fetch invoice logo — generating invoice without it");
    return null;
  }
}

export async function generateInvoicePdf(order: Order, items: OrderItem[]): Promise<Uint8Array> {
  const businessName = process.env.INVOICE_BUSINESS_NAME ?? "Gayathri Coffee Works";
  const businessAddressLines = (process.env.INVOICE_BUSINESS_ADDRESS ?? "33B, Belavadi Industrial Area, Yalawala Hobli, Mysore\nNo 7, Duplin Complex, Shivarampet, Mysore").split("\n");
  const businessGstin = process.env.INVOICE_BUSINESS_GSTIN ?? "29AABFG2580N1Z1";
  const businessPan = process.env.INVOICE_BUSINESS_PAN ?? "AABFG2580N";
  const businessPhone = process.env.INVOICE_BUSINESS_PHONE ?? "0821 2420328, +91-9141737288";
  const businessWebsite = process.env.INVOICE_BUSINESS_WEBSITE ?? "www.gayathricoffee.com";
  const businessState = process.env.INVOICE_BUSINESS_STATE ?? "Karnataka";
  const businessStateCode = process.env.INVOICE_BUSINESS_STATE_CODE ?? "29";
  const hsnCode = process.env.INVOICE_HSN_CODE ?? "0901";

  const gst = computeGst(order.subtotal, order.state, businessState);
  const customerStateCode = gstStateCode(order.state);

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const maroon = rgb(0.404, 0.137, 0.176); // #67232d
  const dark = rgb(0.165, 0.086, 0.047);
  const grey = rgb(0.47, 0.42, 0.39);
  const paleRow = rgb(0.973, 0.973, 0.957);

  const left = 42;
  const right = 553.28;
  let y = 800;

  const draw = (text: string, x: number, yPos: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(text, { x, y: yPos, size: opts.size ?? 9, font: opts.font ?? font, color: opts.color ?? dark });
  };

  const drawRight = (text: string, xRight: number, yPos: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.font ?? font;
    const width = f.widthOfTextAtSize(text, size);
    draw(text, xRight - width, yPos, opts);
  };

  // --- Logo + title ---
  const logoBytes = await loadLogoBytes();
  let logoX = left;
  if (logoBytes) {
    try {
      const isPng = logoBytes[0] === 0x89;
      const image = isPng ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);
      const size = 44;
      page.drawImage(image, { x: left, y: y - size + 6, width: size, height: size });
      logoX = left + size + 10;
    } catch (err) {
      logger.warn({ err }, "Could not embed invoice logo image");
    }
  }

  draw("TAX INVOICE", (right + left) / 2 - bold.widthOfTextAtSize("TAX INVOICE", 15) / 2, y + 8, { size: 15, font: bold, color: maroon });
  y -= 18;

  draw(businessName, logoX, y, { size: 13, font: bold, color: maroon });
  y -= 13;
  for (const line of businessAddressLines) {
    draw(line, logoX, y, { size: 8, color: grey });
    y -= 10;
  }
  draw(`GSTIN/UIN: ${businessGstin}  |  PAN: ${businessPan}`, logoX, y, { size: 8, color: grey });
  y -= 10;
  draw(`State: ${businessState}, Code: ${businessStateCode}`, logoX, y, { size: 8, color: grey });
  y -= 10;
  draw(`Ph: ${businessPhone}  |  ${businessWebsite}`, logoX, y, { size: 8, color: grey });

  y -= 18;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: maroon });
  y -= 18;

  // --- Invoice meta ---
  draw("Invoice No.", left, y, { size: 8, color: grey });
  draw(order.orderNumber, left, y - 12, { size: 11, font: bold });
  drawRight("Invoice Date", right, y, { size: 8, color: grey });
  drawRight(formatDate(order.createdAt), right, y - 12, { size: 11, font: bold });
  drawRight("Place of Supply", right - 160, y, { size: 8, color: grey });
  drawRight(`${order.state ?? "—"}${customerStateCode ? ` (${customerStateCode})` : ""}`, right - 160, y - 12, { size: 10, font: bold });

  y -= 32;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.85, 0.8, 0.7) });
  y -= 18;

  // --- Consignee (Ship to) / Buyer (Bill to) ---
  const colWidth = (right - left - 20) / 2;
  const addrTop = y;

  draw("Consignee (Ship to)", left, y, { size: 8, color: grey });
  let sy = y - 13;
  draw(order.customerName, left, sy, { size: 10, font: bold });
  sy -= 12;
  draw(`${order.address}`, left, sy, { size: 8, color: grey, font });
  sy -= 10;
  draw(`${order.city}, ${order.state ?? ""} ${order.pincode}`, left, sy, { size: 8, color: grey });
  sy -= 10;
  draw(`Ph: ${order.phone}`, left, sy, { size: 8, color: grey });
  if (order.state) {
    sy -= 10;
    draw(`State: ${order.state}, Code: ${customerStateCode ?? "—"}`, left, sy, { size: 8, color: grey });
  }

  const hasSeparateBilling = Boolean(order.billingAddress);
  const bx = left + colWidth + 20;
  draw("Buyer (Bill to)", bx, addrTop, { size: 8, color: grey });
  let by = addrTop - 13;
  draw(order.customerName, bx, by, { size: 10, font: bold });
  by -= 12;
  if (hasSeparateBilling) {
    const billingStateCode = gstStateCode(order.billingState);
    draw(`${order.billingAddress}`, bx, by, { size: 8, color: grey });
    by -= 10;
    draw(`${order.billingCity}, ${order.billingState ?? ""} ${order.billingPincode}`, bx, by, { size: 8, color: grey });
    by -= 10;
    if (order.billingState) {
      draw(`State: ${order.billingState}, Code: ${billingStateCode ?? "—"}`, bx, by, { size: 8, color: grey });
    }
  } else {
    draw("Same as consignee", bx, by, { size: 8, color: grey });
  }

  y = Math.min(sy, by) - 20;

  // --- Item table ---
  const col = { desc: left + 6, hsn: 300, qty: 360, rate: 420, amount: right - 6 };
  page.drawRectangle({ x: left, y: y - 8, width: right - left, height: 22, color: maroon });
  draw("Description of Goods", col.desc, y - 2, { size: 8, font: bold, color: rgb(0.973, 0.816, 0.773) });
  draw("HSN", col.hsn, y - 2, { size: 8, font: bold, color: rgb(0.973, 0.816, 0.773) });
  draw("Qty", col.qty, y - 2, { size: 8, font: bold, color: rgb(0.973, 0.816, 0.773) });
  drawRight("Rate", col.rate + 40, y - 2, { size: 8, font: bold, color: rgb(0.973, 0.816, 0.773) });
  drawRight("Amount", col.amount, y - 2, { size: 8, font: bold, color: rgb(0.973, 0.816, 0.773) });
  y -= 26;

  items.forEach((item, i) => {
    if (i % 2 === 1) {
      page.drawRectangle({ x: left, y: y - 6, width: right - left, height: 18, color: paleRow });
    }
    draw(item.nameSnapshot, col.desc, y, { size: 9 });
    draw(hsnCode, col.hsn, y, { size: 9, color: grey });
    draw(String(item.quantity), col.qty, y, { size: 9 });
    drawRight(money(item.priceSnapshot), col.rate + 40, y, { size: 9 });
    drawRight(money(item.priceSnapshot * item.quantity), col.amount, y, { size: 9 });
    y -= 18;
  });

  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.85, 0.8, 0.7) });
  y -= 18;

  // --- Tax breakdown ---
  const taxColLabel = 360;
  draw("Taxable Value", taxColLabel, y, { size: 9, color: grey });
  drawRight(money(gst.taxableValue), right - 6, y, { size: 9 });
  y -= 15;

  if (gst.type === "intra") {
    draw(`Output CGST @ ${gst.rate.toFixed(2)}%`, taxColLabel, y, { size: 9, color: grey });
    drawRight(money(gst.cgstAmount), right - 6, y, { size: 9 });
    y -= 15;
    draw(`Output SGST @ ${gst.rate.toFixed(2)}%`, taxColLabel, y, { size: 9, color: grey });
    drawRight(money(gst.sgstAmount), right - 6, y, { size: 9 });
    y -= 15;
  } else {
    draw(`Output IGST @ ${gst.rate.toFixed(2)}%`, taxColLabel, y, { size: 9, color: grey });
    drawRight(money(gst.igstAmount), right - 6, y, { size: 9 });
    y -= 15;
  }

  if (order.shippingFee > 0) {
    draw("Shipping (Carriage Outwards)", taxColLabel, y, { size: 9, color: grey });
    drawRight(money(order.shippingFee), right - 6, y, { size: 9 });
    y -= 15;
  }

  y -= 4;
  page.drawLine({ start: { x: taxColLabel, y: y + 11 }, end: { x: right, y: y + 11 }, thickness: 0.5, color: grey });
  draw("Total", taxColLabel, y, { size: 12, font: bold, color: maroon });
  drawRight(money(order.total), right - 6, y, { size: 12, font: bold, color: maroon });

  y -= 28;
  draw("Amount Chargeable (in words)", left, y, { size: 8, color: grey });
  y -= 13;
  draw(rupeesInWords(order.total), left, y, { size: 10, font: bold });

  // --- HSN/SAC summary ---
  y -= 26;
  page.drawRectangle({ x: left, y: y - 8, width: right - left, height: 20, color: paleRow });
  draw("HSN/SAC", left + 6, y - 2, { size: 8, font: bold, color: maroon });
  draw("Taxable Value", 160, y - 2, { size: 8, font: bold, color: maroon });
  if (gst.type === "intra") {
    draw("CGST", 280, y - 2, { size: 8, font: bold, color: maroon });
    draw("SGST", 370, y - 2, { size: 8, font: bold, color: maroon });
  } else {
    draw("IGST", 320, y - 2, { size: 8, font: bold, color: maroon });
  }
  drawRight("Total Tax", right - 6, y - 2, { size: 8, font: bold, color: maroon });
  y -= 24;

  draw(hsnCode, left + 6, y, { size: 9 });
  draw(money(gst.taxableValue), 160, y, { size: 9 });
  if (gst.type === "intra") {
    draw(`${gst.rate.toFixed(2)}%  ${money(gst.cgstAmount)}`, 280, y, { size: 9 });
    draw(`${gst.rate.toFixed(2)}%  ${money(gst.sgstAmount)}`, 370, y, { size: 9 });
    drawRight(money(gst.cgstAmount + gst.sgstAmount), right - 6, y, { size: 9 });
  } else {
    draw(`${gst.rate.toFixed(2)}%  ${money(gst.igstAmount)}`, 320, y, { size: 9 });
    drawRight(money(gst.igstAmount), right - 6, y, { size: 9 });
  }

  // --- Footer ---
  y -= 40;
  draw("Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", left, y, { size: 7.5, color: grey });
  y -= 30;
  drawRight(`for ${businessName}`, right, y, { size: 9, font: bold, color: maroon });
  y -= 28;
  drawRight("Authorised Signatory", right, y, { size: 8, color: grey });

  y -= 26;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.85, 0.8, 0.7) });
  y -= 14;
  draw("Thank you for your order — hand-roasted in Mysore since 1950.", left, y, { size: 8, color: grey });
  y -= 12;
  draw("This is a computer-generated invoice and does not require a signature.", left, y, { size: 7.5, color: grey });

  return doc.save();
}
