import { db } from "../db";
import {
  detectedChanges,
  trackedProducts,
  trackedVariants,
  type DetectedChange,
  type TrackedProduct,
  type TrackedVariant,
} from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { shopifyApiService } from "../shopify-api-service";
import { generateVariantUid } from "./tracking-uid.service";

export type ShopifyApplyResult = {
  success: boolean;
  changeId: number;
  trackingUid: string;
  variantUid?: string | null;
  shopifyProductId: string;
  shopifyVariantId?: string;
  action: string;
  message: string;
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
    if (v) return v;
  }

  const meta = variantMetaFromValue(change.newValue ?? change.oldValue);
  const conditions = [eq(trackedVariants.trackedProductId, product.id)];

  if (meta.color) conditions.push(eq(trackedVariants.option1, meta.color));
  if (meta.size) conditions.push(eq(trackedVariants.option2, meta.size));
  if (meta.sku) conditions.push(eq(trackedVariants.sourceSku, meta.sku));

  if (conditions.length > 1) {
    const rows = await db
      .select()
      .from(trackedVariants)
      .where(and(...conditions))
      .limit(5);
    const matched = rows.find((r) => r.shopifyVariantId);
    if (matched) return matched;
  }

  const [fallback] = await db
    .select()
    .from(trackedVariants)
    .where(
      and(
        eq(trackedVariants.trackedProductId, product.id),
        isNotNull(trackedVariants.shopifyVariantId),
      ),
    )
    .limit(1);

  return fallback ?? null;
}

async function verifyShopifyProduct(product: TrackedProduct): Promise<string> {
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

  return liveId;
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

  const shopifyProductId = await verifyShopifyProduct(product);
  const trackingUid = product.trackingUid!;

  switch (change.changeType) {
    case "price_changed":
    case "variant_price_changed": {
      const price = num(change.newValue);
      if (price == null || price <= 0) throw new Error("Geçersiz fiyat değeri");

      const variant = await resolveTrackedVariant(product, change);
      if (!variant?.shopifyVariantId) {
        throw new Error(
          `Shopify varyant eşleşmesi yok — UID: ${trackingUid}, değişiklik #${changeId}`,
        );
      }

      await shopifyApiService.updateVariantPrice(variant.shopifyVariantId, price);

      return {
        success: true,
        changeId,
        trackingUid,
        variantUid: variant.variantUid,
        shopifyProductId,
        shopifyVariantId: variant.shopifyVariantId,
        action: change.changeType,
        message: `Fiyat ${price} TRY olarak güncellendi (UID: ${trackingUid})`,
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

      const variant = await resolveTrackedVariant(product, change);
      if (!variant?.shopifyVariantId) {
        throw new Error(`Stok güncellemesi için varyant eşleşmesi yok — UID: ${trackingUid}`);
      }

      await shopifyApiService.updateInventory(variant.shopifyVariantId, qty);

      return {
        success: true,
        changeId,
        trackingUid,
        variantUid: variant.variantUid,
        shopifyProductId,
        shopifyVariantId: variant.shopifyVariantId,
        action: change.changeType,
        message: `Stok ${qty} olarak güncellendi (UID: ${trackingUid})`,
      };
    }

    case "variant_stock_changed": {
      const inStock = bool(change.newValue);
      if (inStock == null) throw new Error("Geçersiz varyant stok değeri");

      const variant = await resolveTrackedVariant(product, change);
      if (!variant?.shopifyVariantId) {
        throw new Error(`Varyant stok eşleşmesi yok — UID: ${trackingUid}`);
      }

      await shopifyApiService.updateInventory(variant.shopifyVariantId, inStock ? 10 : 0);

      return {
        success: true,
        changeId,
        trackingUid,
        variantUid: variant.variantUid,
        shopifyProductId,
        shopifyVariantId: variant.shopifyVariantId,
        action: change.changeType,
        message: `Varyant stok ${inStock ? "açık" : "kapalı"} (UID: ${trackingUid})`,
      };
    }

    case "variant_added": {
      const meta = variantMetaFromValue(change.newValue);
      const price =
        meta.price ?? num(product.currentSourcePrice) ?? 0;
      if (price <= 0) throw new Error("Yeni varyant için geçerli fiyat gerekli");

      const created = await shopifyApiService.createVariant(shopifyProductId, {
        option1: meta.color,
        option2: meta.size,
        sku: meta.sku,
        price,
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
      throw new Error(
        `Otomatik uygulanamaz: ${change.changeType} — UID: ${trackingUid}, manuel inceleme gerekli`,
      );
  }
}
