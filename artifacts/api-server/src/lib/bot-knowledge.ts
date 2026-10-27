// Fixed company facts the WhatsApp bot answers from. Keep these in step with the website
// footer/story. Anything not listed here (opening hours, refund terms, …) is deliberately
// NOT stated by the bot — it sends people to customer care instead of guessing.

export const COMPANY_NAME = "Gayathri Coffee Works";
export const WEBSITE = "www.gayathricoffee.com";
export const CARE_WHATSAPP = "8050033791";
export const CARE_EMAIL = "reachus@gayathricoffee.com";

export const BRANCHES = [
  {
    name: "Mysuru — Head Office",
    address: "No. 7, Duplin Complex, Shivarampet, Mysuru — 570001",
    phone: "9141737266 / 0821-2420328",
    map: "https://share.google/7Q5h2qo5Z7Pja8hNS",
  },
  {
    name: "Bengaluru — Malleshwaram Branch",
    address: "No. 172, Between 8th & 10th Cross, Sampige Main Road, Malleshwaram, Bengaluru — 560003",
    phone: "8277288068 / 080-23565978",
    map: "https://share.google/Kb0dotUZIjmZyE2Lv",
  },
];

export const MHC_CAFE = {
  name: "Mysore Heritage Coffee (our café)",
  address: "#1066, Near Hotel Airlines, Jayalakshmi Vilas Road, Chamarajpurum (Lakshmipurum), Mysuru — 570005",
  phone: "9606950300",
};

export function branchesText(): string {
  const lines = ["*Our locations*", ""];
  for (const branch of BRANCHES) {
    lines.push(`📍 *${branch.name}*`, branch.address, `📞 ${branch.phone}`, `🗺️ ${branch.map}`, "");
  }
  lines.push(`☕ *${MHC_CAFE.name}*`, MHC_CAFE.address, `📞 ${MHC_CAFE.phone}`, "");
  lines.push("For opening hours please call the branch before visiting.");
  return lines.join("\n");
}

export function aboutText(): string {
  return [
    `*About ${COMPANY_NAME}*`,
    "",
    "We have been roasting coffee in Mysuru since 1950. It began with Mr. DC Varadaraja Setty roasting and selling coffee door to door by bicycle, and Mr. DV Ravikumar later carried the roastery forward.",
    "",
    "• Hand-roasted — no shortcuts, no additives, just time and care in every batch.",
    "• Arabica and Robusta from the coffee estates of Chikkamagaluru and Coorg.",
    "• The first in Mysuru to roast with German precision technology, without losing the hand-roasted soul.",
    "• Blends for every palate: Arabica, Robusta, Peaberry and Mysore Nuggets, plus tea and ready-to-pour decoction.",
    "• Build your own blend on our website with the Custom Roast tool.",
    "",
    "☕ *Mysore Heritage Coffee* is our café, where the same tradition is served as South Indian filter coffee.",
    "",
    `Website: ${WEBSITE}`,
    "FSSAI licensed — Mysuru head office 11223335000418, Bengaluru branch 11223331001091.",
  ].join("\n");
}

export function contactText(): string {
  return [
    "*Customer care*",
    "",
    `💬 WhatsApp: ${CARE_WHATSAPP}`,
    `📞 Mysuru: ${BRANCHES[0]!.phone}`,
    `📞 Bengaluru: ${BRANCHES[1]!.phone}`,
    `✉️ ${CARE_EMAIL}`,
    `🌐 ${WEBSITE}`,
  ].join("\n");
}

export function paymentText(): string {
  return [
    "*Payments*",
    "",
    "You can pay online at checkout on our website — cards, UPI and net banking, processed securely by Razorpay.",
    "We never see or store your card or UPI details.",
    "",
    "For anything about a payment, message us with your order number.",
  ].join("\n");
}

export function deliveryText(freeDeliveryThreshold: number): string {
  return [
    "*Delivery*",
    "",
    "We ship across India. At checkout you can choose:",
    "• *Fast delivery* — express courier, about 2–4 business days",
    "• *Standard delivery* — regular post, about 5–8 business days",
    "",
    `Delivery is free on orders of ₹${freeDeliveryThreshold} and above. Otherwise the charge depends on your pincode and the weight of your order, and is shown before you pay.`,
    "",
    "Already ordered? Send your *order number* and I'll share your tracking details.",
  ].join("\n");
}

export const MENU_TEXT = [
  `Hello! 👋 Welcome to *${COMPANY_NAME}*.`,
  "I can help with:",
  "",
  "1️⃣  Track my order",
  "2️⃣  Our branches & locations",
  "3️⃣  Products & prices",
  "4️⃣  About us",
  "5️⃣  Delivery & payments",
  "6️⃣  Talk to customer care",
  "",
  "Reply with a number, or just type your question. To track an order, send your *order number* (for example 19777).",
].join("\n");

export const FALLBACK_TEXT = [
  "Sorry, I didn't quite get that. 🙏",
  "",
  "You can reply with:",
  "1 — Track my order",
  "2 — Branches",
  "3 — Products & prices",
  "4 — About us",
  "5 — Delivery & payments",
  "6 — Customer care",
  "",
  `Or reach our team directly on WhatsApp ${CARE_WHATSAPP}.`,
].join("\n");
