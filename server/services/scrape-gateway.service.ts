import axios, { type AxiosRequestConfig } from "axios";
import type { ScrapeGatewaySettingsDto } from "./scrape-gateway-settings.service";
import { getScrapeGatewaySettingsRaw, recordGatewayTest } from "./scrape-gateway-settings.service";
import { parseTrendyolProductFromHtmlContent } from "../trendyol-html-extractor";
import { filterValidProductImages } from "../trendyol-image-utils";
import { validateTrackingSourceData, parseSourcePrice } from "@shared/scrape-validity";

export type GatewayFetchResult = {
  html: string | null;
  images: string[];
  title?: string;
  price?: number;
  providerType: string;
  htmlSuccess: boolean;
  imageSuccess: boolean;
  error?: string;
  durationMs: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseProxyForAxios(proxyUrl: string): AxiosRequestConfig["proxy"] {
  try {
    const u = new URL(proxyUrl);
    const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    return {
      host: u.hostname,
      port,
      protocol: u.protocol.replace(":", ""),
      auth:
        u.username || u.password
          ? {
              username: decodeURIComponent(u.username),
              password: decodeURIComponent(u.password),
            }
          : undefined,
    };
  } catch {
    return undefined;
  }
}

async function fetchWithProxy(url: string, settings: ScrapeGatewaySettingsDto): Promise<string | null> {
  if (!settings.proxyUrlEncrypted) return null;

  const config: AxiosRequestConfig = {
    timeout: settings.timeoutMs,
    maxRedirects: 5,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9",
    },
    proxy: parseProxyForAxios(settings.proxyUrlEncrypted),
    validateStatus: (s) => s < 500,
  };

  const response = await axios.get(url, config);
  const html = typeof response.data === "string" ? response.data : null;
  if (!html || html.length < 3000) return null;
  return html;
}

async function fetchWithScrapingApi(
  url: string,
  settings: ScrapeGatewaySettingsDto,
): Promise<{ html: string | null; json: Record<string, unknown> | null }> {
  if (!settings.providerEndpoint || !settings.providerApiKeyEncrypted) {
    return { html: null, json: null };
  }

  const endpoint = settings.providerEndpoint
    .replace(/\{url\}/g, encodeURIComponent(url))
    .replace(/\{apiKey\}/g, encodeURIComponent(settings.providerApiKeyEncrypted));

  const response = await axios.get(endpoint, {
    timeout: settings.timeoutMs,
    validateStatus: (s) => s < 500,
  });

  const data = response.data;
  if (typeof data === "string" && data.length > 3000) {
    return { html: data, json: null };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const html =
      typeof obj.html === "string"
        ? obj.html
        : typeof obj.content === "string"
          ? obj.content
          : typeof obj.body === "string"
            ? obj.body
            : null;
    return { html, json: obj };
  }
  return { html: null, json: null };
}

async function fetchImageWithProxy(imageUrl: string, settings: ScrapeGatewaySettingsDto): Promise<boolean> {
  if (!settings.proxyUrlEncrypted) return false;
  try {
    await axios.head(imageUrl, {
      timeout: Math.min(settings.timeoutMs, 15000),
      proxy: parseProxyForAxios(settings.proxyUrlEncrypted),
      validateStatus: (s) => s < 500,
    });
    return true;
  } catch {
    return false;
  }
}

export async function runScrapeGateway(url: string): Promise<GatewayFetchResult> {
  const start = Date.now();
  const settings = await getScrapeGatewaySettingsRaw();

  if (!settings.gatewayEnabled || !settings.proxyFallbackEnabled) {
    return {
      html: null,
      images: [],
      providerType: settings.providerType,
      htmlSuccess: false,
      imageSuccess: false,
      error: "gateway-disabled",
      durationMs: Date.now() - start,
    };
  }

  let html: string | null = null;
  let images: string[] = [];
  let title: string | undefined;
  let price: number | undefined;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= settings.retryCount; attempt++) {
    if (attempt > 0) await sleep(settings.retryDelayMs);

    try {
      if (settings.providerType === "scraping_api") {
        const { html: apiHtml, json } = await fetchWithScrapingApi(url, settings);
        html = apiHtml;
        if (json) {
          if (typeof json.title === "string") title = json.title;
          if (json.price) price = parseSourcePrice(json.price);
          if (Array.isArray(json.images)) {
            images = filterValidProductImages(json.images);
          }
        }
      } else if (settings.providerType === "generic_proxy" && settings.useProxyForHtml) {
        html = await fetchWithProxy(url, settings);
      }

      if (html && html.length > 3000) {
        const parsed = parseTrendyolProductFromHtmlContent(html, url, "gateway");
        if (parsed) {
          title = parsed.title || title;
          price = parsed.price.original > 0 ? parsed.price.original : price;
          if (parsed.images.length) images = parsed.images;
        }
        break;
      }
      lastError = "scraping-provider-empty";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "scraping-provider-error";
    }
  }

  const htmlSuccess = Boolean(html && html.length > 3000);

  if (settings.useProxyForImages && images.length === 0 && html) {
    const parsed = parseTrendyolProductFromHtmlContent(html, url, "gateway-images");
    if (parsed?.images.length) images = parsed.images;
  }

  let imageSuccess = images.length > 0;
  if (!imageSuccess && settings.useProxyForImages && settings.proxyUrlEncrypted && images.length === 0 && html) {
    const candidateUrls = filterValidProductImages(
      (parseTrendyolProductFromHtmlContent(html, url, "gateway-img")?.images ?? []).slice(0, 3),
    );
    for (const imgUrl of candidateUrls) {
      if (await fetchImageWithProxy(imgUrl, settings)) {
        images.push(imgUrl);
      }
    }
    imageSuccess = images.length > 0;
  }

  return {
    html,
    images,
    title,
    price,
    providerType: settings.providerType,
    htmlSuccess,
    imageSuccess,
    error: htmlSuccess || imageSuccess ? undefined : lastError || "gateway-no-data",
    durationMs: Date.now() - start,
  };
}

export async function testScrapeGateway(url: string) {
  const start = Date.now();
  try {
    const result = await runScrapeGateway(url);
    const parsed =
      result.html && result.html.length > 3000
        ? parseTrendyolProductFromHtmlContent(result.html, url, "gateway-test")
        : null;

    const title = parsed?.title || result.title || "";
    const price = parsed?.price.original || result.price || 0;
    const images = parsed?.images.length ? parsed.images : result.images;

    const validation = validateTrackingSourceData({
      title,
      price: { original: price },
      images,
    });

    const success = validation.valid;
    const message = success
      ? `Gateway OK — ${images.length} görsel, fiyat ${price}`
      : validation.reason || result.error || "Gateway başarısız";

    await recordGatewayTest(success, message);

    return {
      success,
      providerType: result.providerType,
      htmlReceived: result.htmlSuccess,
      htmlSize: result.html?.length ?? 0,
      titleFound: Boolean(title && title.length > 2),
      priceFound: price > 0,
      imagesFound: images.length,
      durationMs: Date.now() - start,
      error: success ? null : message,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gateway test hatası";
    await recordGatewayTest(false, message);
    return {
      success: false,
      providerType: "unknown",
      htmlReceived: false,
      htmlSize: 0,
      titleFound: false,
      priceFound: false,
      imagesFound: 0,
      durationMs: Date.now() - start,
      error: message,
    };
  }
}
