import type { Response } from "express";
import { db, auditLogTable } from "@workspace/db";
import { getAdmin } from "../middlewares/require-admin";
import { logger } from "./logger";

// Records who did what. It must never break the action itself, so failures are only logged.
export async function audit(res: Response, action: string, target?: string | null, detail?: string | null): Promise<void> {
  const admin = res.locals.admin ? getAdmin(res) : null;
  try {
    await db.insert(auditLogTable).values({
      adminUserId: admin && admin.id !== "local-dev" ? admin.id : null,
      adminEmail: admin?.email ?? "unknown",
      role: admin?.role ?? "unknown",
      action,
      target: target ?? null,
      detail: detail ? detail.slice(0, 500) : null,
    });
  } catch (err) {
    logger.error({ err, action }, "Could not write the audit log");
  }
}
