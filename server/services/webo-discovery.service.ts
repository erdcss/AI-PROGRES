/**
 * Webo otomatik keşif — desteklenen siteleri ara ara tarar,
 * Shopify'da olmayan yeni ürünleri webo kuyruğuna yazar.
 */
import * as cheerio from "cheerio";
import { WEB_HOOK_SITES, buildWebHookProductUrlRegex, isWebHookProductUrl, type WebHookSite } from "@shared/web-hooks-sites";
import {
  appendWeboEvent,
  normalizeMediaUrl,
  purgeWeboAlreadyOnShopify,
  repairIncompleteWeboProducts,
  upsertWeboProduct,
} from "./webo.service";

export type DiscoveryCandidate = {
  sourceUrl: string;
  title: string;
  price?: number | null;
  salePrice?: number | null;
  imageUrl?: string | null;
  images?: string[];
  brand?: string | null;
  sku?: string | null;
};

type DiscoveryState = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastSummary: {
    sitesScanned: number;
    found: number;
    ingested: number;
    skippedShopify: number;
    errors: number;
  } | null;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const state: DiscoveryState = {
  enabled: true,
  running: false,
  intervalMs: 30 * 60 * 1000, // 30 dk
  lastRunAt: null,
  nextRunAt: null,
  lastError: null,
  lastSummary: null,
};

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

export function getWeboDiscoveryStatus(): DiscoveryState {
  return { ...state, lastSummary: state.lastSummary ? { ...state.lastSummary } : null };
}

