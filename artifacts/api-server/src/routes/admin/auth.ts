import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, adminUsersTable } from "@workspace/db";
import {
  AdminLoginBody,
  AdminLoginResponse,
  AdminLogoutResponse,
  AdminMeResponse,
  AdminRequestOtpBody,
  AdminRequestOtpResponse,
  AdminVerifyOtpBody,
  AdminVerifyOtpResponse,
} from "@workspace/api-zod";
import { setAdminSession, clearAdminSession, getAdminSession, isAdminAuthDisabled } from "../../lib/session";
import { sendAdminOtpWhatsApp } from "../../lib/whatsapp";
import { isRole, permissionsFor } from "../../lib/roles";
import { db as database, auditLogTable } from "@workspace/db";
import type { AdminUser } from "@workspace/db";

// What the admin screen needs to know about the person who just logged in.
function meBody(admin: Pick<AdminUser, "email" | "name" | "role">) {
  const role = isRole(admin.role) ? admin.role : "logistics"; // an unknown role gets the least access
  return { email: admin.email, name: admin.name, role, permissions: permissionsFor(role) };
}

const logLogin = (admin: AdminUser, how: string) =>
  database
    .insert(auditLogTable)
    .values({ adminUserId: admin.id, adminEmail: admin.email, role: admin.role, action: "login", detail: how })
    .catch(() => undefined);

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

const router: IRouter = Router();

router.post("/admin/login", async (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { email, password } = parsed.data;
  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email.toLowerCase()))
    .limit(1);

  const valid = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  if (!admin || !valid || !admin.active) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  setAdminSession(res, admin.id);
  await logLogin(admin, "password");
  res.json(AdminLoginResponse.parse(meBody(admin)));
});

router.post("/admin/login/request-otp", async (req, res) => {
  const parsed = AdminRequestOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, parsed.data.email.toLowerCase()))
    .limit(1);

  // Don't reveal whether the email matched an account.
  if (!admin || !admin.phone || !admin.active) {
    res.json(AdminRequestOtpResponse.parse({ sent: false }));
    return;
  }

  // One code per minute per person - stops anyone spamming a colleague's WhatsApp (and your Meta bill).
  const lastRequestedAt = admin.otpExpiresAt ? admin.otpExpiresAt.getTime() - OTP_TTL_MS : 0;
  if (Date.now() - lastRequestedAt < 60_000) {
    res.status(429).json({ error: "A code was just sent. Wait a minute before asking for another." });
    return;
  }

  const code = generateOtp();
  await db
    .update(adminUsersTable)
    .set({ otpCodeHash: hashOtp(code), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0 })
    .where(eq(adminUsersTable.id, admin.id));

  const sent = await sendAdminOtpWhatsApp(admin.phone, code);
  res.json(AdminRequestOtpResponse.parse({ sent }));
});

router.post("/admin/login/verify-otp", async (req, res) => {
  const parsed = AdminVerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { email, code } = parsed.data;

  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email.toLowerCase()))
    .limit(1);

  if (!admin || !admin.active || !admin.otpCodeHash || !admin.otpExpiresAt) {
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }

  if (admin.otpExpiresAt.getTime() < Date.now()) {
    res.status(401).json({ error: "Code expired. Request a new one." });
    return;
  }

  if (admin.otpAttempts >= MAX_OTP_ATTEMPTS) {
    res.status(429).json({ error: "Too many attempts. Request a new code." });
    return;
  }

  if (!timingSafeStringEqual(hashOtp(code), admin.otpCodeHash)) {
    await db
      .update(adminUsersTable)
      .set({ otpAttempts: admin.otpAttempts + 1 })
      .where(eq(adminUsersTable.id, admin.id));
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }

  // Consume the code so it can't be replayed.
  await db
    .update(adminUsersTable)
    .set({ otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0 })
    .where(eq(adminUsersTable.id, admin.id));

  setAdminSession(res, admin.id);
  await logLogin(admin, "whatsapp code");
  res.json(AdminVerifyOtpResponse.parse(meBody(admin)));
});

router.post("/admin/logout", (_req, res) => {
  clearAdminSession(res);
  res.json(AdminLogoutResponse.parse({ ok: true }));
});

router.get("/admin/me", async (req, res) => {
  if (isAdminAuthDisabled()) {
    res.json(AdminMeResponse.parse(meBody({ email: "local-dev@localhost.test", name: "Local dev", role: "superadmin" })));
    return;
  }
  const adminUserId = getAdminSession(req);
  if (!adminUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, adminUserId)).limit(1);
  if (!admin || !admin.active) {
    clearAdminSession(res);
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(AdminMeResponse.parse(meBody(admin)));
});

export default router;
