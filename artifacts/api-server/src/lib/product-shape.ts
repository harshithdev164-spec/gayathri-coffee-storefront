import type { Product, ProductImage, ProductVariant } from "@workspace/db";
import { publicUrlForObjectKey } from "./storage";

export function shapeProduct(product: Product, variants: ProductVariant[], images: ProductImage[]) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortName: product.shortName,
    description: product.description,
    category: product.category,
    roast: product.roast,
    notes: product.notes,
    badge: product.badge,
    active: product.active,
    variants: variants.map((variant) => ({
      id: variant.id,
      weightGrams: variant.weightGrams,
      price: variant.price,
      sku: variant.sku,
      stockQty: variant.stockQty,
      isDefault: variant.isDefault,
    })),
    images: images
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => ({
        id: image.id,
        url: publicUrlForObjectKey(image.objectKey),
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
  };
}
