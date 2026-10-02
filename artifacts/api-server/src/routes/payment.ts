import { Router, type IRouter } from "express";
import { GetPaymentSettingsResponse, CreateRazorpayOrderBody, CreateRazorpayOrderResponse } from "@workspace/api-zod";
import { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured } from "../lib/razorpay";

const router: IRouter = Router();

router.get("/payment/settings", (_req, res) => {
  res.json(
    GetPaymentSettingsResponse.parse({
      razorpayEnabled: isRazorpayConfigured(),
      keyId: isRazorpayConfigured() ? getRazorpayKeyId() : null,
    }),
  );
});

router.post("/payment/razorpay-order", async (req, res) => {
  const parsed = CreateRazorpayOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (!isRazorpayConfigured()) {
    res.status(400).json({ error: "Razorpay isn't connected yet." });
    return;
  }

  try {
    const { razorpayOrderId } = await createRazorpayOrder(parsed.data.amount, `order-${Date.now()}`);
    res.json(CreateRazorpayOrderResponse.parse({ razorpayOrderId }));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not create the Razorpay order." });
  }
});

export default router;
