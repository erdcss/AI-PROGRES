import axios, { type AxiosRequestConfig } from "axios";
import type { ScrapeGatewaySettingsDto } from "./scrape-gateway-settings.service";
import { getScrapeGatewaySettingsRaw, recordGatewayTest } from "./scrape-gateway-settings.service";
import {
  buildGatewayConfigStatus,
  GATEWAY_NOT_CONFIGURED_MESSAGE,
  GATEWAY_PROVIDER_FAILED_MESSAGE,
  isProviderConfigured,
} from "./scrape-gateway-status";
import { parseTrendyolProductFromHtmlContent } from "../trendyol-html-extractor";
import { filterValidProductImages } from "../trendyol-image-utils";
import { validateTrackingSourceData, parseSourcePrice } from "@shared/scrape-validity";
import { isBlockedTrendyolHtml } from "@shared/trendyol-bot-detection";

export type GatewayFetchResult = {
  html: string | null;
  images: string[];
  title?: string;
  price?: number;
  variants?: unknown;
  providerType: string;
  htmlSuccess: boolean;
  imageSuccess: boolean;
  error?: string;
  reason?: string;
  durationMs: number;
};

export type GatewayTestStage = {
  name: string;
  status: "success" | "failed" | "skipped";
  message?: string;
  durationMs?: number;
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

async function testProxyConnection(settings: ScrapeGatewaySettingsDto): Promise<void> {
  if (!settings.proxyUrlEncrypted) throw new Error("Proxy URL tanımlı değil");
  const proxy = parseProxyForAxios(settings.proxyUrlEncrypted);
  if (!proxy) throw new Error("Proxy URL formatı geçersiz");
  await axios.get("https://www.trendyol.com/robots.txt", {
    timeout: Math.min(settings.timeoutMs, 15000),
    proxy,
    validateStatus: (s) => s < 500,
  });
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

type LocalAgentResponse = {
  success?: boolean;
  title?: string;
  price?: number;
  images?: string[];
  variants?: unknown;
  html?: string;
};

async function fetchWithLocalAgent(
  url: string,
  settings: ScrapeGatewaySettingsDto,
): Promise<LocalAgentResponse | null> {
  if (!settings.localAgentEndpoint || !settings.localAgentTokenEncrypted) return null;

  const base = settings.localAgentEndpoint.replace(/\/$/, "");
  const endpoint = `${base}/scrape`;

  const response = await axios.post(
    endpoint,
    { url, token: settings.localAgentTokenEncrypted },
    { timeout: settings.timeoutMs, validateStatus: (s) => s < 500 },
  );

  if (!response.data || typeof response.data !== "object") return null;
  return response.data as LocalAgentResponse;
}

function applyLocalAgentToResult(
  agent: LocalAgentResponse,
  url: string,
): Pick<GatewayFetchResult, "html" | "images" | "title" | "price" | "variants"> {
  const images = filterValidProductImages(agent.images ?? []);
  const price = parseSourcePrice(agent.price ?? 0);
  return {
    html: typeof agent.html === "string" ? agent.html : null,
    images,
    title: agent.title,
    price: price > 0 ? price : undefined,
    variants: agent.variants,
  };
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
      reason: "gateway-disabled",
      durationMs: Date.now() - start,
    };
  }

  if (!isProviderConfigured(settings)) {
    return {
      html: null,
      images: [],
      providerType: settings.providerType,
      htmlSuccess: false,
      imageSuccess: false,
      error: GATEWAY_NOT_CONFIGURED_MESSAGE,
      reason: "gateway-not-configured",
      durationMs: Date.now() - start,
    };
  }

  let html: string | null = null;
  let images: string[] = [];
  let title: string | undefined;
  let price: number | undefined;
  let variants: unknown;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= settings.retryCount; attempt++) {
    if (attempt > 0) await sleep(settings.retryDelayMs);

    try {
      if (settings.providerType === "local_agent") {
        const agent = await fetchWithLocalAgent(url, settings);
        if (agent?.success === false) {
          lastError = "local-agent-rejected";
          continue;
        }
        if (agent) {
          const applied = applyLocalAgentToResult(agent, url);
          html = applied.html;
          images = applied.images;
          title = applied.title;
          price = applied.price;
          variants = applied.variants;
          if (html || title || price || images.length) break;
        }
        lastError = "local-agent-empty";
      } else if (settings.providerType === "scraping_api") {
        const { html: apiHtml, json } = await fetchWithScrapingApi(url, settings);
        html = apiHtml;
        if (json) {
          if (typeof json.title === "string") title = json.title;
          if (json.price) price = parseSourcePrice(json.price);
          if (Array.isArray(json.images)) images = filterValidProductImages(json.images);
        }
      } else if (settings.providerType === "generic_proxy" && settings.useProxyForHtml) {
        html = await fetchWithProxy(url, settings);
      }

      if (html && html.length > 3000) {
        if (isBlockedTrendyolHtml(html)) {
          lastError = "bot-page-detected";
          html = null;
          continue;
        }
        const parsed = parseTrendyolProductFromHtmlContent(html, url, "gateway");
        if (parsed) {
          title = parsed.title || title;
          price = parsed.price.original > 0 ? parsed.price.original : price;
          if (parsed.images.length) images = parsed.images;
          variants = parsed.variants;
        }
        break;
      }

      if (title && price && price > 0 && images.length > 0) break;
      lastError = "gateway-provider-empty";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "gateway-provider-failed";
    }
  }

  const htmlSuccess = Boolean(html && html.length > 3000);
  const hasAgentData = Boolean(title && price && price > 0 && images.length > 0);

  if (images.length === 0 && html) {
    const parsed = parseTrendyolProductFromHtmlContent(html, url, "gateway-images");
    if (parsed?.images.length) images = parsed.images;
  }

  const imageOk = images.length > 0;
  const ok = htmlSuccess || hasAgentData || imageOk;

  return {
    html,
    images,
    title,
    price,
    variants,
    providerType: settings.providerType,
    htmlSuccess: htmlSuccess || hasAgentData,
    imageSuccess: imageOk,
    error: ok ? undefined : lastError || GATEWAY_PROVIDER_FAILED_MESSAGE,
    reason: ok ? undefined : "gateway-provider-failed",
    durationMs: Date.now() - start,
  };
}

