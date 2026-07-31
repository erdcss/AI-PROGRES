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

export type BrowserWorkerColorSiblingCandidate = {
  productId: string;
  url: string;
  color?: string;
  image?: string;
  images?: string[];
  inStock?: boolean;
  source?: string;
};

export type BrowserWorkerColorFamilyMember = {
  productId: string;
  url: string;
  finalUrl?: string;
  color: string;
  images: string[];
  rawProductJson?: Record<string, unknown> | null;
  html?: string;
  ok: boolean;
  error?: string;
  hydratedSnapshot?: Record<string, unknown>;
};

export type BrowserWorkerTrendyolResponse = {
  ok: boolean;
  url?: string;
  finalUrl?: string;
  status?: number;
  html?: string;
  jsonLd?: unknown[];
  rawProductJson?: Record<string, unknown>;
  colorSiblingCandidates?: BrowserWorkerColorSiblingCandidate[];
  colorFamilyMembers?: BrowserWorkerColorFamilyMember[];
  durationMs?: number;
  error?: string;
  errorCategory?: string;
  diagnostics?: {
    contentClass?: string;
    blockReason?: string | null;
    htmlBytes?: number;
    challengeBlocked?: boolean;
    navigationStatus?: number | null;
  };
};

/** Thin/empty HTML without product payload = upstream block (Railway egress / challenge). */
export function inferBrowserWorkerBlocked(
  data: Pick<BrowserWorkerTrendyolResponse, "html" | "rawProductJson" | "errorCategory" | "diagnostics">,
): boolean {
  if (data.errorCategory === "blocked") return true;
  if (data.diagnostics?.challengeBlocked === true) return true;
  const cls = data.diagnostics?.contentClass || "";
  if (
    [
      "empty-document",
      "empty-body",
      "about-blank",
      "unknown-thin",
      "unknown-blocked-response",
      "upstream-556",
      "access-denied",
      "cloudflare-challenge",
      "bot-challenge",
      "captcha",
    ].includes(cls)
  ) {
    return true;
  }
  const html = typeof data.html === "string" ? data.html : "";
  const htmlBytes = data.diagnostics?.htmlBytes ?? html.length;
  const hasRaw =
    Boolean(data.rawProductJson) &&
    typeof data.rawProductJson === "object" &&
    Object.keys(data.rawProductJson as object).length > 0;
  if (!hasRaw && htmlBytes > 0 && htmlBytes < 500) return true;
  if (!hasRaw && html.length === 0 && data.errorCategory !== "auth") {
    // Worker returned failure with no usable payload after navigation attempt
    return data.errorCategory === "unknown" || data.errorCategory === "navigation";
  }
  return false;
}

export type BrowserWorkerScrapeResult = {
  success: boolean;
  html: string | null;
  rawProductJson: Record<string, unknown> | null;
  jsonLd: unknown[];
  finalUrl: string | null;
  status: number | null;
  durationMs: number;
  colorSiblingCandidates?: BrowserWorkerColorSiblingCandidate[];
  colorFamilyMembers?: BrowserWorkerColorFamilyMember[];
  error?: string;
  errorCategory?: BrowserWorkerErrorCategory;
  stageError?: string;
};

const BROWSER_WORKER_TIMEOUT_MS = 45_000;
const BROWSER_WORKER_HEALTH_TIMEOUT_MS = 10_000;
const BROWSER_WORKER_COLOR_FAMILY_TIMEOUT_MS = 100_000;

/** Env secret normalize — trim + optional wrapping quotes */
export function normalizeBrowserWorkerSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1).trim();
  }
  // Railway / copy-paste newline leftovers
  v = v.replace(/\r|\n/g, "").trim();
  return v || null;
}

