import { eq } from "drizzle-orm";
import { db, ordersTable } from "@workspace/db";
import { listRecentCapturedPayments } from "./razorpay";
import { createOrderFromPendingCheckout } from "./order-create";
import { logger } from "./logger";

export type ReconcileResult = {
  checked: number;
  created: string[];
  // Paid in Razorpay but no saved checkout exists (paid before checkouts were saved) — add by hand.
  unmatched: { paymentId: string; razorpayOrderId: string | null; amount: number; contact: string | null; email: string | null; paidAt: string }[];
};

// Safety net behind the webhook: looks at every captured Razorpay payment from the last few days and
// makes sure each one has an order. Safe to run any time and as often as you like.
export async function reconcileRazorpayPayments(days = 3): Promise<ReconcileResult> {
  const payments = await listRecentCapturedPayments(days);
  const result: ReconcileResult = { checked: payments.length, created: [], unmatched: [] };

  for (const payment of payments) {
    if (!payment.order_id) continue;
    const [existing] = await db.select({ id: ordersTable.id, paymentStatus: ordersTable.paymentStatus }).from(ordersTable).where(eq(ordersTable.razorpayOrderId, payment.order_id)).limit(1);
    if (existing) {
      // Order exists but never learned it was paid (e.g. the webhook was missed) — fix that too.
      if (existing.paymentStatus !== "paid") {
        await db.update(ordersTable).set({ paymentStatus: "paid", razorpayPaymentId: payment.id }).where(eq(ordersTable.id, existing.id));
      }
      continue;
    }
    try {
      const created = await createOrderFromPendingCheckout(payment.order_id, payment.id);
      if (created) {
        result.created.push(created.order.orderNumber);
      } else {
        result.unmatched.push({
          paymentId: payment.id,
          razorpayOrderId: payment.order_id,
          amount: Math.round(payment.amount / 100),
          contact: payment.contact ?? null,
          email: payment.email ?? null,
          paidAt: new Date(payment.created_at * 1000).toISOString(),
        });
      }
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, "Reconcile: could not create the missing order");
    }
  }
  return result;
}
