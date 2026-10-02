import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const insertSettingSchema = createInsertSchema(settingsTable);
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settingsTable.$inferSelect;

// Well-known setting keys, seeded on first deploy
export const SETTINGS_KEYS = {
  indiaPostRateTable: "india_post_rate_table",
  freeDeliveryThreshold: "free_delivery_threshold",
} as const;
