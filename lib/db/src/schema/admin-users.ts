import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminUsersTable = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  otpCodeHash: text("otp_code_hash"),
  otpExpiresAt: timestamp("otp_expires_at"),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsersTable.$inferSelect;
