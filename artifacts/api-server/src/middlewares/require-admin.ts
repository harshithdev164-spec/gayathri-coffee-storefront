import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db, adminUsersTable } from "@workspace/db";
import { getAdminSession, isAdminAuthDisabled } from "../lib/session";
import { can, type Permission } from "../lib/roles";

export type AdminIdentity = { id: string; email: string; name: string | null; role: string };

export function getAdmin(res: Response): AdminIdentity {
  return res.locals.admin as AdminIdentity;
}

// Loads the logged-in person on every request, so a deactivated account or a changed role takes effect
// immediately instead of when their cookie expires.
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Several admin routers each run this for the same request - only look the person up once.
  if (res.locals.admin) {
    next();
    return;
  }
  if (isAdminAuthDisabled()) {
    res.locals.admin = { id: "local-dev", email: "local-dev@localhost.test", name: "Local dev", role: "superadmin" } satisfies AdminIdentity;
    next();
    return;
  }
  const adminUserId = getAdminSession(req);
  if (!adminUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, adminUserId)).limit(1);
    if (!admin || !admin.active) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.locals.adminUserId = admin.id;
    res.locals.admin = { id: admin.id, email: admin.email, name: admin.name, role: admin.role } satisfies AdminIdentity;
    next();
  } catch (err) {
    next(err);
  }
}

// Allows the request when the person's role has ANY of the listed permissions. Always used after requireAdmin.
export function requirePermission(...anyOf: Permission[]): RequestHandler<any, any, any, any> {
  return (_req, res, next) => {
    const admin = res.locals.admin as AdminIdentity | undefined;
    if (!admin || !can(admin.role, ...anyOf)) {
      res.status(403).json({ error: "Your role doesn't have access to this." });
      return;
    }
    next();
  };
}
