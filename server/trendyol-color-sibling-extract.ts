/**
 * Trendyol renk kardeş adayı çıkarma (browser-worker + server ortak, ağır bağımlılık yok).
 */

import { extractTrendyolProductId } from "./trendyol-title-utils";

// Canlı Trendyol ürünlerinde 12'den fazla (örn. ORZUQLIFE: 14) renk bulunabiliyor.
export const COLOR_FAMILY_MAX_MEMBERS = 20;
export const COLOR_FAMILY_MEMBER_TIMEOUT_MS = 20_000;
export const COLOR_FAMILY_MEMBER_HYDRATION_TIMEOUT_MS = 12_000;
export const COLOR_FAMILY_TOTAL_DEADLINE_MS = 45_000;
export const COLOR_FAMILY_CONCURRENCY = 2;

export type TrendyolColorSiblingCandidate = {
  productId: string;
  url: string;
  color?: string;
  image?: string;
  images?: string[];
  inStock?: boolean;
  source?: string;
};

const TRENDYOL_HOST_RE = /(^|\.)trendyol\.com$/i;
const PRODUCT_ID_RE = /p-(\d{5,})/i;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function pickProductId(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const digits = String(v).replace(/\D/g, "");
    if (digits.length >= 5) return digits;
  }
  return null;
}

function collectImageUrls(raw: unknown): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === "string" && /^https?:\/\//i.test(u.trim())) {
      out.push(u.trim().split("?")[0]);
      return;
    }
    const rec = asRecord(u);
    if (!rec) return;
    const url = pickString(rec.url, rec.src, rec.contentUrl, rec.imageUrl, rec.thumbnail);
    if (url && /^https?:\/\//i.test(url)) out.push(url.split("?")[0]);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else {
    push(raw);
  }
  return [...new Set(out)];
}

/** Yalnızca trendyol.com ürün URL'lerini kabul eder; p-{id} zorunlu. */
export function normalizeColorSiblingUrl(raw: string): { url: string; productId: string } | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const absolute = trimmed.startsWith("http")
      ? trimmed
      : `https://www.trendyol.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
    const u = new URL(absolute);
    if (!TRENDYOL_HOST_RE.test(u.hostname)) return null;
    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/+$/, "");
    const productId =
      extractTrendyolProductId(u.toString()) ||
      u.pathname.match(PRODUCT_ID_RE)?.[1] ||
      null;
    if (!productId) return null;
    return { url: u.toString(), productId };
  } catch {
    const m = trimmed.match(PRODUCT_ID_RE);
    if (!m) return null;
    return {
      url: `https://www.trendyol.com/x/x-p-${m[1]}`,
      productId: m[1],
    };
  }
}

function candidateFromNode(
  node: unknown,
  source: string,
): TrendyolColorSiblingCandidate | null {
  const rec = asRecord(node);
  if (!rec) {
    if (typeof node === "string") {
      const norm = normalizeColorSiblingUrl(node);
      if (!norm) return null;
      return { productId: norm.productId, url: norm.url, source };
    }
    return null;
  }

  const urlRaw = pickString(
    rec.url,
    rec.productUrl,
    rec.webUrl,
    rec.href,
    rec.link,
    rec.canonicalUrl,
    rec.contentUrl,
    rec.shareUrl,
    rec.redirectUrl,
    rec.targetUrl,
  );
  const productId =
    pickProductId(
      rec.productId,
      rec.contentId,
      rec.productContentId,
      rec.id,
      rec.listingId,
      rec.itemNumber,
      rec.contentNumber,
    ) || (urlRaw ? normalizeColorSiblingUrl(urlRaw)?.productId : null);

  if (!productId) return null;

  const norm = urlRaw
    ? normalizeColorSiblingUrl(urlRaw)
    : normalizeColorSiblingUrl(`https://www.trendyol.com/x/x-p-${productId}`);
  if (!norm) return null;

  const color = pickString(
    rec.color,
    rec.renk,
    rec.name,
    rec.attributeValue,
    rec.attributeBeautifiedValue,
    rec.value,
    rec.beautifiedValue,
    rec.text,
    rec.label,
  );
  const images = collectImageUrls(
    rec.images ?? rec.imageUrls ?? rec.image ?? rec.imageUrl ?? rec.thumbnail,
  );

  return {
    productId,
    url: norm.url,
    color: color || undefined,
    image: images[0],
    images: images.length ? images : undefined,
    inStock:
      rec.inStock === false || rec.available === false || rec.selectable === false
        ? false
        : rec.inStock === true || rec.available === true
          ? true
          : undefined,
    source,
  };
}

