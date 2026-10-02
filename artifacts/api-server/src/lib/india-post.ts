const BASE_URL = process.env.INDIA_POST_BASE_URL || "https://test.cept.gov.in/beextcustomer";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isIndiaPostConfigured(): boolean {
  return Boolean(process.env.INDIA_POST_USERNAME && process.env.INDIA_POST_PASSWORD);
}

export function isIndiaPostBookingConfigured(): boolean {
  return isIndiaPostConfigured() && Boolean(process.env.INDIA_POST_BULK_CUSTOMER_ID && process.env.INDIA_POST_CONTRACT_ID);
}

type LoginResponse = {
  success: boolean;
  message?: string;
  data?: {
    access_token: string;
    expires_in: number;
  };
};

async function getIndiaPostToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const res = await fetch(`${BASE_URL}/v1/access/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      username: process.env.INDIA_POST_USERNAME,
      password: process.env.INDIA_POST_PASSWORD,
    }),
  });
  const data = (await res.json()) as LoginResponse;
  if (!res.ok || !data.success || !data.data?.access_token) {
    throw new Error(data.message || `India Post login failed (HTTP ${res.status})`);
  }

  // Tokens are valid for 15 minutes; refresh a little early to be safe.
  const ttlMs = Math.max((data.data.expires_in - 30) * 1000, 10_000);
  cachedToken = { token: data.data.access_token, expiresAt: Date.now() + ttlMs };
  return cachedToken.token;
}

type BusinessParcelTariffResponse = {
  success: boolean;
  message?: string;
  final_amount?: number;
  base_tariff?: number;
  total_tax?: number;
  chargeable_weight?: number;
};

export type IndiaPostRateInput = {
  weightGrams: number;
  destinationPincode: string;
  // Reasonable default parcel box for a coffee pouch order; override if needed.
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
};

export async function getIndiaPostTariff(input: IndiaPostRateInput): Promise<{ amount: number; chargeableWeight?: number }> {
  const sourcePincode = process.env.INDIA_POST_SOURCE_PINCODE;
  if (!sourcePincode) {
    throw new Error("INDIA_POST_SOURCE_PINCODE is not set.");
  }

  const token = await getIndiaPostToken();
  const weight = Math.min(Math.max(Math.round(input.weightGrams), 1), 35_000);
  const params = new URLSearchParams({
    "product-code": "BP",
    weight: String(weight),
    "source-pincode": sourcePincode,
    "destination-pincode": input.destinationPincode,
    length: String(input.lengthCm ?? 20),
    width: String(input.widthCm ?? 15),
    height: String(input.heightCm ?? 10),
  });

  const res = await fetch(`${BASE_URL}/v1/business-parcel-tariff/calculate?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const data = (await res.json()) as BusinessParcelTariffResponse;
  if (!res.ok || !data.success || typeof data.final_amount !== "number") {
    throw new Error(data.message || `India Post tariff lookup failed (HTTP ${res.status})`);
  }

  return { amount: Math.round(data.final_amount), chargeableWeight: data.chargeable_weight };
}
