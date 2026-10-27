import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  orderItemsTable,
  ordersTable,
  productVariantsTable,
  productsTable,
  whatsappEventsTable,
  type Order,
} from "@workspace/db";
import { logger } from "./logger";
import { readShippingSettings } from "./settings";
import { isWhatsAppConfigured, sendWhatsAppText } from "./whatsapp";
import {
  BRANCHES,
  CARE_WHATSAPP,
  FALLBACK_TEXT,
  MENU_TEXT,
  aboutText,
  branchesText,
  contactText,
  deliveryText,
  paymentText,
} from "./bot-knowledge";

// ───────────────────────── helpers ─────────────────────────

const last10 = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Order received",
  confirmed: "Confirmed — being packed",
  shipped: "Shipped 🚚",
  delivered: "Delivered ✅",
  cancelled: "Cancelled",
};

function sizeLabel(category: string, grams: number): string {
  if (category === "Decoction") return `${grams} ml`;
  return grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`;
}

// ───────────────────────── order tracking ─────────────────────────

type OrderRef = { orderNumber?: string; invoiceNumber?: string };

// Order numbers are 5 digits (19777…), old ones are GC + 6 digits, bills are ON + digits.
// A bare 6-digit number is treated as a pincode, not an order.
function extractOrderRef(text: string): OrderRef {
  const gc = text.match(/\bgc[\s-]?(\d{6})\b/i);
  if (gc) return { orderNumber: `GC${gc[1]}` };
  const bill = text.match(/\bon[\s-]?(\d{3,})\b/i);
  if (bill) return { invoiceNumber: `ON${bill[1]}` };
  const plain = text.match(/(?<![\d])(\d{5})(?![\d])/);
  if (plain) return { orderNumber: plain[1] };
  return {};
}

async function orderDetailsText(order: Order): Promise<string> {
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  const lines = [
    `*Order ${order.orderNumber}*${order.invoiceNumber ? ` (Bill ${order.invoiceNumber})` : ""}`,
    `Placed: ${formatDateTime(order.createdAt)}`,
    `Status: *${STATUS_LABEL[order.status] ?? order.status}*`,
    "",
    ...items.map((item) => `• ${item.nameSnapshot} × ${item.quantity}`),
    "",
    `Total: ${money(order.total)} (${order.paymentStatus === "paid" ? "paid" : "payment " + order.paymentStatus})`,
    `Delivery: ${order.shippingMethod === "shiprocket" ? "Fast delivery" : "Standard delivery (India Post)"}`,
    `To: ${order.city} ${order.pincode}`,
  ];

  if (order.status === "cancelled") {
    lines.push("", "This order was cancelled. Contact customer care if you have questions.");
  } else if (order.trackingNumber) {
    lines.push("");
    if (order.courierName) lines.push(`Courier: ${order.courierName}`);
    lines.push(`Tracking number: *${order.trackingNumber}*`);
    if (order.trackingUrl) lines.push(`Track here: ${order.trackingUrl}`);
    if (order.shippingMethod === "india_post") {
      lines.push("(On the India Post page, type your tracking number to see the latest status.)");
    }
  } else if (order.status === "delivered") {
    lines.push("", "Your order has been delivered. Thank you for choosing Gayathri Coffee! ☕");
  } else {
    lines.push("", "We're getting your order ready. You'll receive your tracking details here as soon as it ships.");
  }
  if (order.status !== "delivered" && order.status !== "cancelled" && order.shippingMethod !== "pickup") {
    lines.push("", order.shippingMethod === "shiprocket" ? "Expected delivery: about 2–4 business days after dispatch." : "Expected delivery: about 5–8 business days after dispatch.");
  }
  return lines.join("\n");
}

// What the bot says and, when it can't solve something itself, why a person should take over.
export type BotResult = { text: string; handoff?: string };

// Your own team numbers (ADMIN_WHATSAPP_NUMBERS) may look up any order.
function isStaffNumber(from: string): boolean {
  return (process.env.ADMIN_WHATSAPP_NUMBERS ?? "")
    .split(",")
    .map((entry) => last10(entry.split(":")[0] ?? ""))
    .filter(Boolean)
    .includes(last10(from));
}

// 10-digit Indian mobile numbers typed in the message, so a customer who ordered with a
// different number than the WhatsApp one they're using can prove it's theirs: "19777 9876543210".
function mobilesInText(text: string): string[] {
  return [...text.matchAll(/(?<!\d)(?:\+?91[\s-]?)?0?([6-9]\d{9})(?!\d)/g)].map((m) => m[1]!);
}

// Order numbers below this were placed before the current numbering began (19777 onwards), so they
// live in our earlier records and the bot can't look them up.
const FIRST_CURRENT_ORDER_NUMBER = 19777;

const HANDOFF_TEXT = [
  "Thanks for reaching out 🙏 I've passed your message to our team and they'll reply here as soon as they can.",
  "",
  `For anything urgent: call Mysuru ${BRANCHES[0]!.phone.split(" / ")[0]}, Bengaluru ${BRANCHES[1]!.phone.split(" / ")[0]}, or WhatsApp ${CARE_WHATSAPP}.`,
].join("\n");

const withHandoff = (reason: string, text: string = HANDOFF_TEXT): BotResult => ({ text, handoff: reason });

// How many "couldn't find that order" answers this customer just got — after two, a person steps in.
async function recentLookupFailures(from: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(whatsappEventsTable)
    .where(
      and(
        eq(whatsappEventsTable.type, "bot_reply"),
        eq(whatsappEventsTable.fromPhone, from),
        gte(whatsappEventsTable.createdAt, since),
        sql`${whatsappEventsTable.body} like 'I couldn''t find%'`,
      ),
    );
  return row?.count ?? 0;
}

// What anyone may see about an order just from its number or a mobile number: where it stands and how to track it.
// Name, address, phone and items stay private until the mobile number on the order is proven.
function limitedOrderLine(order: Order): string {
  const parts = [`*Order ${order.orderNumber}* — ${STATUS_LABEL[order.status] ?? order.status} (${formatDate(order.createdAt)})`];
  if (order.trackingNumber && order.status !== "cancelled") {
    parts.push(`   Tracking number: ${order.trackingNumber}${order.courierName ? ` (${order.courierName})` : ""}`);
    if (order.trackingUrl) parts.push(`   Track here: ${order.trackingUrl}`);
  } else if (order.status !== "delivered" && order.status !== "cancelled") {
    parts.push("   Tracking details will be shared once it ships.");
  }
  return parts.join("\n");
}

const VERIFY_HINT = "For full order details, send your order number together with the mobile number used while ordering, for example *19777 9876543210*.";

// A mobile number typed in the message: the sender's own number gets full details, any other number only the
// status and tracking of its orders.
async function trackByMobile(from: string, mobile: string, wantsHuman: boolean): Promise<BotResult> {
  if (last10(from) === mobile || isStaffNumber(from)) {
    const orders = await db
      .select()
      .from(ordersTable)
      .where(sql`right(regexp_replace(${ordersTable.phone}, '\D', '', 'g'), 10) = ${mobile}`)
      .orderBy(desc(ordersTable.createdAt))
      .limit(3);
    if (orders.length === 0) return trackBySender(from, wantsHuman);
    if (orders.length === 1) {
      const details = await orderDetailsText(orders[0]!);
      return wantsHuman ? withHandoff(`Customer reported a problem (order ${orders[0]!.orderNumber})`, `${details}\n\n${HANDOFF_TEXT}`) : { text: details };
    }
    return trackBySender(from, wantsHuman);
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(sql`right(regexp_replace(${ordersTable.phone}, '\D', '', 'g'), 10) = ${mobile}`)
    .orderBy(desc(ordersTable.createdAt))
    .limit(3);
  if (orders.length === 0) {
    return { text: `I couldn't find any orders for ${mobile}. Please check the number, or send your order number.\n\nCustomer care: WhatsApp ${CARE_WHATSAPP}.` };
  }
  return { text: [`*Orders for ${mobile}*`, "", ...orders.map(limitedOrderLine), "", VERIFY_HINT].join("\n") };
}

