const CDN_HOSTS = ["cdn.dsmcdn.com", "cdn.trendyol.com"];

function extractRawImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["url", "src", "imageUrl", "image", "href"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return null;
}

export function optimizeTrendyolImageUrl(url: string): string | null {
  if (!url) return null;

  let optimized = url.trim();
  if (optimized.startsWith("//")) {
    optimized = `https:${optimized}`;
  }

  if (!optimized.startsWith("http")) return null;
  if (!CDN_HOSTS.some((host) => optimized.includes(host))) return null;

  const exclude = ["/ui/", "/icon", "/logo", "/footer", "/brand/", "/web/", ".svg"];
  if (exclude.some((pattern) => optimized.includes(pattern))) return null;

  optimized = optimized.replace(/^http:/, "https:");
  optimized = optimized.replace(/mnresize\/\d+\/\d+\//, "mnresize/1200/1800/");

  return optimized;
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

export function mergeTrendyolImageLists(...lists: unknown[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const url of normalizeTrendyolImages(list)) {
      if (seen.has(url)) continue;
      seen.add(url);
      merged.push(url);
    }
  }

  return merged;
}
