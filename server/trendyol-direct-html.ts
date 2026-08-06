/**
 * Trendyol doğrudan HTML — Puppeteer/cache gerektirmez.
 * Scenario scraper'ın çalışan axios fallback'i ile aynı strateji.
 * 429 / rate-limit: tespit + backoff + global throttle.
 */
import axios from "axios";
import { extractProductImagesFromHtmlRegex } from "@shared/trendyol-bot-detection";
import {
  isTrendyolRateLimitHtml,
  trendyolBackoffMs,
} from "@shared/trendyol-rate-limit";
import { trendyolAnti429Gate, withTrendyolRateLimit } from "./trendyol-anti-429";

const DIRECT_HEADERS: Record<string, string>[] = [
  {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9",
  },
  {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9",
  },
  {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Referer: "https://www.google.com/",
    "Accept-Language": "tr-TR,tr;q=0.9",
  },
  {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    Referer: "https://www.trendyol.com/",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
  },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function htmlHasProductData(html: string): boolean {
  if (!html || html.length < 5000) return false;
  if (isTrendyolRateLimitHtml(html)) return false;
  if (html.includes("__PRODUCT_DETAIL_APP_INITIAL_STATE__")) return true;
  if (html.includes("__NEXT_DATA__") && html.includes("cdn.dsmcdn.com")) return true;
  if (extractProductImagesFromHtmlRegex(html).length >= 1) return true;
  return (
    html.length > 40000 &&
    /cdn\.dsmcdn\.com\/ty\d+\/(?:prod|product|media)\//i.test(html)
  );
}

type FetchOutcome =
  | { ok: true; html: string }
  | { ok: false; rateLimited: boolean };

async function tryOneFetch(
  targetUrl: string,
  headers: Record<string, string>,
): Promise<FetchOutcome> {
  try {
    const response = await withTrendyolRateLimit("direct-html", () =>
      axios.get(targetUrl, {
        timeout: 20000,
        maxRedirects: 5,
        headers: { ...headers, "Cache-Control": "no-cache" },
        validateStatus: (s) => s < 500,
      }),
    );
    const html = String(response.data || "");
    if (response.status === 429 || isTrendyolRateLimitHtml(html)) {
      trendyolAnti429Gate.reportRateLimit(`direct-html-status-${response.status}`);
      return { ok: false, rateLimited: true };
    }
    if (response.status === 403) return { ok: false, rateLimited: false };
    if (htmlHasProductData(html)) {
      trendyolAnti429Gate.reportSuccess();
      return { ok: true, html };
    }
    return { ok: false, rateLimited: false };
  } catch {
    return { ok: false, rateLimited: false };
  }
}

async function tryScenarioExactFetch(url: string): Promise<FetchOutcome> {
  try {
    const response = await withTrendyolRateLimit("direct-html-exact", () =>
      axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
      }),
    );
    const html = String(response.data || "");
    if (response.status === 429 || isTrendyolRateLimitHtml(html)) {
      trendyolAnti429Gate.reportRateLimit(`direct-html-exact-${response.status}`);
      return { ok: false, rateLimited: true };
    }
    if (response.status === 403) return { ok: false, rateLimited: false };
    if (htmlHasProductData(html)) {
      trendyolAnti429Gate.reportSuccess();
      return { ok: true, html };
    }
    return { ok: false, rateLimited: false };
  } catch {
    return { ok: false, rateLimited: false };
  }
}

/** Tam URL önce (boutiqueId vb.), ardından retry + paralel header denemeleri */
export async function fetchTrendyolDirectHtmlRaw(
  url: string,
  retries = 8,
): Promise<{ html: string; source: string } | null> {
  let rateLimitedHits = 0;

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      const wait = trendyolBackoffMs(attempt + rateLimitedHits, {
        baseMs: rateLimitedHits > 0 ? 4000 : 2000,
        maxMs: 90_000,
      });
      console.log(
        `⏳ [direct-html] retry ${attempt + 1}/${retries} — ${Math.round(wait / 1000)}s bekleniyor${
          rateLimitedHits > 0 ? " (429)" : ""
        }`,
      );
      await sleep(wait);
    }

    const exact = await tryScenarioExactFetch(url);
    if (exact.ok) {
      console.log(`✅ Direct HTML (scenario-exact, ${exact.html.length} bytes, deneme ${attempt + 1})`);
      return { html: exact.html, source: "scenario-exact" };
    }
    if (exact.rateLimited) rateLimitedHits++;

    // 429 sonrası paralel header fırtınası yapma — tek tek dene
    if (rateLimitedHits > 0) {
      for (const headers of DIRECT_HEADERS) {
        const one = await tryOneFetch(url, headers);
        if (one.ok) {
          console.log(`✅ Direct HTML (throttled-header, ${one.html.length} bytes)`);
          return { html: one.html, source: "header-throttled" };
        }
        if (one.rateLimited) {
          rateLimitedHits++;
          break;
        }
      }
      continue;
    }

    const results = await Promise.all(
      DIRECT_HEADERS.map((headers) => tryOneFetch(url, headers)),
    );
    for (const r of results) {
      if (r.ok) {
        console.log(`✅ Direct HTML (multi-header, ${r.html.length} bytes)`);
        return { html: r.html, source: "multi-header" };
      }
      if (r.rateLimited) rateLimitedHits++;
    }
  }

  if (rateLimitedHits > 0) {
    console.warn(`🚫 [direct-html] ${rateLimitedHits} kez 429 — HTML alınamadı: ${url}`);
  }
  return null;
}
