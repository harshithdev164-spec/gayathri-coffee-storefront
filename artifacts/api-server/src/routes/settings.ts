import { Router, type IRouter } from "express";
import {
  GetShippingSettingsResponse,
  GetIndiaPostRateQueryParams,
  GetIndiaPostRateResponse,
  GetShiprocketRateQueryParams,
  GetShiprocketRateResponse,
} from "@workspace/api-zod";
import { readShippingSettings } from "../lib/settings";
import { getIndiaPostTariff, isIndiaPostConfigured } from "../lib/india-post";
import { getShiprocketRate, isShiprocketConfigured } from "../lib/shiprocket";

const router: IRouter = Router();

// Matches the frontend's SHIPROCKET_ESTIMATE_FEE fallback shown before Shiprocket is connected.
const SHIPROCKET_FLAT_ESTIMATE_FEE = 49;

router.get("/shipping-settings", async (_req, res) => {
  const settings = await readShippingSettings();
  res.json(GetShippingSettingsResponse.parse(settings));
});

function lookupRateCardFee(weightGrams: number, table: { weightGrams: number; price: number }[]): number {
  if (table.length === 0) return 60;
  const sorted = [...table].sort((a, b) => a.weightGrams - b.weightGrams);
  const tier = sorted.find((t) => t.weightGrams >= weightGrams);
  return tier ? tier.price : sorted[sorted.length - 1].price;
}

router.get("/shipping/india-post-rate", async (req, res) => {
  const parsed = GetIndiaPostRateQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { pincode, weightGrams } = parsed.data;

  if (isIndiaPostConfigured()) {
    try {
      const quote = await getIndiaPostTariff({ weightGrams, destinationPincode: pincode });
      res.json(GetIndiaPostRateResponse.parse({ amount: quote.amount, source: "india_post_api" }));
      return;
    } catch {
      // fall through to the rate-card fallback below
    }
  }

  const settings = await readShippingSettings();
  const amount = lookupRateCardFee(weightGrams, settings.indiaPostRateTable);
  res.json(GetIndiaPostRateResponse.parse({ amount, source: "rate_card" }));
});

router.get("/shipping/shiprocket-rate", async (req, res) => {
  const parsed = GetShiprocketRateQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { pincode, weightGrams, cod } = parsed.data;

  if (isShiprocketConfigured()) {
    try {
      const quote = await getShiprocketRate(pincode, weightGrams, cod ?? false);
      res.json(GetShiprocketRateResponse.parse({ amount: quote.amount, source: "shiprocket_api", etd: quote.etd, courierName: quote.courierName }));
      return;
    } catch {
      // fall through to the flat-estimate fallback below
    }
  }

  res.json(GetShiprocketRateResponse.parse({ amount: SHIPROCKET_FLAT_ESTIMATE_FEE, source: "flat_estimate", etd: null, courierName: null }));
});

export default router;
