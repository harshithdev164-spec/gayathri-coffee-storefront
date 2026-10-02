import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, packingRecipientsTable } from "@workspace/db";
import {
  AdminListPackingRecipientsResponse,
  AdminCreatePackingRecipientBody,
  AdminCreatePackingRecipientResponse,
  AdminDeletePackingRecipientResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../../middlewares/require-admin";
import type { PackingRecipient } from "@workspace/db";

const router: IRouter = Router();
router.use(requireAdmin);

function shapeRecipient(recipient: PackingRecipient) {
  return { id: recipient.id, name: recipient.name, phone: recipient.phone, createdAt: recipient.createdAt.toISOString() };
}

router.get("/packing-recipients", async (_req, res) => {
  const recipients = await db.select().from(packingRecipientsTable).orderBy(desc(packingRecipientsTable.createdAt));
  res.json(AdminListPackingRecipientsResponse.parse(recipients.map(shapeRecipient)));
});

router.post("/packing-recipients", async (req, res) => {
  const parsed = AdminCreatePackingRecipientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [recipient] = await db.insert(packingRecipientsTable).values(parsed.data).returning();
  if (!recipient) {
    res.status(500).json({ error: "Failed to add recipient" });
    return;
  }
  res.status(201).json(AdminCreatePackingRecipientResponse.parse(shapeRecipient(recipient)));
});

router.delete("/packing-recipients/:id", async (req, res) => {
  const { id } = req.params;
  await db.delete(packingRecipientsTable).where(eq(packingRecipientsTable.id, id));
  res.json(AdminDeletePackingRecipientResponse.parse({ ok: true }));
});

export default router;