function walkColorContainers(root: unknown, source: string, out: TrendyolColorSiblingCandidate[]) {
  const rec = asRecord(root);
  if (!rec) return;

  const sliced = rec.slicedAttributes ?? rec.slicingAttributes;
  if (Array.isArray(sliced)) {
    for (const attr of sliced) {
      const a = asRecord(attr);
      if (!a) continue;
      const attrName = pickString(a.attributeName, a.name).toLowerCase();
      const attrType = pickString(a.attributeType, a.type).toLowerCase();
      const isColor =
        attrName === "renk" ||
        attrName === "color" ||
        attrType === "color" ||
        attrType === "colour" ||
        attrType === "1";
      if (!isColor) continue;
      const items = a.attributes ?? a.items ?? a.values ?? a.options;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const c = candidateFromNode(item, `${source}.slicedAttributes`);
        if (c) out.push(c);
      }
    }
  }

  for (const key of [
    "colorOptions",
    "otherColors",
    "otherColorVariants",
    "colorVariants",
    "variants",
    "otherMerchants",
  ]) {
    const arr = rec[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const c = candidateFromNode(item, `${source}.${key}`);
      if (c) out.push(c);
    }
  }

  const merchant = asRecord(rec.merchantListing) ?? asRecord(rec.listing);
  if (merchant) walkColorContainers(merchant, `${source}.merchantListing`, out);
}

export function extractColorSiblingCandidatesFromProduct(
  product: unknown,
  rootUrl?: string,
): TrendyolColorSiblingCandidate[] {
  const out: TrendyolColorSiblingCandidate[] = [];
  const root = asRecord(product);
  if (!root) return out;

  walkColorContainers(root, "product", out);

  const stateProduct = asRecord(root.product);
  if (stateProduct) walkColorContainers(stateProduct, "state.product", out);

  const merchantListing =
    asRecord(root.merchantListing) ?? asRecord(stateProduct?.merchantListing);
  if (merchantListing) walkColorContainers(merchantListing, "merchantListing", out);

  for (const key of ["url", "productUrl", "webUrl", "href", "link", "canonicalUrl"]) {
    const c = candidateFromNode({ url: root[key], ...root }, `product.${key}`);
    if (c) out.push(c);
  }

  if (rootUrl) {
    const norm = normalizeColorSiblingUrl(rootUrl);
    if (norm) {
      out.push({
        productId: norm.productId,
        url: norm.url,
        source: "rootUrl",
      });
    }
  }

  return out;
}

