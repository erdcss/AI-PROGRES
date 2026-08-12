import type {
  MemoryProduct,
  ProductVariantRow,
  ScrapedProduct,
  TrackedProduct,
} from "../api/tracking";
import {
  domainFromUrl,
  formatMoney,
  marketplaceLabel,
  pickDisplayPrice,
  uniqueImageUrls,
  variantPrice,
} from "./format";

export type UnifiedProduct = {
  key: string;
  routeId: string;
  title: string;
  subtitle: string;
  price: string;
  imageUrl?: string | null;
  tracked: boolean;
  shopify: boolean;
  watchTag?: string | null;
  addedAt: number;
};

export function addedAtMs(...vals: Array<string | number | null | undefined>): number {
  for (const v of vals) {
    if (v == null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    const t = new Date(String(v)).getTime();
    if (Number.isFinite(t) && t > 0) return t;
  }
  return 0;
}

export function buildUnifiedProducts(
  memoryList: MemoryProduct[],
  trackedList: TrackedProduct[],
  scrapedList: ScrapedProduct[],
): UnifiedProduct[] {
  const scrapedTagByUrl = new Map(
    scrapedList
      .filter((p) => p.trendyolUrl)
      .map((p) => [String(p.trendyolUrl).toLowerCase(), p.watchTag || null] as const),
  );
  const scrapedByUrl = new Map(
    scrapedList
      .filter((p) => p.trendyolUrl)
      .map((p) => [String(p.trendyolUrl).toLowerCase(), p] as const),
  );
  const trackedByShopifyMap = new Map(
    trackedList
      .filter((t) => t.shopifyProductId)
      .map((t) => [String(t.shopifyProductId), t] as const),
  );
  const trackedByUrlMap = new Map(
    trackedList
      .filter((t) => t.sourceUrl)
      .map((t) => [String(t.sourceUrl).toLowerCase(), t] as const),
  );
  const scrapedByShopify = new Map(
    scrapedList
      .filter((p) => p.shopifyProductId)
      .map((p) => [String(p.shopifyProductId), p] as const),
  );

  const unified: UnifiedProduct[] = [];

  if (memoryList.length > 0) {
    for (const m of memoryList) {
      const url = String(m.sourceUrl || "").toLowerCase();
      const trackedMatch =
        (m.shopifyProductId && trackedByShopifyMap.get(String(m.shopifyProductId))) ||
        (url ? trackedByUrlMap.get(url) : undefined);
      const scrapedMatch =
        (m.shopifyProductId && scrapedByShopify.get(String(m.shopifyProductId))) ||
        (url ? scrapedByUrl.get(url) : undefined);
      const variantHint =
        typeof m.variantCount === "number" && m.variantCount > 0
          ? ` · ${m.variantCount} varyant`
          : scrapedMatch?.variantCount
            ? ` · ${scrapedMatch.variantCount} varyant`
            : "";
      unified.push({
        key: `m-${m.id}`,
        routeId: trackedMatch ? `tracked-${trackedMatch.id}` : `memory-${m.id}`,
        title: m.title || trackedMatch?.sourceTitle || scrapedMatch?.title || "Ürün",
        subtitle: `Shopify${variantHint}`,
        price: formatMoney(
          pickDisplayPrice(
            m.price,
            m.compareAtPrice,
            trackedMatch?.currentSourcePrice,
            scrapedMatch?.currentPrice,
            scrapedMatch?.originalPrice,
            ...((Array.isArray(m.variants) ? m.variants : []) as ProductVariantRow[]).map((v) =>
              variantPrice(v),
            ),
            ...(scrapedMatch?.variants || []).map((v) => variantPrice(v)),
          ),
        ),
        imageUrl:
          uniqueImageUrls(m.image, m.images)[0] ||
          trackedMatch?.productImageUrl ||
          uniqueImageUrls(scrapedMatch?.image, scrapedMatch?.images)[0],
        tracked: Boolean(trackedMatch || m.isTracking),
        shopify: true,
        watchTag:
          trackedMatch?.watchTag ||
          scrapedMatch?.watchTag ||
          (url ? scrapedTagByUrl.get(url) : null) ||
          null,
        addedAt: addedAtMs(m.createdAt, m.shopifyCreatedAt, m.id),
      });
    }
  }

  const seenRoute = new Set(unified.map((u) => u.routeId));
  const seenShopify = new Set(
    memoryList.map((m) => String(m.shopifyProductId || "")).filter(Boolean),
  );

  for (const t of trackedList) {
    const routeId = `tracked-${t.id}`;
    if (seenRoute.has(routeId)) continue;
    if (t.shopifyProductId && seenShopify.has(String(t.shopifyProductId))) continue;
    const scrapedMatch = scrapedByUrl.get(String(t.sourceUrl || "").toLowerCase());
    seenRoute.add(routeId);
    if (t.shopifyProductId) seenShopify.add(String(t.shopifyProductId));
    unified.push({
      key: `t-${t.id}`,
      routeId,
      title: t.sourceTitle,
      subtitle:
        domainFromUrl(t.sourceUrl) ||
        `${marketplaceLabel(t.sourceSite).toLowerCase()}.com`,
      price: formatMoney(
        pickDisplayPrice(
          t.currentSourcePrice,
          scrapedMatch?.currentPrice,
          scrapedMatch?.originalPrice,
          ...(scrapedMatch?.variants || []).map((v) => variantPrice(v)),
        ),
      ),
      imageUrl: t.productImageUrl || uniqueImageUrls(scrapedMatch?.image, scrapedMatch?.images)[0],
      tracked: true,
      shopify: Boolean(t.shopifyProductId),
      watchTag:
        t.watchTag ||
        scrapedTagByUrl.get(String(t.sourceUrl || "").toLowerCase()) ||
        null,
      addedAt: addedAtMs(t.createdAt, t.id),
    });
  }

  for (const s of scrapedList) {
    const routeId = `scraped-${s.id}`;
    if (seenRoute.has(routeId)) continue;
    if (s.shopifyProductId && seenShopify.has(String(s.shopifyProductId))) continue;
    if (s.shopifyProductId && seenRoute.has(`tracked-${s.id}`)) continue;
    seenRoute.add(routeId);
    if (s.shopifyProductId) seenShopify.add(String(s.shopifyProductId));
    unified.push({
      key: `s-${s.id}`,
      routeId,
      title: s.title,
      subtitle: marketplaceLabel(s.marketplace || "trendyol"),
      price: formatMoney(
        pickDisplayPrice(s.currentPrice, s.originalPrice, ...(s.variants || []).map((v) => variantPrice(v))),
      ),
      imageUrl: uniqueImageUrls(s.image, s.images)[0],
      tracked: Boolean(s.tracking?.id),
      shopify: Boolean(s.shopifyProductId),
      watchTag: s.watchTag || null,
      addedAt: addedAtMs(s.createdAt, s.scrapedAt, s.id),
    });
  }

  unified.sort((a, b) => b.addedAt - a.addedAt || b.key.localeCompare(a.key));
  return unified;
}
