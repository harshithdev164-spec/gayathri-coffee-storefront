import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, adminUsersTable } from "@workspace/db";
import { AdminLoginBody, AdminLoginResponse, AdminLogoutResponse, AdminMeResponse } from "@workspace/api-zod";
import { setAdminSession, clearAdminSession, getAdminSession } from "../../lib/session";

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
