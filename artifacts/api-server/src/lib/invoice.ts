import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Order, OrderItem } from "@workspace/db";
import { computeGst, gstStateCode } from "./gst";
import { rupeesInWords } from "./number-to-words";
import { logger } from "./logger";
import { EMAIL_LOGO_BASE64, EMAIL_LOGO_ASPECT } from "./email-logo";

function money(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `Rs. ${rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Uses the logo embedded in the code, so it can't go missing if the site's asset URLs change.
function loadLogoBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(EMAIL_LOGO_BASE64, "base64"));
}

// The PDF's built-in fonts can only print Latin-1 characters and cannot print line breaks at all —
// either one makes pdf-lib throw, which used to break invoices for customers who typed a two-line
// address or used an emoji. Anything unsupported becomes "?".
function printable(text: string): string {
  return text.replace(/[^\n\x20-\x7E -ÿ–—‘’“”•…]/g, "?");
}

export async function generateInvoicePdf(order: Order, items: OrderItem[]): Promise<Uint8Array> {
  const businessName = process.env.INVOICE_BUSINESS_NAME ?? "Gayathri Coffee Works";
  const businessAddressLines = (process.env.INVOICE_BUSINESS_ADDRESS ?? "33B, Belavadi Industrial Area, Yalawala Hobli, Mysore\nNo 7, Duplin Complex, Shivarampet, Mysore").split("\n");
  const businessGstin = process.env.INVOICE_BUSINESS_GSTIN ?? "29AABFG2580N1Z1";
  const businessPan = process.env.INVOICE_BUSINESS_PAN ?? "AABFG2580N";
  // Mobile numbers only - landline numbers (0821 ...) are dropped from the invoice.
  const businessPhone = (process.env.INVOICE_BUSINESS_PHONE ?? "+91-9141737288")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => /^(\+?91[\s-]?)?[6-9]\d{9}$/.test(n.replace(/[\s-]/g, "").replace(/^\+?91/, "")))
    .join(", ") || "+91-9141737288";
  const businessWebsite = process.env.INVOICE_BUSINESS_WEBSITE ?? "www.gayathricoffee.com";
  const businessState = process.env.INVOICE_BUSINESS_STATE ?? "Karnataka";
  const businessStateCode = process.env.INVOICE_BUSINESS_STATE_CODE ?? "29";
  const hsnCode = process.env.INVOICE_HSN_CODE ?? "0901";

  const gst = computeGst(order.subtotal, order.state, businessState);
  const customerStateCode = gstStateCode(order.state);

  const doc = await PDFDocument.create();
  let page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const maroon = rgb(0.404, 0.137, 0.176); // #67232d
  const dark = rgb(0.165, 0.086, 0.047);
  const grey = rgb(0.4, 0.35, 0.32);
  const paleRow = rgb(0.973, 0.973, 0.957);
  const ruleColor = rgb(0.85, 0.8, 0.7);
  const headText = rgb(0.973, 0.816, 0.773);

  const left = 42;
  const right = 553.28;
  const pageTop = 800;
  const pageBottom = 50;
  let y = pageTop;

  type Style = { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> };

  const draw = (text: string, x: number, yPos: number, opts: Style = {}) => {
    page.drawText(printable(text).replace(/\n/g, " "), { x, y: yPos, size: opts.size ?? 10.5, font: opts.font ?? font, color: opts.color ?? dark });
  };

  const drawRight = (text: string, xRight: number, yPos: number, opts: Style = {}) => {
    const size = opts.size ?? 10.5;
    const f = opts.font ?? font;
    const clean = printable(text).replace(/\n/g, " ");
    draw(clean, xRight - f.widthOfTextAtSize(clean, size), yPos, opts);
  };

  // Breaks text (including the customer's own line breaks) into lines that fit `maxWidth`.
  const wrap = (text: string, maxWidth: number, size: number, f: PDFFont = font): string[] => {
    const lines: string[] = [];
    for (const paragraph of printable(text).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const attempt = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(attempt, size) <= maxWidth || !line) line = attempt;
        else { lines.push(line); line = word; }
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [""];
  };

  // --- Logo + title ---
  const logoBytes = loadLogoBytes();
  let logoX = left;
  if (logoBytes) {
    try {
      const isPng = logoBytes[0] === 0x89;
      const image = isPng ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);
      const height = 62;
      const width = height * EMAIL_LOGO_ASPECT;
      page.drawImage(image, { x: left, y: y - height + 10, width, height });
      logoX = left + width + 12;
    } catch (err) {
      logger.warn({ err }, "Could not embed invoice logo image");
    }
  }

  const title = "TAX INVOICE";
  draw(title, (right + left) / 2 - bold.widthOfTextAtSize(title, 19) / 2, y + 8, { size: 19, font: bold, color: maroon });
  y -= 20;

  draw(businessName, logoX, y, { size: 15, font: bold, color: maroon });
  y -= 16;
  for (const line of businessAddressLines) {
    draw(line, logoX, y, { size: 10, color: grey });
    y -= 13;
  }
  draw(`GSTIN/UIN: ${businessGstin}  |  PAN: ${businessPan}`, logoX, y, { size: 10, color: grey });
  y -= 13;
  draw(`State: ${businessState}, Code: ${businessStateCode}`, logoX, y, { size: 10, color: grey });
  y -= 13;
  draw(`Ph: ${businessPhone}  |  ${businessWebsite}`, logoX, y, { size: 10, color: grey });

  y -= 20;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: maroon });
  y -= 22;

  // --- Invoice meta: bill number, order number, place of supply, date ---
  const metaLabel: Style = { size: 9.5, color: grey };
  const metaValue: Style = { size: 13, font: bold };
  draw("Invoice No.", left, y, metaLabel);
  draw(order.invoiceNumber ?? order.orderNumber, left, y - 16, metaValue);
  draw("Order No.", 160, y, metaLabel);
  draw(order.orderNumber, 160, y - 16, metaValue);
  draw("Place of Supply", 285, y, metaLabel);
  draw(`${order.state ?? "—"}${customerStateCode ? ` (${customerStateCode})` : ""}`, 285, y - 16, { size: 11.5, font: bold });
  drawRight("Invoice Date", right, y, metaLabel);
  drawRight(formatDate(order.createdAt), right, y - 16, metaValue);

  y -= 40;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: ruleColor });
  y -= 22;

  // --- Consignee (Ship to) / Buyer (Bill to) ---
  const colWidth = (right - left - 24) / 2;
  const addrTop = y;
  const addrSize = 10.5;
  const addrLead = 13.5;

  draw("Consignee (Ship to)", left, y, metaLabel);
  let sy = y - 16;
  draw(order.customerName, left, sy, { size: 12.5, font: bold });
  sy -= 15;
  if (order.address.trim()) {
    for (const line of wrap(order.address, colWidth, addrSize)) {
      draw(line, left, sy, { size: addrSize, color: grey });
      sy -= addrLead;
    }
    draw(`${[order.city, order.state].filter(Boolean).join(", ")}${order.pincode ? ` - ${order.pincode}` : ""}, India`, left, sy, { size: addrSize, color: grey });
    sy -= addrLead;
  } else {
    // In-store sale: nothing was delivered anywhere.
    draw("Collected in store", left, sy, { size: addrSize, color: grey });
    sy -= addrLead;
  }
  if (order.phone.trim()) {
    draw(`Ph: ${order.phone}`, left, sy, { size: addrSize, color: grey });
  } else {
    sy += addrLead;
  }
  if (order.state) {
    sy -= addrLead;
    draw(`State: ${order.state}, Code: ${customerStateCode ?? "—"}`, left, sy, { size: addrSize, color: grey });
  }

  const hasSeparateBilling = Boolean(order.billingAddress);
  const bx = left + colWidth + 24;
  draw("Buyer (Bill to)", bx, addrTop, metaLabel);
  let by = addrTop - 16;
  draw(order.customerName, bx, by, { size: 12.5, font: bold });
  by -= 15;
  if (hasSeparateBilling) {
    const billingStateCode = gstStateCode(order.billingState);
    for (const line of wrap(order.billingAddress ?? "", colWidth, addrSize)) {
      draw(line, bx, by, { size: addrSize, color: grey });
      by -= addrLead;
    }
    draw(`${[order.billingCity, order.billingState].filter(Boolean).join(", ")}${order.billingPincode ? ` - ${order.billingPincode}` : ""}, India`, bx, by, { size: addrSize, color: grey });
    by -= addrLead;
    if (order.billingState) {
      draw(`State: ${order.billingState}, Code: ${billingStateCode ?? "—"}`, bx, by, { size: addrSize, color: grey });
      by -= addrLead;
    }
  } else {
    draw("Same as consignee", bx, by, { size: addrSize, color: grey });
    by -= addrLead;
  }

  y = Math.min(sy, by) - 38;

  // --- Item table ---
  const col = { desc: left + 8, hsn: 310, qty: 368, rate: right - 78, amount: right - 8 };
  const descWidth = col.hsn - col.desc - 12;

  const drawTableHeader = () => {
    page.drawRectangle({ x: left, y: y - 9, width: right - left, height: 26, color: maroon });
    draw("Description of Goods", col.desc, y - 1, { size: 10, font: bold, color: headText });
    draw("HSN", col.hsn, y - 1, { size: 10, font: bold, color: headText });
    draw("Qty", col.qty, y - 1, { size: 10, font: bold, color: headText });
    drawRight("Rate", col.rate, y - 1, { size: 10, font: bold, color: headText });
    drawRight("Amount", col.amount, y - 1, { size: 10, font: bold, color: headText });
    y -= 30;
  };
  drawTableHeader();

  items.forEach((item, i) => {
    const nameLines = wrap(item.nameSnapshot, descWidth, 11);
    const rowHeight = nameLines.length * 14 + 8;
    if (y - rowHeight < pageBottom + 260) {
      // keep room for the totals block; continue the table on a fresh page
      page = doc.addPage([595.28, 841.89]);
      y = pageTop;
      drawTableHeader();
    }
    if (i % 2 === 1) {
      page.drawRectangle({ x: left, y: y - rowHeight + 12, width: right - left, height: rowHeight, color: paleRow });
    }
    nameLines.forEach((line, n) => draw(line, col.desc, y - n * 14, { size: 11 }));
    draw(hsnCode, col.hsn, y, { size: 11, color: grey });
    draw(String(item.quantity), col.qty, y, { size: 11 });
    drawRight(money(item.priceSnapshot), col.rate, y, { size: 11 });
    drawRight(money(item.priceSnapshot * item.quantity), col.amount, y, { size: 11 });
    y -= rowHeight;
  });

  y -= 2;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: ruleColor });
  y -= 22;

  // --- Tax breakdown ---
  const taxColLabel = 318;
  const taxRow = (label: string, value: string) => {
    draw(label, taxColLabel, y, { size: 10.5, color: grey });
    drawRight(value, right - 8, y, { size: 10.5 });
    y -= 18;
  };

  taxRow("Taxable Value", money(gst.taxableValue));
  if (gst.type === "intra") {
    taxRow(`Output CGST @ ${gst.rate.toFixed(2)}%`, money(gst.cgstAmount));
    taxRow(`Output SGST @ ${gst.rate.toFixed(2)}%`, money(gst.sgstAmount));
  } else {
    taxRow(`Output IGST @ ${gst.rate.toFixed(2)}%`, money(gst.igstAmount));
  }
  if (order.shippingFee > 0) taxRow("Shipping (Carriage Outwards)", money(order.shippingFee));
  if (order.packagingFee > 0) taxRow("Packaging charge", money(order.packagingFee));

  y -= 2;
  page.drawLine({ start: { x: taxColLabel, y: y + 13 }, end: { x: right, y: y + 13 }, thickness: 0.5, color: grey });
  draw("Total", taxColLabel, y - 2, { size: 14, font: bold, color: maroon });
  drawRight(money(order.total), right - 8, y - 2, { size: 14, font: bold, color: maroon });

  y -= 32;
  draw("Amount Chargeable (in words)", left, y, metaLabel);
  y -= 16;
  for (const line of wrap(rupeesInWords(order.total), right - left, 11.5, bold)) {
    draw(line, left, y, { size: 11.5, font: bold });
    y -= 15;
  }

  // --- HSN/SAC summary ---
  y -= 14;
  page.drawRectangle({ x: left, y: y - 9, width: right - left, height: 24, color: paleRow });
  const hsnHead: Style = { size: 10, font: bold, color: maroon };
  draw("HSN/SAC", left + 8, y - 1, hsnHead);
  draw("Taxable Value", 130, y - 1, hsnHead);
  if (gst.type === "intra") {
    draw("CGST", 250, y - 1, hsnHead);
    draw("SGST", 360, y - 1, hsnHead);
  } else {
    draw("IGST", 300, y - 1, hsnHead);
  }
  drawRight("Total Tax", right - 8, y - 1, hsnHead);
  y -= 26;

  draw(hsnCode, left + 8, y, { size: 10.5 });
  draw(money(gst.taxableValue), 130, y, { size: 10.5 });
  if (gst.type === "intra") {
    draw(`${gst.rate.toFixed(2)}%  ${money(gst.cgstAmount)}`, 250, y, { size: 10.5 });
    draw(`${gst.rate.toFixed(2)}%  ${money(gst.sgstAmount)}`, 360, y, { size: 10.5 });
    drawRight(money(gst.cgstAmount + gst.sgstAmount), right - 8, y, { size: 10.5 });
  } else {
    draw(`${gst.rate.toFixed(2)}%  ${money(gst.igstAmount)}`, 300, y, { size: 10.5 });
    drawRight(money(gst.igstAmount), right - 8, y, { size: 10.5 });
  }

  // --- Footer ---
  y -= 34;
  for (const line of wrap("Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", right - left, 9)) {
    draw(line, left, y, { size: 9, color: grey });
    y -= 12;
  }
  y -= 18;
  drawRight(`for ${businessName}`, right, y, { size: 11, font: bold, color: maroon });
  y -= 30;
  drawRight("Authorised Signatory", right, y, { size: 9.5, color: grey });

  y -= 22;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: ruleColor });
  y -= 16;
  draw("Thank you for your order — hand-roasted in Mysore since 1950.", left, y, { size: 10, color: grey });
  y -= 14;
  draw("This is a computer-generated invoice and does not require a signature.", left, y, { size: 9, color: grey });

  return doc.save();
}
