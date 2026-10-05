// Standard GST state/UT codes (used on every Indian tax invoice next to the state name).
export const GST_STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01",
  "Himachal Pradesh": "02",
  Punjab: "03",
  Chandigarh: "04",
  Uttarakhand: "05",
  Haryana: "06",
  Delhi: "07",
  Rajasthan: "08",
  "Uttar Pradesh": "09",
  Bihar: "10",
  Sikkim: "11",
  "Arunachal Pradesh": "12",
  Nagaland: "13",
  Manipur: "14",
  Mizoram: "15",
  Tripura: "16",
  Meghalaya: "17",
  Assam: "18",
  "West Bengal": "19",
  Jharkhand: "20",
  Odisha: "21",
  Chhattisgarh: "22",
  "Madhya Pradesh": "23",
  Gujarat: "24",
  "Daman and Diu": "25",
  "Dadra and Nagar Haveli": "26",
  Maharashtra: "27",
  Karnataka: "29",
  Goa: "30",
  Lakshadweep: "31",
  Kerala: "32",
  "Tamil Nadu": "33",
  Puducherry: "34",
  "Andaman and Nicobar Islands": "35",
  Telangana: "36",
  "Andhra Pradesh": "37",
  Ladakh: "38",
};

export const INDIAN_STATES = Object.keys(GST_STATE_CODES).sort((a, b) => a.localeCompare(b));

export function gstStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  return GST_STATE_CODES[state.trim()] ?? null;
}

export function isSameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type GstBreakdown =
  | { type: "intra"; taxableValue: number; cgstAmount: number; sgstAmount: number; rate: number }
  | { type: "inter"; taxableValue: number; igstAmount: number; rate: number };

// Our prices are GST-inclusive (what the customer actually pays at checkout),
// so this backs the tax portion out of the subtotal rather than adding it on
// top — the invoice discloses the GST split without changing the amount charged.
export function computeGst(subtotal: number, customerState: string | null | undefined, businessState: string): GstBreakdown {
  const rate = Number(process.env.INVOICE_GST_RATE ?? "5");
  const taxableValue = Math.round((subtotal / (1 + rate / 100)) * 100) / 100;
  const totalTax = Math.round((subtotal - taxableValue) * 100) / 100;

  if (isSameState(customerState, businessState)) {
    const half = Math.round((totalTax / 2) * 100) / 100;
    return { type: "intra", taxableValue, cgstAmount: half, sgstAmount: totalTax - half, rate: rate / 2 };
  }
  return { type: "inter", taxableValue, igstAmount: totalTax, rate };
}
