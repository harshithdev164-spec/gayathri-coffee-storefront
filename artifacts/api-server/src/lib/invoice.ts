import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Order, OrderItem } from "@workspace/db";
import { computeGst, gstStateCode } from "./gst";
import { rupeesInWords, twoDigits } from "./number-to-words";
import { logger } from "./logger";
import { EMAIL_LOGO_BASE64, EMAIL_LOGO_ASPECT } from "./email-logo";
import { carrierName, parseItem } from "./item-format";

function money(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `Rs. ${rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const plain = (amount: number) => (Math.round(amount * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "26-Sep-26", the way Indian tax invoices print dates.
function shortDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }).replace(/ /g, "-").replace("Sept", "Sep");
}

function printedOn(date: Date): string {
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  return `Printed on ${shortDate(date)} at ${time}`;
}

// "Four Hundred Ninety Nine and Five Paise" for the tax-in-words line.
function taxInWords(amount: number): string {
  const whole = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - whole) * 100);
  const base = rupeesInWords(whole).replace(/ Only$/, "");
  return paise > 0 ? `${base} and ${twoDigits(paise)} Paise Only` : `${base} Only`;
}

// Uses the logo embedded in the code, so it can't go missing if the site's asset URLs change.
function loadLogoBytes(): Uint8Array {
  return new Uint8Array(Buffer.from(EMAIL_LOGO_BASE64, "base64"));
}

// The PDF's built-in fonts can only print Latin-1 characters and cannot print line breaks at all —
// either one makes pdf-lib throw, which used to break invoices for customers who typed a two-line
// address or used an emoji. Anything unsupported becomes "?".
function printable(text: string): string {
  return text.replace(/[^\n\x20-\x7E -ÿ–—‘’“”•…]/g, "?");
}

// Each printed copy is labelled the way Indian tax invoices are: original for the buyer, duplicate for
// the transporter, triplicate for the seller, then plain extra copies.
const COPY_LABELS = ["ORIGINAL FOR RECIPIENT", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR SUPPLIER"];
const copyLabel = (index: number) => COPY_LABELS[index] ?? "EXTRA COPY";

export async function generateInvoicePdf(order: Order, items: OrderItem[], copies = 1): Promise<Uint8Array> {
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
  const gstRate = gst.type === "intra" ? gst.rate * 2 : gst.rate;

  // Prices are GST-inclusive: show both the inclusive rate and the rate before tax, and make the
  // line amounts add up to exactly the taxable value (any paisa of rounding goes on the last line).
  const lines = items.map((item) => {
    const parsed = parseItem(item.nameSnapshot, item.quantity);
    const rateExcl = Math.round((item.priceSnapshot / (1 + gstRate / 100)) * 100) / 100;
    return { item, parsed, rateExcl, amount: Math.round(((item.priceSnapshot * item.quantity) / (1 + gstRate / 100)) * 100) / 100 };
  });
  const linesTotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const drift = Math.round((gst.taxableValue - linesTotal) * 100) / 100;
  if (lines.length > 0 && drift !== 0) lines[lines.length - 1]!.amount = Math.round((lines[lines.length - 1]!.amount + drift) * 100) / 100;
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalTax = gst.type === "intra" ? gst.cgstAmount + gst.sgstAmount : gst.igstAmount;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  let logoImage: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
  try {
    const logoBytes = loadLogoBytes();
    logoImage = logoBytes[0] === 0x89 ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes);
  } catch (err) {
    logger.warn({ err }, "Could not embed invoice logo image");
  }

  const maroon = rgb(0.404, 0.137, 0.176); // #67232d
  const dark = rgb(0.13, 0.08, 0.06);
  const grey = rgb(0.4, 0.35, 0.32);
  const soft = rgb(0.973, 0.949, 0.918);
  const rule = rgb(0.78, 0.7, 0.62);
  const headText = rgb(0.976, 0.906, 0.773); // #f9e7c5

  const W = 595.28;
  const H = 841.89;
  const L = 36;
  const R = W - 36;
  const BW = R - L;
  const bottomLimit = H - 34;
  const now = new Date();

  type Style = { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> };
  let page!: PDFPage;

  // All y values below are measured from the TOP of the page, like a layout on paper.
  const txt = (text: string, x: number, top: number, s: Style = {}) => {
    page.drawText(printable(text).replace(/\n/g, " "), { x, y: H - top, size: s.size ?? 9, font: s.font ?? font, color: s.color ?? dark });
  };
  const txtRight = (text: string, xRight: number, top: number, s: Style = {}) => {
    const f = s.font ?? font;
    const clean = printable(text).replace(/\n/g, " ");
    txt(clean, xRight - f.widthOfTextAtSize(clean, s.size ?? 9), top, s);
  };
  const txtCenter = (text: string, xMid: number, top: number, s: Style = {}) => {
    const f = s.font ?? font;
    const clean = printable(text).replace(/\n/g, " ");
    txt(clean, xMid - f.widthOfTextAtSize(clean, s.size ?? 9) / 2, top, s);
  };
  const hline = (x1: number, x2: number, top: number, color = maroon, thickness = 0.6) =>
    page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness, color });
  const vline = (x: number, top1: number, top2: number, color = maroon, thickness = 0.6) =>
    page.drawLine({ start: { x, y: H - top1 }, end: { x, y: H - top2 }, thickness, color });
  const box = (x: number, top: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y: H - top - h, width: w, height: h, borderColor: maroon, borderWidth: 0.6, ...(fill ? { color: fill } : {}) });

  const wrap = (text: string, maxWidth: number, size: number, f: PDFFont = font): string[] => {
    const out: string[] = [];
    for (const paragraph of printable(text).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const attempt = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(attempt, size) <= maxWidth || !line) line = attempt;
        else { out.push(line); line = word; }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [""];
  };

  // Table columns: Sl No | Description | Quantity | Rate (incl. tax) | Rate | per | Amount
  const colW = [28, 205, 62, 62, 58, 36, BW - (28 + 205 + 62 + 62 + 58 + 36)];
  const colX: number[] = [];
  colW.reduce((acc, w, i) => { colX[i] = acc; return acc + w; }, L);
  const colEnd = (i: number) => colX[i]! + colW[i]!;

  const LW = 270; // width of the supplier / consignee / buyer column
  const MX = L + LW; // where the invoice-details grid starts
  const pad = 6;

  // Ship-to / bill-to blocks
  const shipLines = (name: string, address: string, city: string | null, state: string | null, pincode: string, phone: string) => {
    const out: { text: string; font?: PDFFont; size?: number }[] = [{ text: name, font: bold, size: 9.5 }];
    if (address.trim()) {
      for (const l of wrap(address, LW - pad * 2, 8.5)) out.push({ text: l, size: 8.5 });
      const place = `${[city, state].filter(Boolean).join(", ")}${pincode ? ` - ${pincode}` : ""}, India`;
      out.push({ text: place, size: 8.5 });
    } else {
      out.push({ text: "Collected in store", size: 8.5 });
    }
    if (phone.trim()) out.push({ text: `Mob : ${phone}`, size: 8.5 });
    return out;
  };

  const hasBilling = Boolean(order.billingAddress);
  const shipTo = shipLines(order.customerName, order.address, order.city, order.state, order.pincode, order.phone);
  const billTo = hasBilling
    ? shipLines(order.customerName, order.billingAddress ?? "", order.billingCity, order.billingState, order.billingPincode ?? "", order.phone)
    : shipTo;
  const billState = hasBilling ? order.billingState : order.state;
  const billStateCode = hasBilling ? gstStateCode(order.billingState) : customerStateCode;

  const LEAD = 11;
  const partyHeight = (rows: unknown[], hasState: boolean) => pad + 10 + rows.length * LEAD + (hasState ? LEAD : 0) + pad;

  const businessRows: { text: string; font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> }[] = [
    { text: businessName, font: bold, size: 11, color: maroon },
    ...businessAddressLines.flatMap((l) => wrap(l, LW - 66 - pad, 8.5).map((text) => ({ text, size: 8.5, color: grey }))),
    { text: `GSTIN/UIN: ${businessGstin}`, size: 8.5, color: grey },
    { text: `State Name : ${businessState}, Code : ${businessStateCode}`, size: 8.5, color: grey },
    { text: `Contact : ${businessPhone}`, size: 8.5, color: grey },
    { text: businessWebsite, size: 8.5, color: grey },
  ];
  const sellerH = Math.max(86, pad * 2 + businessRows.length * LEAD + 4);
  const shipH = partyHeight(shipTo, Boolean(order.state));
  const billH = partyHeight(billTo, Boolean(billState));
  const GRID_ROW = 29;
  const stackH = Math.max(sellerH + shipH + billH, GRID_ROW * 6 + 50);

  // ---------------------------------------------------------------- one invoice page per copy
  const drawCopy = (index: number) => {
    page = doc.addPage([W, H]);
    let top = 34;

    // Title strip
    txtRight(printedOn(now), R, top, { size: 8, font: italic, color: grey });
    txtRight(`(${copyLabel(index)})`, R, top + 11, { size: 8.5, font: italic, color: grey });
    txtCenter("Tax Invoice", (L + R) / 2, top + 14, { size: 17, font: bold, color: maroon });
    top += 24;

    // Outer box: supplier / consignee / buyer on the left, invoice details on the right
    const boxTop = top;
    box(L, boxTop, BW, stackH);
    vline(MX, boxTop, boxTop + stackH);

    // Supplier
    if (logoImage) {
      const lh = 62;
      page.drawImage(logoImage, { x: L + pad, y: H - boxTop - pad - lh, width: lh * EMAIL_LOGO_ASPECT, height: lh });
    }
    let ty = boxTop + pad + 8;
    for (const row of businessRows) {
      txt(row.text, L + 66, ty, { size: row.size, font: row.font, color: row.color });
      ty += LEAD;
    }
    hline(L, MX, boxTop + sellerH);

    // Consignee
    const shipTop = boxTop + sellerH;
    txt("Consignee (Ship to)", L + pad, shipTop + pad + 4, { size: 8, color: grey });
    let sy = shipTop + pad + 4 + LEAD;
    for (const row of shipTo) { txt(row.text, L + pad, sy, { size: row.size, font: row.font }); sy += LEAD; }
    if (order.state) txt(`State Name : ${order.state}, Code : ${customerStateCode ?? "-"}`, L + pad, sy, { size: 8.5 });
    hline(L, MX, shipTop + shipH);

    // Buyer
    const billTop = shipTop + shipH;
    txt("Buyer (Bill to)", L + pad, billTop + pad + 4, { size: 8, color: grey });
    let by = billTop + pad + 4 + LEAD;
    for (const row of billTo) { txt(row.text, L + pad, by, { size: row.size, font: row.font }); by += LEAD; }
    if (billState) txt(`State Name : ${billState}, Code : ${billStateCode ?? "-"}`, L + pad, by, { size: 8.5 });

    // Invoice details grid (2 columns x 6 rows, then Terms of Delivery)
    const half = (R - MX) / 2;
    const cells: [string, string][][] = [
      [["Invoice No.", order.invoiceNumber ?? order.orderNumber], ["Dated", shortDate(order.createdAt)]],
      [["Delivery Note", ""], ["Mode/Terms of Payment", `${order.paymentMethod} (${order.paymentStatus})`]],
      [["Reference No. & Date.", ""], ["Other References", `Order No. ${order.orderNumber}`]],
      [["Buyer's Order No.", order.orderNumber], ["Dated", shortDate(order.createdAt)]],
      [["Dispatch Doc No.", order.trackingNumber ?? ""], ["Delivery Note Date", ""]],
      [["Dispatched through", order.courierName ?? carrierName(order.shippingMethod)], ["Destination", [order.city, order.state].filter(Boolean).join(", ")]],
    ];
    cells.forEach((row, r) => {
      const rowTop = boxTop + r * GRID_ROW;
      row.forEach(([label, value], c) => {
        const x = MX + c * half + pad;
        txt(label, x, rowTop + 9.5, { size: 7.5, color: grey });
        if (value) txt(wrap(value, half - pad * 2, 9, bold)[0]!, x, rowTop + 21.5, { size: 9, font: bold });
      });
      if (r > 0) hline(MX, R, rowTop);
    });
    vline(MX + half, boxTop, boxTop + GRID_ROW * 6);
    hline(MX, R, boxTop + GRID_ROW * 6);
    txt("Terms of Delivery", MX + pad, boxTop + GRID_ROW * 6 + 11, { size: 7.5, color: grey });

    top = boxTop + stackH;

    // ------------------------------------------------------------ item table
    const FOOTER_H = 250;
    const drawTableHeader = () => {
      page.drawRectangle({ x: L, y: H - top - 26, width: BW, height: 26, color: maroon });
      txtCenter("Sl", colX[0]! + colW[0]! / 2, top + 11, { size: 8, font: bold, color: headText });
      txtCenter("No.", colX[0]! + colW[0]! / 2, top + 21, { size: 8, font: bold, color: headText });
      txtCenter("Description of Goods", colX[1]! + colW[1]! / 2, top + 16, { size: 9, font: bold, color: headText });
      txtCenter("Quantity", colX[2]! + colW[2]! / 2, top + 16, { size: 9, font: bold, color: headText });
      txtCenter("Rate", colX[3]! + colW[3]! / 2, top + 11, { size: 9, font: bold, color: headText });
      txtCenter("(Incl. of Tax)", colX[3]! + colW[3]! / 2, top + 21, { size: 7.5, font: bold, color: headText });
      txtCenter("Rate", colX[4]! + colW[4]! / 2, top + 16, { size: 9, font: bold, color: headText });
      txtCenter("per", colX[5]! + colW[5]! / 2, top + 16, { size: 9, font: bold, color: headText });
      txtCenter("Amount", colX[6]! + colW[6]! / 2, top + 16, { size: 9, font: bold, color: headText });
      top += 26;
    };

    // Closes the table body on this page: bottom rule plus the vertical column rules.
    const closeBody = (bodyTop: number, bodyBottom: number) => {
      for (let i = 0; i < colX.length; i++) vline(colX[i]!, bodyTop, bodyBottom);
      vline(R, bodyTop, bodyBottom);
      hline(L, R, bodyBottom);
    };

    drawTableHeader();
    let bodyTop = top;
    top += 6;

    lines.forEach((line, n) => {
      const detail = [line.parsed.grind ? `Grind: ${line.parsed.grind}` : null, line.parsed.size].filter(Boolean).join("  |  ");
      const nameLines = wrap(line.parsed.product, colW[1]! - 12, 9.5, bold);
      const rowH = nameLines.length * 11.5 + (detail ? 11 : 0) + 6;
      if (top + rowH > bottomLimit - 40) {
        closeBody(bodyTop, top);
        page = doc.addPage([W, H]);
        top = 34;
        drawTableHeader();
        bodyTop = top;
        top += 6;
      }
      txtCenter(String(n + 1), colX[0]! + colW[0]! / 2, top + 8, { size: 9 });
      nameLines.forEach((l, i) => txt(l, colX[1]! + 6, top + 8 + i * 11.5, { size: 9.5, font: bold }));
      if (detail) txt(detail, colX[1]! + 12, top + 8 + nameLines.length * 11.5, { size: 8.5, font: italic, color: grey });
      txtRight(`${line.item.quantity} Nos`, colEnd(2) - 6, top + 8, { size: 9.5, font: bold });
      txtRight(plain(line.item.priceSnapshot), colEnd(3) - 6, top + 8, { size: 9 });
      txtRight(plain(line.rateExcl), colEnd(4) - 6, top + 8, { size: 9 });
      txtCenter("Nos", colX[5]! + colW[5]! / 2, top + 8, { size: 9 });
      txtRight(plain(line.amount), colEnd(6) - 6, top + 8, { size: 9.5, font: bold });
      top += rowH;
    });

    // Tax and charge rows sit in the table body, right-aligned like the printed template.
    top += 8;
    const chargeRow = (label: string, ratePct: string | null, amount: number, f: PDFFont = boldItalic) => {
      txtRight(label, colEnd(1) - 8, top + 8, { size: 9, font: f });
      if (ratePct) txtRight(`${ratePct} %`, colEnd(5) - 6, top + 8, { size: 9, font: italic });
      txtRight(plain(amount), colEnd(6) - 6, top + 8, { size: 9.5, font: bold });
      top += 15;
    };
    if (gst.type === "intra") {
      chargeRow(`Output CGST @ ${gst.rate}%`, String(gst.rate), gst.cgstAmount);
      chargeRow(`Output SGST @ ${gst.rate}%`, String(gst.rate), gst.sgstAmount);
    } else {
      chargeRow(`Output IGST @ ${gst.rate}%`, String(gst.rate), gst.igstAmount);
    }
    if (order.shippingFee > 0) chargeRow("Shipping (Carriage Outwards)", null, order.shippingFee);
    if (order.packagingFee > 0) chargeRow("Packaging charge", null, order.packagingFee);

    // Let the body stretch down so the totals sit at the bottom of the page when there is room.
    const bodyBottom = Math.max(top + 4, bottomLimit - FOOTER_H);
    closeBody(bodyTop, bodyBottom);
    top = bodyBottom;

    // Footer sections may need a fresh page when the body ran long.
    if (top + FOOTER_H > bottomLimit + 40) {
      page = doc.addPage([W, H]);
      top = 34;
    }

    // Total row
    const totalRowTop = top;
    box(L, totalRowTop, BW, 22, soft);
    txtRight("Total", colEnd(1) - 8, totalRowTop + 15, { size: 10, font: bold });
    txtRight(`${totalQty} Nos`, colEnd(2) - 6, totalRowTop + 15, { size: 10, font: bold });
    txtRight(money(order.total), R - 6, totalRowTop + 15, { size: 11, font: bold, color: maroon });
    top += 22;

    // Amount in words
    box(L, top, BW, 34);
    txt("Amount Chargeable (in words)", L + pad, top + 11, { size: 8, color: grey });
    txtRight("E. & O.E", R - pad, top + 11, { size: 8, font: italic, color: grey });
    txt(wrap(rupeesInWords(order.total), BW - pad * 2, 10, bold)[0]!, L + pad, top + 26, { size: 10, font: bold });
    top += 34;

    // HSN / SAC summary
    const hsnCols = gst.type === "intra"
      ? [66, 84, 56, 78, 56, 78, BW - 418]
      : [150, 110, 70, 100, BW - 430];
    const hsnX: number[] = [];
    hsnCols.reduce((acc, w, i) => { hsnX[i] = acc; return acc + w; }, L);
    const hsnHead = gst.type === "intra"
      ? ["HSN/SAC", "Taxable Value", "CGST %", "CGST Amount", "SGST %", "SGST Amount", "Total Tax"]
      : ["HSN/SAC", "Taxable Value", "IGST %", "IGST Amount", "Total Tax"];
    const hsnRow = (values: string[], rowTop: number, h: number, f: PDFFont, fill?: ReturnType<typeof rgb>) => {
      box(L, rowTop, BW, h, fill);
      values.forEach((v, i) => {
        if (i > 0) vline(hsnX[i]!, rowTop, rowTop + h);
        if (i === 0) txt(v, hsnX[i]! + pad, rowTop + h / 2 + 3, { size: 8.5, font: f });
        else txtRight(v, hsnX[i]! + hsnCols[i]! - pad, rowTop + h / 2 + 3, { size: 8.5, font: f });
      });
    };
    hsnRow(hsnHead, top, 20, bold, soft);
    top += 20;
    const rateText = `${gst.rate}%`;
    const hsnValues = gst.type === "intra"
      ? [hsnCode, plain(gst.taxableValue), rateText, plain(gst.cgstAmount), rateText, plain(gst.sgstAmount), plain(totalTax)]
      : [hsnCode, plain(gst.taxableValue), rateText, plain(gst.igstAmount), plain(totalTax)];
    hsnRow(hsnValues, top, 18, font);
    top += 18;
    const hsnTotals = gst.type === "intra"
      ? ["Total", plain(gst.taxableValue), "", plain(gst.cgstAmount), "", plain(gst.sgstAmount), plain(totalTax)]
      : ["Total", plain(gst.taxableValue), "", plain(gst.igstAmount), plain(totalTax)];
    hsnRow(hsnTotals, top, 18, bold);
    top += 18;

    // Tax in words + PAN
    box(L, top, BW, 20);
    txt("Tax Amount (in words) :", L + pad, top + 13, { size: 8.5 });
    txt(wrap(taxInWords(totalTax), BW - 130, 9, bold)[0]!, L + pad + 98, top + 13, { size: 9, font: bold });
    top += 20;
    box(L, top, BW, 18);
    txt("Company's PAN :", L + pad, top + 12, { size: 8.5 });
    txt(businessPan, L + pad + 70, top + 12, { size: 9, font: bold });
    top += 18;

    // Declaration + signature
    const signH = 66;
    box(L, top, BW / 2 + 20, signH);
    box(L + BW / 2 + 20, top, BW / 2 - 20, signH);
    txt("Declaration", L + pad, top + 12, { size: 8.5, font: bold, color: maroon });
    wrap("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", BW / 2 + 20 - pad * 2, 8)
      .forEach((l, i) => txt(l, L + pad, top + 24 + i * 10, { size: 8, color: grey }));
    txtRight(`for ${businessName}`, R - pad, top + 14, { size: 9.5, font: bold, color: maroon });
    txtRight("Authorised Signatory", R - pad, top + signH - 8, { size: 8.5, color: grey });
    top += signH + 10;

    txtCenter("This is a Computer Generated Invoice", (L + R) / 2, top + 4, { size: 8.5, color: grey });
    txtCenter("Thank you for your order - hand-roasted in Mysore since 1950.", (L + R) / 2, top + 16, { size: 8.5, font: italic, color: grey });
  };

  const count = Math.min(Math.max(Math.round(copies) || 1, 1), 20);
  for (let i = 0; i < count; i++) drawCopy(i);
  return doc.save();
}
