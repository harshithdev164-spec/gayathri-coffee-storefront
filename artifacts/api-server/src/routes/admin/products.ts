import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { db, productsTable, productVariantsTable, productImagesTable } from "@workspace/db";
import {
  AdminListProductsResponse,
  AdminCreateProductBody,
  AdminCreateProductResponse,
  AdminUpdateProductBody,
  AdminUpdateProductResponse,
  AdminDeleteProductResponse,
  AdminPresignUploadBody,
  AdminPresignUploadResponse,
  AdminAddProductImageBody,
  AdminAddProductImageResponse,
  AdminDeleteProductImageResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../../middlewares/require-admin";
import { shapeProduct } from "../../lib/product-shape";
import { presignProductImageUpload, publicUrlForObjectKey } from "../../lib/storage";

const router: IRouter = Router();
router.use(requireAdmin);

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

async function loadDetails(productIds: string[]) {
  if (productIds.length === 0) return { variants: [], images: [] };
  const [variants, images] = await Promise.all([
    db.select().from(productVariantsTable).where(inArray(productVariantsTable.productId, productIds)),
    db.select().from(productImagesTable).where(inArray(productImagesTable.productId, productIds)),
  ]);
  return { variants, images };
}

async function replaceVariants(productId: string, variants: z.infer<typeof AdminCreateProductBody>["variants"]) {
  await db.delete(productVariantsTable).where(eq(productVariantsTable.productId, productId));
  if (variants.length === 0) return;
  await db.insert(productVariantsTable).values(
    variants.map((variant) => ({
      productId,
      weightGrams: variant.weightGrams,
      price: variant.price,
      sku: variant.sku ?? null,
      stockQty: variant.stockQty,
      isDefault: variant.isDefault,
    })),
  );
}

router.get("/products", async (_req, res) => {
  const products = await db.select().from(productsTable);
  const { variants, images } = await loadDetails(products.map((product) => product.id));

  const shaped = products.map((product) =>
    shapeProduct(
      product,
      variants.filter((v) => v.productId === product.id),
      images.filter((i) => i.productId === product.id),
    ),
  );
  res.json(AdminListProductsResponse.parse(shaped));
});

router.post("/products", async (req, res) => {
  const parsed = AdminCreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { variants, ...productFields } = parsed.data;

  let product;
  try {
    [product] = await db.insert(productsTable).values(productFields).returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `A product with slug "${productFields.slug}" already exists.` });
      return;
    }
    throw err;
  }
  if (!product) {
    res.status(500).json({ error: "Failed to create product" });
    return;
  }
  await replaceVariants(product.id, variants);

  const { variants: savedVariants, images } = await loadDetails([product.id]);
  res.status(201).json(AdminCreateProductResponse.parse(shapeProduct(product, savedVariants, images)));
});

router.patch("/products/:id", async (req, res) => {
  const { id } = req.params;
  const parsed = AdminUpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { variants, ...productFields } = parsed.data;

  let product;
  try {
    [product] = await db
      .update(productsTable)
      .set({ ...productFields, updatedAt: new Date() })
      .where(eq(productsTable.id, id))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `A product with slug "${productFields.slug}" already exists.` });
      return;
    }
    throw err;
  }
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await replaceVariants(product.id, variants);

  const { variants: savedVariants, images } = await loadDetails([product.id]);
  res.json(AdminUpdateProductResponse.parse(shapeProduct(product, savedVariants, images)));
});

router.delete("/products/:id", async (req, res) => {
  const { id } = req.params;
  const deleted = await db.delete(productsTable).where(eq(productsTable.id, id)).returning({ id: productsTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(AdminDeleteProductResponse.parse({ ok: true }));
});

router.post("/uploads/presign", async (req, res) => {
  const parsed = AdminPresignUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const result = await presignProductImageUpload(parsed.data.filename, parsed.data.contentType);
  res.json(AdminPresignUploadResponse.parse(result));
});

router.post("/products/:id/images", async (req, res) => {
  const { id } = req.params;
  const parsed = AdminAddProductImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id)).limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (parsed.data.isPrimary) {
    await db.update(productImagesTable).set({ isPrimary: false }).where(eq(productImagesTable.productId, id));
  }

  const existing = await db.select().from(productImagesTable).where(eq(productImagesTable.productId, id));
  const [image] = await db
    .insert(productImagesTable)
    .values({
      productId: id,
      objectKey: parsed.data.objectKey,
      isPrimary: parsed.data.isPrimary,
      sortOrder: existing.length,
    })
    .returning();
  if (!image) {
    res.status(500).json({ error: "Failed to add image" });
    return;
  }

  res.status(201).json(
    AdminAddProductImageResponse.parse({
      id: image.id,
      url: publicUrlForObjectKey(image.objectKey),
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    }),
  );
});

router.delete("/products/:id/images/:imageId", async (req, res) => {
  const { id, imageId } = req.params;
  const deleted = await db
    .delete(productImagesTable)
    .where(eq(productImagesTable.id, imageId))
    .returning({ id: productImagesTable.id, productId: productImagesTable.productId });

  if (deleted.length === 0 || deleted[0]?.productId !== id) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json(AdminDeleteProductImageResponse.parse({ ok: true }));
});

export default router;
