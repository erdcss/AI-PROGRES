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

  if (trimmed.startsWith("//")) return `https:${trimmed}`;
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

function decodedPath(url: string): string {
  const path = url.split("?")[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function isKnownNonProductAsset(url: string): boolean {
  const path = decodedPath(url);
  // QC_ENRICHMENT is also used by Trendyol for the real numbered product gallery
  // (for example 1_org_zoom.jpg). Do not reject the whole folder; the strict
  // gallery-path check below still requires a real product-looking image path,
  // while care/size-chart/banner assets remain blocked here.
  return /(?:size[_-]?(?:chart|guide)|beden[_-]?(?:tablo|rehber)|yikama|washing|wash[_-]?care|care[_-]?(?:instruction|guide)|instruction|laundry|symbol|\/icons?\/|[_-]icon(?:[_./-]|$)|badge|logo|banner|campaign|kampanya|seller|review|yorum|avatar|footer|header|favicon|story[_-]?image)/i.test(
    path,
  );
}

function isStrictProductGalleryPath(url: string): boolean {
  const path = decodedPath(url);
  return (
    /\/ty\d+\/prod\/(?:QC|QC_PREP|PIM)\//i.test(path) ||
    /\/ty\d+\/product\/media\//i.test(path) ||
    (/\/ty\d+\//i.test(path) && /(?:org_zoom|_org_)/i.test(path))
  );
}

export function optimizeTrendyolImageUrl(url: string): string | null {
  if (!url) return null;

  const optimized = toAbsoluteCdnUrl(url);
  if (!optimized) return null;
  if (!CDN_HOSTS.some((host) => optimized.includes(host))) return null;

  const exclude = ["/ui/", "/icon", "/logo", "/footer", "/brand/", "/web/", "/sfint/", ".svg"];
  if (exclude.some((pattern) => optimized.toLowerCase().includes(pattern.toLowerCase()))) return null;

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

/**
 * Yalnız gerçek Trendyol ürün galerisi görsellerini kabul eder.
 * Açıklama içi zenginleştirme, yıkama/bakım ikonları, beden tabloları, banner ve UI görselleri kesin olarak elenir.
 */
export function filterValidProductImages(images: unknown): string[] {
  return normalizeTrendyolImages(images).filter((img) => {
    if (
      img.includes("mask-image") ||
      img.includes("background-image") ||
      img.includes(".svg") ||
      img.includes("/sfint/") ||
      img.includes("data:") ||
      isKnownNonProductAsset(img)
    ) {
      return false;
    }

    if (!isStrictProductGalleryPath(img)) return false;

    const path = decodedPath(img);
    return (
      /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(path) ||
      /org_zoom|_org_|\/prod\/(?:QC|QC_PREP|PIM)\/|\/product\/media\//i.test(path)
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
    for (const url of filterValidProductImages(list)) {
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

/** CDN 404 durumunda yalnız doğrulanmış ürün galerisi URL'leri için alternatifler üretir. */
export function getTrendyolImageFallbackUrls(
  url: string,
  preferredTyFolders: string[] = [],
): string[] {
  const normalized = url.trim().replace(/^http:/, "https:");
  if (!normalized.startsWith("https://")) return [];
  if (filterValidProductImages([normalized]).length === 0) return [];

  const variants: string[] = [];
  const seen = new Set<string>();

  const add = (candidate: string | null | undefined) => {
    if (!candidate || seen.has(candidate)) return;
    if (filterValidProductImages([candidate]).length === 0) return;
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
  for (const url of filterValidProductImages(images)) {
    const m = String(url || "").match(/\/(ty\d+)\//i);
    if (!m) continue;
    const ty = m[1].toLowerCase();
    if (seen.has(ty)) continue;
    seen.add(ty);
    out.push(m[1]);
  }
  return out;
}

/** Önizleme için yalnız ürün galerisi görsellerini sıralar. */
export function prioritizeProductImagesForPreview(images: string[]): string[] {
  const byKey = new Map<string, string>();

  for (const url of filterValidProductImages(images)) {
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
