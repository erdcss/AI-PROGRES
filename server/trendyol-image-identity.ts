/**
 * Trendyol görsel URL'lerini tekil medya kimliğine indirger.
 */

export type TrendyolImageIdentity = {
  identity: string;
  normalizedUrl: string;
  widthHint: number;
  isResized: boolean;
  shard: string | null;
};

const QC_PATH_RE =
  /\/(?:prod\/QC(?:_PREP|_ENRICHMENT)?\/[^/]+\/[^/]+\/[^/]+|product\/media\/images\/[^/]+\/[^/]+\/[^/]+)\/([^/?#]+)/i;

export function normalizeTrendyolImageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    let path = u.pathname.replace(/\/mnresize\/\d+\/\d+\//i, "/");
    path = path.replace(/\/ty\d+\//i, "/ty/");
    u.pathname = path;
    return u.toString();
  } catch {
    return url.split("?")[0];
  }
}

export function extractTrendyolMediaIdentity(url: string): string | null {
  const normalized = normalizeTrendyolImageUrl(url);
  const qc = normalized.match(QC_PATH_RE);
  if (qc?.[1]) return `qc:${qc[1].toLowerCase()}`;

  const file = normalized.match(/\/([^/]+\.(?:jpg|jpeg|png|webp))$/i);
  if (file?.[1]) return `file:${file[1].toLowerCase()}`;

  const uuid = normalized.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  if (uuid?.[1]) return `uuid:${uuid[1].toLowerCase()}`;

  return null;
}

export function parseTrendyolImageMeta(url: string): TrendyolImageIdentity {
  const identity = extractTrendyolMediaIdentity(url) || url;
  const resize = url.match(/\/mnresize\/(\d+)\/(\d+)\//i);
  const shard = url.match(/\/ty(\d+)\//i)?.[1] ?? null;
  return {
    identity,
    normalizedUrl: normalizeTrendyolImageUrl(url),
    widthHint: resize ? Math.max(Number(resize[1]), Number(resize[2])) : 2000,
    isResized: Boolean(resize),
    shard,
  };
}

export type DedupedTrendyolImage = {
  url: string;
  identity: string;
  source: string;
  verified: boolean;
};

/** Aynı medya kimliği için en yüksek çözünürlüklü URL'yi seç */
export function dedupeTrendyolImages(
  urls: string[],
  source = "scrape",
): DedupedTrendyolImage[] {
  const best = new Map<string, { url: string; widthHint: number }>();

  for (const raw of urls) {
    if (!raw?.startsWith("http")) continue;
    const meta = parseTrendyolImageMeta(raw);
    const existing = best.get(meta.identity);
    if (!existing || meta.widthHint > existing.widthHint) {
      best.set(meta.identity, { url: raw, widthHint: meta.widthHint });
    }
  }

  return [...best.entries()].map(([identity, v]) => ({
    url: v.url,
    identity,
    source,
    verified: true,
  }));
}
