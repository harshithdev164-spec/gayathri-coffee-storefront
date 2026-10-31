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

type PickupLocation = { name: string; pincode: string };
let cachedPickup: { value: PickupLocation; expiresAt: number } | null = null;

// The pickup location is whatever it is called in YOUR Shiprocket account (Settings > Pickup Addresses) -
// it was wrongly assumed to be "Primary", which made Shiprocket reject every order. Set
// SHIPROCKET_PICKUP_LOCATION to pick a specific one; otherwise the account's first active location is used.
export async function getPickupLocation(): Promise<PickupLocation> {
  if (cachedPickup && cachedPickup.expiresAt > Date.now()) return cachedPickup.value;

  const token = await getShiprocketToken();
  const res = await fetch(`${SHIPROCKET_BASE}/settings/company/pickup`, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => ({}))) as { data?: { shipping_address?: { pickup_location: string; pin_code: string; status: number }[] } };
  const locations = data.data?.shipping_address ?? [];
  if (!res.ok || locations.length === 0) {
    throw new Error("Shiprocket has no pickup address on your account. Add one in Shiprocket > Settings > Pickup Addresses.");
  }

  const wanted = process.env.SHIPROCKET_PICKUP_LOCATION?.trim().toLowerCase();
  const chosen =
    (wanted && locations.find((l) => l.pickup_location.toLowerCase() === wanted)) ||
    locations.find((l) => l.status === 2) ||
    locations[0]!;
  if (wanted && chosen.pickup_location.toLowerCase() !== wanted) {
    throw new Error(`SHIPROCKET_PICKUP_LOCATION "${process.env.SHIPROCKET_PICKUP_LOCATION}" isn't in your Shiprocket account. Available: ${locations.map((l) => l.pickup_location).join(", ")}.`);
  }

  const value = { name: chosen.pickup_location, pincode: chosen.pin_code };
  cachedPickup = { value, expiresAt: Date.now() + 1000 * 60 * 30 };
  return value;
}

type ServiceabilityResponse = {
  data?: {
    available_courier_companies?: { courier_company_id: number; rate: number; etd?: string; courier_name?: string }[];
    recommended_courier_company_id?: number;
  };
};

// Money left in the Shiprocket wallet (in rupees). Every AWB booked takes its freight out of this, and
// booking fails when it runs out - so the admin dashboard shows it.
export async function getShiprocketWalletBalance(): Promise<number> {
  const token = await getShiprocketToken();
  const res = await fetch(`${SHIPROCKET_BASE}/account/details/wallet-balance`, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => ({}))) as { data?: { balance_amount?: string | number }; message?: string };
  const balance = Number(data.data?.balance_amount);
  if (!res.ok || !Number.isFinite(balance)) throw new Error(data.message || `Could not read the Shiprocket wallet (HTTP ${res.status})`);
  return balance;
}

export type ShiprocketRateQuote = { amount: number; etd: string | null; courierName: string | null };

