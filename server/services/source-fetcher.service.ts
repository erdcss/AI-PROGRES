import { runTrendyolScrapePipeline } from "../trendyol-scrape-pipeline";
import { validateTrackingSourceData, parseSourcePrice } from "@shared/scrape-validity";
import { validateFetchedPrice } from "@shared/tracking-price-sanity";
import { filterValidProductImages } from "../trendyol-image-utils";

export type FetchedSourceSnapshot = {
  valid: true;
  sourceUrl: string;
  title: string;
  price: number;
  currency: string;
  images: string[];
  variants: Array<{
    key: string;
    color?: string;
    size?: string;
    price?: number;
    inStock?: boolean;
    sku?: string;
  }>;
  stock: number | null;
  available: boolean | null;
  quality: Record<string, unknown>;
  rawData: Record<string, unknown>;
};

export type SourceFetchResult =
  | { valid: true; data: FetchedSourceSnapshot }
  | { valid: false; reason: string; message: string; quality?: Record<string, unknown> };

function normalizeVariants(raw: unknown): FetchedSourceSnapshot["variants"] {
  if (!raw || typeof raw !== "object") return [];
  const v = raw as {
    allVariants?: Array<{ color?: string; size?: string; inStock?: boolean; sku?: string; price?: number }>;
  };
  const list = v.allVariants ?? [];
  return list.map((item) => {
    const color = item.color || "Varsayılan";
    const size = item.size || "Tek Beden";
    return {
      key: `${color}::${size}`.toLowerCase(),
      color,
      size,
      inStock: typeof item.inStock === "boolean" ? item.inStock : undefined,
      sku: item.sku,
      price: item.price,
    };
  });
}

function totalStock(variants: FetchedSourceSnapshot["variants"]): number | null {
  if (variants.length === 0) return null;
  if (variants.some((variant) => typeof variant.inStock !== "boolean")) return null;
  const inStockCount = variants.filter((v) => v.inStock === true).length;
  return inStockCount;
}

export function hasSufficientVariantCoverage(
  previousVariantCount: number,
  currentVariantCount: number,
): boolean {
  if (previousVariantCount <= 1) return true;
  return currentVariantCount >= Math.ceil(previousVariantCount * 0.6);
}

/** Güvenli pipeline ile kaynak veri çeker — scenarioBasedScrape kullanmaz */
export async function fetchSourceForTracking(
  sourceUrl: string,
  options?: { baselinePrice?: number | null },
): Promise<SourceFetchResult> {
  try {
    const outcome = await runTrendyolScrapePipeline(sourceUrl, "auto-fast");
    const result = outcome.result ?? {};

    const validation = validateTrackingSourceData({
      title: result.title,
      price: result.price,
      images: result.images,
      titleSource: result.titleSource,
      priceSource:
        result.price && typeof result.price === "object"
          ? (result.price as Record<string, unknown>).method ??
            (result.price as Record<string, unknown>).priceSource
          : undefined,
      success: outcome.success || result.previewOk,
    });

    const quality = {
      success: outcome.success,
      partialSuccess: outcome.partialSuccess,
      usableForCsv: result.usableForCsv,
      usableForShopify: result.usableForShopify,
      finalSuccessReason: outcome.diagnostics?.finalSuccessReason ?? result.finalSuccessReason,
      titleSource: result.titleSource,
      stageErrors: outcome.diagnostics?.stageErrors ?? result.stageErrors,
      validationReason: validation.reason,
    };

    if (!validation.valid) {
      const messages: Record<string, string> = {
        invalid_title: "Geçersiz ürün başlığı — bot veya hata sayfası",
        bot_or_blocked_page: "Kaynak erişim engellendi (bot/403/captcha)",
        price_extraction_failed: "Fiyat doğrulanamadı",
        fallback_fake_price: "Sahte fallback fiyat tespit edildi",
        slug_only_no_data: "Yalnızca URL slug verisi — geçersiz",
        no_valid_price: "Fiyat alınamadı",
        suspicious_default_price: "Şüpheli varsayılan fiyat (100 TL)",
      };
      return {
        valid: false,
        reason: validation.reason ?? "invalid_source",
        message: messages[validation.reason ?? ""] ?? "Kaynak veri alınamadı, değişiklik oluşturulmadı",
        quality,
      };
    }

    const price = parseSourcePrice(result.price);
    const priceSanity = validateFetchedPrice(price, options?.baselinePrice ?? null);
    if (!priceSanity.ok) {
      return {
        valid: false,
        reason: "unreliable_price",
        message: priceSanity.reason ?? "Fiyat doğrulanamadı",
        quality: { ...quality, priceSanityReason: priceSanity.reason },
      };
    }

    const images = filterValidProductImages(result.images);
    const variants = normalizeVariants(result.variants);
    const stock = totalStock(variants);
    const hasKnownStock = variants.some((variant) => typeof variant.inStock === "boolean");
    const available = hasKnownStock
      ? variants.some((variant) => variant.inStock === true)
      : null;

    return {
      valid: true,
      data: {
        valid: true,
        sourceUrl,
        title: String(result.title),
        price,
        currency: "TRY",
        images,
        variants,
        stock,
        available,
        quality,
        rawData: result as Record<string, unknown>,
      },
    };
  } catch (err) {
    return {
      valid: false,
      reason: "fetch_error",
      message: (err as Error).message || "Kaynak veri alınamadı",
    };
  }
}
