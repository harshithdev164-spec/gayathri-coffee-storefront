import crypto from "node:crypto";

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

type RazorpayOrderResponse = {
  id: string;
  error?: { description?: string };
};

function authHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

// Receipt and notes are what you see against each payment in the Razorpay dashboard,
// so they carry the order number and the key order details.
export async function createRazorpayOrder(
  amountRupees: number,
  receipt: string,
  notes: Record<string, string> = {},
): Promise<{ razorpayOrderId: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured.");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100),
      currency: "INR",
      receipt,
      notes,
    }),
  });
  const data = (await res.json()) as RazorpayOrderResponse;
  if (!res.ok || !data.id) {
    throw new Error(data.error?.description || `Razorpay order creation failed (HTTP ${res.status})`);
  }

  return { razorpayOrderId: data.id };
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;

  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  // Guard against a timing side-channel and a length mismatch (timingSafeEqual throws on unequal lengths).
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  status: string;
  amount: number;
  email?: string;
  contact?: string;
  created_at: number;
  notes?: Record<string, string> | unknown[];
};

// Captured payments from the last `days` days, newest first. Used to catch any payment whose order
// never reached our database.
export async function listRecentCapturedPayments(days: number): Promise<RazorpayPayment[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 24 * 60 * 60;
  const payments: RazorpayPayment[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const res = await fetch(`https://api.razorpay.com/v1/payments?from=${from}&to=${now}&count=100&skip=${skip}`, {
      headers: { Authorization: authHeader() },
    });
    const data = (await res.json().catch(() => ({}))) as { items?: RazorpayPayment[]; error?: { description?: string } };
    if (!res.ok) throw new Error(data.error?.description || `Razorpay payment lookup failed (HTTP ${res.status})`);
    const page = data.items ?? [];
    payments.push(...page.filter((payment) => payment.status === "captured"));
    if (page.length < 100) break;
  }
  return payments;
}
