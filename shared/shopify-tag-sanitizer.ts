const TRENDYOL_TAG_PATTERN = /trendyol/i;

/** Shopify etiketlerinde "trendyol" kelimesi kullanılmaz */
export function isBlockedShopifyTag(tag: string): boolean {
  return TRENDYOL_TAG_PATTERN.test(String(tag ?? "").trim());
}

export function sanitizeShopifyTags(tags: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    // CSV'nin önceki çift-escape çıktılarından veya kullanıcı girişinden kalan
    // dış tırnakları Shopify etiketi olarak saklama.
    const tag = String(raw ?? "")
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .trim();
    if (!tag || isBlockedShopifyTag(tag)) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(tag);
  }

  return result;
}

export function joinShopifyTags(tags: Iterable<string>): string {
  return sanitizeShopifyTags(tags).join(", ");
}

/** Otomatik ürün etiketleri — trendyol kelimesi içermez */
export function buildAutomaticProductTags(sourceProductId: string): string[] {
  const id = String(sourceProductId ?? "").trim();
  if (!id) return ["import"];
  return ["import", `src:${id}`];
}

/** Mevcut ürün araması için dahili etiket (Shopify tag alanında) */
export function buildSourceLookupTag(sourceProductId: string): string {
  return `src:${String(sourceProductId ?? "").trim()}`;
}

/** Eski kayıtlar için yalnızca arama amaçlı legacy etiket */
export function buildLegacySourceLookupTag(sourceProductId: string): string {
  return `trendyol:${String(sourceProductId ?? "").trim()}`;
}
