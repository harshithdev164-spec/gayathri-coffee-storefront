import type { NextFunction, Request, Response } from "express";
import { getAdminSession, isAdminAuthDisabled } from "../lib/session";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (isAdminAuthDisabled()) {
    next();
    return;
  }
  const adminUserId = getAdminSession(req);
  if (!adminUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.locals.adminUserId = adminUserId;
  next();
}
