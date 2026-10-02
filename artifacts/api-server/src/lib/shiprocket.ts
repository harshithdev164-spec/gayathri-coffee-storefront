const SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isShiprocketConfigured(): boolean {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

async function getShiprocketToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const res = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }),
  });
  const data = (await res.json()) as { token?: string; message?: string };
  if (!res.ok || !data.token) {
    throw new Error(data.message || `Shiprocket login failed (HTTP ${res.status})`);
  }

  cachedToken = { token: data.token, expiresAt: Date.now() + 1000 * 60 * 60 * 9 };
  return data.token;
}

type ServiceabilityResponse = {
  data?: {
    available_courier_companies?: { courier_company_id: number; rate: number; etd?: string; courier_name?: string }[];
    recommended_courier_company_id?: number;
  };
};

export type ShiprocketRateQuote = { amount: number; etd: string | null; courierName: string | null };

// This is Shiprocket's own shipping calculator: given a pickup/delivery pincode
// pair, weight and COD-or-not, it returns every courier they'd hand the order to
// and what each would charge — the real, live equivalent of a flat estimate.
export async function getShiprocketRate(deliveryPincode: string, weightGrams: number, cod: boolean): Promise<ShiprocketRateQuote> {
  const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE;
  if (!pickupPincode) {
    throw new Error("SHIPROCKET_PICKUP_PINCODE is not set.");
  }

  const token = await getShiprocketToken();
  const weightKg = Math.max(weightGrams / 1000, 0.5);
  const params = new URLSearchParams({
    pickup_postcode: pickupPincode,
    delivery_postcode: deliveryPincode,
    weight: String(weightKg),
    cod: cod ? "1" : "0",
  });

  const res = await fetch(`${SHIPROCKET_BASE}/courier/serviceability/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as ServiceabilityResponse;
  const couriers = data.data?.available_courier_companies ?? [];
  if (!res.ok || couriers.length === 0) {
    throw new Error(`No courier serviceable${cod ? " for COD" : ""} at pincode ${deliveryPincode}.`);
  }

  const recommended = couriers.find((c) => c.courier_company_id === data.data?.recommended_courier_company_id);
  const cheapest = couriers.reduce((min, c) => (c.rate < min.rate ? c : min), couriers[0]!);
  const chosen = recommended ?? cheapest;

  return { amount: Math.round(chosen.rate), etd: chosen.etd ?? null, courierName: chosen.courier_name ?? null };
}

export type ShiprocketOrderInput = {
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  items: { name: string; price: number; quantity: number; sku: string }[];
  total: number;
  cod: boolean;
};

export type ShiprocketShipmentResult = {
  shiprocketOrderId: string;
  shipmentId: string;
  awbCode: string | null;
};

export async function createShiprocketShipment(order: ShiprocketOrderInput): Promise<ShiprocketShipmentResult> {
  const token = await getShiprocketToken();
  const [firstName, ...rest] = order.customerName.trim().split(/\s+/);

  const res = await fetch(`${SHIPROCKET_BASE}/orders/create/adhoc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      order_id: order.orderNumber,
      order_date: new Date().toISOString().slice(0, 10),
      pickup_location: "Primary",
      billing_customer_name: firstName || order.customerName,
      billing_last_name: rest.join(" ") || ".",
      billing_address: order.address,
      billing_city: order.city,
      billing_pincode: order.pincode,
      billing_state: "Karnataka",
      billing_country: "India",
      billing_phone: order.phone,
      shipping_is_billing: true,
      order_items: order.items.map((item) => ({
        name: item.name,
        units: item.quantity,
        selling_price: item.price,
        // Shiprocket requires an SKU per line item.
        sku: item.sku,
      })),
      payment_method: order.cod ? "COD" : "Prepaid",
      sub_total: order.total,
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
    }),
  });

  const data = (await res.json()) as {
    message?: string;
    order_id?: number | string;
    shipment_id?: number | string;
    awb_code?: string;
  };
  if (!res.ok) {
    throw new Error(data.message || `Shiprocket order creation failed (HTTP ${res.status})`);
  }

  return {
    shiprocketOrderId: data.order_id ? String(data.order_id) : "",
    shipmentId: data.shipment_id ? String(data.shipment_id) : "",
    awbCode: data.awb_code ? String(data.awb_code) : null,
  };
}
