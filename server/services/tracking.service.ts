import { db } from "../db";
import {
  trackedProducts,
  trackedVariants,
  productSnapshots,
  detectedChanges,
  syncLogs,
  products,
  urlTracking,
  shopifyTransferredProducts,
  type InsertTrackedProduct,
  type InsertTrackedVariant,
} from "@shared/schema";
import { eq, desc, and, sql, inArray, isNull, isNotNull, ne, or } from "drizzle-orm";
import { getTrackingSettings } from "./tracking-settings.service";
import { generateTrackingUid, generateVariantUid } from "./tracking-uid.service";
import {
  buildTrackingVariantLabel,
  resolveTrackingVariantColorSize,
  type TrackingVariantInput,
} from "@shared/trendyol-variant-utils";
import {
  buildPricePairDisplay,
  resolveProfitMarginPercent,
} from "@shared/tracking-price-display";

export type SyncLogMeta = Record<string, unknown>;

export type TrackingRegistrationVariant = TrackingVariantInput & {
  sku?: string;
  shopifyVariantId?: string;
  price?: number;
  inStock?: boolean;
};

/** Shopify'a aktarılan varyantlar — stok dışı / eşleşmeyen bedenler takibe alınmaz */
export function filterUploadedVariantsForTracking(
  variants: TrackingRegistrationVariant[],
): TrackingRegistrationVariant[] {
  const withShopifyId = variants.filter((v) => Boolean(String(v.shopifyVariantId ?? "").trim()));
  if (withShopifyId.length > 0) return withShopifyId;
  return variants.filter((v) => v.inStock !== false);
}

function pickFirstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const item of images) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.startsWith("http")) return trimmed;
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      for (const key of ["url", "src", "imageUrl", "image"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim().startsWith("http")) {
          return value.trim();
        }
      }
    }
  }
  return null;
}

export class TrackingService {
  private async getLatestImageMap(productIds: number[]): Promise<Map<number, string | null>> {
    const map = new Map<number, string | null>();
    if (productIds.length === 0) return map;

    const rows = await db
      .select({
        trackedProductId: productSnapshots.trackedProductId,
        images: productSnapshots.images,
        createdAt: productSnapshots.createdAt,
      })
      .from(productSnapshots)
      .where(inArray(productSnapshots.trackedProductId, productIds))
      .orderBy(desc(productSnapshots.createdAt));

    for (const row of rows) {
      if (!map.has(row.trackedProductId)) {
        map.set(row.trackedProductId, pickFirstImageUrl(row.images));
      }
    }

    for (const id of productIds) {
      if (!map.has(id)) map.set(id, null);
    }

    return map;
  }
  async assertEnabled() {
    const s = await getTrackingSettings();
    if (!s.trackingEnabled) {
      throw new Error("Takip sistemi program ayarlarından kapalı");
    }
  }

  async writeSyncLog(input: {
    trackedProductId?: number | null;
    action: string;
    status: "success" | "warning" | "error" | "skipped";
    message: string;
    meta?: SyncLogMeta;
  }) {
    await db.insert(syncLogs).values({
      trackedProductId: input.trackedProductId ?? null,
      action: input.action,
      status: input.status,
      message: input.message,
      meta: input.meta ?? {},
    });
  }

  async listProducts() {
    await this.assertEnabled();
    return db
      .select()
      .from(trackedProducts)
      .where(
        and(
          ne(trackedProducts.currentStatus, "shopify_deleted"),
          isNull(trackedProducts.archivedAt),
          or(
            isNotNull(trackedProducts.shopifyProductId),
            isNotNull(trackedProducts.shopifyProductGid),
          ),
        ),
      )
      .orderBy(desc(trackedProducts.updatedAt));
  }

