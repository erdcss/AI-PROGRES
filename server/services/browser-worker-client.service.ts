import axios, { type AxiosError } from "axios";
import { isCloudRuntime } from "@shared/deploy-runtime";

export type BrowserWorkerErrorCategory =
  | "not-configured"
  | "dns"
  | "timeout"
  | "auth"
  | "connection"
  | "blocked"
  | "navigation"
  | "unknown";

export type BrowserWorkerHealthStatus = {
  enabled: boolean;
  endpointConfigured: boolean;
  endpointHost: string | null;
  tokenConfigured: boolean;
  reachable: boolean;
  browserReady: boolean;
  latencyMs: number | null;
  error: string | null;
  errorCategory: BrowserWorkerErrorCategory | null;
};

export type BrowserWorkerTrendyolResponse = {
  ok: boolean;
  url?: string;
  finalUrl?: string;
  status?: number;
  html?: string;
  jsonLd?: unknown[];
  rawProductJson?: Record<string, unknown>;
  durationMs?: number;
  error?: string;
  errorCategory?: string;
};

export type BrowserWorkerScrapeResult = {
  success: boolean;
  html: string | null;
  rawProductJson: Record<string, unknown> | null;
  jsonLd: unknown[];
  finalUrl: string | null;
  status: number | null;
  durationMs: number;
  error?: string;
  errorCategory?: BrowserWorkerErrorCategory;
  stageError?: string;
};

const BROWSER_WORKER_TIMEOUT_MS = 45_000;
const BROWSER_WORKER_HEALTH_TIMEOUT_MS = 10_000;

function getBrowserWorkerConfig() {
  const endpoint =
    process.env.BROWSER_WORKER_URL?.trim() ||
    process.env.BROWSER_WORKER_ENDPOINT?.trim() ||
    null;
  const token = process.env.BROWSER_WORKER_TOKEN?.trim() || null;
  const timeoutMs = Number(process.env.BROWSER_WORKER_TIMEOUT_MS) || BROWSER_WORKER_TIMEOUT_MS;
  return {
    endpoint,
    token,
    timeoutMs,
    endpointConfigured: Boolean(endpoint),
    tokenConfigured: Boolean(token),
    configured: Boolean(endpoint && token),
  };
}

export function isBrowserWorkerConfigured(): boolean {
  return getBrowserWorkerConfig().configured;
}

export function extractSafeBrowserWorkerHost(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).hostname || null;
  } catch {
    return null;
  }
}

function logBrowserWorker(line: string): void {
  console.log(`[BrowserWorker] ${line}`);
}

