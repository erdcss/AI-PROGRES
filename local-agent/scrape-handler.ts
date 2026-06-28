/**
 * Local Scrape Agent — Trendyol ürün çekimi (Windows / ev ağı).
 * Railway cloud erişimi başarısız olduğunda bu agent üzerinden veri sağlanır.
 */
import { runTrendyolScrapePipeline } from "../server/trendyol-scrape-pipeline";
import { validateTrackingSourceData, parseSourcePrice } from "@shared/scrape-validity";
import { filterValidProductImages } from "../server/trendyol-image-utils";
import { isValidTrendyolProductTitle } from "../server/trendyol-title-utils";

export type LocalAgentScrapeSuccess = {
  success: true;
  source: "local_agent";
  url: string;
  title: string;
  titleSource: string;
  price: { original: number; currency: string };
  images: string[];
  variants: unknown;
  stock: number | null;
  available: boolean | null;
  quality: {
    validTitle: boolean;
    validPrice: boolean;
    validImages: boolean;
    finalSuccessReason: string;
  };
  rawDiagnostics: {
    htmlSize: number;
    durationMs: number;
    stageErrors: string[];
  };
};

export type LocalAgentScrapeFailure = {
  success: false;
  source: "local_agent";
  url: string;
  error: string;
  userMessage: string;
  stageErrors: string[];
  rawDiagnostics?: {
    durationMs: number;
    stageErrors: string[];
  };
};

export type LocalAgentScrapeResponse = LocalAgentScrapeSuccess | LocalAgentScrapeFailure;

function countStock(variants: unknown): number | null {
  if (!variants || typeof variants !== "object") return null;
  const v = variants as { allVariants?: Array<{ inStock?: boolean }> };
  const list = v.allVariants ?? [];
  if (list.length === 0) return null;
  return list.filter((item) => item.inStock !== false).length;
}

function isAvailable(variants: unknown): boolean | null {
  if (!variants || typeof variants !== "object") return null;
  const v = variants as { allVariants?: Array<{ inStock?: boolean }> };
  const list = v.allVariants ?? [];
  if (list.length === 0) return null;
  return list.some((item) => item.inStock !== false);
}

/** Agent kendi içinde internal provider döngüsüne girmez */
export async function scrapeTrendyolForLocalAgent(url: string): Promise<LocalAgentScrapeResponse> {
  const start = Date.now();
  process.env.LOCAL_SCRAPE_AGENT_MODE = "true";

  try {
    const outcome = await runTrendyolScrapePipeline(url, "auto-fast");
    const result = outcome.result ?? {};
    const diagnostics = outcome.diagnostics;
    const stageErrors = [...(diagnostics?.stageErrors ?? [])];

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
      success: outcome.success,
    });

    const priceValue = parseSourcePrice(result.price);
    const images = filterValidProductImages(result.images);
    const title = String(result.title ?? "").trim();
    const titleSource = String(result.titleSource ?? "unknown");
    const hasValidTitle = isValidTrendyolProductTitle(title);
    const hasValidPrice = priceValue > 0;
    const hasValidImages = images.length > 0;

    if (!validation.valid || !outcome.success) {
      const error = validation.reason ?? "no-usable-data";
      return {
        success: false,
        source: "local_agent",
        url,
        error,
        userMessage: "Ürün verisi doğrulanamadı.",
        stageErrors: stageErrors.length > 0 ? stageErrors : [error],
        rawDiagnostics: {
          durationMs: Date.now() - start,
          stageErrors,
        },
      };
    }

    const fullData = hasValidTitle && hasValidPrice && hasValidImages;
    const finalSuccessReason = fullData ? "local-agent-full-data" : "local-agent-success";

    return {
      success: true,
      source: "local_agent",
      url,
      title,
      titleSource,
      price: { original: priceValue, currency: "TRY" },
      images,
      variants: result.variants ?? [],
      stock: countStock(result.variants),
      available: isAvailable(result.variants),
      quality: {
        validTitle: hasValidTitle,
        validPrice: hasValidPrice,
        validImages: hasValidImages,
        finalSuccessReason,
      },
      rawDiagnostics: {
        htmlSize: diagnostics?.directHtmlSuccess ? 5000 : 0,
        durationMs: Date.now() - start,
        stageErrors,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      source: "local_agent",
      url,
      error: "scrape-error",
      userMessage: "Ürün verisi doğrulanamadı.",
      stageErrors: [message],
      rawDiagnostics: {
        durationMs: Date.now() - start,
        stageErrors: [message],
      },
    };
  }
}
