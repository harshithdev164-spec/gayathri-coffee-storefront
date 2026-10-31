import { eq, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, pendingCheckoutsTable, type Order, type OrderItem } from "@workspace/db";
import { CreateOrderBody } from "@workspace/api-zod";
import { nextInvoiceNumber, nextOrderNumber } from "./order-shape";
import { sendNotifications } from "./notify";
import { isShiprocketConfigured } from "./shiprocket";
import { shipOrderViaShiprocket } from "./shiprocket-ship";
import { logger } from "./logger";
import { sendOrderConfirmationEmail } from "./email";
import { sendOrderConfirmedWhatsApp, sendAdminNewOrderAlert, sendPackingAlert } from "./whatsapp";

// What the checkout sends, minus the Razorpay proof — that is added once the payment is verified.
export const CheckoutPayload = CreateOrderBody.omit({ razorpayOrderId: true, razorpayPaymentId: true, razorpaySignature: true });
export type CheckoutPayloadType = ReturnType<typeof CheckoutPayload.parse>;

type CreateOrderOptions = {
  payload: CheckoutPayloadType;
  // Set once a Razorpay payment has been verified (signature at checkout, or the webhook / reconcile job).
  razorpay?: { orderId: string; paymentId: string };
  // Order number reserved when the Razorpay order was created, so Razorpay and the dashboard agree.
  orderNumber?: string;
};

export type CreatedOrder = { order: Order; items: OrderItem[]; created: boolean };

// The single place orders are created. Safe to call from the browser, the Razorpay webhook and the
// reconcile job at the same time for the same payment — only one of them creates the order, the rest
// get that same order back.
export async function createOrder({ payload, razorpay, orderNumber }: CreateOrderOptions): Promise<CreatedOrder> {
  const paid = Boolean(razorpay);
  const { items, ...orderFields } = payload;

  // Everything that must happen exactly once per payment runs in one transaction, behind a lock on the
  // Razorpay order id. If the browser and the webhook arrive together, the second waits, then finds the
  // order already there - so there is never a duplicate order and never a skipped bill number.
  const outcome = await db.transaction(async (tx) => {
    if (razorpay) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${razorpay.orderId}))`);
      const [existingOrder] = await tx.select().from(ordersTable).where(eq(ordersTable.razorpayOrderId, razorpay.orderId)).limit(1);
      if (existingOrder) {
        const existingItems = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, existingOrder.id));
        return { order: existingOrder, items: existingItems, created: false };
      }
    }

    const [created] = await tx
      .insert(ordersTable)
      .values({
        ...orderFields,
        notes: orderFields.notes ?? null,
        email: orderFields.email ?? null,
        state: orderFields.state ?? null,
        billingAddress: orderFields.billingAddress ?? null,
        billingCity: orderFields.billingCity ?? null,
        billingPincode: orderFields.billingPincode ?? null,
        billingState: orderFields.billingState ?? null,
        orderNumber: orderNumber ?? (await nextOrderNumber(tx)),
        invoiceNumber: await nextInvoiceNumber(tx),
        paymentStatus: paid ? "paid" : "pending",
        // A verified payment means the order is confirmed (auto-accepted), not just awaiting payment.
        status: paid ? "confirmed" : "pending",
        razorpayOrderId: razorpay?.orderId ?? null,
        razorpayPaymentId: razorpay?.paymentId ?? null,
      })
      .returning();
    if (!created) throw new Error("Failed to create order");

    const createdItems = await tx
      .insert(orderItemsTable)
      .values(
        items.map((item) => ({
          orderId: created.id,
          productVariantId: item.productVariantId ?? null,
          nameSnapshot: item.name,
          priceSnapshot: item.price,
          quantity: item.quantity,
        })),
      )
      .returning();

    if (razorpay) {
      await tx.update(pendingCheckoutsTable).set({ completedAt: new Date() }).where(eq(pendingCheckoutsTable.razorpayOrderId, razorpay.orderId));
    }
    return { order: created, items: createdItems, created: true };
  });

  // Already created by the other path - nothing more to do (and no second set of messages).
  if (!outcome.created) return outcome;
  const order = outcome.order;
  const savedItems = outcome.items;

  await sendNotifications(`new order ${order.orderNumber}`, [
    sendOrderConfirmationEmail(order, savedItems),
    sendOrderConfirmedWhatsApp(order),
    sendAdminNewOrderAlert(order, savedItems),
    sendPackingAlert(order, savedItems),
  ]);

  // Optional: book the courier straight away for paid (or COD) Shiprocket orders.
  // Off unless SHIPROCKET_AUTO_SHIP=true because assigning an AWB debits your Shiprocket wallet.
  let finalOrder = order;
  if (
    process.env.SHIPROCKET_AUTO_SHIP === "true" &&
    order.shippingMethod === "shiprocket" &&
    isShiprocketConfigured() &&
    (paid || order.paymentMethod === "Cash on Delivery")
  ) {
    try {
      finalOrder = await shipOrderViaShiprocket(order, savedItems, { schedulePickup: process.env.SHIPROCKET_AUTO_PICKUP !== "false" });
    } catch (err) {
      logger.error({ err, orderId: order.id }, "Auto-shipment failed — create it manually from the admin panel");
    }
  }

  return { order: finalOrder, items: savedItems, created: true };
}

// Rebuilds the order for a Razorpay payment whose browser never reported back. Returns null when we
// have no saved checkout for it (e.g. payments made before checkouts were saved).
export async function createOrderFromPendingCheckout(razorpayOrderId: string, razorpayPaymentId: string, paidAmountPaise?: number): Promise<CreatedOrder | null> {
  const [pending] = await db.select().from(pendingCheckoutsTable).where(eq(pendingCheckoutsTable.razorpayOrderId, razorpayOrderId)).limit(1);
  if (!pending) return null;
  const payload = CheckoutPayload.safeParse(pending.payload);
  if (!payload.success) {
    logger.error({ razorpayOrderId, issues: payload.error.issues }, "Saved checkout is not a valid order — cannot auto-create it");
    return null;
  }
  if (paidAmountPaise !== undefined && paidAmountPaise !== Math.round(payload.data.total * 100)) {
    logger.error({ razorpayOrderId, paidAmountPaise, expected: payload.data.total * 100 }, "Paid amount differs from the saved checkout - not auto-creating, needs a human");
    return null;
  }
  return createOrder({
    payload: payload.data,
    razorpay: { orderId: razorpayOrderId, paymentId: razorpayPaymentId },
    orderNumber: pending.orderNumber,
  });
}