export function categorizeBrowserWorkerError(
  err: unknown,
  httpStatus?: number,
): { category: BrowserWorkerErrorCategory; message: string } {
  if (httpStatus === 401 || httpStatus === 403) {
    return { category: "auth", message: "Browser Worker token uyuşmuyor." };
  }

  const axiosErr = err as AxiosError | undefined;
  const code = axiosErr?.code ?? "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || lower.includes("enotfound")) {
    return {
      category: "dns",
      message: "Browser Worker endpoint DNS çözümlenemiyor.",
    };
  }
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return { category: "timeout", message: "Browser Worker yanıt vermiyor." };
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || lower.includes("econnrefused")) {
    return { category: "connection", message: "Browser Worker çalışmıyor veya port kapalı." };
  }
  if (lower.includes("blocked")) {
    return { category: "blocked", message: "Hedef site erişimi engellendi." };
  }
  if (lower.includes("navigation")) {
    return { category: "navigation", message: "Sayfa yüklenemedi." };
  }

  return { category: "unknown", message: message || "Browser Worker bağlantısı kurulamadı." };
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getBrowserWorkerHealthStatus(): Promise<BrowserWorkerHealthStatus> {
  const { endpoint, endpointConfigured, tokenConfigured, configured } = getBrowserWorkerConfig();
  const endpointHost = extractSafeBrowserWorkerHost(endpoint);
  const enabled = isCloudRuntime() && configured;

  if (!endpointConfigured && !tokenConfigured) {
    return {
      enabled: false,
      endpointConfigured: false,
      endpointHost: null,
      tokenConfigured: false,
      reachable: false,
      browserReady: false,
      latencyMs: null,
      error: "BROWSER_WORKER_URL/BROWSER_WORKER_ENDPOINT ve BROWSER_WORKER_TOKEN tanımlı değil.",
      errorCategory: "not-configured",
    };
  }

  if (!endpointConfigured) {
    return {
      enabled: false,
      endpointConfigured: false,
      endpointHost: null,
      tokenConfigured,
      reachable: false,
      browserReady: false,
      latencyMs: null,
      error: "BROWSER_WORKER_ENDPOINT eksik veya geçersiz.",
      errorCategory: "not-configured",
    };
  }

  if (!tokenConfigured) {
    return {
      enabled: false,
      endpointConfigured: true,
      endpointHost,
      tokenConfigured: false,
      reachable: false,
      browserReady: false,
      latencyMs: null,
      error: "BROWSER_WORKER_TOKEN eksik.",
      errorCategory: "not-configured",
    };
  }

  const base = endpoint!.replace(/\/$/, "");
  const start = Date.now();
  try {
    const res = await axios.get(`${base}/health`, {
      timeout: BROWSER_WORKER_HEALTH_TIMEOUT_MS,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - start;
    const ok = res.status === 200 && res.data?.ok === true;
    const browserReady = res.data?.browserReady === true;

    if (!ok) {
      const categorized = categorizeBrowserWorkerError(new Error(`HTTP ${res.status}`), res.status);
      return {
        enabled,
        endpointConfigured: true,
        endpointHost,
        tokenConfigured: true,
        reachable: false,
        browserReady: false,
        latencyMs,
        error: `Browser Worker health yanıtı beklenmiyor (HTTP ${res.status}).`,
        errorCategory: categorized.category,
      };
    }

    return {
      enabled,
      endpointConfigured: true,
      endpointHost,
      tokenConfigured: true,
      reachable: true,
      browserReady,
      latencyMs,
      error: browserReady ? null : "Chromium henüz hazır değil.",
      errorCategory: browserReady ? null : "unknown",
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const categorized = categorizeBrowserWorkerError(err);
    return {
      enabled,
      endpointConfigured: true,
      endpointHost,
      tokenConfigured: true,
      reachable: false,
      browserReady: false,
      latencyMs,
      error: categorized.message,
      errorCategory: categorized.category,
    };
  }
}

export async function fetchHtmlWithBrowserWorker(url: string): Promise<BrowserWorkerScrapeResult> {
  const start = Date.now();
  const { endpoint, token, configured, endpointConfigured, tokenConfigured, timeoutMs } =
    getBrowserWorkerConfig();
  const endpointHost = extractSafeBrowserWorkerHost(endpoint);

  logBrowserWorker(`endpoint configured: ${endpointConfigured ? "yes" : "no"}`);
  logBrowserWorker(`endpoint host: ${endpointHost ?? "(yok)"}`);
  logBrowserWorker(`token configured: ${tokenConfigured ? "yes" : "no"}`);

  if (!configured || !endpoint || !token) {
    logBrowserWorker("request failed category: not-configured");
    return {
      success: false,
      html: null,
      rawProductJson: null,
      jsonLd: [],
      finalUrl: null,
      status: null,
      durationMs: Date.now() - start,
      error: "Browser Worker yapılandırılmamış",
      errorCategory: "not-configured",
      stageError: "browser-worker-not-configured",
    };
  }

  const base = endpoint.replace(/\/$/, "");
  logBrowserWorker("request started: scrape/html");

  try {
    const response = await axios.post(
      `${base}/scrape/html`,
      { url },
      {
        timeout: timeoutMs,
        headers: authHeaders(token),
        validateStatus: () => true,
      },
    );

    const durationMs = Date.now() - start;
    const data = response.data as BrowserWorkerTrendyolResponse;

    if (response.status === 401 || response.status === 403) {
      logBrowserWorker("request failed category: auth");
      return {
        success: false,
        html: null,
        rawProductJson: null,
        jsonLd: [],
        finalUrl: null,
        status: response.status,
        durationMs,
        error: "browser-worker-unauthorized",
        errorCategory: "auth",
        stageError: "browser-worker-failed",
      };
    }

    if (!data?.ok || !data.html) {
      logBrowserWorker(`request failed category: ${data.errorCategory ?? "unknown"}`);
      return {
        success: false,
        html: null,
        rawProductJson: null,
        jsonLd: [],
        finalUrl: data.finalUrl ?? null,
        status: data.status ?? response.status,
        durationMs,
        error: data.error ?? "browser-worker-empty-html",
        errorCategory: (data.errorCategory as BrowserWorkerErrorCategory) ?? "unknown",
        stageError: "browser-worker-failed",
      };
    }

    logBrowserWorker(`request succeeded (${durationMs}ms, html ${data.html.length} bytes)`);
    return {
      success: true,
      html: data.html,
      rawProductJson: null,
      jsonLd: [],
      finalUrl: data.finalUrl ?? null,
      status: data.status ?? response.status,
      durationMs,
    };
  } catch (err) {
    const categorized = categorizeBrowserWorkerError(err);
    logBrowserWorker(`request failed category: ${categorized.category}`);
    return {
      success: false,
      html: null,
      rawProductJson: null,
      jsonLd: [],
      finalUrl: null,
      status: null,
      durationMs: Date.now() - start,
      error: categorized.message,
      errorCategory: categorized.category,
      stageError: "browser-worker-failed",
    };
  }
}

export async function scrapeTrendyolWithBrowserWorker(url: string): Promise<BrowserWorkerScrapeResult> {
  const start = Date.now();
  const { endpoint, token, configured, endpointConfigured, tokenConfigured, timeoutMs } =
    getBrowserWorkerConfig();
  const endpointHost = extractSafeBrowserWorkerHost(endpoint);

  logBrowserWorker(`endpoint configured: ${endpointConfigured ? "yes" : "no"}`);
  logBrowserWorker(`endpoint host: ${endpointHost ?? "(yok)"}`);
  logBrowserWorker(`token configured: ${tokenConfigured ? "yes" : "no"}`);

  if (!configured || !endpoint || !token) {
    logBrowserWorker("request failed category: not-configured");
    return {
      success: false,
      html: null,
      rawProductJson: null,
      jsonLd: [],
      finalUrl: null,
      status: null,
      durationMs: Date.now() - start,
      error: "Browser Worker yapılandırılmamış",
      errorCategory: "not-configured",
      stageError: "browser-worker-not-configured",
    };
  }

  const base = endpoint.replace(/\/$/, "");
  logBrowserWorker("request started: scrape/trendyol");

  try {
    const response = await axios.post(
      `${base}/scrape/trendyol`,
      { url },
      {
        timeout: timeoutMs,
        headers: authHeaders(token),
        validateStatus: () => true,
      },
    );

    const durationMs = Date.now() - start;
    const data = response.data as BrowserWorkerTrendyolResponse;

    if (response.status === 401 || response.status === 403) {
      logBrowserWorker("request failed category: auth");
      return {
        success: false,
        html: null,
        rawProductJson: null,
        jsonLd: [],
        finalUrl: null,
        status: response.status,
        durationMs,
        error: "browser-worker-unauthorized",
        errorCategory: "auth",
        stageError: "browser-worker-failed",
      };
    }

    if (!data?.ok) {
      logBrowserWorker(`request failed category: ${data.errorCategory ?? "unknown"}`);
      return {
        success: false,
        html: data.html ?? null,
        rawProductJson: data.rawProductJson ?? null,
        jsonLd: data.jsonLd ?? [],
        finalUrl: data.finalUrl ?? null,
        status: data.status ?? response.status,
        durationMs,
        error: data.error ?? "browser-worker-failed",
        errorCategory: (data.errorCategory as BrowserWorkerErrorCategory) ?? "unknown",
        stageError: "browser-worker-failed",
      };
    }

    logBrowserWorker(`request succeeded (${durationMs}ms, html ${data.html?.length ?? 0} bytes)`);
    return {
      success: true,
      html: data.html ?? null,
      rawProductJson:
        data.rawProductJson && Object.keys(data.rawProductJson).length > 0
          ? data.rawProductJson
          : null,
      jsonLd: data.jsonLd ?? [],
      finalUrl: data.finalUrl ?? null,
      status: data.status ?? response.status,
      durationMs,
    };
  } catch (err) {
    const categorized = categorizeBrowserWorkerError(err);
    logBrowserWorker(`request failed category: ${categorized.category}`);
    return {
      success: false,
      html: null,
      rawProductJson: null,
      jsonLd: [],
      finalUrl: null,
      status: null,
      durationMs: Date.now() - start,
      error: categorized.message,
      errorCategory: categorized.category,
      stageError: "browser-worker-failed",
    };
  }
}
