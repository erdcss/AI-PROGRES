export type ShopifyExportGateInput = {
  title: string;
  scrapedTitle?: string;
  priceOriginal: number;
  images: unknown;
  sourceUrl?: string;
  titleSource?: string;
  approvedForShopify?: boolean;
  titleEdited?: boolean;
};

export type ShopifyExportGateResult = {
  allowed: boolean;
  reason?: string;
  warning?: string;
  needsTitleApproval?: boolean;
};

function normalizeImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === "string") {
        const url = img.trim().startsWith("//") ? `https:${img.trim()}` : img.trim();
        return url.startsWith("http") ? url : "";
      }
      if (img && typeof img === "object" && "url" in img) {
        const raw = String((img as { url: string }).url).trim();
        const url = raw.startsWith("//") ? `https:${raw}` : raw;
        return url.startsWith("http") ? url : "";
      }
      return "";
    })
    .filter(Boolean);
}

function isValidSourceUrl(url?: string): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Shopify aktarım uygunluğu — url-slug başlık onay veya düzenleme ile geçilebilir */
export function evaluateShopifyExportGate(
  input: ShopifyExportGateInput,
): ShopifyExportGateResult {
  const title = String(input.title ?? "").trim();
  const priceOriginal = Number(input.priceOriginal) || 0;
  const images = normalizeImageUrls(input.images);
  const sourceUrl = String(input.sourceUrl ?? "").trim();
  const titleSource = String(input.titleSource ?? "");
  const scrapedTitle = String(input.scrapedTitle ?? title).trim();
  const titleEdited =
    input.titleEdited === true ||
    (scrapedTitle.length > 0 && title.toLowerCase() !== scrapedTitle.toLowerCase());

  if (priceOriginal <= 0) {
    return { allowed: false, reason: "Fiyat alınamadığı için Shopify aktarımı engellendi" };
  }
  if (images.length === 0) {
    return { allowed: false, reason: "En az 1 geçerli görsel gerekli" };
  }
  if (!isValidSourceUrl(sourceUrl)) {
    return { allowed: false, reason: "Geçerli kaynak URL bulunamadı" };
  }
  if (title.length < 8) {
    return { allowed: false, reason: "Başlık çok kısa (en az 8 karakter gerekli)" };
  }

  if (titleSource === "url-slug") {
    return {
      allowed: true,
      warning: "title_from_url_slug_review_recommended",
    };
  }

  return { allowed: true };
}
