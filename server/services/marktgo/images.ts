/**
 * Prepare Trendyol/CDN image URLs for MARKT-GO product payloads.
 *
 * Offline-first: prefer real ty folders and known-good alternatives without
 * turning an otherwise valid product into an image-less MARKT-GO item.
 */
import {
  collectTrendyolTyFolders,
  filterValidProductImages,
  getTrendyolImageFallbackUrls,
  prioritizeProductImagesForPreview,
} from "@shared/trendyol-product-images";
import { isCloudRuntime } from "@shared/deploy-runtime";

const MIN_BYTES = 512;
const PROBE_TIMEOUT_MS = 2_000;
const MAX_IMAGES = 12;
const LOW_TY_RE = /\/ty(1660|1000|1505)\//i;

function normalizeDirectImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;

  try {
    const proxyCandidate = value.startsWith("/api/image-proxy")
      ? `https://local.invalid${value}`
      : value;
    const parsed = new URL(proxyCandidate);
    if (parsed.pathname === "/api/image-proxy") {
      const inner = parsed.searchParams.get("url");
      if (inner) value = decodeURIComponent(inner);
    }
  } catch {
    /* continue with the raw value */
  }

  if (value.startsWith("//")) value = `https:${value}`;
  else if (value.startsWith("/ty") || value.startsWith("/mnresize/")) {
    value = `https://cdn.dsmcdn.com${value}`;
  }
  if (/^http:\/\//i.test(value)) value = value.replace(/^http:/i, "https:");
  if (!/^https:\/\//i.test(value)) return null;

  if (
    /(?:\/ui\/|\/icons?\/|logo|favicon|avatar|banner|campaign|kampanya|seller|review|yorum|size[_-]?(?:chart|guide)|beden[_-]?(?:tablo|rehber)|washing|wash[_-]?care)/i.test(value)
  ) {
    return null;
  }
  return value;
}

function directImageUrls(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const direct =
      typeof item === "string"
        ? normalizeDirectImageUrl(item)
        : item && typeof item === "object"
          ? ["url", "src", "imageUrl", "image", "href", "link", "path", "original", "large", "medium"]
              .map((key) => normalizeDirectImageUrl((item as Record<string, unknown>)[key]))
              .find((value): value is string => Boolean(value)) || null
          : null;
    if (!direct || seen.has(direct)) continue;
    seen.add(direct);
    result.push(direct);
  }
  return result;
}

function imageIdentityKey(url: string): string {
  return url
    .replace(/mnresize\/\d+\/\d+\//, "")
    .replace(/\/ty\d+\//i, "/")
    .split("?")[0]
    .toLowerCase();
}

function rewriteTyFolder(url: string, ty: string): string {
  return url.replace(/\/ty\d+\//i, `/${ty}/`);
}

async function probeImageUrl(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.trendyol.com/",
      },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("xml") || ct.includes("json") || ct.includes("text/html")) return false;
    return buf.length >= MIN_BYTES;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recover a low-quality ty rewrite using sibling gallery folders (no network).
 * Example: ty1660/.../hash.jpg + preferred ty1819 → ty1819/.../hash.jpg
 */
function recoverWithPreferredTy(url: string, preferredTyFolders: string[]): string {
  if (!LOW_TY_RE.test(url) || !preferredTyFolders.length) return url;
  return rewriteTyFolder(url, preferredTyFolders[0]);
}

async function resolveSuspiciousUrl(
  url: string,
  preferredTyFolders: string[],
): Promise<string | null> {
  const recovered = recoverWithPreferredTy(url, preferredTyFolders);
  if (!isCloudRuntime()) {
    const candidates = getTrendyolImageFallbackUrls(recovered, preferredTyFolders).slice(0, 6);
    for (const candidate of candidates) {
      if (await probeImageUrl(candidate)) return candidate;
    }
    // Local probe başarısız olsa bile gerçek ürün galerisi URL'sini tamamen kaybetme.
    // MARKT-GO tarafı URL'yi kendi ortamından tekrar deneyebilir.
    return recovered;
  }

  // Railway/datacenter ortamında Trendyol CDN probe'u güvenilir değil. Daha iyi bir
  // kardeş ty klasörü bulunduysa onu kullan; bulunmadıysa geçerli kaynak URL'yi koru.
  return recovered;
}

/** Normalize, dedupe, and keep usable image URLs for MARKT-GO. */
export async function prepareMarktGoImages(
  raw: unknown,
  limit = MAX_IMAGES,
): Promise<string[]> {
  const rawList = Array.isArray(raw) ? raw : [];
  const filtered = filterValidProductImages(rawList);
  const direct = directImageUrls(rawList);
  const preferredTy = collectTrendyolTyFolders(filtered).filter(
    (ty) => !/^ty(1660|1000|1505)$/i.test(ty),
  );
  const rankedStrict = prioritizeProductImagesForPreview(filtered).map((url) =>
    recoverWithPreferredTy(url, preferredTy),
  );
  // Sıkı Trendyol galerisi sıralaması öncelikli; ardından ürün verisindeki orijinal
  // doğrudan URL'leri koru. Böylece yeni CDN path'leri filtre yüzünden kaybolmaz.
  const ranked = [...new Set([...rankedStrict, ...direct])];

  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const url of ranked) {
    if (resolved.length >= limit) break;
    let finalUrl = url;
    if (LOW_TY_RE.test(url)) {
      const fixed = await resolveSuspiciousUrl(url, preferredTy);
      if (!fixed) continue;
      finalUrl = fixed;
    }
    const key = imageIdentityKey(finalUrl);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(finalUrl);
    const ty = finalUrl.match(/\/(ty\d+)\//i)?.[1];
    if (ty && !preferredTy.some((t) => t.toLowerCase() === ty.toLowerCase())) {
      preferredTy.unshift(ty);
    }
  }

  // Son güvenlik: filtre gerçek ürün görseli bulduysa sırf ty klasörü şüpheli diye
  // ürünü görselsiz göndermeyelim. Önce normal URL'ler, sonra düşük öncelikli ty URL'leri.
  if (!resolved.length && ranked.length) {
    const fallbackRanked = [
      ...ranked.filter((url) => !LOW_TY_RE.test(url)),
      ...ranked.filter((url) => LOW_TY_RE.test(url)),
    ];
    for (const url of fallbackRanked) {
      if (resolved.length >= limit) break;
      const key = imageIdentityKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(url);
    }
  }

  return resolved;
}