/** Endpoint resolve — URL wins over ENDPOINT; trailing slash stripped */
export function resolveBrowserWorkerEndpoint(
  urlValue?: string | null,
  endpointValue?: string | null,
): string | null {
  const raw =
    normalizeBrowserWorkerSecret(urlValue) ||
    normalizeBrowserWorkerSecret(endpointValue) ||
    null;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function getBrowserWorkerConfig() {
  const endpoint = resolveBrowserWorkerEndpoint(
    process.env.BROWSER_WORKER_URL,
    process.env.BROWSER_WORKER_ENDPOINT,
  );
  const token = normalizeBrowserWorkerSecret(process.env.BROWSER_WORKER_TOKEN);
  const parsedTimeout = Number(process.env.BROWSER_WORKER_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? parsedTimeout
      : BROWSER_WORKER_TIMEOUT_MS;
  return {
    endpoint,
    token,
    timeoutMs,
    endpointConfigured: Boolean(endpoint),
    tokenConfigured: Boolean(token),
    configured: Boolean(endpoint && token),
  };
}

export function mapBrowserWorkerStageError(
  category: BrowserWorkerErrorCategory | string | null | undefined,
): string {
  switch (category) {
    case "auth":
      return "browser-worker-unauthorized";
    case "timeout":
      return "browser-worker-timeout";
    case "not-configured":
      return "browser-worker-not-configured";
    case "blocked":
      return "browser-worker-blocked";
    case "dns":
    case "connection":
    case "navigation":
    case "unknown":
    default:
      return "browser-worker-failed";
  }
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

function logBrowserWorker(line: string, meta?: Record<string, unknown>): void {
  if (meta && Object.keys(meta).length > 0) {
    console.log(`[BrowserWorker] ${line}`, meta);
  } else {
    console.log(`[BrowserWorker] ${line}`);
  }
}

export function createScrapeCorrelationId(): string {
  return `bw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

    if (response.status === 401 || (response.status === 403 && (data as any)?.errorCategory === "auth")) {
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
        stageError: "browser-worker-unauthorized",
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
        stageError: mapBrowserWorkerStageError(data.errorCategory),
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
      stageError: mapBrowserWorkerStageError(categorized.category),
    };
  }
}

export async function scrapeTrendyolWithBrowserWorker(
  url: string,
  options?: {
    includeColorFamily?: boolean;
    includeSiblingHtml?: boolean;
    correlationId?: string;
    clientTimeoutMs?: number;
  },
): Promise<BrowserWorkerScrapeResult> {
  const start = Date.now();
  const correlationId = options?.correlationId || createScrapeCorrelationId();
  const { endpoint, token, configured, endpointConfigured, tokenConfigured, timeoutMs } =
    getBrowserWorkerConfig();
  const endpointHost = extractSafeBrowserWorkerHost(endpoint);
  const includeColorFamily = options?.includeColorFamily !== false;
  const requestTimeoutMs =
    options?.clientTimeoutMs && options.clientTimeoutMs > 0
      ? options.clientTimeoutMs
      : includeColorFamily
        ? Math.max(timeoutMs, BROWSER_WORKER_COLOR_FAMILY_TIMEOUT_MS)
        : timeoutMs;

  logBrowserWorker("request started: scrape/trendyol", {
    correlationId,
    endpointHost,
    endpointConfigured,
    tokenConfigured,
    includeColorFamily,
    timeoutMs: requestTimeoutMs,
  });

  if (!configured || !endpoint || !token) {
    logBrowserWorker("request failed category: not-configured", { correlationId });
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

  try {
    const response = await axios.post(
      `${base}/scrape/trendyol`,
      {
        url,
        includeColorFamily,
        includeSiblingHtml: options?.includeSiblingHtml === true,
        correlationId,
      },
      {
        timeout: requestTimeoutMs,
        headers: {
          ...authHeaders(token),
          "X-Correlation-Id": correlationId,
        },
        validateStatus: () => true,
      },
    );

    const durationMs = Date.now() - start;
    const data = (response.data ?? {}) as BrowserWorkerTrendyolResponse;
    const hasHtml = typeof data.html === "string" && data.html.length >= 500;
    const hasRaw =
      Boolean(data.rawProductJson) &&
      typeof data.rawProductJson === "object" &&
      Object.keys(data.rawProductJson as object).length > 0;

    if (response.status === 401) {
      logBrowserWorker("request failed category: auth", {
        correlationId,
        httpStatus: response.status,
        durationMs,
      });
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
        stageError: "browser-worker-unauthorized",
      };
    }

    // 403 may be auth OR challenge/blocked — body errorCategory wins
    if (response.status === 403 && data?.errorCategory === "auth") {
      logBrowserWorker("request failed category: auth", {
        correlationId,
        httpStatus: response.status,
        durationMs,
      });
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
        stageError: "browser-worker-unauthorized",
      };
    }

    if (response.status >= 500) {
      logBrowserWorker("request failed category: connection", {
        correlationId,
        httpStatus: response.status,
        durationMs,
      });
      return {
        success: false,
        html: hasHtml ? data.html! : null,
        rawProductJson: hasRaw ? (data.rawProductJson as Record<string, unknown>) : null,
        jsonLd: data.jsonLd ?? [],
        finalUrl: data.finalUrl ?? null,
        status: response.status,
        durationMs,
        colorSiblingCandidates: data.colorSiblingCandidates,
        colorFamilyMembers: data.colorFamilyMembers,
        error: data.error ?? `browser-worker-http-${response.status}`,
        errorCategory: "connection",
        stageError: "browser-worker-failed",
      };
    }

    if (!data?.ok || (!hasHtml && !hasRaw)) {
      const inferredBlocked = inferBrowserWorkerBlocked(data);
      const category: BrowserWorkerErrorCategory = inferredBlocked
        ? "blocked"
        : ((data.errorCategory as BrowserWorkerErrorCategory) ||
          (response.status === 429 ? "timeout" : "unknown"));
      const stageError =
        category === "blocked"
          ? "browser-worker-blocked"
          : mapBrowserWorkerStageError(category) === "browser-worker-failed" && !hasHtml && !hasRaw
            ? "browser-worker-invalid-response"
            : mapBrowserWorkerStageError(category);
      logBrowserWorker("request failed category: invalid-response", {
        correlationId,
        httpStatus: response.status,
        durationMs,
        hasHtml,
        hasRaw,
        errorCategory: category,
        contentClass: data.diagnostics?.contentClass ?? null,
        htmlBytes: data.diagnostics?.htmlBytes ?? (typeof data.html === "string" ? data.html.length : 0),
      });
      return {
        success: false,
        html: hasHtml ? data.html! : null,
        rawProductJson: hasRaw ? (data.rawProductJson as Record<string, unknown>) : null,
        jsonLd: data.jsonLd ?? [],
        finalUrl: data.finalUrl ?? null,
        status: data.status ?? response.status,
        durationMs,
        colorSiblingCandidates: data.colorSiblingCandidates,
        colorFamilyMembers: data.colorFamilyMembers,
        error: data.error ?? (category === "blocked" ? "browser-worker-blocked" : "browser-worker-invalid-response"),
        errorCategory: category,
        stageError,
      };
    }

    logBrowserWorker("request succeeded", {
      correlationId,
      durationMs,
      httpStatus: response.status,
      htmlBytes: hasHtml ? data.html!.length : 0,
      hasRawProductJson: hasRaw,
      colorFamilyMembers: Array.isArray(data.colorFamilyMembers)
        ? data.colorFamilyMembers.length
        : 0,
      colorSiblingCandidates: Array.isArray(data.colorSiblingCandidates)
        ? data.colorSiblingCandidates.length
        : 0,
    });

    return {
      success: true,
      html: hasHtml ? data.html! : null,
      rawProductJson: hasRaw ? (data.rawProductJson as Record<string, unknown>) : null,
      jsonLd: data.jsonLd ?? [],
      finalUrl: data.finalUrl ?? null,
      status: data.status ?? response.status,
      durationMs,
      colorSiblingCandidates: data.colorSiblingCandidates,
      colorFamilyMembers: data.colorFamilyMembers,
    };
  } catch (err) {
    const categorized = categorizeBrowserWorkerError(err);
    logBrowserWorker(`request failed category: ${categorized.category}`, {
      correlationId,
      durationMs: Date.now() - start,
    });
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
      stageError: mapBrowserWorkerStageError(categorized.category),
    };
  }
}
