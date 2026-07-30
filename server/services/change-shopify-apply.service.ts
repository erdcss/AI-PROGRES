import { db } from "../db";
import {
  detectedChanges,
  shopifyTransferredProducts,
  trackedProducts,
  trackedVariants,
  type DetectedChange,
  type TrackedProduct,
  type TrackedVariant,
} from "@shared/schema";
import { eq, and, isNotNull, inArray, ne } from "drizzle-orm";
import { shopifyApiService } from "../shopify-api-service";
import { generateVariantUid } from "./tracking-uid.service";
import {
  applyProfitMargin,
  pickRepresentativeShopifyPrice,
  resolveMarginPercentPreferringLive,
} from "@shared/tracking-price-display";
import {
  extractSourceCostFromChangeValue,
  matchTrackedVariantByKey,
} from "@shared/tracking-variant-resolve";
import { stableVariantKey } from "@shared/tracking-price-sanity";

export type ShopifyApplyResult = {
  success: boolean;
  changeId: number;
  trackingUid: string;
  variantUid?: string | null;
  shopifyProductId: string;
  shopifyVariantId?: string;
  action: string;
  message: string;
  salePrice?: number;
  sourceCost?: number;
  marginPercent?: number;
};

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === 0) return false;
  if (value === 1) return true;
  if (value && typeof value === "object" && "inStock" in (value as object)) {
    return bool((value as { inStock: unknown }).inStock);
  }
  return null;
}

function variantMetaFromValue(v: unknown): {
  color?: string;
  size?: string;
  key?: string;
  sku?: string;
  inStock?: boolean;
  price?: number;
} {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  return {
    color: o.color ? String(o.color) : o.option1 ? String(o.option1) : undefined,
    size: o.size ? String(o.size) : o.option2 ? String(o.option2) : undefined,
    key: o.key ? String(o.key) : undefined,
    sku: o.sku ? String(o.sku) : undefined,
    inStock: typeof o.inStock === "boolean" ? o.inStock : undefined,
    price: num(o.price) ?? undefined,
  };
}

function variantKeyFromReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const keyMatch = reason.match(/([^\s“”"]+::[^\s“”"]+)/);
  if (keyMatch?.[1]) return keyMatch[1];
  const quoted = reason.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]?.includes("/")) {
    const [color, size] = quoted[1].split("/").map((s) => s.trim());
    if (color || size) return stableVariantKey({ color, size });
  }
  return null;
}

async function resolveTrackedVariant(
  product: TrackedProduct,
  change: DetectedChange,
): Promise<TrackedVariant | null> {
  if (change.trackedVariantId) {
    const [v] = await db
      .select()
      .from(trackedVariants)
      .where(eq(trackedVariants.id, change.trackedVariantId))
      .limit(1);
    if (v?.trackedProductId === product.id && v.shopifyVariantId) return v;
  }

  const rows = await db
    .select()
    .from(trackedVariants)
    .where(eq(trackedVariants.trackedProductId, product.id));

  const meta = variantMetaFromValue(change.newValue ?? change.oldValue);
  const key =
    meta.key ||
    (meta.color || meta.size
      ? stableVariantKey({ color: meta.color, size: meta.size, sku: meta.sku })
      : null) ||
    variantKeyFromReason(change.reason);

  if (key) {
    const matched = matchTrackedVariantByKey(rows, key);
    if (matched?.shopifyVariantId) {
      return rows.find((r) => r.id === matched.id) ?? null;
    }
  }

  if (meta.color || meta.size || meta.sku) {
    const filtered = rows.filter((r) => {
      if (meta.color && r.option1 !== meta.color) return false;
      if (meta.size && r.option2 !== meta.size) return false;
      if (meta.sku && r.sourceSku !== meta.sku) return false;
      return Boolean(r.shopifyVariantId);
    });
    if (filtered.length === 1) return filtered[0];
  }

  // Tek Shopify-bağlı varyant varsa ürün seviyesi değişikliklerde onu kullan
  const mapped = rows.filter((r) => Boolean(String(r.shopifyVariantId ?? "").trim()));
  if (mapped.length === 1) return mapped[0];

  return null;
}

async function getMappedShopifyVariants(productId: number): Promise<TrackedVariant[]> {
  return db
    .select()
    .from(trackedVariants)
    .where(
      and(
        eq(trackedVariants.trackedProductId, productId),
        isNotNull(trackedVariants.shopifyVariantId),
      ),
    );
}