function parsePrice(raw: string): number | null {
  const cleaned = String(raw || "")
    .replace(/[^\d.,]/g, "")
    .trim();
  if (!cleaned) return null;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const n = Number.parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (cleaned.includes(",")) {
    const n = Number.parseFloat(cleaned.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const n = Number.parseFloat(cleaned.replace(/\./g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchDiscoveryHtml(url: string, site: WebHookSite): Promise<string> {
  const { fetchMarketplaceListingHtml } = await import("../product-pool/scrape");
  return fetchMarketplaceListingHtml(url, site.id);
}

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function slugTitleFromUrl(sourceUrl: string): string {
  const slug = sourceUrl.split("/").pop()?.split("?")[0] || "";
  return slug.replace(/[-_+.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function pushCandidate(
  map: Map<string, DiscoveryCandidate>,
  site: WebHookSite,
  rawUrl: string,
  title?: string | null,
  price?: number | null,
  imageUrl?: string | null,
): void {
  const clean = String(rawUrl || "").trim().split("?")[0].replace(/["'<>]/g, "");
  if (!clean || map.has(clean)) return;
  if (!isWebHookProductUrl(clean, site)) return;
  const t = String(title || "").trim() || slugTitleFromUrl(clean);
  if (t.length < 3) return;
  map.set(clean, {
    sourceUrl: clean,
    title: t.slice(0, 200),
    price: price ?? null,
    salePrice: price ?? null,
    imageUrl: imageUrl ?? null,
  });
}

function walkJsonForProducts(
  obj: unknown,
  site: WebHookSite,
  map: Map<string, DiscoveryCandidate>,
  depth = 0,
): void {
  if (!obj || depth > 12) return;
  if (Array.isArray(obj)) {
    for (const item of obj) walkJsonForProducts(item, site, map, depth + 1);
    return;
  }
  if (typeof obj !== "object") return;
  const rec = obj as Record<string, unknown>;

  const urlKeys = ["url", "productUrl", "link", "href", "webUrl", "pdpUrl", "detailUrl"];
  const titleKeys = ["name", "title", "productName", "displayName", "label"];
  let foundUrl = "";
  for (const k of urlKeys) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 8) {
      foundUrl = v;
      break;
    }
  }
  if (foundUrl) {
    const abs = foundUrl.startsWith("http")
      ? foundUrl
      : absoluteUrl(`https://www.${site.domain}`, foundUrl);
    let title = "";
    for (const k of titleKeys) {
      const v = rec[k];
      if (typeof v === "string" && v.trim().length >= 3) {
        title = v.trim();
        break;
      }
    }
    const priceRaw = rec.price ?? rec.salePrice ?? rec.listPrice;
    let price: number | null = null;
    if (typeof priceRaw === "number" && priceRaw > 0) price = priceRaw;
    else if (typeof priceRaw === "object" && priceRaw) {
      const p = priceRaw as Record<string, unknown>;
      const n = Number(p.sellingPrice ?? p.value ?? p.amount);
      if (n > 0) price = n;
    }
    const img =
      rec.imageUrl ??
      rec.image ??
      (Array.isArray(rec.images) ? rec.images[0] : null);
    pushCandidate(
      map,
      site,
      abs,
      title,
      price,
      typeof img === "string" ? normalizeMediaUrl(img, abs) : null,
    );
  }

  for (const v of Object.values(rec)) {
    walkJsonForProducts(v, site, map, depth + 1);
  }
}

function discoverFromEmbeddedJson(
  html: string,
  site: WebHookSite,
  pageUrl: string,
): DiscoveryCandidate[] {
  const map = new Map<string, DiscoveryCandidate>();

  const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch?.[1]) {
    try {
      walkJsonForProducts(JSON.parse(nextMatch[1]), site, map);
    } catch {
      /* ignore */
    }
  }

  const ldMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m[1]);
      walkJsonForProducts(data, site, map);
    } catch {
      /* ignore */
    }
  }

  const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i);
  if (stateMatch?.[1]) {
    try {
      walkJsonForProducts(JSON.parse(stateMatch[1]), site, map);
    } catch {
      /* ignore */
    }
  }

  return [...map.values()].slice(0, 40);
}

function discoverFromRegex(html: string, site: WebHookSite): DiscoveryCandidate[] {
  const map = new Map<string, DiscoveryCandidate>();
  const re = buildWebHookProductUrlRegex(site);
  if (!re) return [];
  const matches = html.match(re) || [];
  for (const raw of matches) {
    pushCandidate(map, site, raw);
    if (map.size >= 40) break;
  }
  return [...map.values()];
}

/** Trendyol infinite-scroll JSON (hafif) */
async function discoverTrendyolApi(): Promise<DiscoveryCandidate[]> {
  const urls = [
    "https://apigw.trendyol.com/discovery-web-searchgw-service/v2/api/infiniteScroll/sr?q=yeni&culture=tr-TR&channelId=1&storefrontId=1&pi=1",
    "https://apigw.trendyol.com/discovery-web-searchgw-service/v2/api/infiniteScroll/sr?wg=1&wc=82&culture=tr-TR&channelId=1&storefrontId=1&pi=1",
  ];
  const out: DiscoveryCandidate[] = [];
  for (const apiUrl of urls) {
    try {
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Accept-Language": "tr-TR",
        },
        signal: AbortSignal.timeout(18_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        result?: {
          products?: Array<{
            url?: string;
            name?: string;
            imageUrl?: string;
            images?: string[];
            price?: { sellingPrice?: number; originalPrice?: number };
            brand?: { name?: string };
          }>;
        };
      };
      const products = data?.result?.products || [];
      for (const p of products.slice(0, 24)) {
        const path = String(p.url || "").trim();
        if (!path) continue;
        const sourceUrl = path.startsWith("http")
          ? path
          : `https://www.trendyol.com${path.startsWith("/") ? "" : "/"}${path}`;
        const title = String(p.name || "").trim();
        if (!title) continue;
        const sale = Number(p.price?.sellingPrice) || null;
        const original = Number(p.price?.originalPrice) || sale;
        const rawImg = p.imageUrl || p.images?.[0] || null;
        const imageUrl = normalizeMediaUrl(rawImg) || null;
        out.push({
          sourceUrl,
          title,
          price: original,
          salePrice: sale,
          imageUrl,
          brand: p.brand?.name || null,
        });
      }
    } catch {
      /* try next */
    }
  }
  return out;
}

function getSiteDiscoverUrls(site: WebHookSite): string[] {
  const urls = new Set<string>();
  if (site.discoverUrl) urls.add(site.discoverUrl);
  if (site.url) urls.add(site.url);
  for (const u of site.discoverUrls || []) {
    if (u) urls.add(u);
  }
  return [...urls];
}

function pickImgFromEl(
  $: cheerio.CheerioAPI,
  el: cheerio.Element,
  pageUrl: string,
): string | null {
  const node = $(el);
  const attrs = ["src", "data-src", "data-lazy-src", "data-original", "data-zoom-image", "data-image"];
  for (const attr of attrs) {
    const v = node.attr(attr);
    if (v) {
      const n = normalizeMediaUrl(v, pageUrl);
      if (n) return n;
    }
  }
  const srcset = node.attr("srcset") || node.attr("data-srcset");
  if (srcset) {
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    const n = normalizeMediaUrl(first, pageUrl);
    if (n) return n;
  }
  return null;
}

function parseListingHtml(site: WebHookSite, html: string, pageUrl: string): DiscoveryCandidate[] {
  const $ = cheerio.load(html);
  const map = new Map<string, DiscoveryCandidate>();

  for (const c of discoverFromEmbeddedJson(html, site, pageUrl)) {
    map.set(c.sourceUrl, c);
  }

  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    const sourceUrl = absoluteUrl(pageUrl, href).split("?")[0];
    if (!isWebHookProductUrl(sourceUrl, site) || map.has(sourceUrl)) return;

    let title =
      String($(el).attr("title") || "").trim() ||
      String($(el).find("img").attr("alt") || "").trim() ||
      $(el).text().replace(/\s+/g, " ").trim();
    if (title.length < 4) {
      const card = $(el).closest(
        "[class*='product'],[class*='Product'],[data-testid*='product'],li,article",
      );
      title =
        String(card.find("img").attr("alt") || "").trim() ||
        card.find("h2,h3,[class*='title'],[class*='name']").first().text().replace(/\s+/g, " ").trim() ||
        slugTitleFromUrl(sourceUrl);
    }
    if (title.length < 3 || title.length > 220) return;

    const card = $(el).closest(
      "[class*='product'],[class*='Product'],[data-testid*='product'],li,article,div",
    );
    const img =
      pickImgFromEl($, $(el).find("img").get(0) || el, pageUrl) ||
      pickImgFromEl($, card.find("img").get(0) || el, pageUrl);
    const priceText = card
      .find("[class*='price'],[class*='Price'],[data-testid*='price']")
      .first()
      .text();
    const price = parsePrice(priceText);

    map.set(sourceUrl, {
      sourceUrl,
      title: title.slice(0, 200),
      price,
      salePrice: price,
      imageUrl: img,
    });
  });

  for (const c of discoverFromRegex(html, site)) {
    if (!map.has(c.sourceUrl)) map.set(c.sourceUrl, c);
  }

  return [...map.values()].slice(0, 50);
}

