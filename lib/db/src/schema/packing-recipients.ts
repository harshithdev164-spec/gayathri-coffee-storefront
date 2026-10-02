import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packingRecipientsTable = pgTable("packing_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPackingRecipientSchema = createInsertSchema(packingRecipientsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPackingRecipient = z.infer<typeof insertPackingRecipientSchema>;
export type PackingRecipient = typeof packingRecipientsTable.$inferSelect;