function normalizeShopifyOptionLabel(value: string | undefined | null, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const lower = raw.toLocaleLowerCase("tr-TR");
  if (
    lower === "default title" ||
    lower === "default" ||
    lower === "title" ||
    lower === "varsayılan" ||
    lower === "tek renk"
  ) {
    return fallback === "Tek Beden" ? "Tek Beden" : "Varsayılan";
  }
  return raw;
}

/**
 * tracked_variants boşsa Shopify canlı varyantlarından bağlantı kurar.
 * Restore / yeniden kayıt sonrası eksik eşlemeyi onarır.
 */
async function ensureMappedShopifyVariants(
  product: TrackedProduct,
  liveVariants: Array<{ id: string; option1?: string; option2?: string; sku?: string }>,
): Promise<TrackedVariant[]> {
  const existing = await getMappedShopifyVariants(product.id);
  if (existing.length > 0) return existing;
  if (!product.trackingUid || liveVariants.length === 0) return [];

  const allRows = await db
    .select()
    .from(trackedVariants)
    .where(eq(trackedVariants.trackedProductId, product.id));

  // Tek satır + tek canlı varyant → doğrudan bağla
  if (allRows.length === 1 && liveVariants.length === 1 && !allRows[0].shopifyVariantId) {
    await db
      .update(trackedVariants)
      .set({
        shopifyVariantId: String(liveVariants[0].id),
        matchConfidence: "95",
        matchStatus: "matched",
        updatedAt: new Date(),
      })
      .where(eq(trackedVariants.id, allRows[0].id));
    return getMappedShopifyVariants(product.id);
  }

  for (const live of liveVariants) {
    const shopifyVariantId = String(live.id ?? "").trim();
    if (!shopifyVariantId) continue;

    const colorLabel =
      !live.option1 || String(live.option1).toLowerCase() === "default title"
        ? "Varsayılan"
        : normalizeShopifyOptionLabel(live.option1, "Varsayılan");
    const sizeLabel =
      !live.option2 || String(live.option2).toLowerCase() === "default title"
        ? "Tek Beden"
        : normalizeShopifyOptionLabel(live.option2, "Tek Beden");

    const alreadyLinked = allRows.some((r) => r.shopifyVariantId === shopifyVariantId);
    if (alreadyLinked) continue;

    const byOptions = allRows.find(
      (r) =>
        !r.shopifyVariantId &&
        String(r.option1 ?? "").toLocaleLowerCase("tr-TR") ===
          colorLabel.toLocaleLowerCase("tr-TR") &&
        String(r.option2 ?? "").toLocaleLowerCase("tr-TR") ===
          sizeLabel.toLocaleLowerCase("tr-TR"),
    );

    if (byOptions) {
      await db
        .update(trackedVariants)
        .set({
          shopifyVariantId,
          matchConfidence: "95",
          matchStatus: "matched",
          updatedAt: new Date(),
        })
        .where(eq(trackedVariants.id, byOptions.id));
      byOptions.shopifyVariantId = shopifyVariantId;
      continue;
    }

    await db.insert(trackedVariants).values({
      trackedProductId: product.id,
      variantUid: generateVariantUid(product.trackingUid, colorLabel, sizeLabel, live.sku),
      sourceVariantTitle: [colorLabel, sizeLabel].filter(Boolean).join(" / "),
      option1: colorLabel,
      option2: sizeLabel,
      sourceSku: live.sku ?? null,
      shopifyVariantId,
      currentSourcePrice: product.currentSourcePrice,
      currentAvailable: true,
      matchConfidence: "95",
      matchStatus: "matched",
    });
  }

  return getMappedShopifyVariants(product.id);
}