async function discoverFromListingHtml(site: WebHookSite, pageUrl: string): Promise<DiscoveryCandidate[]> {
  const html = await fetchDiscoveryHtml(pageUrl, site);
  return parseListingHtml(site, html, pageUrl);
}

async function discoverSite(site: WebHookSite): Promise<{
  candidates: DiscoveryCandidate[];
  error?: string;
}> {
  const map = new Map<string, DiscoveryCandidate>();
  const errors: string[] = [];

  if (site.id === "trendyol") {
    try {
      const api = await discoverTrendyolApi();
      for (const c of api) map.set(c.sourceUrl, c);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  for (const pageUrl of getSiteDiscoverUrls(site)) {
    try {
      const found = await discoverFromListingHtml(site, pageUrl);
      for (const c of found) {
        if (!map.has(c.sourceUrl)) map.set(c.sourceUrl, c);
      }
    } catch (err) {
      errors.push(`${pageUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const candidates = [...map.values()].slice(0, 50);
  if (!candidates.length && errors.length) {
    return { candidates: [], error: errors[0] };
  }
  return { candidates };
}

function needsEnrich(candidate: DiscoveryCandidate): boolean {
  const hasPrice = Number(candidate.salePrice || candidate.price || 0) > 0;
  const hasImage = Boolean(candidate.imageUrl || candidate.images?.length);
  return !hasPrice || !hasImage;
}

async function enrichTrendyol(candidate: DiscoveryCandidate): Promise<DiscoveryCandidate | null> {
  try {
    const { scrapeWithEnhancedMethod } = await import("../enhanced-trendyol-scraper");
    const scraped = await scrapeWithEnhancedMethod(candidate.sourceUrl);
    if (!scraped) return null;
    const images = (scraped.images || []).filter((u) => u?.startsWith("http"));
    const imageUrl = normalizeMediaUrl(images[0], candidate.sourceUrl) || candidate.imageUrl;
    const salePrice = Number(scraped.price) > 0 ? Number(scraped.price) : null;
    return {
      sourceUrl: candidate.sourceUrl,
      title: scraped.title || candidate.title,
      price: salePrice,
      salePrice,
      imageUrl,
      images,
      brand: scraped.brand || candidate.brand,
    };
  } catch {
    return null;
  }
}

async function enrichCandidate(candidate: DiscoveryCandidate): Promise<DiscoveryCandidate> {
  const host = (() => {
    try {
      return new URL(candidate.sourceUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (host.includes("trendyol.com")) {
    const trendyol = await enrichTrendyol(candidate);
    if (trendyol && (trendyol.imageUrl || trendyol.salePrice)) return trendyol;
  }

  try {
    const { scrapeProductPoolUrl } = await import("../product-pool/scrape");
    const scraped = await scrapeProductPoolUrl(candidate.sourceUrl);
    const images = Array.isArray(scraped.images) ? scraped.images : [];
    const imageUrl =
      normalizeMediaUrl(images[0], candidate.sourceUrl) ||
      normalizeMediaUrl(candidate.imageUrl, candidate.sourceUrl);
    return {
      sourceUrl: scraped.sourceUrl || candidate.sourceUrl,
      title: scraped.title || candidate.title,
      price: scraped.price ?? candidate.price,
      salePrice: scraped.salePrice ?? scraped.price ?? candidate.salePrice,
      imageUrl,
      brand: scraped.brand ?? candidate.brand,
      sku: scraped.sku ?? undefined,
      images,
    };
  } catch {
    return candidate;
  }
}

async function ingestCandidates(
  site: WebHookSite,
  candidates: DiscoveryCandidate[],
  enrich: boolean,
): Promise<{ ingested: number; skippedShopify: number }> {
  let ingested = 0;
  let skippedShopify = 0;
  const concurrency = enrich ? 3 : 2;

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const prepared = await Promise.all(
      batch.map(async (c) => {
        if (enrich || needsEnrich(c)) return enrichCandidate(c);
        return c;
      }),
    );
    for (const candidate of prepared) {
      const row = await upsertWeboProduct({
        sourceUrl: candidate.sourceUrl,
        title: candidate.title,
        siteId: site.id,
        siteName: site.name,
        siteLogoUrl: site.logoUrl,
        price: candidate.price,
        salePrice: candidate.salePrice ?? candidate.price,
        imageUrl: candidate.imageUrl,
        images:
          candidate.images?.length
            ? candidate.images
            : candidate.imageUrl
              ? [candidate.imageUrl]
              : [],
        brand: candidate.brand,
        sku: candidate.sku,
        source: "discovery",
      });
      if (row?.skipped === "shopify") {
        skippedShopify += 1;
      } else if (row?.id) {
        ingested += 1;
      }
    }
  }
  return { ingested, skippedShopify };
}

async function scanOneSite(
  site: WebHookSite,
  enrich: boolean,
): Promise<{
  found: number;
  ingested: number;
  skippedShopify: number;
  error?: string;
}> {
  const { candidates, error } = await discoverSite(site);
  if (!candidates.length) {
    return { found: 0, ingested: 0, skippedShopify: 0, error };
  }
  const { ingested, skippedShopify } = await ingestCandidates(site, candidates, enrich);
  return { found: candidates.length, ingested, skippedShopify };
}

export async function runWeboDiscoveryCycle(
  reason = "scheduled",
  options?: { enrich?: boolean },
): Promise<DiscoveryState["lastSummary"]> {
  if (state.running) {
    await appendWeboEvent({
      level: "warn",
      message: "Keşif zaten çalışıyor — yeni tur atlandı",
      meta: { reason },
    });
    return state.lastSummary;
  }

  state.running = true;
  state.lastError = null;
  const summary = {
    sitesScanned: 0,
    found: 0,
    ingested: 0,
    skippedShopify: 0,
    errors: 0,
  };

  await appendWeboEvent({
    level: "info",
    message: `Keşif turu başladı (${reason})`,
    meta: { reason, sites: WEB_HOOK_SITES.length },
  });

  try {
    await purgeWeboAlreadyOnShopify();

    const enrich = Boolean(options?.enrich);
    for (const site of WEB_HOOK_SITES) {
      const result = await scanOneSite(site, enrich);
      summary.sitesScanned += 1;

      if (result.error && result.found === 0) {
        summary.errors += 1;
        await appendWeboEvent({
          level: "warn",
          siteId: site.id,
          siteName: site.name,
          message: `Tarama hatası: ${result.error}`,
        });
        continue;
      }

      summary.found += result.found;
      summary.ingested += result.ingested;
      summary.skippedShopify += result.skippedShopify;

      await appendWeboEvent({
        level: "ok",
        siteId: site.id,
        siteName: site.name,
        message: `${result.found} aday · ${result.ingested} yeni · ${result.skippedShopify} Shopify’da atlandı`,
        meta: {
          found: result.found,
          ingested: result.ingested,
          skippedShopify: result.skippedShopify,
        },
      });
    }

    const repaired = await repairIncompleteWeboProducts(40).catch(() => 0);
    if (repaired > 0) {
      await appendWeboEvent({
        level: "info",
        message: `${repaired} eksik görsel/fiyat ürün onarıldı`,
        meta: { repaired },
      });
    }

    state.lastSummary = summary;
    state.lastRunAt = new Date().toISOString();
    state.nextRunAt = new Date(Date.now() + state.intervalMs).toISOString();

    await appendWeboEvent({
      level: "ok",
      message: `Keşif bitti: ${summary.ingested} yeni, ${summary.skippedShopify} Shopify filtresi`,
      meta: summary,
    });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    summary.errors += 1;
    await appendWeboEvent({
      level: "error",
      message: `Keşif turu hata: ${state.lastError}`,
    });
  } finally {
    state.running = false;
  }

  return summary;
}

export function setWeboDiscoveryEnabled(enabled: boolean): void {
  state.enabled = Boolean(enabled);
  if (state.enabled) {
    ensureWeboDiscoveryScheduler();
    state.nextRunAt = new Date(Date.now() + state.intervalMs).toISOString();
  } else if (timer) {
    clearInterval(timer);
    timer = null;
    started = false;
    state.nextRunAt = null;
  }
  void appendWeboEvent({
    level: "info",
    message: state.enabled ? "Otomatik keşif açıldı" : "Otomatik keşif durduruldu",
  });
}

export function ensureWeboDiscoveryScheduler(): void {
  if (!state.enabled) return;
  if (started && timer) return;
  started = true;
  state.nextRunAt = new Date(Date.now() + 45_000).toISOString();

  // İlk tur kısa gecikmeyle
  setTimeout(() => {
    if (!state.enabled) return;
    void runWeboDiscoveryCycle("boot");
  }, 45_000);

  timer = setInterval(() => {
    if (!state.enabled || state.running) return;
    void runWeboDiscoveryCycle("scheduled");
  }, state.intervalMs);

  if (typeof (timer as NodeJS.Timeout).unref === "function") {
    (timer as NodeJS.Timeout).unref();
  }

  console.log(
    `🔎 Webo keşif zamanlayıcısı aktif (her ${Math.round(state.intervalMs / 60000)} dk)`,
  );
}