async function trackByReference(from: string, ref: OrderRef, text: string, wantsHuman: boolean): Promise<BotResult> {
  const condition = ref.invoiceNumber
    ? eq(ordersTable.invoiceNumber, ref.invoiceNumber)
    : eq(ordersTable.orderNumber, ref.orderNumber ?? "");
  const [order] = await db.select().from(ordersTable).where(condition).limit(1);

  // Order details are private: shown only to our own team, to the mobile number that placed the
  // order, or to someone who quotes that mobile number with the order number. Never confirm that
  // an order exists for anyone else.
  const allowed =
    order !== undefined &&
    (isStaffNumber(from) || last10(order.phone) === last10(from) || mobilesInText(text).includes(last10(order.phone)));

  if (order && allowed) {
    const details = await orderDetailsText(order);
    return wantsHuman
      ? withHandoff(`Customer reported a problem with order ${order.orderNumber}`, `${details}\n\n${HANDOFF_TEXT}`)
      : { text: details };
  }

  // The order exists but this person hasn't proven it's theirs: status and tracking only.
  if (order) {
    return { text: [limitedOrderLine(order), "", VERIFY_HINT].join("\n") };
  }

  // A 5-digit number below 19777 was placed before our current system — we can't see it, so a person must check.
  const plain = ref.orderNumber && /^\d{5}$/.test(ref.orderNumber) ? Number(ref.orderNumber) : null;
  if (plain !== null && plain < FIRST_CURRENT_ORDER_NUMBER) {
    return withHandoff(
      `Asked about order #${ref.orderNumber}, which is from before the current numbering (19777+). Needs a manual check.`,
      [
        `I can't see order #${ref.orderNumber} in my system — orders placed through our earlier system are checked by our team directly. 🙏`,
        "",
        "I've asked them to look into it and reply here. Please keep this chat open.",
        "",
        HANDOFF_TEXT.split("\n").slice(2).join("\n"),
      ].join("\n"),
    );
  }

  if ((await recentLookupFailures(from)) >= 2) {
    return withHandoff(
      `Customer couldn't be matched to order ${ref.orderNumber ?? ref.invoiceNumber} after repeated tries.`,
      [
        "I'm sorry — I still can't match that order to this number. 🙏",
        "",
        "I've handed this to our team so a person can check it for you.",
        "",
        HANDOFF_TEXT.split("\n").slice(2).join("\n"),
      ].join("\n"),
    );
  }

  return {
    text: [
      "I couldn't find that order for this WhatsApp number. 🤔",
      "",
      "Please check the order number and send it together with the mobile number used while ordering, for example:",
      "*19777 9876543210*",
      "",
      `Still stuck? Customer care is on WhatsApp ${CARE_WHATSAPP}.`,
    ].join("\n"),
  };
}

