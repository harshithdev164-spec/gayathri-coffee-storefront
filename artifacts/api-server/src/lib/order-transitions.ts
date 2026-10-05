import { eq } from "drizzle-orm";
import { db, ordersTable, type Order } from "@workspace/db";
import { sendShippingUpdateEmail } from "./email";
import { sendOrderShippedWhatsApp, sendAdminOrderShippedAlert, sendAdminOrderCancelledAlert } from "./whatsapp";

type OrderPatch = {
  status?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  paymentStatus?: string;
  razorpayPaymentId?: string | null;
};

// Shared by the admin "update order" route and the Shiprocket/Razorpay webhook
// handlers so a status transition always fires the same notifications no
// matter which path triggered it.
export async function updateOrderStatus(existing: Order, patch: OrderPatch): Promise<Order> {
  const [order] = await db.update(ordersTable).set(patch).where(eq(ordersTable.id, existing.id)).returning();
  if (!order) {
    throw new Error(`Order ${existing.id} disappeared during update`);
  }

  if (order.status === "shipped" && existing.status !== "shipped") {
    void sendShippingUpdateEmail(order);
    void sendOrderShippedWhatsApp(order);
    void sendAdminOrderShippedAlert(order);
  }

  if (order.status === "cancelled" && existing.status !== "cancelled") {
    void sendAdminOrderCancelledAlert(order);
  }

  return order;
}

const STATUS_RANK: Record<string, number> = { pending: 0, confirmed: 1, shipped: 2, delivered: 3 };

// Courier webhooks can arrive out of order (retries, duplicate delivery).
// Never let a later/duplicate event move a terminal or further-along status backwards.
export function isForwardStatusTransition(from: string, to: string): boolean {
  if (to === "cancelled") return from !== "delivered";
  const fromRank = STATUS_RANK[from] ?? -1;
  const toRank = STATUS_RANK[to] ?? -1;
  return toRank > fromRank;
}
