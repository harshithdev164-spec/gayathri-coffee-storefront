import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, productsTable, productVariantsTable, productImagesTable } from "@workspace/db";
import { ListProductsResponse } from "@workspace/api-zod";
import { shapeProduct } from "../lib/product-shape";

const router: IRouter = Router();

router.get("/products", async (_req, res) => {
  const products = await db.select().from(productsTable).where(eq(productsTable.active, true));
  const productIds = products.map((product) => product.id);

  const [variants, images] = productIds.length
    ? await Promise.all([
        db.select().from(productVariantsTable).where(inArray(productVariantsTable.productId, productIds)),
        db.select().from(productImagesTable).where(inArray(productImagesTable.productId, productIds)),
      ])
    : [[], []];

  const shaped = products.map((product) =>
    shapeProduct(
      product,
      variants.filter((variant) => variant.productId === product.id),
      images.filter((image) => image.productId === product.id),
    ),
  );

  res.json(ListProductsResponse.parse(shaped));
});

export default router;