export async function testScrapeGateway(url: string) {
  const overallStart = Date.now();
  const stages: GatewayTestStage[] = [];
  const settings = await getScrapeGatewaySettingsRaw();
  const status = buildGatewayConfigStatus(settings);

  const addStage = (stage: GatewayTestStage) => stages.push(stage);

  addStage({
    name: "settings-check",
    status: settings.gatewayEnabled ? "success" : "failed",
    message: settings.gatewayEnabled ? "Gateway açık" : "Gateway kapalı",
  });

  if (!settings.gatewayEnabled) {
    const result = {
      success: false,
      reason: "gateway-disabled",
      userMessage: "Scrape Gateway kapalı. Kaynak erişim ayarlarından açın.",
      recommendation: "Gateway ve proxy fallback'i etkinleştirin.",
      ...status,
      stages,
      durationMs: Date.now() - overallStart,
    };
    await recordGatewayTest({ success: false, message: result.userMessage, error: result.reason, url });
    return result;
  }

  addStage({
    name: "provider-configuration",
    status: status.providerConfigured ? "success" : "failed",
    message: status.providerConfigured
      ? `Sağlayıcı yapılandırıldı (${settings.providerType})`
      : "Proxy veya scraping API ayarı eksik",
  });

  if (!status.providerConfigured) {
    const result = {
      success: false,
      reason: "gateway-not-configured",
      userMessage: GATEWAY_NOT_CONFIGURED_MESSAGE,
      recommendation:
        "Kaynak erişim ayarlarından generic_proxy, scraping_api veya local_agent seçin ve kimlik bilgilerini girin.",
      ...status,
      stages,
      durationMs: Date.now() - overallStart,
    };
    await recordGatewayTest({
      success: false,
      message: result.userMessage,
      error: result.reason,
      url,
    });
    return result;
  }

  if (settings.providerType === "generic_proxy") {
    const proxyStart = Date.now();
    try {
      await testProxyConnection(settings);
      addStage({
        name: "proxy-connection",
        status: "success",
        message: "Proxy bağlantısı OK",
        durationMs: Date.now() - proxyStart,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Proxy bağlantı hatası";
      addStage({ name: "proxy-connection", status: "failed", message: msg, durationMs: Date.now() - proxyStart });
    }
  } else {
    addStage({ name: "proxy-connection", status: "skipped", message: "Bu sağlayıcı tipi için atlandı" });
  }

  if (settings.providerType === "local_agent") {
    const agentStart = Date.now();
    try {
      const ping = await fetchWithLocalAgent(url, settings);
      addStage({
        name: "local-agent-scrape",
        status: ping ? "success" : "failed",
        message: ping ? "Yerel köprü yanıt verdi" : "Yerel köprü yanıt vermedi",
        durationMs: Date.now() - agentStart,
      });
    } catch (err) {
      addStage({
        name: "local-agent-scrape",
        status: "failed",
        message: err instanceof Error ? err.message : "Yerel köprü hatası",
        durationMs: Date.now() - agentStart,
      });
    }
  }

  const fetchStart = Date.now();
  let gw: GatewayFetchResult;
  try {
    gw = await runScrapeGateway(url);
    addStage({
      name: "trendyol-html-fetch",
      status: gw.htmlSuccess ? "success" : "failed",
      message: gw.htmlSuccess ? `HTML ${gw.html?.length ?? 0} byte` : gw.error ?? "HTML alınamadı",
      durationMs: Date.now() - fetchStart,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch hatası";
    addStage({ name: "trendyol-html-fetch", status: "failed", message: msg, durationMs: Date.now() - fetchStart });
    const result = {
      success: false,
      reason: "gateway-provider-failed",
      userMessage: GATEWAY_PROVIDER_FAILED_MESSAGE,
      recommendation: "Proxy/API ayarlarını doğrulayıp tekrar test edin.",
      ...status,
      stages,
      durationMs: Date.now() - overallStart,
      error: msg,
    };
    await recordGatewayTest({ success: false, message: result.userMessage, error: msg, url });
    return result;
  }

  const html = gw.html;
  const botStart = Date.now();
  if (!html) {
    addStage({ name: "bot-page-check", status: "skipped", message: "HTML yok" });
  } else if (isBlockedTrendyolHtml(html)) {
    addStage({
      name: "bot-page-check",
      status: "failed",
      message: "Bot/engel sayfası tespit edildi",
      durationMs: Date.now() - botStart,
    });
  } else {
    addStage({
      name: "bot-page-check",
      status: "success",
      message: "Sayfa geçerli görünüyor",
      durationMs: Date.now() - botStart,
    });
  }

  const parseStart = Date.now();
  const parsed =
    html && html.length > 3000
      ? parseTrendyolProductFromHtmlContent(html, url, "gateway-test")
      : null;

  addStage({
    name: "json-ld-parse",
    status: parsed ? "success" : "failed",
    message: parsed ? "HTML/JSON-LD parse başarılı" : "Parse başarısız",
    durationMs: Date.now() - parseStart,
  });

  const title = parsed?.title || gw.title || "";
  const price = parsed?.price.original || gw.price || 0;
  const images = parsed?.images.length ? parsed.images : gw.images;

  addStage({
    name: "price-parse",
    status: price > 0 ? "success" : "failed",
    message: price > 0 ? `Fiyat: ${price} TL` : "Fiyat bulunamadı",
  });

  addStage({
    name: "image-parse",
    status: images.length > 0 ? "success" : "failed",
    message: images.length > 0 ? `${images.length} görsel` : "Görsel bulunamadı",
  });

  const validation = validateTrackingSourceData({
    title,
    price: { original: price },
    images,
  });

  const success = validation.valid;
  const reason = success
    ? "gateway-full-data"
    : gw.reason === "gateway-not-configured"
      ? "gateway-not-configured"
      : "gateway-provider-failed";

  const userMessage = success
    ? `Gateway test başarılı — ${images.length} görsel, ${price} TL`
    : reason === "gateway-not-configured"
      ? GATEWAY_NOT_CONFIGURED_MESSAGE
      : validation.reason || gw.error || GATEWAY_PROVIDER_FAILED_MESSAGE;

  await recordGatewayTest({
    success,
    message: userMessage,
    error: success ? null : userMessage,
    url,
    htmlSize: html?.length ?? 0,
    titleFound: Boolean(title && title.length > 2),
    priceFound: price > 0,
    imagesFound: images.length,
    workingProvider: success ? settings.providerType : null,
  });

  return {
    success,
    reason,
    userMessage,
    recommendation: success
      ? "Scraper'da ürün çekmeyi tekrar deneyebilirsiniz."
      : "Kaynak erişim ayarlarını gözden geçirin ve testi tekrarlayın.",
    providerType: settings.providerType,
    htmlReceived: gw.htmlSuccess,
    htmlSize: html?.length ?? 0,
    titleFound: Boolean(title && title.length > 2),
    priceFound: price > 0,
    imagesFound: images.length,
    durationMs: Date.now() - overallStart,
    error: success ? null : userMessage,
    stages,
    ...status,
  };
}
