import { createHash } from "crypto";
import { marktGoStockForAvailability } from "@shared/integration-provider";
import { matchWebHookSite } from "@shared/web-hooks-sites";
import type { LocalProductInput } from "./types";
import {
  extractExternalId,
  extractId,
  extractTags,
  normalizeMarktGoProduct,
} from "./normalize";

const PROFIT_MARGIN = 0.1;
export const SOURCE_URL_TAG_PREFIX = "src:";

export function poolLocalProductId(product: Record<string, unknown>): string {
  const poolId = String(product.poolId || product.id || "").trim();
  if (poolId) return poolId;
  const url = String(product.sourceUrl || "").trim();
  if (url) return `url_${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;
  return `tmp_${Date.now()}`;
}

export function mapPoolProductToMarktGoInput(
  product: Record<string, unknown>,
): LocalProductInput {
  const cost = Number(product.salePrice);
  const sale = Number.isFinite(cost) ? cost : 0;
  const compare =
    product.compareAtPrice != null && Number(product.compareAtPrice) > sale
      ? Number(product.compareAtPrice)
      : null;
  const sellPrice = Math.round(sale * (1 + PROFIT_MARGIN) * 100) / 100;
  const regular = compare
    ? Math.round(compare * (1 + PROFIT_MARGIN) * 100) / 100
    : sellPrice;
  const images = Array.isArray(product.images)
    ? product.images.map(String)
    : product.image
      ? [String(product.image)]
      : [];
  const tags = Array.isArray(product.tags) ? product.tags.map(String) : [];
  const features = Array.isArray(product.features)
    ? (product.features as Array<{ name?: string; value?: string }>)
        .map((f) =>
          f?.name && f?.value ? `<li><strong>${f.name}:</strong> ${f.value}</li>` : "",
        )
        .filter(Boolean)
        .join("")
    : "";
  const description = features ? `<ul>${features}</ul>` : "";
  const variantSeen = new Set<string>();
  const variants = Array.isArray(product.variants)
    ? (product.variants as Array<Record<string, unknown>>).map((v, i) => {
        let localVariantId = String(v.id || v.sku || `v${i + 1}`).trim();
        if (!localVariantId || variantSeen.has(localVariantId)) {
          localVariantId = `${localVariantId || "v"}-${i + 1}`;
        }
        variantSeen.add(localVariantId);
        return {
          localVariantId,
          option1: v.option1
            ? String(v.option1)
            : v.color
              ? String(v.color)
              : v.title
                ? String(v.title)
                : undefined,
          option2: v.option2 ? String(v.option2) : v.size ? String(v.size) : undefined,
          sku: v.sku ? String(v.sku) : undefined,
          stock: marktGoStockForAvailability(v.inStock !== false),
          price: v.price != null ? Number(v.price) : sellPrice,
          imageUrl: v.imageUrl ? String(v.imageUrl) : v.image ? String(v.image) : undefined,
        };
      })
    : [];

  return {
    localProductId: poolLocalProductId(product),
    title: String(product.title || "Ürün"),
    description,
    brand: product.brand ? String(product.brand) : product.siteName ? String(product.siteName) : null,
    category: product.category ? String(product.category) : null,
    sourceUrl: product.sourceUrl ? String(product.sourceUrl) : null,
    price: regular,
    discountPrice: compare ? sellPrice : null,
    stock: marktGoStockForAvailability(product.inStock !== false),
    images,
    tags: buildExportTags(tags, product.sourceUrl ? String(product.sourceUrl) : null),
    variants,
  };
}

export function sourceUrlTag(url: string): string {
  return `${SOURCE_URL_TAG_PREFIX}${String(url || "").trim()}`;
}

export function parseSourceUrlFromTags(tags: unknown): string {
  if (!Array.isArray(tags)) return "";
  for (const t of tags) {
    const s = String(t || "").trim();
    if (s.toLowerCase().startsWith(SOURCE_URL_TAG_PREFIX)) {
      return s.slice(SOURCE_URL_TAG_PREFIX.length).trim();
    }
  }
  return "";
}

function buildExportTags(tags: string[], sourceUrl: string | null): string[] {
  const out: string[] = ["urun-havuzu"];
  const seen = new Set<string>(["urun-havuzu"]);
  for (const t of tags) {
    const cleaned = String(t || "").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (key.startsWith(SOURCE_URL_TAG_PREFIX) || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) out.push(sourceUrlTag(sourceUrl));
  return out;
}

export function localIdFromRemote(item: Record<string, unknown>): string {
  const ext = String(item.externalId || item.external_id || "").trim();
  if (/^aip_/i.test(ext)) {
    const rest = ext.slice(4);
    if (rest) return rest;
  }
  if (ext) return ext;
  const id = extractId(item);
  return id ? `mg_${id}` : `mg_${Date.now()}`;
}

export type CatalogPoolProduct = {
  poolId: string;
  title: string;
  sourceUrl: string;
  siteName: string;
  siteLogoUrl: string;
  brand?: string;
  currency: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  salePrice: number;
  images: string[];
  variants?: Array<{
    title: string;
    sku?: string;
    option1?: string;
    option2?: string;
    price?: number | null;
    inStock?: boolean;
  }>;
  inStock: boolean;
  scrapedAt: string;
  externalProductId: string;
};

function reverseMargin(livePrice: number): number {
  return Math.round((livePrice / (1 + PROFIT_MARGIN)) * 100) / 100;
}

export function remoteToPoolProduct(raw: unknown): CatalogPoolProduct | null {
  const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = extractId(item);
  if (!id) return null;
  const norm = normalizeMarktGoProduct(item);
  const tags = extractTags(item);
  const sourceUrl = String(
    item.sourceUrl || parseSourceUrlFromTags(tags) || "",
  ).trim();
  const poolId = localIdFromRemote({
    ...item,
    externalId: extractExternalId(item) || item.externalId,
  });
  const liveSell = norm.discountPrice ?? norm.price ?? 0;
  const liveCompare =
    norm.discountPrice != null &&
    norm.price != null &&
    norm.price > norm.discountPrice
      ? norm.price
      : null;
  const salePrice = reverseMargin(liveSell);
  const compareAtPrice = liveCompare != null ? reverseMargin(liveCompare) : null;
  const price =
    compareAtPrice && compareAtPrice > salePrice ? compareAtPrice : salePrice;
  const site = sourceUrl ? matchWebHookSite(sourceUrl) : null;
  const variants = (norm.variants || []).map((v) => ({
    title: [v.option1, v.option2].filter(Boolean).join(" / ") || "Varsayılan",
    sku: v.sku,
    option1: v.option1,
    option2: v.option2,
    price: v.price != null ? reverseMargin(v.price) : salePrice,
    inStock: v.stock == null ? true : v.stock > 0,
  }));
  return {
    poolId,
    title: norm.title || "Ürün",
    sourceUrl: sourceUrl || `marktgo://products/${id}`,
    siteName: site?.name || String(norm.brand || "MARKT-GO"),
    siteLogoUrl: site?.logoUrl || "",
    brand: norm.brand || undefined,
    currency: "TRY",
    price,
    compareAtPrice,
    discountPercent:
      compareAtPrice && price > 0
        ? Math.round((1 - salePrice / price) * 100)
        : 0,
    salePrice,
    images: norm.images,
    variants: variants.length ? variants : undefined,
    inStock: (norm.stock ?? 1) > 0,
    scrapedAt: norm.updatedAt || new Date().toISOString(),
    externalProductId: id,
  };
}
