const CDN_HOSTS = ["cdn.dsmcdn.com", "cdn.trendyol.com"];

function extractRawImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["url", "src", "imageUrl", "image", "href", "link", "path"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return null;
}

function toAbsoluteCdnUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/ty") || trimmed.startsWith("/mnresize/")) {
    return `https://cdn.dsmcdn.com${trimmed}`;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return `https://cdn.dsmcdn.com${trimmed}`;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/^http:/, "https:");
  }

  return null;
}

export function optimizeTrendyolImageUrl(url: string): string | null {
  if (!url) return null;

  const optimized = toAbsoluteCdnUrl(url);
  if (!optimized) return null;
  if (!CDN_HOSTS.some((host) => optimized.includes(host))) return null;

  const exclude = ["/ui/", "/icon", "/logo", "/footer", "/brand/", "/web/", "/sfint/", ".svg"];
  if (exclude.some((pattern) => optimized.includes(pattern))) return null;

  return optimized.replace(/mnresize\/\d+\/\d+\//, "mnresize/1200/1800/");
}

export function normalizeTrendyolImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of images) {
    const raw = extractRawImageUrl(item);
    if (!raw) continue;

    const optimized = optimizeTrendyolImageUrl(raw);
    if (!optimized || seen.has(optimized)) continue;

    seen.add(optimized);
    result.push(optimized);
  }

  return result;
}

/** Ürün görselleri — SVG, sfint ikonları ve CSS mask URL'lerini eler */
export function filterValidProductImages(images: unknown): string[] {
  return normalizeTrendyolImages(images).filter((img) => {
    if (
      img.includes("mask-image") ||
      img.includes("background-image") ||
      img.includes(".svg") ||
      img.includes("/sfint/") ||
      img.includes("data:")
    ) {
      return false;
    }
    const isProductCdn =
      /\/ty\d+\/(prod|product|media)\//i.test(img) ||
      /\/QC_|\/PIM_|QC_PREP|ENRICHMENT|org_zoom|_org_/i.test(img);
    if (!isProductCdn) return false;
    const path = img.split("?")[0];
    // Uzantısız CDN, webp/avif ve query parametreli URL'leri koru
    return (
      /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(path) ||
      /org_zoom|_org_|\/prod\/|\/product\/|\/media\//i.test(path)
    );
  });
}