function scrubSwatchColorLabel(raw: string): string {
  return String(raw || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/^renk\s*:\s*/i, "")
    .replace(/popüler/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickColorFromAttrs(chunk: string): string {
  const aria = chunk.match(/aria-label=["']([^"']+)["']/i)?.[1];
  const title = chunk.match(/\btitle=["']([^"']+)["']/i)?.[1];
  const alt = chunk.match(/\balt=["']([^"']+)["']/i)?.[1];
  for (const c of [aria, title, alt]) {
    const scrubbed = scrubSwatchColorLabel(c || "");
    if (scrubbed && scrubbed.length <= 40 && !/sepete|favori|kupon/i.test(scrubbed)) {
      return scrubbed;
    }
  }
  const text = scrubSwatchColorLabel(
    chunk
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  );
  if (
    text &&
    text.length <= 40 &&
    !/sepete|favori|kupon|beden|tükendi|stok/i.test(text)
  ) {
    return text;
  }
  return "";
}

function pickImageFromChunk(chunk: string): string | undefined {
  const src =
    chunk.match(/<(?:img|source)[^>]*(?:src|data-src|srcset)=["']([^"']+)["']/i)?.[1] ||
    chunk.match(/(?:src|data-src)=["'](https?:\/\/[^"']*cdn\.dsmcdn\.com[^"']+)["']/i)?.[1];
  if (!src) return undefined;
  const first = src.split(",")[0]?.trim().split(/\s+/)[0];
  return first && /^https?:\/\//i.test(first) ? first.split("?")[0] : undefined;
}

export function extractColorSiblingCandidatesFromHtml(html: string): TrendyolColorSiblingCandidate[] {
  const out: TrendyolColorSiblingCandidate[] = [];
  if (!html || html.length < 50) return out;

  // Trendyol bazı sayfalarda renk kardeşlerini yalnızca ProductGroup JSON-LD
  // hasVariant listesinde yayınlıyor: color + sku + image + offers.url.
  const jsonLdScripts =
    html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of jsonLdScripts) {
    const body = script
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>\s*$/i, "")
      .trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body) as unknown;
      const stack: unknown[] = [parsed];
      const visited = new Set<object>();
      while (stack.length) {
        const current = stack.pop();
        if (Array.isArray(current)) {
          stack.push(...current);
          continue;
        }
        const rec = asRecord(current);
        if (!rec || visited.has(rec)) continue;
        visited.add(rec);

        const type = pickString(rec["@type"]);
        const offers = asRecord(rec.offers);
        const color = pickString(rec.color, rec.renk);
        const url = pickString(rec.url, offers?.url);
        if (/product/i.test(type) && color && (url || rec.sku)) {
          const candidate = candidateFromNode(
            {
              ...rec,
              url,
              productId: rec.productId ?? rec.contentId ?? rec.sku,
              color,
              images: rec.images ?? rec.image,
              inStock:
                typeof offers?.availability === "string"
                  ? !/outofstock|soldout/i.test(offers.availability)
                  : undefined,
            },
            "jsonld.hasVariant",
          );
          if (candidate) out.push(candidate);
        }

        for (const key of ["@graph", "hasVariant", "variant", "variants"]) {
          const child = rec[key];
          if (child != null) stack.push(child);
        }
      }
    } catch {
      // Bozuk/kaçışlı JSON-LD diğer HTML kaynaklarını engellemesin.
    }
  }

  // Renk swatch linkleri — mümkünse renk adı + thumbnail birlikte
  const blockPatterns = [
    /<a[^>]*(?:class|data-testid)=["'][^"']*(?:slicing|color|renk|Colour|Color)[^"']*["'][^>]*href=["']([^"']*p-\d{5,}[^"']*)["'][^>]*>([\s\S]{0,800}?)<\/a>/gi,
    /<a[^>]*href=["']([^"']*p-\d{5,}[^"']*)["'][^>]*(?:class|data-testid)=["'][^"']*(?:slicing|color|renk|Colour|Color)[^"']*["'][^>]*>([\s\S]{0,800}?)<\/a>/gi,
    /<a[^>]*href=["']([^"']*p-\d{5,}[^"']*)["'][^>]*aria-label=["'][^"']*(?:renk|color)[^"']*["'][^>]*>([\s\S]{0,800}?)<\/a>/gi,
  ];

  for (const re of blockPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const norm = normalizeColorSiblingUrl(m[1]);
      if (!norm) continue;
      const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
      const inner = m[2] || "";
      const color = pickColorFromAttrs(openTag) || pickColorFromAttrs(inner);
      const image = pickImageFromChunk(openTag + inner);
      out.push({
        productId: norm.productId,
        url: norm.url,
        color: color || undefined,
        image,
        images: image ? [image] : undefined,
        source: "dom.color-slicer",
      });
    }
  }

  // Fallback: sadece href (renk/görsel yok)
  const hrefOnly = [
    /<a[^>]*(?:class|data-testid)=["'][^"']*(?:slicing|color|renk|Colour|Color)[^"']*["'][^>]*href=["']([^"']*p-\d{5,}[^"']*)["'][^>]*>/gi,
    /<a[^>]*href=["']([^"']*p-\d{5,}[^"']*)["'][^>]*(?:class|data-testid)=["'][^"']*(?:slicing|color|renk|Colour|Color)[^"']*["'][^>]*>/gi,
  ];
  for (const re of hrefOnly) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const norm = normalizeColorSiblingUrl(m[1]);
      if (!norm) continue;
      out.push({ productId: norm.productId, url: norm.url, source: "dom.color-slicer" });
    }
  }

  // href yok — data-product-id / data-content-id / data-url üzerinde renk swatch
  const dataIdPatterns = [
    /<(?:div|button|span|li|a)[^>]*(?:class|data-testid)=["'][^"']*(?:slicing|color|renk|Colour|Color)[^"']*["'][^>]*(?:data-product-id|data-content-id|data-id)=["'](\d{5,})["'][^>]*>/gi,
    /<(?:div|button|span|li|a)[^>]*(?:data-product-id|data-content-id|data-id)=["'](\d{5,})["'][^>]*(?:class|data-testid)=["'][^"']*(?:slicing|color|renk|Colour|Color)[^"']*["'][^>]*>/gi,
  ];
  for (const re of dataIdPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const productId = m[1];
      const chunk = m[0];
      const color = pickColorFromAttrs(chunk);
      const image = pickImageFromChunk(chunk);
      out.push({
        productId,
        url: `https://www.trendyol.com/x/x-p-${productId}`,
        color: color || undefined,
        image,
        images: image ? [image] : undefined,
        source: "dom.data-product-id",
      });
    }
  }

  const dataUrlPatterns = [
    /<(?:div|button|span|li|a)[^>]*(?:class|data-testid)=["'][^"']*(?:slicing|color|renk)[^"']*["'][^>]*(?:data-url|data-href)=["']([^"']*p-\d{5,}[^"']*)["'][^>]*>/gi,
  ];
  for (const re of dataUrlPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const norm = normalizeColorSiblingUrl(m[1]);
      if (!norm) continue;
      const color = pickColorFromAttrs(m[0]);
      const image = pickImageFromChunk(m[0]);
      out.push({
        productId: norm.productId,
        url: norm.url,
        color: color || undefined,
        image,
        images: image ? [image] : undefined,
        source: "dom.data-url",
      });
    }
  }

  return out;
}

