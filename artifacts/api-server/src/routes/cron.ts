import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { reconcileRazorpayPayments } from "../lib/payment-reconcile";
import { isRazorpayConfigured } from "../lib/razorpay";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>" (set CRON_SECRET in the project's
// environment variables). It re-checks recent Razorpay payments so nothing paid is ever missing.
router.get("/cron/reconcile-payments", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const valid = Boolean(secret) && header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!valid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isRazorpayConfigured()) {
    res.json({ ok: true, skipped: "Razorpay isn't configured" });
    return;
  }
  try {
    const result = await reconcileRazorpayPayments(3);
    if (result.unmatched.length) logger.error({ unmatched: result.unmatched }, "Paid Razorpay payments with no order and no saved checkout");
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Reconcile failed" });
  }
});

export default router;