async function resolveMarginPercent(
  product: TrackedProduct,
  options?: { liveSalePrice?: number | null; baselineCost?: number | null },
): Promise<number> {
  const [transfer] = await db
    .select({
      profitMargin: shopifyTransferredProducts.profitMargin,
      originalPrice: shopifyTransferredProducts.originalPrice,
      shopifyPrice: shopifyTransferredProducts.shopifyPrice,
    })
    .from(shopifyTransferredProducts)
    .where(eq(shopifyTransferredProducts.sourceUrl, product.sourceUrl))
    .limit(1);

  const margin = resolveMarginPercentPreferringLive({
    transferProfitMargin: transfer?.profitMargin,
    transferOriginalPrice: transfer?.originalPrice,
    transferShopifyPrice: transfer?.shopifyPrice,
    baselineCost: options?.baselineCost ?? (Number(product.currentSourcePrice) || null),
    liveSalePrice: options?.liveSalePrice ?? null,
    fallbackPercent: 10,
  });
  if (margin == null) {
    throw new Error(
      "Shopify satış fiyatı güvenle hesaplanamadı — ürünün kâr marjı kaydı eksik",
    );
  }
  return margin;
}

async function calculateShopifySalePrice(
  product: TrackedProduct,
  sourcePrice: number,
  options?: { liveSalePrice?: number | null; baselineCost?: number | null },
): Promise<{ sale: number; marginPercent: number }> {
  const marginPercent = await resolveMarginPercent(product, options);
  const sale = applyProfitMargin(sourcePrice, marginPercent);
  if (sale == null || sale <= 0) {
    throw new Error("Shopify satış fiyatı hesaplanamadı");
  }
  return { sale, marginPercent };
}

async function updateTransferShopifyPrice(sourceUrl: string, salePrice: number) {
  try {
    await db
      .update(shopifyTransferredProducts)
      .set({
        shopifyPrice: String(salePrice),
        updatedAt: new Date(),
      })
      .where(eq(shopifyTransferredProducts.sourceUrl, sourceUrl));
  } catch (err) {
    console.warn(
      `⚠️ shopify_transferred_products.shopifyPrice güncellenemedi: ${(err as Error).message}`,
    );
  }
}

async function verifyShopifyProduct(product: TrackedProduct): Promise<{
  liveId: string;
  liveVariants: Array<{ id: string; price: number; option1?: string; option2?: string; sku?: string }>;
}> {
  if (!product.trackingUid) {
    throw new Error("Ürün benzersiz ID (trackingUid) eksik — lütfen takip kaydını yenileyin");
  }
  if (!product.shopifyProductId) {
    throw new Error(`Shopify ürün ID yok (UID: ${product.trackingUid})`);
  }

  const verify = await shopifyApiService.getDirectProductData(product.shopifyProductId);
  if (!verify.success || !verify.product) {
    throw new Error(
      `Shopify ürün doğrulanamadı — UID: ${product.trackingUid}, Shopify ID: ${product.shopifyProductId}`,
    );
  }

  const liveId = String(verify.product.id);
  if (liveId !== String(product.shopifyProductId)) {
    throw new Error(
      `Shopify ID uyuşmazlığı — UID: ${product.trackingUid}, kayıt: ${product.shopifyProductId}, canlı: ${liveId}`,
    );
  }

  const liveVariants = (verify.product.variants ?? []).map((v: Record<string, unknown>) => ({
    id: String(v.id),
    price: Number(v.price) || 0,
    option1: v.option1 ? String(v.option1) : undefined,
    option2: v.option2 ? String(v.option2) : undefined,
    sku: v.sku ? String(v.sku) : undefined,
  }));

  return { liveId, liveVariants };
}

/**
 * Kaynak alış sabitken Shopify satış fiyatı sapmış mı?
 */
export async function detectShopifyPriceDriftChanges(
  product: TrackedProduct,
  sourceCost: number,
): Promise<
  Array<{
    changeType: string;
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
    confidence: number;
    status: "pending" | "manual_review";
    reason?: string;
    variantKey?: string;
  }>
