import { integer, jsonb, pgSequence, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productVariantsTable } from "./products";

// Customer-facing order numbers (19777, 19778, …) and bill numbers (ON693, ON694, …) count up
// from these sequences, so they never repeat and survive restarts and parallel orders.
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 19777, minValue: 19777 });
export const invoiceNumberSeq = pgSequence("invoice_number_seq", { startWith: 693, minValue: 693 });

export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  // Bill number printed on the invoice. Null on orders placed before bill numbers existed.
  invoiceNumber: text("invoice_number").unique(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  pincode: text("pincode").notNull(),
  // Used to decide CGST+SGST (intra-Karnataka) vs IGST (inter-state) on the invoice.
  state: text("state"),
  // Billing address — null when it's the same as the shipping address above.
  billingAddress: text("billing_address"),
  billingCity: text("billing_city"),
  billingPincode: text("billing_pincode"),
  billingState: text("billing_state"),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull(),
  shippingMethod: text("shipping_method").notNull(),
  shippingFee: integer("shipping_fee").notNull(),
  // "online" = placed on the website, "offline" = added by hand in the admin panel (walk-in, phone, WhatsApp).
  source: text("source").notNull().default("online"),
  // Flat packaging charge added to every order (0 on orders placed before it existed).
  packagingFee: integer("packaging_fee").notNull().default(0),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  // Unique so the browser, the Razorpay webhook and the reconcile job can never create the same paid order twice.
  razorpayOrderId: text("razorpay_order_id").unique(),
  razorpayPaymentId: text("razorpay_payment_id"),
  status: text("status").notNull().default("pending"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  // Shiprocket bookkeeping — lets admins re-download the AWB label and schedule pickup later.
  shiprocketOrderId: text("shiprocket_order_id"),
  shiprocketShipmentId: text("shiprocket_shipment_id"),
  courierName: text("courier_name"),
  pickupScheduledFor: text("pickup_scheduled_for"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderItemsTable = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  productVariantId: uuid("product_variant_id").references(() => productVariantsTable.id, { onDelete: "set null" }),
  nameSnapshot: text("name_snapshot").notNull(),
  priceSnapshot: integer("price_snapshot").notNull(),
  quantity: integer("quantity").notNull(),
});

// A checkout saved on our server the moment the customer opens Razorpay, before they pay. If they pay
// but their browser never reports back (closed tab, dropped network), the Razorpay webhook / reconcile
// job rebuilds the order from this row, so a captured payment can never go missing from the dashboard.
export const pendingCheckoutsTable = pgTable("pending_checkouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  razorpayOrderId: text("razorpay_order_id").notNull().unique(),
  // Reserved up front so the same number appears in Razorpay and on the final order.
  orderNumber: text("order_number").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
