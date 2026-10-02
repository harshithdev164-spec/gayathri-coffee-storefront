import { db, settingsTable, SETTINGS_KEYS } from "@workspace/db";

export type RateTier = { weightGrams: number; price: number };

const DEFAULT_RATE_TABLE: RateTier[] = [
  { weightGrams: 500, price: 82 },
  { weightGrams: 1000, price: 101 },
  { weightGrams: 1500, price: 120 },
  { weightGrams: 2000, price: 139 },
  { weightGrams: 2500, price: 158 },
  { weightGrams: 3000, price: 177 },
  { weightGrams: 3500, price: 196 },
  { weightGrams: 4000, price: 215 },
  { weightGrams: 4500, price: 234 },
  { weightGrams: 5000, price: 252 },
  { weightGrams: 5500, price: 277 },
  { weightGrams: 6000, price: 296 },
  { weightGrams: 6500, price: 315 },
  { weightGrams: 7000, price: 334 },
  { weightGrams: 7500, price: 353 },
  { weightGrams: 8000, price: 372 },
  { weightGrams: 8500, price: 390 },
  { weightGrams: 9000, price: 409 },
  { weightGrams: 9500, price: 428 },
  { weightGrams: 10000, price: 447 },
];

const DEFAULT_FREE_DELIVERY_THRESHOLD = 900;

function sortedTiers(tiers: RateTier[]): RateTier[] {
  return [...tiers].sort((a, b) => a.weightGrams - b.weightGrams);
}

export async function readShippingSettings() {
  const rows = await db.select().from(settingsTable);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  const rawTable = byKey.get(SETTINGS_KEYS.indiaPostRateTable);
  let indiaPostRateTable = DEFAULT_RATE_TABLE;
  if (rawTable) {
    try {
      const parsed = JSON.parse(rawTable) as RateTier[];
      if (Array.isArray(parsed) && parsed.length > 0) indiaPostRateTable = sortedTiers(parsed);
    } catch {
      // fall back to defaults on malformed stored JSON
    }
  }

  const freeDeliveryThreshold = Number(byKey.get(SETTINGS_KEYS.freeDeliveryThreshold) ?? DEFAULT_FREE_DELIVERY_THRESHOLD);
  return { indiaPostRateTable, freeDeliveryThreshold };
}

export async function writeShippingSettings(settings: { indiaPostRateTable: RateTier[]; freeDeliveryThreshold: number }) {
  const table = sortedTiers(settings.indiaPostRateTable);
  await db
    .insert(settingsTable)
    .values({ key: SETTINGS_KEYS.indiaPostRateTable, value: JSON.stringify(table) })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(table) } });
  await db
    .insert(settingsTable)
    .values({ key: SETTINGS_KEYS.freeDeliveryThreshold, value: String(settings.freeDeliveryThreshold) })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(settings.freeDeliveryThreshold) } });
  return readShippingSettings();
}
