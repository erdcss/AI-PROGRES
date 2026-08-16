import { eq } from "drizzle-orm";
import { db } from "../../db";
import { detectedChanges, trackedProducts, trackedVariants } from "@shared/schema";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import { getMarktGoClientForConnection } from "./connection.service";
import { findMappingForTrackedProduct, listVariantMappings } from "./mapping.service";
import { userMessageForMarktGoError } from "./errors";

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "object" && v && "price" in (v as object)) {
    return num((v as { price: unknown }).price);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function applyDetectedChangeToMarktGo(changeId: number) {
  const [change] = await db
    .select()
    .from(detectedChanges)
    .where(eq(detectedChanges.id, changeId))
    .limit(1);
  if (!change) throw new Error("Değişiklik bulunamadı");

  const mapping = await findMappingForTrackedProduct(change.trackedProductId);
  if (!mapping) {
    throw new Error("Bu ürün için MARKT-GO eşlemesi yok");
  }

  const { client } = await getMarktGoClientForConnection(mapping.connectionId);
  const productId = mapping.externalProductId;
  const t = String(change.changeType || "");
  let action = "noop";

  try {
    if (t.includes("price") && !t.includes("variant")) {
      const price = num(change.newValue);
      if (price != null) {
        await client.patch(`/products/${productId}/pricing`, { price });
        action = "pricing";
      }
    } else if (t.includes("stock") && !t.includes("variant")) {
      const stock = num(change.newValue);
      if (stock != null) {
        await client.patch(`/products/${productId}/inventory`, { stock });
        action = "inventory";
      }
    } else if (t === "title_changed") {
      await client.patch(`/products/${productId}`, {
        name: String(change.newValue ?? ""),
      });
      action = "title";
    } else if (t.startsWith("variant_") || t.includes("variant")) {
      const variants = await listVariantMappings(mapping.id);
      let variantId: string | null = null;
      if (change.trackedVariantId) {
        const [tv] = await db
          .select()
          .from(trackedVariants)
          .where(eq(trackedVariants.id, change.trackedVariantId))
          .limit(1);
        if (tv) {
          const hit = variants.find(
            (v) =>
              v.localVariantId === String(tv.id) ||
              (tv.option1 && v.option1 === tv.option1 && tv.option2 === v.option2),
          );
          variantId = hit?.externalVariantId || null;
        }
      }
      if (variantId && t.includes("stock")) {
        const stock = num(change.newValue);
        if (stock != null) {
          await client.patch(`/products/${productId}/variants/${variantId}/inventory`, {
            stock,
          });
          action = "variant_inventory";
        }
      } else if (variantId && t.includes("price")) {
        const price = num(change.newValue);
        if (price != null) {
          await client.patch(`/products/${productId}/variants/${variantId}`, { price });
          action = "variant_price";
        }
      }
    }

    return {
      success: true,
      provider: DESTINATION_PROVIDER.MARKTGO,
      changeId,
      externalProductId: productId,
      action,
      message: `MARKT-GO güncellendi (${action})`,
    };
  } catch (err) {
    throw new Error(userMessageForMarktGoError(err));
  }
}

export async function trackedProductHasMarktGoMapping(trackedProductId: number) {
  const mapping = await findMappingForTrackedProduct(trackedProductId);
  return Boolean(mapping);
}

export async function ensureTrackedLink(trackedProductId: number, mappingId: number) {
  const [p] = await db
    .select()
    .from(trackedProducts)
    .where(eq(trackedProducts.id, trackedProductId))
    .limit(1);
  if (!p) return;
  const { integrationProductMappings } = await import("@shared/schema");
  await db
    .update(integrationProductMappings)
    .set({ trackedProductId, updatedAt: new Date() })
    .where(eq(integrationProductMappings.id, mappingId));
}
