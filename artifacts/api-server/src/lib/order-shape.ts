import type { Order, OrderItem } from "@workspace/db";

export function shapeOrder(order: Order, items: OrderItem[]) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    address: order.address,
    city: order.city,
    pincode: order.pincode,
    state: order.state,
    billingAddress: order.billingAddress,
    billingCity: order.billingCity,
    billingPincode: order.billingPincode,
    billingState: order.billingState,
    notes: order.notes,
    subtotal: order.subtotal,
    shippingMethod: order.shippingMethod,
    shippingFee: order.shippingFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    createdAt: order.createdAt.toISOString(),
    items: items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      name: item.nameSnapshot,
      price: item.priceSnapshot,
      quantity: item.quantity,
    })),
  };
}

export function generateOrderNumber(): string {
  return `GC${Math.floor(100000 + Math.random() * 900000)}`;
}