async function sendersOrders(from: string): Promise<Order[]> {
  return db
    .select()
    .from(ordersTable)
    .where(sql`right(regexp_replace(${ordersTable.phone}, '\D', '', 'g'), 10) = ${last10(from)}`)
    .orderBy(desc(ordersTable.createdAt))
    .limit(3);
}

async function trackBySender(from: string, wantsHuman = false): Promise<BotResult> {
  const orders = await sendersOrders(from);

  if (orders.length === 0) {
    const text = [
      "I couldn't find any orders for this WhatsApp number.",
      "",
      "Send your *order number* together with the mobile number you ordered with, for example *19777 9876543210* — or contact customer care on WhatsApp " + CARE_WHATSAPP + ".",
    ].join("\n");
    return wantsHuman ? withHandoff("Customer reported a problem but no order matches their number", `${text}\n\n${HANDOFF_TEXT}`) : { text };
  }

  const body =
    orders.length === 1
      ? await orderDetailsText(orders[0]!)
      : [
          "*Your recent orders*",
          "",
          ...orders.map((order) => `• ${order.orderNumber} — ${STATUS_LABEL[order.status] ?? order.status} — ${money(order.total)} (${formatDate(order.createdAt)})`),
          "",
          "Send an order number to see its full details and tracking.",
        ].join("\n");
  return wantsHuman ? withHandoff(`Customer reported a problem (latest order ${orders[0]!.orderNumber})`, `${body}\n\n${HANDOFF_TEXT}`) : { text: body };
}

// ───────────────────────── products ─────────────────────────

type CatalogProduct = {
  name: string;
  shortName: string;
  category: string;
  description: string;
  notes: string;
  variants: { weightGrams: number; price: number }[];
};

async function loadCatalog(): Promise<CatalogProduct[]> {
  const products = await db.select().from(productsTable).where(eq(productsTable.active, true));
  if (products.length === 0) return [];
  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(inArray(productVariantsTable.productId, products.map((p) => p.id)));
  return products.map((product) => ({
    name: product.name,
    shortName: product.shortName,
    category: product.category,
    description: product.description,
    notes: product.notes,
    variants: variants
      .filter((v) => v.productId === product.id)
      .map((v) => ({ weightGrams: v.weightGrams, price: v.price }))
      .sort((a, b) => a.weightGrams - b.weightGrams),
  }));
}