function imagePreviewDedupeKey(url: string): string {
  return url
    .replace(/mnresize\/\d+\/\d+\//, "")
    .replace(/\/ty\d+\//, "/")
    .split("?")[0];
}

/** Known-bad CDN folder rewrites that often 404; prefer any other ty when deduping. */
const LOW_QUALITY_TY = new Set(["ty1660", "ty1000", "ty1505"]);

function tyFolderOf(url: string): string | null {
  const m = url.match(/\/(ty\d+)\//i);
  return m ? m[1].toLowerCase() : null;
}

/** Prefer real CDN ty folders over hardcoded rewrites; prefer org_zoom / non-mnresize. */
export function preferBetterTrendyolImageUrl(existing: string, candidate: string): string {
  const existingTy = tyFolderOf(existing);
  const candidateTy = tyFolderOf(candidate);
  if (existingTy && candidateTy && existingTy !== candidateTy) {
    const existingLow = LOW_QUALITY_TY.has(existingTy);
    const candidateLow = LOW_QUALITY_TY.has(candidateTy);
    if (existingLow && !candidateLow) return candidate;
    if (!existingLow && candidateLow) return existing;
  }
  if (/1_org_zoom/i.test(candidate) && !/1_org_zoom/i.test(existing)) return candidate;
  if (/org_zoom/i.test(candidate) && !/org_zoom/i.test(existing)) return candidate;
  if (!/mnresize/i.test(candidate) && /mnresize/i.test(existing)) return candidate;
  return existing;
}

export function mergeTrendyolImageLists(...lists: unknown[]): string[] {
  const byKey = new Map<string, string>();

  for (const list of lists) {
    for (const url of normalizeTrendyolImages(list)) {
      const key = imagePreviewDedupeKey(url);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, url);
        continue;
      }
      byKey.set(key, preferBetterTrendyolImageUrl(existing, url));
    }
  }

  return [...byKey.values()];
}

/** CDN 404 durumunda denenecek alternatif görsel URL'leri */
export function getTrendyolImageFallbackUrls(
  url: string,
  preferredTyFolders: string[] = [],
): string[] {
  const normalized = url.trim().replace(/^http:/, "https:");
  if (!normalized.startsWith("https://")) return [];

  const variants: string[] = [];
  const seen = new Set<string>();

  const add = (candidate: string | null | undefined) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    variants.push(candidate);
  };

  add(normalized);

  const pathMatch = normalized.match(/cdn\.dsmcdn\.com\/(.+)$/i);
  if (pathMatch) {
    const path = pathMatch[1].split("?")[0];
    const barePath = path.replace(/^mnresize\/\d+\/\d+\//, "");

    add(`https://cdn.dsmcdn.com/${barePath}`);
    add(`https://cdn.dsmcdn.com/mnresize/620/920/${barePath}`);
    add(`https://cdn.dsmcdn.com/mnresize/1200/1800/${barePath}`);

    if (barePath.includes("/prod/QC/")) {
      add(`https://cdn.dsmcdn.com/${barePath.replace("/prod/QC/", "/prod/QC_PREP/")}`);
      add(`https://cdn.dsmcdn.com/mnresize/620/920/${barePath.replace("/prod/QC/", "/prod/QC_PREP/")}`);
    }
    if (barePath.includes("/prod/QC_PREP/")) {
      const qcPath = barePath.replace("/prod/QC_PREP/", "/prod/QC/");
      add(`https://cdn.dsmcdn.com/${qcPath}`);
      add(`https://cdn.dsmcdn.com/mnresize/620/920/${qcPath}`);
      add(`https://cdn.dsmcdn.com/mnresize/1200/1800/${qcPath}`);
    }
    if (barePath.includes("/prod/QC_ENRICHMENT/")) {
      add(`https://cdn.dsmcdn.com/${barePath.replace("/prod/QC_ENRICHMENT/", "/prod/QC/")}`);
      add(`https://cdn.dsmcdn.com/${barePath.replace("/prod/QC_ENRICHMENT/", "/prod/QC_PREP/")}`);
    }

    // tyXXXX klasör numarası CDN'de kayabiliyor — önce ürün galerisinden gelen ty'ler
    const tyMatch = barePath.match(/^(ty\d+)\//i);
    if (tyMatch) {
      const rest = barePath.slice(tyMatch[0].length);
      const tyCandidates = [
        ...preferredTyFolders,
        "ty1660",
        "ty1814",
        "ty1813",
        "ty1929",
        "ty1835",
        "ty1504",
        "ty1694",
        "ty1856",
      ];
      for (const ty of tyCandidates) {
        if (!ty || ty.toLowerCase() === tyMatch[1].toLowerCase()) continue;
        add(`https://cdn.dsmcdn.com/${ty}/${rest}`);
        add(`https://cdn.dsmcdn.com/mnresize/1200/1800/${ty}/${rest}`);
      }
    }
  }

  return variants;
}

/** Collect distinct /tyXXXX/ folders already present in a gallery (prefer these on recovery). */
export function collectTrendyolTyFolders(images: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of images) {
    const m = String(url || "").match(/\/(ty\d+)\//i);
    if (!m) continue;
    const ty = m[1].toLowerCase();
    if (seen.has(ty)) continue;
    seen.add(ty);
    out.push(m[1]);
  }
  return out;
}

/** Önizleme için org_zoom görselleri öne alır, tekrarları eler */
export function prioritizeProductImagesForPreview(images: string[]): string[] {
  const byKey = new Map<string, string>();

  for (const url of images) {
    const key = imagePreviewDedupeKey(url);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, url);
      continue;
    }
    byKey.set(key, preferBetterTrendyolImageUrl(existing, url));
  }

  return [...byKey.values()].sort((a, b) => {
    const rank = (u: string) => {
      const ty = tyFolderOf(u);
      if (ty && LOW_QUALITY_TY.has(ty)) return 4;
      if (/1_org_zoom/i.test(u)) return 0;
      if (/org_zoom|_org_/i.test(u)) return 1;
      if (/mnresize/i.test(u)) return 3;
      return 2;
    };
    return rank(a) - rank(b);
  });
}
