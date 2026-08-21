/**
 * Prepare Trendyol/CDN image URLs for MARKT-GO product payloads.
 * Drops unreachable URLs and recovers broken /tyXXXX/ rewrites when possible.
 */
import {
  collectTrendyolTyFolders,
  filterValidProductImages,
  getTrendyolImageFallbackUrls,
  prioritizeProductImagesForPreview,
} from "@shared/trendyol-product-images";

const MIN_BYTES = 512;
const PROBE_TIMEOUT_MS = 3_500;
const MAX_IMAGES = 12;

function imageIdentityKey(url: string): string {
  return url
    .replace(/mnresize\/\d+\/\d+\//, "")
    .replace(/\/ty\d+\//i, "/")
    .split("?")[0]
    .toLowerCase();
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

async function resolveWorkingUrl(
  url: string,
  preferredTyFolders: string[],
): Promise<string | null> {
  const candidates = getTrendyolImageFallbackUrls(url, preferredTyFolders);
  for (const candidate of candidates.slice(0, 12)) {
    if (await probeImageUrl(candidate)) return candidate;
  }
  return null;
}

/** Normalize, dedupe, and keep only reachable image URLs for MARKT-GO. */
export async function prepareMarktGoImages(
  raw: unknown,
  limit = MAX_IMAGES,
): Promise<string[]> {
  const filtered = filterValidProductImages(Array.isArray(raw) ? raw : []);
  // Collect ty folders from the full raw list BEFORE identity-dedupe, otherwise
  // a leading ty1660 rewrite can hide the real folder needed for recovery.
  const preferredTy = collectTrendyolTyFolders(filtered).filter(
    (ty) => !/^ty(1660|1000|1505)$/i.test(ty),
  );
  const ranked = prioritizeProductImagesForPreview(filtered);
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const url of ranked) {
    if (resolved.length >= limit) break;
    const working = await resolveWorkingUrl(url, preferredTy);
    if (!working) continue;
    const key = imageIdentityKey(working);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(working);
    const ty = working.match(/\/(ty\d+)\//i)?.[1];
    if (ty && !preferredTy.some((t) => t.toLowerCase() === ty.toLowerCase())) {
      preferredTy.unshift(ty);
    }
  }

  // Last resort: only keep non-rewrite URLs if probes failed entirely.
  if (!resolved.length && ranked.length) {
    for (const url of ranked) {
      if (resolved.length >= limit) break;
      if (/\/ty(1660|1000|1505)\//i.test(url)) continue;
      const key = imageIdentityKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(url);
    }
  }

  return resolved;
}
