import { isBlockedTrendyolTitle } from "@shared/trendyol-bot-detection";
import { filterValidProductImages } from "./trendyol-image-utils";
import { parseTrendyolProductFromHtmlContent } from "./trendyol-html-extractor";
import {
  extractTrendyolProductId,
  isValidTrendyolProductTitle,
  cleanTrendyolDisplayTitle,
} from "./trendyol-title-utils";
import { resolveTrendyolSourceIds } from "./shopify-source-key";

export type ParsedHtmlCore = NonNullable<ReturnType<typeof parseTrendyolProductFromHtmlContent>>;

export function isPlaceholderTrendyolTitle(title: string | undefined | null): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (isBlockedTrendyolTitle(title) || !isValidTrendyolProductTitle(title)) return true;
  const placeholders = [
    "slicing attribute product",
    "ürün",
    "product",
    "marka",
    "trendyol ürünü",
    "slicing attribute",
  ];
  return placeholders.includes(t);
}

export function htmlProductIdMatchesUrl(html: string, url: string): boolean {
  const expected = extractTrendyolProductId(url);
  if (!expected) return true;
  const ids = resolveTrendyolSourceIds(url);
  const patterns = [
    new RegExp(`"id"\\s*:\\s*${expected}\\b`),
    new RegExp(`p-${expected}\\b`),
    new RegExp(`"productId"\\s*:\\s*"?${expected}"?`),
  ];
  return patterns.some((p) => p.test(html));
}

export function parseTrendyolCoreFromHtml(
  html: string,
  url: string,
  source: string,
): ParsedHtmlCore | null {
  if (!html || html.length < 5000) return null;
  if (!htmlProductIdMatchesUrl(html, url)) return null;
  const parsed = parseTrendyolProductFromHtmlContent(html, url, source);
  if (!parsed) return null;
  const title = cleanTrendyolDisplayTitle(parsed.title || "");
  if (isPlaceholderTrendyolTitle(title)) return null;
  return { ...parsed, title };
}

function countTrendyolVariants(v: unknown): number {
  if (!v || typeof v !== "object") return 0;
  const o = v as { allVariants?: unknown[]; sizes?: unknown[]; colors?: unknown[] };
  if (Array.isArray(o.allVariants) && o.allVariants.length > 0) return o.allVariants.length;
  return Math.max(o.sizes?.length ?? 0, o.colors?.length ?? 0);
}

export function mergeTrendyolHtmlCoreIntoResult(
  target: Record<string, unknown>,
  parsed: ParsedHtmlCore,
  url: string,
): void {
  if (!isPlaceholderTrendyolTitle(parsed.title)) {
    target.title = cleanTrendyolDisplayTitle(parsed.title);
    target.titleSource = "html-parser";
  }
  if (parsed.brand) target.brand = parsed.brand;
  if (parsed.description) target.description = parsed.description;
  if (parsed.category) target.category = parsed.category;
  if (parsed.price?.original && parsed.price.original > 0) {
    target.price = parsed.price;
  }
  const images = filterValidProductImages(parsed.images || []);
  if (images.length > 0) {
    target.images = images;
  }
  if (parsed.variants) {
    const existingCount = countTrendyolVariants(target.variants);
    const incomingCount = countTrendyolVariants(parsed.variants);
    if (incomingCount > existingCount) {
      target.variants = parsed.variants;
    }
  }
  target.extractionMethod = `${String(target.extractionMethod || "scenario")}+html-parser`;
  target.sourceProductId = extractTrendyolProductId(url);
}
