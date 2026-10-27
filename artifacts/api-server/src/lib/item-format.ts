// Order item names are stored as one string, e.g. "Pure Coffee · 500 g · Coarse (Filter)" or
// "Custom Blend · 50% Robusta / 50% Arabica · Medium grind · 1 kg". The packing team needs the
// product, grind, pack size and quantity separately, so this splits that string back apart.
const SIZE = /^\d+(\.\d+)?\s*(g|gm|gms|gram|grams|kg|kgs|ml|l|ltr)$/i;
const GRIND = /(grind|coarse|medium|fine|roasted beans|whole bean)/i;

export type ParsedItem = { product: string; grind: string | null; size: string | null; quantity: number };

export function parseItem(name: string, quantity: number): ParsedItem {
  const parts = name.split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  let grind: string | null = null;
  let size: string | null = null;
  const product: string[] = [];
  for (const part of parts) {
    if (!size && SIZE.test(part)) size = part;
    else if (!grind && GRIND.test(part) && product.length > 0) grind = part.replace(/\s+grind$/i, "");
    else product.push(part);
  }
  return { product: product.join(" · ") || name, grind, size, quantity };
}

// One line per item: product, grind, pack size, quantity. WhatsApp template values can't contain
// line breaks, so lines are joined with " // ".
export function packingLines(items: { nameSnapshot: string; quantity: number }[]): string {
  return items
    .map((item, index) => {
      const parsed = parseItem(item.nameSnapshot, item.quantity);
      return `${index + 1}) ${parsed.product} | Grind: ${parsed.grind ?? "-"} | Size: ${parsed.size ?? "-"} | Qty: ${parsed.quantity}`;
    })
    .join(" // ");
}

export function carrierName(shippingMethod: string): string {
  if (shippingMethod === "shiprocket") return "Shiprocket";
  if (shippingMethod === "india_post") return "India Post";
  return "Store pickup";
}