> {
  if (!product.shopifyProductId || !Number.isFinite(sourceCost) || sourceCost <= 0) {
    return [];
  }

  let marginPercent: number;
  let liveVariants: Array<{ id: string; price: number }> = [];
  try {
    const verified = await verifyShopifyProduct(product);
    liveVariants = verified.liveVariants;
  } catch {
    return [];
  }

  const liveSale = pickRepresentativeShopifyPrice(liveVariants.map((v) => v.price));
  try {
    marginPercent = await resolveMarginPercent(product, {
      liveSalePrice: liveSale,
      baselineCost: sourceCost,
    });
  } catch {
    return [];
  }

  const expectedSale = applyProfitMargin(sourceCost, marginPercent);
  if (expectedSale == null) return [];

  const mapped = await getMappedShopifyVariants(product.id);
  if (mapped.length === 0) return [];

  const drifted = mapped.filter((mv) => {
    const live = liveVariants.find((lv) => lv.id === String(mv.shopifyVariantId));
    if (!live || live.price <= 0) return false;
    return Math.abs(live.price - expectedSale) > 0.5;
  });

  if (drifted.length === 0) return [];

  const allSameTarget = drifted.length === mapped.length;
  if (allSameTarget) {
    const sampleLive = liveVariants.find((lv) => lv.id === String(drifted[0].shopifyVariantId));
    const impliedOldCost =
      sampleLive && marginPercent > -100
        ? Math.round((sampleLive.price / (1 + marginPercent / 100)) * 100) / 100
        : sourceCost;
    return [
      {
        changeType: "price_changed",
        fieldName: "shopify_sale_drift",
        oldValue: impliedOldCost > 0 ? impliedOldCost : sourceCost,
        newValue: sourceCost,
        confidence: 88,
        status: "pending",
        reason: `Shopify satış fiyatı kaynak alış ile uyumsuz (beklenen ${expectedSale} ₺). Anlık düzeltme önerilir.`,
      },
    ];
  }

  return drifted.map((mv) => {
    const live = liveVariants.find((lv) => lv.id === String(mv.shopifyVariantId));
    const impliedOldCost =
      live && marginPercent > -100
        ? Math.round((live.price / (1 + marginPercent / 100)) * 100) / 100
        : sourceCost;
    const key = stableVariantKey({
      color: mv.option1,
      size: mv.option2,
      sku: mv.sourceSku,
    });
    return {
      changeType: "variant_price_changed",
      fieldName: "shopify_sale_drift",
      oldValue: impliedOldCost > 0 ? impliedOldCost : sourceCost,
      newValue: sourceCost,
      confidence: 85,
      status: "pending" as const,
      reason: `Shopify varyant satışı kaynak alış ile uyumsuz (beklenen ${expectedSale} ₺).`,
      variantKey: key,
    };
  });
}

