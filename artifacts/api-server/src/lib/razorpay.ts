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
  amount_refunded?: number;
  notes?: Record<string, string> | unknown[];
};

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: authHeader() } });
  const data = (await res.json().catch(() => ({}))) as RazorpayPayment & { error?: { description?: string } };
  if (!res.ok || !data.id) throw new Error(data.error?.description || `Razorpay payment lookup failed (HTTP ${res.status})`);
  return data;
}

// The money really arrived: this payment belongs to this Razorpay order, has gone through, and is for
// exactly the order total. Returns the reason it does not, or null when it does.
export function paymentMismatch(payment: Pick<RazorpayPayment, "order_id" | "status" | "amount">, razorpayOrderId: string, totalRupees: number): string | null {
  if (payment.order_id !== razorpayOrderId) return "This payment belongs to a different Razorpay order.";
  if (payment.status !== "captured" && payment.status !== "authorized") return `The payment is ${payment.status}, not completed.`;
  if (payment.amount !== Math.round(totalRupees * 100)) return `The payment is for Rs ${payment.amount / 100} but the order total is Rs ${totalRupees}.`;
  return null;
}

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
    payments.push(...page.filter((payment) => payment.status === "captured" || payment.status === "refunded"));
    if (page.length < 100) break;
  }
  return payments;
}
