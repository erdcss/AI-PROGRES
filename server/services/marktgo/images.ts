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
  const filtered = filterValidProductImages(Array.isArray(raw) ? raw : []);
  const preferredTy = collectTrendyolTyFolders(filtered).filter(
    (ty) => !/^ty(1660|1000|1505)$/i.test(ty),
  );
  const ranked = prioritizeProductImagesForPreview(filtered).map((url) =>
    recoverWithPreferredTy(url, preferredTy),
  );

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