// This is Shiprocket's own shipping calculator: given a pickup/delivery pincode
// pair, weight and COD-or-not, it returns every courier they'd hand the order to
// and what each would charge — the real, live equivalent of a flat estimate.
export async function getShiprocketRate(deliveryPincode: string, weightGrams: number, cod: boolean): Promise<ShiprocketRateQuote> {
  // Rates must be quoted from where the parcel really leaves, so the Shiprocket pickup address wins.
  const pickupPincode = (await getPickupLocation().catch(() => null))?.pincode ?? process.env.SHIPROCKET_PICKUP_PINCODE;
  if (!pickupPincode) {
    throw new Error("No Shiprocket pickup address found and SHIPROCKET_PICKUP_PINCODE is not set.");
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
  state?: string | null;
  // Only set when the customer entered a billing address different from the
  // shipping address above — Shiprocket delivers to address/city/pincode and
  // prints billing_* on the invoice it generates.
  billingAddress?: string | null;
  billingCity?: string | null;
  billingPincode?: string | null;
  billingState?: string | null;
  items: { name: string; price: number; quantity: number; sku: string }[];
  total: number;
  cod: boolean;
  // Parcel weight in kilograms; Shiprocket bills freight on it.
  weightKg?: number;
};

export type ShiprocketShipmentResult = {
  shiprocketOrderId: string;
  shipmentId: string;
  awbCode: string | null;
};

export async function createShiprocketShipment(order: ShiprocketOrderInput): Promise<ShiprocketShipmentResult> {
  const token = await getShiprocketToken();
  const [firstName, ...rest] = order.customerName.trim().split(/\s+/);
  const lastName = rest.join(" ") || ".";
  const hasSeparateBilling = Boolean(order.billingAddress);
  const pickup = await getPickupLocation();
  // Shiprocket wants a bare 10-digit mobile number — strip +91 / spaces / dashes.
  const phone = order.phone.replace(/\D/g, "").slice(-10);
  // Address lines must be at least 3 characters; very long item names are rejected.
  const padAddress = (value: string) => (value.trim().length >= 3 ? value.trim() : `${value.trim()} ...`.trim());
  const itemName = (name: string) => name.slice(0, 200);
  const skuOf = (sku: string) => sku.slice(0, 50);

  const res = await fetch(`${SHIPROCKET_BASE}/orders/create/adhoc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      order_id: order.orderNumber,
      order_date: new Date().toISOString().slice(0, 16).replace("T", " "),
      pickup_location: pickup.name,
      billing_customer_name: firstName || order.customerName,
      billing_last_name: lastName,
      billing_address: padAddress((hasSeparateBilling ? order.billingAddress : order.address) ?? ""),
      billing_city: hasSeparateBilling ? (order.billingCity ?? order.city) : order.city,
      billing_pincode: hasSeparateBilling ? (order.billingPincode ?? order.pincode) : order.pincode,
      billing_state: (hasSeparateBilling ? order.billingState : order.state) ?? "Karnataka",
      billing_country: "India",
      billing_phone: phone,
      shipping_is_billing: !hasSeparateBilling,
      ...(hasSeparateBilling
        ? {
            shipping_customer_name: firstName || order.customerName,
            shipping_last_name: lastName,
            shipping_address: padAddress(order.address),
            shipping_city: order.city,
            shipping_pincode: order.pincode,
            shipping_state: order.state ?? "Karnataka",
            shipping_country: "India",
            shipping_phone: phone,
          }
        : {}),
      order_items: order.items.map((item) => ({
        name: itemName(item.name),
        units: item.quantity,
        selling_price: item.price,
        // Shiprocket requires an SKU per line item.
        sku: skuOf(item.sku) || "item",
      })),
      payment_method: order.cod ? "COD" : "Prepaid",
      sub_total: order.total,
      length: 10,
      breadth: 10,
      height: 10,
      weight: Math.max(order.weightKg ?? 0, 0.5),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    errors?: Record<string, string[] | string>;
    order_id?: number | string;
    shipment_id?: number | string;
    awb_code?: string;
  };
  if (!res.ok || (!data.order_id && !data.shipment_id)) {
    // Validation failures come back as a generic message with the real reasons in `errors`.
    const details = data.errors
      ? Object.entries(data.errors).map(([field, msg]) => `${field}: ${Array.isArray(msg) ? msg.join(", ") : msg}`).join("; ")
      : "";
    throw new Error([data.message || `Shiprocket order creation failed (HTTP ${res.status})`, details].filter(Boolean).join(" — "));
  }

  return {
    shiprocketOrderId: data.order_id ? String(data.order_id) : "",
    shipmentId: data.shipment_id ? String(data.shipment_id) : "",
    awbCode: data.awb_code ? String(data.awb_code) : null,
  };
}

async function shiprocketPost<T>(path: string, body: unknown, failure: string): Promise<T> {
  const token = await getShiprocketToken();
  const res = await fetch(`${SHIPROCKET_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || `${failure} (HTTP ${res.status})`);
  }
  return data;
}

export type AwbAssignment = { awbCode: string; courierName: string | null };

// Picks Shiprocket's recommended courier for the shipment and generates its AWB.
// This is the step that actually books the shipment (and debits freight from the wallet).
export async function assignShiprocketAwb(shipmentId: string): Promise<AwbAssignment> {
  const data = await shiprocketPost<{
    awb_assign_status?: number;
    message?: string;
    status_code?: number;
    response?: { data?: { awb_code?: string; courier_name?: string; awb_assign_error?: string }; message?: string };
  }>("/courier/assign/awb", { shipment_id: shipmentId }, "Shiprocket AWB assignment failed");

  const awb = data.response?.data?.awb_code;
  if (!awb) {
    // Shiprocket explains itself in several different places depending on what went wrong.
    const reason = data.response?.data?.awb_assign_error || data.response?.message || data.message;
    const walletHint = /wallet|balance|recharge|insufficient/i.test(reason ?? "") ? " Top up your Shiprocket wallet and try again." : "";
    throw new Error(`${reason || "Shiprocket could not assign an AWB."}${walletHint} (Check the wallet balance, the parcel weight and the delivery address.)`);
  }
  return { awbCode: String(awb), courierName: data.response?.data?.courier_name ?? null };
}

// Label URLs expire, so a fresh one is generated every time an admin downloads.
export async function getShiprocketLabelUrl(shipmentId: string): Promise<string> {
  const data = await shiprocketPost<{ label_url?: string; label_created?: number; response?: string; message?: string }>(
    "/courier/generate/label",
    { shipment_id: [Number(shipmentId)] },
    "Shiprocket label generation failed",
  );
  if (!data.label_url) {
    throw new Error(data.response || data.message || "Shiprocket did not return a label. The AWB may not be assigned yet.");
  }
  return data.label_url;
}

export type PickupResult = { scheduledFor: string | null; message: string };

export async function scheduleShiprocketPickup(shipmentId: string): Promise<PickupResult> {
  const data = await shiprocketPost<{
    pickup_status?: number;
    message?: string;
    response?: { pickup_scheduled_date?: string; data?: string; message?: string };
  }>("/courier/generate/pickup", { shipment_id: [Number(shipmentId)] }, "Shiprocket pickup scheduling failed");

  if (data.pickup_status === 0 && !data.response?.pickup_scheduled_date) {
    throw new Error(data.response?.message || data.message || "Shiprocket could not schedule the pickup.");
  }
  return {
    scheduledFor: data.response?.pickup_scheduled_date ?? null,
    message: data.response?.data ?? "Pickup requested.",
  };
}
