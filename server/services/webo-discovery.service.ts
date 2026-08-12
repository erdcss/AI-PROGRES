/**
 * Webo otomatik keşif — desteklenen siteleri ara ara tarar,
 * Shopify'da olmayan yeni ürünleri webo kuyruğuna yazar.
 */
import * as cheerio from "cheerio";
import { WEB_HOOK_SITES, type WebHookSite } from "@shared/web-hooks-sites";
import {
  appendWeboEvent,
  purgeWeboAlreadyOnShopify,
  upsertWeboProduct,
} from "./webo.service";

export type DiscoveryCandidate = {
  sourceUrl: string;
  title: string;
  price?: number | null;
  salePrice?: number | null;
  imageUrl?: string | null;
  brand?: string | null;
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

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(22_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function looksLikeProductUrl(url: string, site: WebHookSite): boolean {
  const u = url.toLowerCase();
  if (!u.includes(site.domain)) return false;
  if (site.id === "trendyol") return /-\w*p-\d+/i.test(u) || /\/p-\d+/i.test(u);
  if (site.id === "amazon") return /\/dp\/[a-z0-9]{8,}/i.test(u) || /\/gp\/product\//i.test(u);
  if (site.id === "n11") return /\/urun\//i.test(u) || /-P\d+/i.test(u);
  if (site.id === "beymen") return /\/p-\d+/i.test(u) || /\/[a-z0-9-]+-\d+\.html/i.test(u);
  if (site.id === "pazarama") return /\/urun\//i.test(u) || /\/p\//i.test(u);
  if (site.id === "pttavm") return /\/urun\//i.test(u);
  if (site.id === "idefix") return /\/urun\//i.test(u) || /product/i.test(u);
  if (site.id === "hepegitim") return /\/urun\//i.test(u) || /product/i.test(u);
  return /\/(urun|product|p|dp)\//i.test(u);
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
        out.push({
          sourceUrl,
          title,
          price: original,
          salePrice: sale,
          imageUrl: p.imageUrl || p.images?.[0] || null,
          brand: p.brand?.name || null,
        });
      }
    } catch {
      /* try next */
    }
  }
  return out;
}

async function discoverFromListingHtml(site: WebHookSite): Promise<DiscoveryCandidate[]> {
  const pageUrl = site.discoverUrl || site.url;
  const html = await fetchHtml(pageUrl);
  const $ = cheerio.load(html);
  const map = new Map<string, DiscoveryCandidate>();

  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    const sourceUrl = absoluteUrl(pageUrl, href).split("?")[0];
    if (!looksLikeProductUrl(sourceUrl, site)) return;
    if (map.has(sourceUrl)) return;

    let title =
      String($(el).attr("title") || "").trim() ||
      String($(el).find("img").attr("alt") || "").trim() ||
      $(el).text().replace(/\s+/g, " ").trim();
    if (title.length < 6) {
      const card = $(el).closest(
        "[class*='product'],[class*='Product'],[data-testid*='product'],li,article",
      );
      title =
        String(card.find("img").attr("alt") || "").trim() ||
        card.find("h2,h3,[class*='title'],[class*='name']").first().text().replace(/\s+/g, " ").trim() ||
        title;
    }
    if (title.length < 6 || title.length > 220) return;

    const card = $(el).closest(
      "[class*='product'],[class*='Product'],[data-testid*='product'],li,article,div",
    );
    const img =
      $(el).find("img").attr("src") ||
      $(el).find("img").attr("data-src") ||
      card.find("img").attr("src") ||
      card.find("img").attr("data-src") ||
      null;
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
      imageUrl: img && String(img).startsWith("http") ? String(img) : null,
    });
  });

  return [...map.values()].slice(0, 30);
}

async function discoverSite(site: WebHookSite): Promise<{
  candidates: DiscoveryCandidate[];
  error?: string;
}> {
  try {
    if (site.id === "trendyol") {
      const api = await discoverTrendyolApi();
      if (api.length > 0) return { candidates: api };
    }
    const html = await discoverFromListingHtml(site);
    return { candidates: html };
  } catch (err) {
    return { candidates: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runWeboDiscoveryCycle(reason = "scheduled"): Promise<DiscoveryState["lastSummary"]> {
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

    for (const site of WEB_HOOK_SITES) {
      summary.sitesScanned += 1;
      const { candidates, error } = await discoverSite(site);
      if (error) {
        summary.errors += 1;
        await appendWeboEvent({
          level: "warn",
          siteId: site.id,
          siteName: site.name,
          message: `Tarama hatası: ${error}`,
        });
        continue;
      }

      summary.found += candidates.length;
      let siteIngested = 0;
      let siteSkipped = 0;

      for (const c of candidates) {
        const row = await upsertWeboProduct({
          sourceUrl: c.sourceUrl,
          title: c.title,
          siteName: site.name,
          siteLogoUrl: site.logoUrl,
          price: c.price,
          salePrice: c.salePrice ?? c.price,
          imageUrl: c.imageUrl,
          images: c.imageUrl ? [c.imageUrl] : [],
          brand: c.brand,
          source: "discovery",
        });
        if (row?.skipped === "shopify") {
          siteSkipped += 1;
          summary.skippedShopify += 1;
        } else if (row?.id) {
          siteIngested += 1;
          summary.ingested += 1;
        }
      }

      await appendWeboEvent({
        level: "ok",
        siteId: site.id,
        siteName: site.name,
        message: `${candidates.length} aday · ${siteIngested} yeni · ${siteSkipped} Shopify’da atlandı`,
        meta: { found: candidates.length, ingested: siteIngested, skippedShopify: siteSkipped },
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
