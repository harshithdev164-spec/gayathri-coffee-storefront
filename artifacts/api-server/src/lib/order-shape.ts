import { sql } from "drizzle-orm";
import { db, type Order, type OrderItem } from "@workspace/db";

export function shapeOrder(order: Order, items: OrderItem[]) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    address: order.address,
    city: order.city,
    pincode: order.pincode,
    state: order.state,
    billingAddress: order.billingAddress,
    billingCity: order.billingCity,
    billingPincode: order.billingPincode,
    billingState: order.billingState,
    notes: order.notes,
    subtotal: order.subtotal,
    shippingMethod: order.shippingMethod,
    shippingFee: order.shippingFee,
    packagingFee: order.packagingFee,
    source: order.source,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    courierName: order.courierName,
    shiprocketShipmentId: order.shiprocketShipmentId,
    pickupScheduledFor: order.pickupScheduledFor,
    razorpayPaymentId: order.razorpayPaymentId,
    createdAt: order.createdAt.toISOString(),
    items: items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      quantity: item.quantity,
    })),
  };
}

// Next order number (19777, 19778, …) and bill number (ON693, ON694, …) from their database sequences.
export async function nextOrderIdentifiers(): Promise<{ orderNumber: string; invoiceNumber: string }> {
  const result = await db.execute<{ order_no: string; invoice_no: string }>(
    sql`select nextval('order_number_seq')::text as order_no, nextval('invoice_number_seq')::text as invoice_no`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("Could not allocate an order number");
  return { orderNumber: row.order_no, invoiceNumber: `ON${row.invoice_no}` };
}

// Order numbers can be reserved before payment (they show up in Razorpay); gaps are harmless.
// Bill numbers are only allocated when the order is actually created, so invoices stay gap-free.
type Executor = Pick<typeof db, "execute">;

export async function nextOrderNumber(executor: Executor = db): Promise<string> {
  const result = await executor.execute<{ order_no: string }>(sql`select nextval('order_number_seq')::text as order_no`);
  const row = result.rows[0];
  if (!row) throw new Error("Could not allocate an order number");
  return row.order_no;
}

export async function nextInvoiceNumber(executor: Executor = db): Promise<string> {
  const result = await executor.execute<{ invoice_no: string }>(sql`select nextval('invoice_number_seq')::text as invoice_no`);
  const row = result.rows[0];
  if (!row) throw new Error("Could not allocate a bill number");
  return `ON${row.invoice_no}`;
}