function productDetailText(product: CatalogProduct): string {
  return [
    `*${product.name}* (${product.category})`,
    product.description,
    product.notes ? `Cup notes: ${product.notes}` : "",
    "",
    "*Sizes & prices*",
    ...product.variants.map((v) => `• ${sizeLabel(product.category, v.weightGrams)} — ${money(v.price)}`),
    "",
    "Order on our website: www.gayathricoffee.com",
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");
}

function catalogText(products: CatalogProduct[]): string {
  const categories = [...new Set(products.map((p) => p.category))];
  const lines = ["*Our products*", ""];
  for (const category of categories) {
    lines.push(`*${category}*`);
    for (const product of products.filter((p) => p.category === category)) {
      const cheapest = Math.min(...product.variants.map((v) => v.price));
      lines.push(`• ${product.name} — from ${money(cheapest)}`);
    }
    lines.push("");
  }
  lines.push("Send a product name (for example *House Blend*) for its sizes and details.", "Order at www.gayathricoffee.com");
  return lines.join("\n");
}

// ───────────────────────── intent routing ─────────────────────────

const has = (text: string, words: string[]) => words.some((word) => text.includes(word));

// Someone upset, or with a problem only a person can fix: refunds, cancellations, missing or damaged parcels,
// money taken but no confirmation.
const PROBLEM = /\b(problem|issue|issues|complaint|complain|not received|didn'?t receive|did not receive|haven'?t received|have not received|not delivered|wrong|damaged|broken|missing|delayed?|late|stuck|refund|cancel(led|lation)?|return|replace(ment)?|cheat(ed)?|fraud|scam|angry|disappointed|worst|bad service|no response|not responding|deducted|debited|charged twice|double charge|payment (failed|not|issue|problem)|money)\b/;
const PAID_CLAIM = /\b(i (have|ve) (made|done) (all )?(the )?payments?|payment (is )?(done|made|completed)|i (have )?paid|already paid|amount (was )?(deducted|debited))\b/;
const WHEN_QUESTION = /\b(how many (more )?days|how long|when (will|can|do|would)|delivery date|expected (delivery|date)|eta|arrive|reach me|reach us|by when|how soon)\b/;
const BULK = /\b(bulk|wholesale|b2b|distributor|dealership|franchise|franchisee|hotel supply|supply to|25 ?kg|50 ?kg)\b/;
const ACK_WORDS = new Set(["ok", "okay", "okk", "okey", "thanks", "thank", "thankyou", "thx", "thanx", "ty", "you", "u", "so", "much", "a", "lot", "very", "fine", "great", "nice", "good", "cool", "done", "got", "it", "noted", "alright", "sure", "yes", "yeah", "yep", "k", "perfect", "awesome", "sir", "madam"]);
const isAcknowledgement = (text: string) => {
  const words = text.replace(/[^a-z0-9\u{1F300}-\u{1FAFF}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every((word) => ACK_WORDS.has(word) || /^[\u{1F300}-\u{1FAFF}]+$/u.test(word));
};
const BYE = /^(bye+|good ?bye|see you|tc|take care)[\s!.]*$/;
const GREETING = /^(hi+|hii+|hello+|hey+|hai|namaste|namaskara|good (morning|afternoon|evening)|menu|help|start|options?|hola)\b/;

const THANKS_TEXT = "You're welcome! 😊 If you need anything else, just type *menu*.";
const BYE_TEXT = "Thank you for choosing Gayathri Coffee! ☕ Have a lovely day.";

export async function buildBotReply(from: string, rawText: string): Promise<BotResult> {
  const text = rawText.trim().toLowerCase().replace(/\s+/g, " ");
  const wantsHuman = PROBLEM.test(text) || PAID_CLAIM.test(text);

  const ref = extractOrderRef(text);
  if (ref.orderNumber || ref.invoiceNumber) return trackByReference(from, ref, text, wantsHuman);

  if (text === "") return { text: MENU_TEXT };

  // A mobile number anywhere in the message finds that customer's orders.
  const typedMobile = mobilesInText(text)[0];
  if (typedMobile) return trackByMobile(from, typedMobile, wantsHuman);

  switch (text) {
    case "1": return trackBySender(from);
    case "2": return { text: branchesText() };
    case "3": return { text: catalogText(await loadCatalog()) };
    case "4": return { text: aboutText() };
    case "5": return { text: `${deliveryText((await readShippingSettings()).freeDeliveryThreshold)}\n\n${paymentText()}` };
    case "6": return { text: contactText() };
  }

  if (isAcknowledgement(text)) return { text: THANKS_TEXT };
  if (BYE.test(text)) return { text: BYE_TEXT };

  // A specific product name wins over generic keywords ("mysore nuggets price" is a product, not a city).
  const squashed = normalize(text);
  if (squashed.length >= 4 && !wantsHuman) {
    const catalog = await loadCatalog();
    const matches = catalog.filter((p) => {
      const names = [normalize(p.name), normalize(p.shortName)].filter((n) => n.length >= 4);
      return names.some((n) => squashed.includes(n));
    });
    if (matches.length === 1) return { text: productDetailText(matches[0]!) };
  }

  // "Same mobile number was used" / "please check" — they mean the order tied to the number they're writing from.
  if (/\b(same (mobile|number|phone|no)|please check|kindly check|check (once|again|my)|any update|update (on|about|regarding))\b/.test(text)) {
    return trackBySender(from, wantsHuman);
  }

  // Problems and complaints: show where their order stands, then bring in a person.
  if (wantsHuman) return trackBySender(from, true);

  // "When will it arrive?" — their order's status and tracking is the real answer.
  if (WHEN_QUESTION.test(text) && has(text, ["order", "parcel", "delivery", "package", "coffee", "my"])) {
    const own = await sendersOrders(from);
    if (own.length > 0) return trackBySender(from);
    return { text: `${deliveryText((await readShippingSettings()).freeDeliveryThreshold)}` };
  }

  if (BULK.test(text)) {
    return withHandoff(
      "Bulk / B2B / franchise enquiry",
      [
        "Thank you for your interest in working with us! ☕",
        "",
        "We supply bulk coffee (25 kg and 50 kg) and have franchise opportunities for our café. I've passed your enquiry to our team — they'll reply here with details.",
        "",
        `You can also WhatsApp us on ${CARE_WHATSAPP}.`,
      ].join("\n"),
    );
  }

  if (has(text, ["track", "status", "where is my", "my order", "order status", "awb", "shipment", "parcel", "dispatch", "shipped"])) {
    return trackBySender(from);
  }
  if (has(text, ["branch", "address", "location", "store", "shop", "outlet", "visit", "map", "where are you", "where is your", "nearest", "timing", "open"])) {
    return { text: branchesText() };
  }
  if (has(text, ["contact", "call", "phone", "number", "customer care", "support", "email", "mail", "talk", "speak", "human", "agent", "person", "representative"])) {
    // Someone asking for a person should get one, not just a list of numbers.
    if (has(text, ["human", "agent", "person", "representative", "talk to", "speak to"])) {
      return withHandoff("Customer asked to speak to a person");
    }
    return { text: contactText() };
  }
  if (has(text, ["delivery", "deliver", "shipping", "courier", "charges", "free delivery"])) {
    return { text: deliveryText((await readShippingSettings()).freeDeliveryThreshold) };
  }
  if (has(text, ["payment", "pay ", "upi", "card", "cod", "cash", "razorpay"])) {
    return { text: paymentText() };
  }
  if (has(text, ["about", "company", "history", "story", "founder", "who are", "since", "heritage", "cafe", "café", "mhc", "gayathri coffee works"])) {
    return { text: aboutText() };
  }
  const aboutBuying = has(text, ["price", "rate", "cost", "buy", "available", "product", "variety", "varieties", "catalog", "list", "order", "sell"]);
  if (
    has(text, ["price", "rate", "cost", "product", "coffee", "tea", "decoction", "menu list", "buy", "available", "powder", "blend", "variety", "varieties", "arabica", "robusta", "peaberry", "chicory", "catalog"]) &&
    (text.split(" ").length < 6 || aboutBuying)
  ) {
    return { text: catalogText(await loadCatalog()) };
  }
  if (GREETING.test(text)) return { text: MENU_TEXT };

  // Something longer that we don't recognise is a real question — a person should answer it, not a menu.
  if (text.split(" ").length >= 5) return withHandoff("Question the bot did not understand");
  return { text: FALLBACK_TEXT };
}

// ───────────────────────── entry point from the webhook ─────────────────────────

// Business-app greetings and other bots reply to our messages automatically; answering
// those would start a never-ending conversation between two bots.
function looksLikeAutoReply(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return lower.startsWith("thank you for contacting gayathri coffee") || lower.includes("automated message") || lower.includes("auto-reply") || lower.includes("auto reply");
}

// Once a team member has replied in the admin chat, the bot stays out of the conversation for a while.
const HUMAN_HANDOVER_MINUTES = 30;
// After the bot hands a chat to the team it stays quiet (apart from menu commands) until someone replies, or this long passes.
const AWAITING_HUMAN_HOURS = 8;

async function humanRecentlyReplied(from: string): Promise<boolean> {
  const since = new Date(Date.now() - HUMAN_HANDOVER_MINUTES * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(whatsappEventsTable)
    .where(and(eq(whatsappEventsTable.type, "agent_reply"), eq(whatsappEventsTable.fromPhone, from), gte(whatsappEventsTable.createdAt, since)));
  return (row?.count ?? 0) > 0;
}

// True while a chat has been handed to the team and nobody has answered it yet.
async function awaitingHuman(from: string): Promise<boolean> {
  const since = new Date(Date.now() - AWAITING_HUMAN_HOURS * 60 * 60 * 1000);
  const [handoff] = await db
    .select({ at: whatsappEventsTable.createdAt })
    .from(whatsappEventsTable)
    .where(and(eq(whatsappEventsTable.type, "handoff"), eq(whatsappEventsTable.fromPhone, from), gte(whatsappEventsTable.createdAt, since)))
    .orderBy(desc(whatsappEventsTable.createdAt))
    .limit(1);
  if (!handoff) return false;
  const [answered] = await db
    .select({ id: whatsappEventsTable.id })
    .from(whatsappEventsTable)
    .where(and(eq(whatsappEventsTable.type, "agent_reply"), eq(whatsappEventsTable.fromPhone, from), gte(whatsappEventsTable.createdAt, handoff.at)))
    .limit(1);
  return !answered;
}

async function isRateLimited(from: string): Promise<boolean> {
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(whatsappEventsTable)
    .where(and(eq(whatsappEventsTable.type, "bot_reply"), eq(whatsappEventsTable.fromPhone, from), gte(whatsappEventsTable.createdAt, since)));
  return (row?.count ?? 0) >= 12;
}

// Menu numbers, "menu" and order numbers always get an answer, even while a chat waits for a person.
const isExplicitCommand = (text: string) => /^[1-6]$/.test(text.trim()) || /^menu$/i.test(text.trim()) || Boolean(extractOrderRef(text.toLowerCase()).orderNumber || extractOrderRef(text.toLowerCase()).invoiceNumber);

const MEDIA_TYPES_IGNORED = new Set(["reaction", "sticker"]);

const MEDIA_HANDOFF_TEXT = [
  "Thanks, I've received that. 🙏 I can only read text messages myself, so I've passed it to our team — they'll take a look and reply here.",
  "",
  `For anything urgent, WhatsApp ${CARE_WHATSAPP}.`,
].join("\n");

async function recordHandoff(from: string, reason: string, customerText: string) {
  await db
    .insert(whatsappEventsTable)
    .values({ type: "handoff", fromPhone: from, status: "open", body: `${reason}${customerText ? ` — “${customerText.slice(0, 300)}”` : ""}` })
    .catch((err) => logger.error({ err }, "Failed to record WhatsApp handoff"));
}

export async function handleInboundMessage(message: { id: string; from: string; type: string; text?: { body?: string } }): Promise<void> {
  if (!isWhatsAppConfigured() || process.env.WHATSAPP_BOT_ENABLED === "false") return;
  if (MEDIA_TYPES_IGNORED.has(message.type)) return;

  const body = message.type === "text" ? (message.text?.body ?? "") : "";
  if (message.type === "text" && looksLikeAutoReply(body)) return;
  if (await humanRecentlyReplied(message.from)) return;

  const waiting = await awaitingHuman(message.from);
  if (waiting && !(message.type === "text" && isExplicitCommand(body))) return; // the team has it — don't talk over them

  if (await isRateLimited(message.from)) {
    logger.warn({ from: message.from }, "WhatsApp bot rate limit reached — not replying");
    return;
  }

  try {
    const result: BotResult =
      message.type === "text"
        ? await buildBotReply(message.from, body)
        : { text: MEDIA_HANDOFF_TEXT, handoff: `Customer sent a ${message.type} the bot cannot read` };
    if (result.handoff) await recordHandoff(message.from, result.handoff, body);
    await sendWhatsAppText(message.from, result.text);
  } catch (err) {
    logger.error({ err, from: message.from }, "WhatsApp bot failed to reply");
  }
}

// Exported for tests.
export { extractOrderRef };
