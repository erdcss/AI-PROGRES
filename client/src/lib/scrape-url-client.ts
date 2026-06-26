import { normalizeTrendyolDisplayPrice } from "@/utils/price-utils";
import { resolveOriginalImageUrl } from "@/lib/product-image-url";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";

export type ScrapedUrlPayload = {
  title: string;
  brand?: string;
  description?: string;
  category?: string;
  price: {
    original: number;
    withProfit: number;
    formatted: string;
    profitFormatted: string;
    currency: string;
  };
  images: string[];
  variants?: {
    colors?: string[];
    sizes?: string[];
    allVariants?: Array<{
      color: string;
      size: string;
      inStock: boolean;
      colorCode?: string;
    }>;
  };
  features?: Array<{ key: string; value: string }>;
  tags?: string[];
  csvContent?: string;
  csvInfo?: {
    filename: string;
    downloadUrl: string;
    ready: boolean;
    productCount: number;
  };
  extractionMethod?: string;
  success?: boolean;
  originalUrl: string;
  sourceUrl: string;
};

function normalizeImageList(images: unknown): string[] {
  if (!Array.isArray(images)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of images) {
    const url = resolveOriginalImageUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }

  return result;
}

function buildFallbackCsvContent(data: {
  title: string;
  brand?: string;
  price?: { original: number };
  images?: string[];
}): string {
  const handle = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-");
  const price = data.price?.original ?? "";
  const imgUrl = data.images?.[0] ?? "";
  return `Title,URL handle,Description,Vendor,Product category,Type,Tags,Published on online store,Status,SKU,Barcode,Option1 name,Option1 value,Option1 Linked To,Option2 name,Option2 value,Option2 Linked To,Option3 name,Option3 value,Option3 Linked To,Price,Compare-at price,Cost per item,Charge tax,Tax code,Unit price total measure,Unit price total measure unit,Unit price base measure,Unit price base measure unit,Inventory tracker,Inventory quantity,Continue selling when out of stock,Weight value (grams),Weight unit for display,Requires shipping,Fulfillment service,Product image URL,Image position,Image alt text,Variant image URL,Gift card,SEO title,SEO description,Color (product.metafields.shopify.color-pattern),Google Shopping / Google product category,Google Shopping / Gender,Google Shopping / Age group,Google Shopping / Manufacturer part number (MPN),Google Shopping / Ad group name,Google Shopping / Ads labels,Google Shopping / Condition,Google Shopping / Custom product,Google Shopping / Custom label 0,Google Shopping / Custom label 1,Google Shopping / Custom label 2,Google Shopping / Custom label 3,Google Shopping / Custom label 4\n"${data.title}","${handle}",,,"${data.brand || ""}","Kategori","Kategori","","TRUE","active",,,,,,,,,,,,"${price}","","","TRUE","","","","","","shopify","0","CONTINUE","","g","TRUE","manual","${imgUrl}","1","${data.title}","","FALSE","${data.title}","${data.title}","","","","","","","","","","","","","",""`;
}

export function normalizeScrapedPayload(
  raw: Record<string, unknown>,
  url: string,
): ScrapedUrlPayload {
  const images = normalizeImageList(raw.images);
  const displayPrice = normalizeTrendyolDisplayPrice(raw.price, 0.15);

  let csvContent =
    typeof raw.csvContent === "string" && raw.csvContent.length > 50
      ? raw.csvContent
      : undefined;

  if (!csvContent && raw.title) {
    csvContent = buildFallbackCsvContent({
      title: String(raw.title),
      brand: raw.brand ? String(raw.brand) : undefined,
      price: { original: displayPrice.original },
      images,
    });
  }

  return {
    title: String(raw.title || "Ürün"),
    brand: raw.brand ? String(raw.brand) : "",
    description: raw.description ? String(raw.description) : "",
    category: raw.category ? String(raw.category) : "",
    price: {
      original: displayPrice.original,
      withProfit: displayPrice.withProfit,
      formatted: displayPrice.formatted,
      profitFormatted: displayPrice.profitFormatted,
      currency: "TRY",
    },
    images,
    variants: sanitizeTrendyolVariants(raw.variants, {
      productTitle: String(raw.title || "Ürün"),
    }),
    features: (raw.features as ScrapedUrlPayload["features"]) || [],
    tags: (raw.tags as string[]) || [],
    csvContent,
    csvInfo: raw.csvInfo as ScrapedUrlPayload["csvInfo"],
    extractionMethod: raw.extractionMethod
      ? String(raw.extractionMethod)
      : undefined,
    success: raw.success !== false,
    originalUrl: url,
    sourceUrl: url,
  };
}

/** Toplu ve tekli akışların ortak scenario-scrape + poll mantığı */
export async function fetchScenarioScrapeResult(
  url: string,
  onlyExtractData = true,
): Promise<ScrapedUrlPayload> {
  const startResp = await fetch("/api/scenario-scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, mode: "single", onlyExtractData }),
  });

  if (!startResp.ok) {
    const errData = await startResp.json().catch(() => ({}));
    throw new Error(
      (errData as { message?: string }).message || `HTTP ${startResp.status}`,
    );
  }

  const startData = await startResp.json();
  let raw: Record<string, unknown>;

  if (!startData.jobId) {
    raw = { ...startData, originalUrl: url };
  } else {
    const { jobId } = startData;
    const maxWait = 180_000;
    const pollInterval = 2500;
    const deadline = Date.now() + maxWait;
    let polled: Record<string, unknown> | null = null;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const pollResp = await fetch(`/api/scrape-job/${jobId}`);
      if (!pollResp.ok) {
        throw new Error(`Polling hatası: HTTP ${pollResp.status}`);
      }

      const pollData = await pollResp.json();
      if (pollData.status === "done") {
        if (pollData.result?.success === false) {
          throw new Error(
            pollData.result.message || pollData.result.error || "Çekim başarısız",
          );
        }
        polled = { ...pollData.result, originalUrl: url };
        break;
      }
      if (pollData.status === "error") {
        throw new Error(pollData.error || "Scraping başarısız");
      }
    }

    if (!polled) {
      throw new Error("Zaman aşımı — lütfen tekrar deneyin.");
    }
    raw = polled;
  }

  if (!raw?.title) {
    throw new Error("Ürün verisi alınamadı");
  }

  return normalizeScrapedPayload(raw, url);
}

export function buildCsvPreviewEntry(
  data: ScrapedUrlPayload,
  url: string,
  idPrefix = "csv",
) {
  const urlSlug = url.split("/").pop()?.split("?")[0] || `url-${Date.now()}`;
  return {
    id: `${idPrefix}-${urlSlug}-${Date.now()}`,
    productTitle: data.title,
    csvContent: data.csvContent || "",
    sourceUrl: url,
    variants: {
      colors: data.variants?.colors || [],
      sizes: data.variants?.sizes || [],
    },
    images: data.images,
    price: data.price.original,
    brand: data.brand,
    createdAt: new Date().toISOString(),
  };
}
