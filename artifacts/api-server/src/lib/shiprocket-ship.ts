import { eq } from "drizzle-orm";
import { db, ordersTable, type Order, type OrderItem } from "@workspace/db";
import { parseItem } from "./item-format";
import { assignShiprocketAwb, createShiprocketShipment, scheduleShiprocketPickup } from "./shiprocket";

// Books an order with Shiprocket: creates the shipment, generates the AWB with the
// recommended courier and (optionally) requests a pickup. Each step is saved as soon as it
// succeeds and skipped if already done, so a failure halfway (e.g. wallet balance) can simply
// be retried without creating a duplicate shipment.
// "500 g" -> 500, "1 kg" -> 1000, "200 ml" -> 200 (a litre of liquid weighs about a kilo). Unknown sizes count as 0.
function packGrams(size: string | null): number {
  const match = size?.match(/^(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|kg|kgs|ml|l|ltr)$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  return unit.startsWith("k") || unit === "l" || unit === "ltr" ? value * 1000 : value;
}

export async function shipOrderViaShiprocket(
  initial: Order,
  items: OrderItem[],
  opts: { schedulePickup?: boolean } = {},
): Promise<Order> {
  let order = initial;
  const save = async (patch: Partial<Order>) => {
    const [updated] = await db.update(ordersTable).set(patch).where(eq(ordersTable.id, order.id)).returning();
    if (!updated) throw new Error("Order disappeared while saving shipment details");
    order = updated;
  };

  if (!order.shiprocketShipmentId) {
    const shipment = await createShiprocketShipment({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      city: order.city,
      pincode: order.pincode,
      state: order.state,
      billingAddress: order.billingAddress,
      billingCity: order.billingCity,
      billingPincode: order.billingPincode,
      billingState: order.billingState,
      items: items.map((item) => ({
        name: item.nameSnapshot,
        price: item.priceSnapshot,
        quantity: item.quantity,
        // Shiprocket requires an SKU per line item; fall back to a slug of the
        // name for items with no linked variant (e.g. custom blends).
        sku: item.productVariantId ?? item.nameSnapshot.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      })),
      // Pack size is part of each item's name ("Pure Coffee · 500 g · ..."), so the weight can be rebuilt from it.
      weightKg: items.reduce((sum, item) => sum + packGrams(parseItem(item.nameSnapshot, item.quantity).size) * item.quantity, 0) / 1000,
      total: order.total,
      cod: order.paymentMethod === "Cash on Delivery",
    });
    await save({
      shiprocketOrderId: shipment.shiprocketOrderId || null,
      shiprocketShipmentId: shipment.shipmentId || null,
      status: order.status === "pending" ? "confirmed" : order.status,
      ...(shipment.awbCode ? { trackingNumber: shipment.awbCode, trackingUrl: `https://shiprocket.co/tracking/${shipment.awbCode}` } : {}),
    });
  }

  if (!order.shiprocketShipmentId) throw new Error("Shiprocket did not return a shipment id.");

  if (!order.trackingNumber) {
    const awb = await assignShiprocketAwb(order.shiprocketShipmentId);
    await save({
      trackingNumber: awb.awbCode,
      trackingUrl: `https://shiprocket.co/tracking/${awb.awbCode}`,
      courierName: awb.courierName,
    });
  }

  if (opts.schedulePickup && !order.pickupScheduledFor) {
    const pickup = await scheduleShiprocketPickup(order.shiprocketShipmentId);
    await save({ pickupScheduledFor: pickup.scheduledFor ?? "Requested" });
  }

  return order;
}
