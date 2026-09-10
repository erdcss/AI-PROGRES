import { eq } from "drizzle-orm";
import { db } from "../../db";
import { detectedChanges, trackedProducts, trackedVariants } from "@shared/schema";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import { extractSourceCostFromChangeValue } from "@shared/tracking-variant-resolve";
import { getMarktGoClientForConnection } from "./connection.service";
import { findMappingForTrackedProduct, listVariantMappings } from "./mapping.service";
import { userMessageForMarktGoError } from "./errors";

const MARKTGO_DEFAULT_PROFIT_MARGIN = 0.1;

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "object" && v) {
    const row = v as Record<string, unknown>;
    for (const key of ["price", "stock", "quantity", "value"]) {
      const n = Number(row[key]);
      if (Number.isFinite(n)) return n;
    }
    if (typeof row.inStock === "boolean") return row.inStock ? 1 : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function marktGoSalePriceFromPurchasePrice(purchasePrice: number): number {
  return Math.round(purchasePrice * (1 + MARKTGO_DEFAULT_PROFIT_MARGIN) * 100) / 100;
}

async function getTrackedProductSourceContext(trackedProductId: number) {
  const [product] = await db
    .select({
      sourceSite: trackedProducts.sourceSite,
      sourceUrl: trackedProducts.sourceUrl,
    })
    .from(trackedProducts)
    .where(eq(trackedProducts.id, trackedProductId))
    .limit(1);
  return product ?? null;
}

function pricingMovementMeta(
  source: Awaited<ReturnType<typeof getTrackedProductSourceContext>>,
  purchasePrice: number,
) {
  return {
    purchasePrice,
    sourceSite: source?.sourceSite || "AI-PROGRES",
    sourceUrl: source?.sourceUrl || null,
    arrivedAt: new Date().toISOString(),
  };
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
  const source = await getTrackedProductSourceContext(change.trackedProductId);
  let action = "noop";
  let appliedPurchasePrice: number | null = null;
  let appliedSalePrice: number | null = null;

  try {
    if (t.includes("price") && !t.includes("variant")) {
      const purchasePrice = extractSourceCostFromChangeValue(change.newValue);
      if (purchasePrice == null || purchasePrice <= 0) {
        throw new Error("Geçersiz yeni alış fiyatı — MARKT-GO güncellemesi yapılmadı");
      }
      const salePrice = marktGoSalePriceFromPurchasePrice(purchasePrice);
      await client.patch(`/products/${productId}/pricing`, {
        price: salePrice,
        ...pricingMovementMeta(source, purchasePrice),
      });
      appliedPurchasePrice = purchasePrice;
      appliedSalePrice = salePrice;
      action = "pricing";
    } else if (t.includes("stock") && !t.includes("variant")) {
      const stock = num(change.newValue);
      if (stock == null || stock < 0) {
        throw new Error("Geçersiz stok değeri — MARKT-GO güncellemesi yapılmadı");
      }
      await client.patch(`/products/${productId}/inventory`, { stock: Math.floor(stock) });
      action = "inventory";
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

      if (!variantId) {
        throw new Error("MARKT-GO varyant eşlemesi bulunamadı — yanlış varyantı güncellememek için işlem durduruldu");
      }

      if (t.includes("stock")) {
        const stock = num(change.newValue);
        if (stock == null || stock < 0) {
          throw new Error("Geçersiz varyant stok değeri — MARKT-GO güncellemesi yapılmadı");
        }
        await client.patch(`/products/${productId}/variants/${variantId}/inventory`, {
          stock: Math.floor(stock),
        });
        action = "variant_inventory";
      } else if (t.includes("price")) {
        const purchasePrice = extractSourceCostFromChangeValue(change.newValue);
        if (purchasePrice == null || purchasePrice <= 0) {
          throw new Error("Geçersiz varyant alış fiyatı — MARKT-GO güncellemesi yapılmadı");
        }
        const salePrice = marktGoSalePriceFromPurchasePrice(purchasePrice);
        await client.patch(`/products/${productId}/pricing`, {
          ...pricingMovementMeta(source, purchasePrice),
          variants: [{ id: variantId, price: salePrice }],
        });
        appliedPurchasePrice = purchasePrice;
        appliedSalePrice = salePrice;
        action = "variant_price";
      }
    } else if (t === "product_removed" || t === "source_unavailable" || t === "product_out_of_stock") {
      await client.patch(`/products/${productId}`, { status: "inactive" });
      action = "deactivate";
      await db
        .update(trackedProducts)
        .set({
          trackingEnabled: false,
          currentStatus: "disabled",
          pausedReason:
            t === "product_removed"
              ? "Kaynak ürün kaldırıldı — otomatik durduruldu"
              : t === "source_unavailable"
                ? "Kaynak erişilemedi — otomatik durduruldu"
                : "Ürün stok dışı — otomatik durduruldu",
          updatedAt: new Date(),
        })
        .where(eq(trackedProducts.id, change.trackedProductId));
    }

    if (action === "noop") {
      throw new Error(`Bu değişiklik MARKT-GO'da uygulanabilir bir işleme dönüşmedi: ${t || "unknown"}`);
    }

    return {
      success: true,
      provider: DESTINATION_PROVIDER.MARKTGO,
      changeId,
      externalProductId: productId,
      action,
      purchasePrice: appliedPurchasePrice,
      salePrice: appliedSalePrice,
      message:
        appliedPurchasePrice != null && appliedSalePrice != null
          ? `MARKT-GO güncellendi (alış ${appliedPurchasePrice.toFixed(2)} ₺ → satış ${appliedSalePrice.toFixed(2)} ₺)`
          : `MARKT-GO güncellendi (${action})`,
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
