/**
 * Trendyol ürün sayfası breadcrumb (kategori yolu) çıkarımı.
 * "Trendyol" / Ana Sayfa gibi gürültü segmentler elenir.
 */

const SKIP_SEGMENT_RE =
  /^(trendyol|ana\s*sayfa|home|anasayfa|t[uü]m\s*kategoriler)$/i;

function decodeHtmlEntities(text: string): string {
  return String(text || "")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeSegment(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/\s+/g, " ")
    .replace(/^[\s›>/\-–—|]+|[\s›>/\-–—|]+$/g, "")
    .trim();
}

function isNoiseSegment(segment: string, opts?: { title?: string; brand?: string }): boolean {
  const s = normalizeSegment(segment);
  if (!s || s.length < 2) return true;
  if (SKIP_SEGMENT_RE.test(s)) return true;
  if (/trendyol/i.test(s)) return true;
  if (s.length > 80) return true;

  const title = normalizeSegment(opts?.title || "");
  if (title && title.length >= 12) {
    const a = s.toLocaleLowerCase("tr-TR");
    const b = title.toLocaleLowerCase("tr-TR");
    if (a === b) return true;
    if (a.length > 24 && (b.includes(a) || a.includes(b.slice(0, Math.min(40, b.length))))) {
      return true;
    }
  }
  return false;
}

/** JSON-LD BreadcrumbList itemListElement name listesi */
function extractFromJsonLd(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const type = String(node?.["@type"] || "");
        if (!/BreadcrumbList/i.test(type)) continue;
        const items = Array.isArray(node.itemListElement) ? node.itemListElement : [];
        for (const item of items) {
          const name =
            item?.name ||
            item?.item?.name ||
            (typeof item?.item === "string" ? "" : item?.item?.["@name"]);
          const n = normalizeSegment(String(name || ""));
          if (n) out.push(n);
        }
      }
    } catch {
      /* ignore bad json-ld */
    }
  }
  return out;
}

/** DOM / HTML regex breadcrumb linkleri */
function extractFromHtmlAnchors(html: string): string[] {
  const out: string[] = [];
  const blocks: string[] = [];

  const navRe =
    /<(?:nav|div|ol|ul)[^>]*(?:breadcrumb|product-detail-breadcrumb|category-path)[^>]*>([\s\S]*?)<\/(?:nav|div|ol|ul)>/gi;
  let bm: RegExpExecArray | null;
  while ((bm = navRe.exec(html))) {
    if (bm[1]) blocks.push(bm[1]);
  }
  if (!blocks.length) {
    // Geniş fallback: aria-label breadcrumb
    const aria = html.match(
      /<nav[^>]*aria-label=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i,
    );
    if (aria?.[1]) blocks.push(aria[1]);
  }

  const source = blocks.length ? blocks.join("\n") : html.slice(0, 200_000);
  const linkRe = /<(?:a|span|li)[^>]*>([\s\S]*?)<\/(?:a|span|li)>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(source))) {
    const text = normalizeSegment(String(lm[1] || "").replace(/<[^>]+>/g, " "));
    if (!text || text === ">" || text === "›") continue;
    if (text.length === 1 && /[›>]/.test(text)) continue;
    out.push(text);
  }
  return out;
}

/**
 * Ham segment listesini temizler: Trendyol / Ana Sayfa / ürün başlığı elenir.
 */
export function cleanTrendyolCategoryPath(
  segments: string[],
  opts?: { title?: string; brand?: string },
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of segments) {
    const s = normalizeSegment(raw);
    if (isNoiseSegment(s, opts)) continue;
    const key = s.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * HTML'den Trendyol kategori yolu (breadcrumb) çıkarır.
 */
export function extractTrendyolCategoryPath(
  html: string,
  opts?: { title?: string; brand?: string },
): string[] {
  if (!html || html.length < 200) return [];
  const fromLd = extractFromJsonLd(html);
  const fromDom = extractFromHtmlAnchors(html);
  // JSON-LD genelde daha temiz; yoksa DOM
  const preferred = fromLd.length >= 2 ? fromLd : fromDom.length ? fromDom : fromLd;
  return cleanTrendyolCategoryPath(preferred, opts);
}
