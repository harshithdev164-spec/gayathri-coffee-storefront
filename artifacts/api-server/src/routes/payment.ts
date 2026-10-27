import { Router, type IRouter } from "express";
import { GetPaymentSettingsResponse, CreateRazorpayOrderBody, CreateRazorpayOrderResponse } from "@workspace/api-zod";
import { db, pendingCheckoutsTable } from "@workspace/db";
import { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured } from "../lib/razorpay";
import { nextOrderNumber } from "../lib/order-shape";
import { CheckoutPayload } from "../lib/order-create";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/payment/settings", (_req, res) => {
  res.json(
    GetPaymentSettingsResponse.parse({
      razorpayEnabled: isRazorpayConfigured(),
      keyId: isRazorpayConfigured() ? getRazorpayKeyId() : null,
    }),
  );
});

// Razorpay notes accept at most 256 characters per value.
const note = (value: string) => value.replace(/\s*[\r\n]+\s*/g, ", ").slice(0, 250);

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

  const checkout = parsed.data.checkout ? CheckoutPayload.safeParse(parsed.data.checkout) : null;
  if (checkout && !checkout.success) {
    res.status(400).json({ error: "Invalid order details" });
    return;
  }
  const payload = checkout?.data;
  if (payload && payload.total !== parsed.data.amount) {
    res.status(400).json({ error: "The order total doesn't match the amount to pay. Please refresh and try again." });
    return;
  }

  try {
    // The order number is reserved now so it shows against the payment in the Razorpay dashboard.
    const orderNumber = await nextOrderNumber();
    const notes: Record<string, string> = payload
      ? {
          order_number: orderNumber,
          customer: note(payload.customerName),
          phone: note(payload.phone),
          email: note(payload.email ?? ""),
          delivery: payload.shippingMethod === "india_post" ? "India Post" : "Shiprocket",
          ship_to: note(`${payload.address}, ${payload.city} ${payload.pincode}`),
          items: note(payload.items.map((item) => `${item.quantity}x ${item.name}`).join("; ")),
        }
      : { order_number: orderNumber };

    const { razorpayOrderId } = await createRazorpayOrder(parsed.data.amount, orderNumber, notes);

    if (payload) {
      // Saved before the customer pays so a payment can never exist without a way to rebuild its order.
      await db
        .insert(pendingCheckoutsTable)
        .values({ razorpayOrderId, orderNumber, payload })
        .catch((err) => logger.error({ err, razorpayOrderId }, "Could not save the pending checkout — run the database push"));
    }

    res.json(CreateRazorpayOrderResponse.parse({ razorpayOrderId, orderNumber }));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Could not create the Razorpay order." });
  }
});

export default router;
