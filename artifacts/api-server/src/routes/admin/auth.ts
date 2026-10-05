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
import { setAdminSession, clearAdminSession, getAdminSession } from "../../lib/session";
import { sendAdminOtpWhatsApp } from "../../lib/whatsapp";

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
  if (!admin || !valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  setAdminSession(res, admin.id);
  res.json(AdminLoginResponse.parse({ email: admin.email }));
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
  if (!admin || !admin.phone) {
    res.json(AdminRequestOtpResponse.parse({ sent: false }));
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

  if (!admin || !admin.otpCodeHash || !admin.otpExpiresAt) {
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
  res.json(AdminVerifyOtpResponse.parse({ email: admin.email }));
});

router.post("/admin/logout", (_req, res) => {
  clearAdminSession(res);
  res.json(AdminLogoutResponse.parse({ ok: true }));
});

router.get("/admin/me", async (req, res) => {
  const adminUserId = getAdminSession(req);
  if (!adminUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [admin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, adminUserId)).limit(1);
  if (!admin) {
    clearAdminSession(res);
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(AdminMeResponse.parse({ email: admin.email }));
});

export default router;
