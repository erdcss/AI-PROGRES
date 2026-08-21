/**
 * Prepare Trendyol/CDN image URLs for MARKT-GO product payloads.
 *
 * Offline-first: prefer real ty folders and drop known-bad rewrites without
 * probing CDN (Railway/datacenter IPs often cannot reach cdn.dsmcdn.com).
 * Optional light probe only for remaining low-quality ty URLs when enabled.
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
    return null;
  }
  // Cloud: never block sync on CDN probes — return best offline guess.
  if (LOW_TY_RE.test(recovered)) return null;
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

  // Absolute fallback: any non-rewrite URL still unused
  if (!resolved.length) {
    for (const url of ranked) {
      if (resolved.length >= limit) break;
      if (LOW_TY_RE.test(url)) continue;
      const key = imageIdentityKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(url);
    }
  }

  return resolved;
}
