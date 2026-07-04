import { db } from "../db";
import { trackedProducts, trackedVariants } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { generateTrackingUid, generateVariantUid } from "./tracking-uid.service";

/** Mevcut kayıtlara benzersiz ID ata */
export async function backfillTrackingUids(): Promise<{ products: number; variants: number }> {
  let products = 0;
  let variants = 0;

  const missingProducts = await db
    .select()
    .from(trackedProducts)
    .where(isNull(trackedProducts.trackingUid))
    .limit(500);

  for (const p of missingProducts) {
    let uid = generateTrackingUid({
      sourceSite: p.sourceSite,
      sourceProductId: p.sourceProductId,
      sourceUrl: p.sourceUrl,
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await db
        .select({ id: trackedProducts.id })
        .from(trackedProducts)
        .where(eq(trackedProducts.trackingUid, uid))
        .limit(1);
      if (!clash[0]) break;
      uid = generateTrackingUid({
        sourceSite: p.sourceSite,
        sourceProductId: p.sourceProductId,
        sourceUrl: p.sourceUrl,
      });
    }
    await db
      .update(trackedProducts)
      .set({ trackingUid: uid, updatedAt: new Date() })
      .where(eq(trackedProducts.id, p.id));
    products++;
  }

  const missingVariants = await db
    .select({
      variant: trackedVariants,
      trackingUid: trackedProducts.trackingUid,
    })
    .from(trackedVariants)
    .innerJoin(trackedProducts, eq(trackedVariants.trackedProductId, trackedProducts.id))
    .where(isNull(trackedVariants.variantUid))
    .limit(2000);

  for (const row of missingVariants) {
    if (!row.trackingUid) continue;
    const uid = generateVariantUid(
      row.trackingUid,
      row.variant.option1,
      row.variant.option2,
      row.variant.sourceSku,
    );
    await db
      .update(trackedVariants)
      .set({ variantUid: uid, updatedAt: new Date() })
      .where(eq(trackedVariants.id, row.variant.id));
    variants++;
  }

  if (products > 0 || variants > 0) {
    console.info(`✅ Takip UID backfill: ${products} ürün, ${variants} varyant`);
  }

  return { products, variants };
}
