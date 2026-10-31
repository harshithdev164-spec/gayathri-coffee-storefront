// Submits the WhatsApp message templates this app sends to Meta for approval.
// Run once from the project root:  node --env-file=.env scripts/create-whatsapp-templates.mjs
const token = process.env.WHATSAPP_ACCESS_TOKEN;
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
if (!token || !wabaId) {
  console.error("Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID in .env first.");
  process.exit(1);
}

const templates = [
  {
    name: "gc_order_details_v2",
    category: "UTILITY",
    language: "en",
    components: [
      {
        type: "BODY",
        text:
          "New order {{1}} - ship via {{2}}.\n\nCustomer: {{3}} ({{4}})\nPayment: {{5}}\nShip to: {{6}}\n\nItems to pack (product | grind | size | qty): {{7}}\n\nGayathri Coffee Works",
        example: {
          body_text: [
            [
              "19780",
              "Shiprocket",
              "Anita Rao",
              "9876543210",
              "Razorpay - Rs 1200 (paid)",
              "12 MG Road, Mysuru 570001",
              "1) Pure Coffee | Grind: Coarse (Filter) | Size: 500 g | Qty: 2 // 2) Mysore Nuggets | Grind: Fine (Nice) | Size: 250 g | Qty: 1",
            ],
          ],
        },
      },
    ],
  },
  {
    // Admin login code. Meta's authentication format: fixed wording, a "copy code" button, and
    // authentication templates are normally approved within seconds.
    name: "gc_admin_otp_v1",
    category: "AUTHENTICATION",
    language: "en",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 5 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
    ],
  },
];

// Pass template names as arguments to submit only those, e.g. `... gc_admin_otp_v1`.
const only = process.argv.slice(2);
for (const template of templates.filter((t) => only.length === 0 || only.includes(t.name))) {
  const res = await fetch(`https://graph.facebook.com/v22.0/${wabaId}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(template),
  });
  const data = await res.json().catch(() => ({}));
  console.log(template.name, res.ok ? "submitted" : "FAILED", JSON.stringify(data));
}
