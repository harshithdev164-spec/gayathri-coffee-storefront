import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";

export const whatsappEventsTable = pgTable("whatsapp_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 'message_sent' | 'message_status' | 'template_status' | 'inbound_message'
  type: text("type").notNull(),
  templateName: text("template_name"),
  waMessageId: text("wa_message_id"),
  orderId: uuid("order_id"),
  status: text("status"),
  fromPhone: text("from_phone"),
  body: text("body"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WhatsappEvent = typeof whatsappEventsTable.$inferSelect;