export async function applyDetectedChangeToShopify(changeId: number): Promise<ShopifyApplyResult> {
  const [change] = await db
    .select()
    .from(detectedChanges)
    .where(eq(detectedChanges.id, changeId))
    .limit(1);
  if (!change) throw new Error("Değişiklik bulunamadı");

  const [product] = await db
    .select()
    .from(trackedProducts)
    .where(eq(trackedProducts.id, change.trackedProductId))
    .limit(1);
  if (!product) throw new Error("Takip ürünü bulunamadı");
  if (
    product.trackingEnabled !== true ||
    product.currentStatus !== "active" ||
    product.archivedAt != null
  ) {
    throw new Error("Takip ürünü aktif değil veya Shopify senkronunda arşivlenmiş");
  }

  const { liveId: shopifyProductId, liveVariants } = await verifyShopifyProduct(product);
  const trackingUid = product.trackingUid!;

  switch (change.changeType) {
    case "price_changed": {
      const sourcePrice = extractSourceCostFromChangeValue(change.newValue);
      if (sourcePrice == null || sourcePrice <= 0) throw new Error("Geçersiz fiyat değeri");
      const baselineCost =
        extractSourceCostFromChangeValue(change.oldValue) ??
        Number(product.currentSourcePrice) ??
        null;
      const liveSalePrice = pickRepresentativeShopifyPrice(liveVariants.map((v) => v.price));
      const { sale: price, marginPercent } = await calculateShopifySalePrice(product, sourcePrice, {
        liveSalePrice,
        baselineCost,
      });

      let variants = await ensureMappedShopifyVariants(product, liveVariants);
      if (variants.length === 0 && liveVariants.length > 0) {
        // DB yazılamasa bile canlı Shopify varyantlarına uygula
        variants = liveVariants.map((v) => ({
          id: -1,
          trackedProductId: product.id,
          shopifyVariantId: v.id,
        })) as TrackedVariant[];
      }
      if (variants.length === 0) {
        throw new Error(
          `Shopify varyant eşleşmesi yok — UID: ${trackingUid}. Shopify'da ürün varyantı bulunamadı.`,
        );
      }

      // Tek GraphQL çağrısı — paralel REST PUT 429 üretiyordu
      try {
        await shopifyApiService.updateProductVariantsPrices(
          shopifyProductId,
          variants.map((variant) => ({
            variantId: variant.shopifyVariantId!,
            price,
          })),
        );
      } catch (bulkErr) {
        console.warn(
          `⚠️ Bulk fiyat güncellemesi başarısız, sırayla deneniyor: ${(bulkErr as Error).message}`,
        );
        for (const variant of variants) {
          await shopifyApiService.updateVariantPrice(variant.shopifyVariantId!, price);
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      await Promise.all(
        variants
          .filter((variant) => variant.id > 0)
          .map((variant) =>
            db
              .update(trackedVariants)
              .set({
                currentSourcePrice: String(sourcePrice),
                updatedAt: new Date(),
              })
              .where(eq(trackedVariants.id, variant.id)),
          ),
      );
      const updated = variants.length;

      await db
        .update(trackedProducts)
        .set({
          currentSourcePrice: String(sourcePrice),
          updatedAt: new Date(),
        })
        .where(eq(trackedProducts.id, product.id));

      await updateTransferShopifyPrice(product.sourceUrl, price);

      // Aynı ürün için diğer bekleyen fiyat kayıtlarını geçersiz kıl
      await db
        .update(detectedChanges)
        .set({
          status: "superseded",
          reason: `Daha yeni fiyat düzeltmesi (#${changeId}) Shopify'a uygulandı`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(detectedChanges.trackedProductId, product.id),
            eq(detectedChanges.changeType, "price_changed"),
            ne(detectedChanges.id, changeId),
            inArray(detectedChanges.status, ["pending", "manual_review", "approved"]),
          ),
        );

      return {
        success: true,
        changeId,
        trackingUid,
        shopifyProductId,
        action: change.changeType,
        message: `${updated} Shopify varyantının satış fiyatı ${price} TRY olarak güncellendi (alış ${sourcePrice} + %${marginPercent}${
          liveSalePrice != null ? `, önceki Shopify ${liveSalePrice}` : ""
        })`,
        salePrice: price,
        sourceCost: sourcePrice,
        marginPercent,
      };
    }

    case "variant_price_changed": {
      const sourcePrice = extractSourceCostFromChangeValue(change.newValue);
      if (sourcePrice == null || sourcePrice <= 0) throw new Error("Geçersiz fiyat değeri");
      const baselineCost =
        extractSourceCostFromChangeValue(change.oldValue) ??
        Number(product.currentSourcePrice) ??
        null;
      const liveSalePrice = pickRepresentativeShopifyPrice(liveVariants.map((v) => v.price));
      const { sale: price, marginPercent } = await calculateShopifySalePrice(product, sourcePrice, {
        liveSalePrice,
        baselineCost,
      });

      await ensureMappedShopifyVariants(product, liveVariants);
      let variant = await resolveTrackedVariant(product, change);
      if (!variant?.shopifyVariantId && liveVariants.length === 1) {
        variant = {
          id: -1,
          shopifyVariantId: liveVariants[0].id,
          trackedProductId: product.id,
        } as TrackedVariant;
      }
      if (!variant?.shopifyVariantId) {
        throw new Error(
          `Shopify varyant eşleşmesi yok — UID: ${trackingUid}, değişiklik #${changeId}. Varyant bağlantısını kontrol edin.`,
        );
      }

      await shopifyApiService.updateVariantPrice(variant.shopifyVariantId, price);
      if (variant.id > 0) {
        await db
          .update(trackedVariants)
          .set({
            currentSourcePrice: String(sourcePrice),
            updatedAt: new Date(),
          })
          .where(eq(trackedVariants.id, variant.id));
      }

      await updateTransferShopifyPrice(product.sourceUrl, price);

      return {
        success: true,
        changeId,
        trackingUid,
        variantUid: variant.variantUid,
        shopifyProductId,
        shopifyVariantId: variant.shopifyVariantId,
        action: change.changeType,
        message: `Fiyat ${price} TRY olarak güncellendi (alış ${sourcePrice} + %${marginPercent}, UID: ${trackingUid})`,
        salePrice: price,
        sourceCost: sourcePrice,
        marginPercent,
      };
    }

    case "stock_changed": {
      if (change.fieldName === "available") {
        const inStock = bool(change.newValue);
        if (inStock == null) throw new Error("Geçersiz stok müsaitlik değeri");
        const status = inStock ? "active" : "draft";
        await shopifyApiService.updateProductStatus(shopifyProductId, status);
        return {
          success: true,
          changeId,
          trackingUid,
          shopifyProductId,
          action: change.changeType,
          message: `Ürün durumu ${status} olarak güncellendi (UID: ${trackingUid})`,
        };
      }

      const qty = num(change.newValue);
      if (qty == null || qty < 0) throw new Error("Geçersiz stok miktarı");
      throw new Error(
        "Toplam ürün stoku tek bir Shopify varyantına güvenli biçimde uygulanamaz",
      );
    }

    case "variant_stock_changed": {
      const inStock = bool(change.newValue);
      if (inStock == null) throw new Error("Geçersiz varyant stok değeri");
      if (inStock) {
        throw new Error(
          "Stok miktarı bilinmeden Shopify stoğu güvenle açılamaz; kaynak miktarı gerekli",
        );
      }

      await ensureMappedShopifyVariants(product, liveVariants);
      let variant = await resolveTrackedVariant(product, change);
      if (!variant?.shopifyVariantId && liveVariants.length === 1) {
        variant = {
          id: -1,
          shopifyVariantId: liveVariants[0].id,
          trackedProductId: product.id,
        } as TrackedVariant;
      }
      if (!variant?.shopifyVariantId) {
        throw new Error(`Varyant stok eşleşmesi yok — UID: ${trackingUid}`);
      }

      await shopifyApiService.updateInventory(variant.shopifyVariantId, 0);
      if (variant.id > 0) {
        await db
          .update(trackedVariants)
          .set({ currentAvailable: false, updatedAt: new Date() })
          .where(eq(trackedVariants.id, variant.id));
      }

      return {
        success: true,
        changeId,
        trackingUid,
        variantUid: variant.variantUid,
        shopifyProductId,
        shopifyVariantId: variant.shopifyVariantId,
        action: change.changeType,
        message: `Varyant stok kapalı (UID: ${trackingUid})`,
      };
    }

    case "variant_added": {
      const meta = variantMetaFromValue(change.newValue);
      const price = meta.price ?? num(product.currentSourcePrice) ?? 0;
      if (price <= 0) throw new Error("Yeni varyant için geçerli fiyat gerekli");
      const { sale } = await calculateShopifySalePrice(product, price);

      const created = await shopifyApiService.createVariant(shopifyProductId, {
        option1: meta.color,
        option2: meta.size,
        sku: meta.sku,
        price: sale,
        inventory_quantity: meta.inStock === false ? 0 : 1,
      });

      const newShopifyVariantId = String(created.variantId ?? created.data?.variant?.id ?? "");
      if (newShopifyVariantId) {
        const variantUid = generateVariantUid(
          trackingUid,
          meta.color,
          meta.size,
          meta.sku,
        );
        await db.insert(trackedVariants).values({
          trackedProductId: product.id,
          variantUid,
          sourceVariantTitle: [meta.color, meta.size].filter(Boolean).join(" / ") || "yeni",
          option1: meta.color ?? null,
          option2: meta.size ?? null,
          sourceSku: meta.sku ?? null,
          shopifyVariantId: newShopifyVariantId,
          currentSourcePrice: String(price),
          currentAvailable: meta.inStock !== false,
          matchConfidence: "95",
          matchStatus: "matched",
        });
      }

      return {
        success: true,
        changeId,
        trackingUid,
        shopifyProductId,
        shopifyVariantId: newShopifyVariantId || undefined,
        action: change.changeType,
        message: `Yeni varyant Shopify'a eklendi (UID: ${trackingUid})`,
      };
    }

    case "title_changed": {
      const title = String(change.newValue ?? "").trim();
      if (!title) throw new Error("Geçersiz başlık");

      await shopifyApiService.updateProductTitle(shopifyProductId, title);

      await db
        .update(trackedProducts)
        .set({ sourceTitle: title, updatedAt: new Date() })
        .where(eq(trackedProducts.id, product.id));

      return {
        success: true,
        changeId,
        trackingUid,
        shopifyProductId,
        action: change.changeType,
        message: `Başlık güncellendi (UID: ${trackingUid})`,
      };
    }

    default:
      throw new Error(`Desteklenmeyen değişiklik türü: ${change.changeType}`);
  }
}
