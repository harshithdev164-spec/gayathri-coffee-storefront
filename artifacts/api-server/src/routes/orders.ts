import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pendingCheckoutsTable } from "@workspace/db";
import { CreateOrderBody, CreateOrderResponse } from "@workspace/api-zod";
import { shapeOrder } from "../lib/order-shape";
import { verifyRazorpaySignature } from "../lib/razorpay";
import { CheckoutPayload, createOrder } from "../lib/order-create";

const router: IRouter = Router();

router.post("/orders", async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, ...rest } = parsed.data;
  let payload = CheckoutPayload.parse(rest);
  if (payload.items.length === 0) {
    res.status(400).json({ error: "An order needs at least one item" });
    return;
  }

  let razorpay: { orderId: string; paymentId: string } | undefined;
  let orderNumber: string | undefined;
  if (razorpayOrderId || razorpayPaymentId || razorpaySignature) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ error: "Incomplete Razorpay payment verification data" });
      return;
    }
    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      res.status(400).json({ error: "Payment verification failed" });
      return;
    }
    razorpay = { orderId: razorpayOrderId, paymentId: razorpayPaymentId };

    // The checkout we saved before the customer paid is the source of truth: it carries the order
    // number shown in Razorpay and can't be altered by the browser after payment.
    const [pending] = await db.select().from(pendingCheckoutsTable).where(eq(pendingCheckoutsTable.razorpayOrderId, razorpayOrderId)).limit(1);
    if (pending) {
      const saved = CheckoutPayload.safeParse(pending.payload);
      if (saved.success) payload = saved.data;
      orderNumber = pending.orderNumber;
    }
  }

  const { order, items } = await createOrder({ payload, razorpay, orderNumber });
  res.status(201).json(CreateOrderResponse.parse(shapeOrder(order, items)));
});

export default router;
