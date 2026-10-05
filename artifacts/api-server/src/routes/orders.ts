import { Router, type IRouter } from "express";
import { db, ordersTable, orderItemsTable } from "@workspace/db";
import { CreateOrderBody, CreateOrderResponse } from "@workspace/api-zod";
import { shapeOrder, generateOrderNumber } from "../lib/order-shape";
import { verifyRazorpaySignature } from "../lib/razorpay";
import { sendOrderConfirmationEmail } from "../lib/email";
import { sendOrderConfirmedWhatsApp, sendAdminNewOrderAlert, sendPackingAlert } from "../lib/whatsapp";

const router: IRouter = Router();

router.post("/orders", async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { items, razorpayOrderId, razorpayPaymentId, razorpaySignature, ...orderFields } = parsed.data;
  if (items.length === 0) {
    res.status(400).json({ error: "An order needs at least one item" });
    return;
  }

  let paymentStatus = "pending";
  if (razorpayOrderId || razorpayPaymentId || razorpaySignature) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ error: "Incomplete Razorpay payment verification data" });
      return;
    }
    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      res.status(400).json({ error: "Payment verification failed" });
      return;
    }
    paymentStatus = "paid";
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      ...orderFields,
      notes: orderFields.notes ?? null,
      email: orderFields.email ?? null,
      state: orderFields.state ?? null,
      billingAddress: orderFields.billingAddress ?? null,
      billingCity: orderFields.billingCity ?? null,
      billingPincode: orderFields.billingPincode ?? null,
      billingState: orderFields.billingState ?? null,
      orderNumber: generateOrderNumber(),
      paymentStatus,
      razorpayOrderId: razorpayOrderId ?? null,
      razorpayPaymentId: razorpayPaymentId ?? null,
    })
    .returning();
  if (!order) {
    res.status(500).json({ error: "Failed to create order" });
    return;
  }

  const savedItems = await db
    .insert(orderItemsTable)
    .values(
      items.map((item) => ({
        orderId: order.id,
        productVariantId: item.productVariantId ?? null,
        nameSnapshot: item.name,
        priceSnapshot: item.price,
        quantity: item.quantity,
      })),
    )
    .returning();

  void sendOrderConfirmationEmail(order, savedItems);
  void sendOrderConfirmedWhatsApp(order);
  void sendAdminNewOrderAlert(order);
  void sendPackingAlert(order, savedItems);

  res.status(201).json(CreateOrderResponse.parse(shapeOrder(order, savedItems)));
});

export default router;
