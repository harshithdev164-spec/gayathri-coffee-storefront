import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productVariantsTable } from "./products";

export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
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
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  status: text("status").notNull().default("pending"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
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

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