export function mergeColorSiblingCandidates(
  ...groups: TrendyolColorSiblingCandidate[][]
): TrendyolColorSiblingCandidate[] {
  const map = new Map<string, TrendyolColorSiblingCandidate>();

  for (const group of groups) {
    for (const c of group) {
      const norm = normalizeColorSiblingUrl(c.url);
      if (!norm) continue;
      const merged: TrendyolColorSiblingCandidate = {
        ...c,
        productId: norm.productId,
        url: norm.url,
      };
      const existing = map.get(norm.productId);
      if (!existing) {
        map.set(norm.productId, merged);
        continue;
      }

      // Kaynaklar tamamlayıcıdır: görsel-zengin BW adayı, isimli HTML/state
      // adayının rengini ezmemeli. Her alanı ayrı birleştir.
      const images = [
        ...new Set(
          [
            ...(existing.images ?? (existing.image ? [existing.image] : [])),
            ...(merged.images ?? (merged.image ? [merged.image] : [])),
          ].filter((u): u is string => Boolean(u)),
        ),
      ];
      const existingRealUrl = !existing.url.includes("/x/x-p-");
      const mergedRealUrl = !merged.url.includes("/x/x-p-");
      const source = [
        ...new Set([existing.source, merged.source].filter((s): s is string => Boolean(s))),
      ].join("+");
      map.set(norm.productId, {
        ...existing,
        ...merged,
        url: mergedRealUrl && !existingRealUrl ? merged.url : existing.url,
        color: existing.color || merged.color,
        image: images[0],
        images: images.length ? images : undefined,
        inStock:
          existing.inStock === false || merged.inStock === false
            ? false
            : existing.inStock === true || merged.inStock === true
              ? true
              : undefined,
        source: source || merged.source || existing.source,
      });
    }
  }

  return [...map.values()];
}

export function finalizeColorSiblingCandidateList(
  candidates: TrendyolColorSiblingCandidate[],
  rootUrl: string,
  max = COLOR_FAMILY_MAX_MEMBERS,
): TrendyolColorSiblingCandidate[] {
  const root = normalizeColorSiblingUrl(rootUrl);
  const withRoot = root
    ? mergeColorSiblingCandidates(candidates, [
        { productId: root.productId, url: root.url, source: "root" },
      ])
    : mergeColorSiblingCandidates(candidates);

  if (root) {
    const rootCand =
      withRoot.find((c) => c.productId === root.productId) ?? {
        productId: root.productId,
        url: root.url,
        source: "root",
      };
    const rest = withRoot.filter((c) => c.productId !== root.productId);
    // Root adayındaki renk/görsel bilgisini silme — finalize sadece sırayı korur
    return [rootCand, ...rest].slice(0, max);
  }
  return withRoot.slice(0, max);
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function resolveColorFamilyGroupId(raw: unknown): string | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const nested = asRecord(rec.product) ?? rec;
  const id = pickString(
    nested.productGroupId,
    nested.groupId,
    nested.contentGroupId,
    nested.productGroupID,
    rec.productGroupId,
    rec.groupId,
    rec.contentGroupId,
  );
  return id || undefined;
}

export function buildColorFamilyIdentity(input: {
  rootProductId: string;
  memberProductIds: string[];
  groupId?: string;
}): { familyId: string; familySourceKey: string; sourceAliases: string[] } {
  const ids = [
    ...new Set(
      [input.rootProductId, ...input.memberProductIds]
        .map((id) => String(id).replace(/\D/g, ""))
        .filter((id) => id.length >= 5),
    ),
  ].sort((a, b) => {
    const na = BigInt(a);
    const nb = BigInt(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  const sourceAliases = ids.map((id) => `trendyol:${id}`);
  if (input.groupId) {
    return {
      familyId: input.groupId,
      familySourceKey: `trendyol-group:${input.groupId}`,
      sourceAliases,
    };
  }
  const familyId = ids[0] || input.rootProductId;
  return {
    familyId,
    familySourceKey: `trendyol-group:${familyId}`,
    sourceAliases,
  };
}
