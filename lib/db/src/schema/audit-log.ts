import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Who did what in the admin panel and when. Written by the server, never edited or deleted from the UI.
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id"),
    adminEmail: text("admin_email").notNull(),
    role: text("role").notNull(),
    action: text("action").notNull(),
    // The order number / user email the action was about.
    target: text("target"),
    detail: text("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("audit_log_created_at_idx").on(table.createdAt)],
);

export type AuditLogEntry = typeof auditLogTable.$inferSelect;