  async getProduct(id: number) {
    const rows = await db.select().from(trackedProducts).where(eq(trackedProducts.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async listChanges(filters?: {
    status?: string;
    productId?: number;
    changeType?: string;
  }) {
    await this.assertEnabled();
    return this.listChangesForPanel(filters);
  }

  /** Kontrol merkezi — takip kapalı olsa bile listeler */
  async listProductsForPanel(options?: { includeArchived?: boolean }) {
    const includeArchived = options?.includeArchived === true;
    const products = await db
      .select()
      .from(trackedProducts)
      .where(
        includeArchived
          ? undefined
          : and(
              ne(trackedProducts.currentStatus, "shopify_deleted"),
              isNull(trackedProducts.archivedAt),
              or(
                isNotNull(trackedProducts.shopifyProductId),
                isNotNull(trackedProducts.shopifyProductGid),
              ),
            ),
      )
      .orderBy(desc(trackedProducts.updatedAt));

    const imageMap = await this.getLatestImageMap(products.map((p) => p.id));
    return products.map((p) => ({
      ...p,
      productImageUrl: imageMap.get(p.id) ?? null,
    }));
  }

  async listChangesForPanel(filters?: {
    status?: string;
    productId?: number;
    changeType?: string;
  }) {
    const conditions = [];
    conditions.push(
      inArray(
        detectedChanges.trackedProductId,
        db
          .select({ id: trackedProducts.id })
          .from(trackedProducts)
          .where(
            and(
              ne(trackedProducts.currentStatus, "shopify_deleted"),
              isNull(trackedProducts.archivedAt),
              or(
                isNotNull(trackedProducts.shopifyProductId),
                isNotNull(trackedProducts.shopifyProductGid),
              ),
            ),
          ),
      ),
    );
    if (filters?.status === "actionable") {
      conditions.push(
        inArray(detectedChanges.status, ["pending", "manual_review", "approved", "failed"]),
      );
    } else if (filters?.status) {
      conditions.push(eq(detectedChanges.status, filters.status));
    } else {
      conditions.push(ne(detectedChanges.status, "superseded"));
    }
    if (filters?.productId) conditions.push(eq(detectedChanges.trackedProductId, filters.productId));
    if (filters?.changeType) conditions.push(eq(detectedChanges.changeType, filters.changeType));

    const query = db.select().from(detectedChanges).orderBy(desc(detectedChanges.createdAt));
    if (conditions.length === 0) return query;
    return query.where(and(...conditions));
  }

  async listChangesWithProductForPanel(filters?: {
    status?: string;
    productId?: number;
    changeType?: string;
  }) {
    const changes = await this.listChangesForPanel(filters);
    if (changes.length === 0) return [];

    const productIds = [...new Set(changes.map((c) => c.trackedProductId))];
    const products = await db
      .select({
        id: trackedProducts.id,
        sourceTitle: trackedProducts.sourceTitle,
        sourceUrl: trackedProducts.sourceUrl,
        shopifyProductId: trackedProducts.shopifyProductId,
        trackingUid: trackedProducts.trackingUid,
        currentSourcePrice: trackedProducts.currentSourcePrice,
      })
      .from(trackedProducts)
      .where(inArray(trackedProducts.id, productIds));

    const byId = new Map(products.map((p) => [p.id, p]));
    const sourceUrls = [...new Set(products.map((p) => p.sourceUrl).filter(Boolean))];
    const transfers =
      sourceUrls.length > 0
        ? await db
            .select({
              sourceUrl: shopifyTransferredProducts.sourceUrl,
              profitMargin: shopifyTransferredProducts.profitMargin,
              originalPrice: shopifyTransferredProducts.originalPrice,
              shopifyPrice: shopifyTransferredProducts.shopifyPrice,
            })
            .from(shopifyTransferredProducts)
            .where(inArray(shopifyTransferredProducts.sourceUrl, sourceUrls))
        : [];
    const transferByUrl = new Map(transfers.map((row) => [row.sourceUrl, row]));

    const variantIds = [
      ...new Set(
        changes
          .map((change) => change.trackedVariantId)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    const variants =
      variantIds.length > 0
        ? await db
            .select({
              id: trackedVariants.id,
              variantUid: trackedVariants.variantUid,
              sourceVariantTitle: trackedVariants.sourceVariantTitle,
              sourceSku: trackedVariants.sourceSku,
              option1: trackedVariants.option1,
              option2: trackedVariants.option2,
              option3: trackedVariants.option3,
              shopifyVariantId: trackedVariants.shopifyVariantId,
              currentSourcePrice: trackedVariants.currentSourcePrice,
              currentAvailable: trackedVariants.currentAvailable,
            })
            .from(trackedVariants)
            .where(inArray(trackedVariants.id, variantIds))
        : [];
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const imageMap = await this.getLatestImageMap(productIds);
    return changes.map((c) => {
      const product = byId.get(c.trackedProductId);
      const variant = c.trackedVariantId ? variantById.get(c.trackedVariantId) : undefined;
      const color =
        variant?.option1 && String(variant.option1).trim() ? String(variant.option1).trim() : null;
      const size =
        variant?.option2 && String(variant.option2).trim() ? String(variant.option2).trim() : null;
      const variantLabel = variant
        ? buildTrackingVariantLabel(variant.option1, variant.option2, variant.sourceVariantTitle) ||
          buildTrackingVariantLabel(variant.option1, variant.option3, variant.sourceSku) ||
          variant.sourceSku ||
          null
        : null;
      const transfer = product?.sourceUrl ? transferByUrl.get(product.sourceUrl) : undefined;
      const marginPercent = resolveProfitMarginPercent({
        profitMargin: transfer?.profitMargin,
        originalPrice: transfer?.originalPrice,
        shopifyPrice: transfer?.shopifyPrice,
        fallbackPercent: 10,
      });
      const isPriceChange =
        c.changeType === "price_changed" || c.changeType === "variant_price_changed";
      const priceDisplay = isPriceChange
        ? buildPricePairDisplay(c.oldValue, c.newValue, marginPercent)
        : null;

      return {
        ...c,
        productTitle: product?.sourceTitle ?? null,
        productUrl: product?.sourceUrl ?? null,
        shopifyProductId: product?.shopifyProductId ?? null,
        trackingUid: product?.trackingUid ?? null,
        productImageUrl: imageMap.get(c.trackedProductId) ?? null,
        currentSourcePrice: product?.currentSourcePrice ?? null,
        profitMarginPercent: marginPercent,
        priceDisplay,
        variantUid: variant?.variantUid ?? null,
        variantLabel,
        variantColor: color,
        variantSize: size,
        variantSku: variant?.sourceSku ?? null,
        shopifyVariantId: variant?.shopifyVariantId ?? null,
        variantAvailable: variant?.currentAvailable ?? null,
      };
    });
  }

  async getLatestSnapshot(trackedProductId: number) {
    const rows = await db
      .select()
      .from(productSnapshots)
      .where(eq(productSnapshots.trackedProductId, trackedProductId))
      .orderBy(desc(productSnapshots.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async saveSnapshot(input: {
    trackedProductId: number;
    snapshotType: "initial" | "check" | "manual";
    sourceUrl: string;
    title: string;
    price: number;
    currency?: string;
    stock?: number | null;
    available?: boolean | null;
    images: unknown[];
    variants: unknown[];
    rawData: Record<string, unknown>;
    quality: Record<string, unknown>;
  }) {
    const [row] = await db
      .insert(productSnapshots)
      .values({
        trackedProductId: input.trackedProductId,
        snapshotType: input.snapshotType,
        sourceUrl: input.sourceUrl,
        title: input.title,
        price: String(input.price),
        currency: input.currency ?? "TRY",
        stock: input.stock ?? null,
        available: input.available ?? null,
        images: input.images as never,
        variants: input.variants as never,
        rawData: input.rawData as never,
        quality: input.quality as never,
      })
      .returning();
    return row;
  }

  async registerFromShopifyUpload(input: {
    sourceUrl: string;
    title: string;
    price: number;
    shopifyProductId: string;
    shopifyHandle?: string;
    shopifyProductGid?: string;
    variants?: TrackingRegistrationVariant[];
  }) {
    await this.assertEnabled();
    if (input.price <= 0) {
      throw new Error("price=0 — tracking kaydı oluşturulamaz");
    }

    const variantList = filterUploadedVariantsForTracking(input.variants ?? []);

    const site = input.sourceUrl.includes("trendyol") ? "trendyol" : "other";
    const productIdMatch = input.sourceUrl.match(/p-(\d+)/);
    const existing = await db
      .select()
      .from(trackedProducts)
      .where(eq(trackedProducts.sourceUrl, input.sourceUrl))
      .limit(1);

    const trackingUid =
      existing[0]?.trackingUid ??
      generateTrackingUid({
        sourceSite: site,
        sourceProductId: productIdMatch?.[1] ?? null,
        sourceUrl: input.sourceUrl,
      });

    const payload: InsertTrackedProduct = {
      sourceUrl: input.sourceUrl,
      sourceSite: site,
      sourceProductId: productIdMatch?.[1] ?? null,
      sourceTitle: input.title,
      shopifyProductId: input.shopifyProductId,
      shopifyHandle: input.shopifyHandle ?? null,
      shopifyProductGid: input.shopifyProductGid ?? null,
      trackingUid,
      currentSourcePrice: String(input.price),
      currentStatus: "active",
      trackingEnabled: true,
      shopifySyncStatus: "live",
      lastShopifySyncAt: new Date(),
      pausedReason: null,
      archivedAt: null,
      lastErrorMessage: null,
      lastSuccessAt: new Date(),
    };

    let productRow;
    if (existing[0]) {
      [productRow] = await db
        .update(trackedProducts)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(trackedProducts.id, existing[0].id))
        .returning();
    } else {
      [productRow] = await db.insert(trackedProducts).values(payload).returning();
    }

    // Shopify'a hiç aktarılmamış eski varyant kayıtlarını temizle
    await db
      .delete(trackedVariants)
      .where(
        and(
          eq(trackedVariants.trackedProductId, productRow.id),
          isNull(trackedVariants.shopifyVariantId),
        ),
      );

    for (const v of variantList) {
      const { color, size } = resolveTrackingVariantColorSize(v);
      const option1 = color;
      const option2 = size;
      const variantPayload: InsertTrackedVariant = {
        trackedProductId: productRow.id,
        variantUid: generateVariantUid(
          productRow.trackingUid ?? trackingUid,
          option1,
          option2,
          v.sku,
        ),
        sourceVariantTitle:
          buildTrackingVariantLabel(color, size, v.sku) || v.sku || "unknown",
        option1,
        option2,
        sourceSku: v.sku ?? null,
        shopifyVariantId: v.shopifyVariantId ?? null,
        currentSourcePrice: v.price ? String(v.price) : String(input.price),
        currentAvailable: v.inStock !== false,
        matchConfidence: v.shopifyVariantId ? "90" : "50",
        matchStatus: v.shopifyVariantId ? "matched" : "uncertain",
      };

      const existingVar = v.sku
        ? await db
            .select()
            .from(trackedVariants)
            .where(
              and(
                eq(trackedVariants.trackedProductId, productRow.id),
                eq(trackedVariants.sourceSku, v.sku),
              ),
            )
            .limit(1)
        : await db
            .select()
            .from(trackedVariants)
            .where(
              and(
                eq(trackedVariants.trackedProductId, productRow.id),
                eq(trackedVariants.option1, option1 ?? ""),
                eq(trackedVariants.option2, option2 ?? ""),
              ),
            )
            .limit(1);

      if (existingVar[0]) {
        const patch = { ...variantPayload, updatedAt: new Date() };
        if (existingVar[0].variantUid) delete (patch as { variantUid?: string }).variantUid;
        await db
          .update(trackedVariants)
          .set(patch)
          .where(eq(trackedVariants.id, existingVar[0].id));
      } else {
        await db.insert(trackedVariants).values(variantPayload);
      }
    }

    const priorInitial = await db
      .select()
      .from(productSnapshots)
      .where(
        and(
          eq(productSnapshots.trackedProductId, productRow.id),
          eq(productSnapshots.snapshotType, "initial"),
        ),
      )
      .limit(1);

    let snapshot = priorInitial[0];
    if (!snapshot) {
      snapshot = await this.saveSnapshot({
        trackedProductId: productRow.id,
        snapshotType: "initial",
        sourceUrl: input.sourceUrl,
        title: input.title,
        price: input.price,
        images: [],
        variants: variantList,
        rawData: { shopifyProductId: input.shopifyProductId },
        quality: { registeredFrom: "shopify_upload" },
      });
    } else if (variantList.length > 0) {
      await db
        .update(productSnapshots)
        .set({ variants: variantList as never })
        .where(eq(productSnapshots.id, snapshot.id));
    }

    await this.writeSyncLog({
      trackedProductId: productRow.id,
      action: "tracking_check",
      status: "success",
      message: "Shopify aktarımı sonrası tracking kaydı oluşturuldu",
      meta: {
        sourceUrl: input.sourceUrl,
        trackedProductId: productRow.id,
        newSnapshotId: snapshot.id,
        stage: "register",
      },
    });

    return productRow;
  }

  async setTrackingEnabled(id: number, enabled: boolean) {
    await this.assertEnabled();
    const [row] = await db
      .update(trackedProducts)
      .set({
        trackingEnabled: enabled,
        currentStatus: enabled ? "active" : "disabled",
        updatedAt: new Date(),
      })
      .where(eq(trackedProducts.id, id))
      .returning();
    return row ?? null;
  }

  async updateAfterSuccessfulCheck(
    productId: number,
    data: { price: number; stock?: number | null; title: string },
  ) {
    await db
      .update(trackedProducts)
      .set({
        currentSourcePrice: String(data.price),
        currentSourceStock: data.stock ?? null,
        sourceTitle: data.title,
        lastCheckedAt: new Date(),
        lastSuccessAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
        currentStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(trackedProducts.id, productId));
  }

  async markCheckError(productId: number, message: string) {
    await db
      .update(trackedProducts)
      .set({
        lastCheckedAt: new Date(),
        lastErrorAt: new Date(),
        lastErrorMessage: message,
        currentStatus: "error",
        updatedAt: new Date(),
      })
      .where(eq(trackedProducts.id, productId));
  }

  async cleanupInvalidRecordsOnStartup() {
    await db
      .update(trackedProducts)
      .set({
        trackingEnabled: false,
        currentStatus: "disabled",
        lastErrorMessage: "startup-cleanup: geçersiz kaynak",
        updatedAt: new Date(),
      })
      .where(
        sql`lower(${trackedProducts.sourceTitle}) IN ('trendyol.com', 'welcome to trendyol')
            OR (${trackedProducts.currentSourcePrice} = 100)
            OR lower(${trackedProducts.sourceTitle}) LIKE '%access denied%'`,
      );
  }

  async cleanupInvalidRecords(adminSecret?: string) {
    await this.assertEnabled();
    const expected = process.env.ADMIN_SECRET || "repli_t_admin_2024";
    if (adminSecret !== expected) {
      throw new Error("Unauthorized — invalid admin secret");
    }

    const disabledProducts = await db
      .update(trackedProducts)
      .set({
        trackingEnabled: false,
        currentStatus: "disabled",
        lastErrorMessage: "cleanup-invalid: geçersiz kaynak verisi",
        updatedAt: new Date(),
      })
      .where(
        sql`lower(${trackedProducts.sourceTitle}) IN ('trendyol.com', 'welcome to trendyol')
            OR (${trackedProducts.currentSourcePrice} = 100 AND ${trackedProducts.sourceTitle} ILIKE '%trendyol%')
            OR lower(${trackedProducts.sourceTitle}) LIKE '%access denied%'`,
      )
      .returning();

    const legacyUrl = await db
      .update(urlTracking)
      .set({ isTracking: false, status: "disabled", updatedAt: new Date() } as never)
      .where(
        sql`lower(${urlTracking.productTitle}) IN ('trendyol.com', 'welcome to trendyol')
            OR (${urlTracking.currentPrice} = 100 AND lower(${urlTracking.productTitle}) LIKE '%trendyol%')`,
      )
      .returning();

    const legacyProducts = await db
      .update(products)
      .set({ isActive: false, syncStatus: "error", updatedAt: new Date() })
      .where(
        sql`lower(${products.title}) IN ('trendyol.com', 'welcome to trendyol')
            OR (${products.currentPrice} = 100 AND lower(${products.title}) LIKE '%trendyol%')`,
      )
      .returning();

    await this.writeSyncLog({
      action: "error",
      status: "warning",
      message: `cleanup-invalid: ${disabledProducts.length} tracked, ${legacyUrl.length} url_tracking, ${legacyProducts.length} products disabled`,
      meta: {
        trackedDisabled: disabledProducts.length,
        urlTrackingDisabled: legacyUrl.length,
        productsDisabled: legacyProducts.length,
      },
    });

    return {
      disabledCount: disabledProducts.length,
      products: disabledProducts,
      urlTrackingDisabled: legacyUrl.length,
      legacyProductsDisabled: legacyProducts.length,
    };
  }
}

export const trackingService = new TrackingService();
