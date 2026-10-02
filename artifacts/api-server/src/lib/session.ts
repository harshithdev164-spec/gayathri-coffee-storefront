import type { CookieOptions, Request, Response } from "express";

const COOKIE_NAME = "admin_session";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  signed: true,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  path: "/",
};

export function setAdminSession(res: Response, adminUserId: string): void {
  res.cookie(COOKIE_NAME, adminUserId, cookieOptions);
}

export function clearAdminSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
}

export function getAdminSession(req: Request): string | null {
  const value = req.signedCookies?.[COOKIE_NAME];
  return typeof value === "string" ? value : null;
}
