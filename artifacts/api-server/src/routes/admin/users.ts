import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, adminUsersTable, auditLogTable, type AdminUser } from "@workspace/db";
import { getAdmin, requireAdmin, requirePermission } from "../../middlewares/require-admin";
import { ROLES } from "../../lib/roles";
import { audit } from "../../lib/audit";

const router: IRouter = Router();
router.use(requireAdmin);

const publicUser = (user: AdminUser) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  phone: user.phone,
  role: user.role,
  active: user.active,
  createdAt: user.createdAt.toISOString(),
});

const phoneField = z.string().trim().max(20).nullish();
const passwordField = z.string().min(8, "The password needs at least 8 characters").max(100);

const CreateUserBody = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  name: z.string().trim().min(1, "Enter the person's name").max(120),
  phone: phoneField,
  role: z.enum(ROLES as [string, ...string[]]),
  password: passwordField,
});

const UpdateUserBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: phoneField,
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  active: z.boolean().optional(),
  password: passwordField.optional(),
});

router.get("/users", requirePermission("users"), async (_req, res) => {
  const users = await db.select().from(adminUsersTable).orderBy(adminUsersTable.createdAt);
  res.json(users.map(publicUser));
});

router.post("/users", requirePermission("users"), async (req, res) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check the details." });
    return;
  }
  const input = parsed.data;
  const [existing] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.email, input.email)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Someone with this email already has a login." });
    return;
  }
  const [user] = await db
    .insert(adminUsersTable)
    .values({
      email: input.email,
      name: input.name,
      phone: input.phone || null,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 12),
    })
    .returning();
  await audit(res, "user.created", input.email, `role ${input.role}`);
  res.status(201).json(publicUser(user!));
});

router.patch("/users/:id", requirePermission("users"), async (req, res) => {
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Please check the details." });
    return;
  }
  const input = parsed.data;
  const me = getAdmin(res);

  const [target] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, req.params.id)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Never leave the business with nobody who can manage logins.
  const losesSuperadmin = (input.role !== undefined && input.role !== "superadmin") || input.active === false;
  if (target.role === "superadmin" && target.active && losesSuperadmin) {
    const all = await db.select().from(adminUsersTable);
    const otherSuperadmins = all.filter((u) => u.id !== target.id && u.role === "superadmin" && u.active);
    if (otherSuperadmins.length === 0) {
      res.status(400).json({ error: "There must always be at least one active superadmin." });
      return;
    }
  }
  if (target.id === me.id && (input.active === false || (input.role !== undefined && input.role !== target.role))) {
    res.status(400).json({ error: "You can't deactivate yourself or change your own role. Ask another superadmin." });
    return;
  }

  const changes: Partial<typeof adminUsersTable.$inferInsert> = {};
  const notes: string[] = [];
  if (input.name !== undefined) changes.name = input.name;
  if (input.phone !== undefined) changes.phone = input.phone || null;
  if (input.role !== undefined && input.role !== target.role) { changes.role = input.role; notes.push(`role ${target.role} -> ${input.role}`); }
  if (input.active !== undefined && input.active !== target.active) { changes.active = input.active; notes.push(input.active ? "activated" : "deactivated"); }
  if (input.password) { changes.passwordHash = await bcrypt.hash(input.password, 12); notes.push("password reset"); }

  const [updated] = Object.keys(changes).length
    ? await db.update(adminUsersTable).set(changes).where(eq(adminUsersTable.id, target.id)).returning()
    : [target];
  if (notes.length) await audit(res, "user.updated", target.email, notes.join(", "));
  res.json(publicUser(updated!));
});

// The latest 200 things people did in the admin panel.
router.get("/audit-log", requirePermission("users"), async (_req, res) => {
  const rows = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(200);
  res.json(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })));
});

export default router;
