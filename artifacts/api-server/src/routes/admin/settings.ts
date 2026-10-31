import { Router, type IRouter } from "express";
import { AdminGetSettingsResponse, AdminUpdateSettingsBody, AdminUpdateSettingsResponse } from "@workspace/api-zod";
import { requireAdmin, requirePermission } from "../../middlewares/require-admin";
import { readShippingSettings, writeShippingSettings } from "../../lib/settings";

const router: IRouter = Router();
router.use(requireAdmin);

router.get("/settings", requirePermission("settings", "packing"), async (_req, res) => {
  const settings = await readShippingSettings();
  res.json(AdminGetSettingsResponse.parse(settings));
});

router.patch("/settings", requirePermission("settings"), async (req, res) => {
  const parsed = AdminUpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const settings = await writeShippingSettings(parsed.data);
  res.json(AdminUpdateSettingsResponse.parse(settings));
});

export default router;
