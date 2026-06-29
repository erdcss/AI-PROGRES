import axios, { type AxiosError } from "axios";
import { isCloudRuntime } from "@shared/deploy-runtime";
import { getInternalSourceAccessSecrets } from "../config/source-access.config";
import { filterValidProductImages } from "../trendyol-image-utils";
import { parseSourcePrice, validateTrackingSourceData } from "@shared/scrape-validity";
import type { GatewayFetchResult } from "./scrape-gateway.service";

export type LocalAgentApiResponse = {
  success: boolean;
  source?: string;
  url?: string;
  title?: string;
  titleSource?: string;
  price?: { original: number; currency: string };
  images?: string[];
  variants?: unknown;
  html?: string;
  error?: string;
  userMessage?: string;
  stageErrors?: string[];
  quality?: {
    validTitle?: boolean;
    validPrice?: boolean;
    validImages?: boolean;
    finalSuccessReason?: string;
  };
  rawDiagnostics?: {
    htmlSize?: number;
    durationMs?: number;
    stageErrors?: string[];
  };
};

export type LocalAgentErrorCategory =
  | "not-configured"
  | "dns"
  | "timeout"
  | "auth"
  | "connection"
  | "unknown";

export type LocalAgentHealthStatus = {
  enabled: boolean;
  endpointConfigured: boolean;
  endpointHost: string | null;
  tokenConfigured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
  errorCategory: LocalAgentErrorCategory | null;
};

const LOCAL_AGENT_TIMEOUT_MS = 65_000;
const LOCAL_AGENT_HEALTH_TIMEOUT_MS = 8_000;

function getAgentConfig() {
  const secrets = getInternalSourceAccessSecrets();
  return {
    endpoint: secrets.localAgentEndpoint,
    token: secrets.localAgentToken,
    endpointConfigured: Boolean(secrets.localAgentEndpoint),
    tokenConfigured: Boolean(secrets.localAgentToken),
    configured: Boolean(secrets.localAgentEndpoint && secrets.localAgentToken),
  };
}

export function isLocalAgentConfigured(): boolean {
  return getAgentConfig().configured;
}

/** Yanıtlarda/logda güvenli hostname — token ve query parametreleri dönmez */
export function extractSafeEndpointHost(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    const u = new URL(endpoint);
    return u.hostname || null;
  } catch {
    return null;
  }
}

/** Endpoint hostname maskeli — secret dönmez */
export function maskLocalAgentEndpoint(endpoint: string | null): string | null {
  const host = extractSafeEndpointHost(endpoint);
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return `***.${host}`;
  return `***.${parts.slice(-2).join(".")}`;
}

function shortenUrlForLog(url: string, max = 96): string {
  const trimmed = url.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function logLocalAgent(line: string): void {
  console.log(`[LocalAgent] ${line}`);
}

export function categorizeLocalAgentError(
  err: unknown,
  httpStatus?: number,
): { category: LocalAgentErrorCategory; message: string } {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      category: "auth",
      message: "Local Agent token uyuşmuyor.",
    };
  }

  const axiosErr = err as AxiosError | undefined;
  const code = axiosErr?.code ?? "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || lower.includes("enotfound")) {
    return {
      category: "dns",
      message:
        "Local Agent endpoint DNS çözümlenemiyor. Cloudflare Tunnel adresi eski olabilir.",
    };
  }
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return {
      category: "timeout",
      message: "Local Agent yanıt vermiyor veya tunnel kapalı.",
    };
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || lower.includes("econnrefused")) {
    return {
      category: "connection",
      message: "Local Agent çalışmıyor veya port kapalı.",
    };
  }

  return {
    category: "unknown",
    message: message || "Local Agent bağlantısı kurulamadı.",
  };
}

export async function getLocalAgentHealthStatus(): Promise<LocalAgentHealthStatus> {
  const { endpoint, endpointConfigured, tokenConfigured, configured } = getAgentConfig();
  const endpointHost = extractSafeEndpointHost(endpoint);
  const enabled = isCloudRuntime() && configured;

  if (!endpointConfigured && !tokenConfigured) {
    return {
      enabled: false,
      endpointConfigured: false,
      endpointHost: null,
      tokenConfigured: false,
      reachable: false,
      latencyMs: null,
      error: "INTERNAL_LOCAL_AGENT_ENDPOINT ve INTERNAL_LOCAL_AGENT_TOKEN tanımlı değil.",
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
      latencyMs: null,
      error: "INTERNAL_LOCAL_AGENT_ENDPOINT eksik veya geçersiz.",
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
      latencyMs: null,
      error: "INTERNAL_LOCAL_AGENT_TOKEN eksik.",
      errorCategory: "not-configured",
    };
  }

  const base = endpoint!.replace(/\/$/, "");
  const start = Date.now();
  try {
    const res = await axios.get(`${base}/health`, {
      timeout: LOCAL_AGENT_HEALTH_TIMEOUT_MS,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - start;
    const ok = res.status === 200 && res.data?.ok === true;

    if (!ok) {
      const authIssue = res.status === 401 || res.status === 403;
      const categorized = categorizeLocalAgentError(
        new Error(`HTTP ${res.status}`),
        res.status,
      );
      return {
        enabled,
        endpointConfigured: true,
        endpointHost,
        tokenConfigured: true,
        reachable: false,
        latencyMs,
        error: authIssue
          ? categorized.message
          : `Local Agent health yanıtı beklenmiyor (HTTP ${res.status}).`,
        errorCategory: categorized.category,
      };
    }

    return {
      enabled,
      endpointConfigured: true,
      endpointHost,
      tokenConfigured: true,
      reachable: true,
      latencyMs,
      error: null,
      errorCategory: null,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const categorized = categorizeLocalAgentError(err);
    return {
      enabled,
      endpointConfigured: true,
      endpointHost,
      tokenConfigured: true,
      reachable: false,
      latencyMs,
      error: categorized.message,
      errorCategory: categorized.category,
    };
  }
}

export async function pingLocalAgentHealth(): Promise<boolean> {
  const status = await getLocalAgentHealthStatus();
  return status.reachable;
}

export async function callLocalScrapeAgent(url: string): Promise<
  GatewayFetchResult & {
    agentSuccess: boolean;
    finalSuccessReason?: string;
    stageError?: string;
    errorCategory?: LocalAgentErrorCategory;
  }
> {
  const start = Date.now();
  const { endpoint, token, configured, endpointConfigured, tokenConfigured } = getAgentConfig();
  const endpointHost = extractSafeEndpointHost(endpoint);

  logLocalAgent(`endpoint configured: ${endpointConfigured ? "yes" : "no"}`);
  logLocalAgent(`endpoint host: ${endpointHost ?? "(yok)"}`);
  logLocalAgent(`token configured: ${tokenConfigured ? "yes" : "no"}`);

  if (!configured || !endpoint || !token) {
    logLocalAgent("request failed category: not-configured");
    logLocalAgent("fallback path: api/html/cloud");
    return {
      html: null,
      images: [],
      providerType: "local_agent",
      htmlSuccess: false,
      imageSuccess: false,
      agentSuccess: false,
      stageError: "source-access-internal-provider-unavailable",
      error: "Local agent yapılandırılmamış",
      reason: "source-access-internal-provider-unavailable",
      errorCategory: "not-configured",
      durationMs: Date.now() - start,
    };
  }

  const base = endpoint.replace(/\/$/, "");
  const scrapeUrl = `${base}/scrape`;
  logLocalAgent(`request started: scrape (${shortenUrlForLog(url)})`);

  try {
    const response = await axios.post<LocalAgentApiResponse>(
      scrapeUrl,
      { url },
      {
        timeout: LOCAL_AGENT_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "x-agent-token": token,
        },
        validateStatus: () => true,
      },
    );

    const data = response.data;
    const durationMs = Date.now() - start;

    if (response.status === 401 || response.status === 403) {
      logLocalAgent("request failed category: auth");
      logLocalAgent("fallback path: api/html/cloud");
      return {
        html: null,
        images: [],
        providerType: "local_agent",
        htmlSuccess: false,
        imageSuccess: false,
        agentSuccess: false,
        stageError: "local-agent-failed",
        error: "local-agent-unauthorized",
        reason: "local-agent-failed",
        errorCategory: "auth",
        durationMs,
      };
    }

    if (!data?.success) {
      logLocalAgent("request failed category: unknown");
      logLocalAgent("fallback path: api/html/cloud");
      return {
        html: null,
        images: [],
        providerType: "local_agent",
        htmlSuccess: false,
        imageSuccess: false,
        agentSuccess: false,
        stageError: "local-agent-failed",
        error: data?.error ?? data?.userMessage ?? "local-agent-failed",
        reason: "local-agent-failed",
        errorCategory: "unknown",
        durationMs,
      };
    }

    const images = filterValidProductImages(data.images ?? []);
    const priceValue = parseSourcePrice(data.price);
    const title = String(data.title ?? "").trim();

    const validation = validateTrackingSourceData({
      title,
      price: data.price,
      images,
      titleSource: data.titleSource,
      success: true,
    });

    if (!validation.valid || priceValue <= 0) {
      logLocalAgent("request failed category: unknown");
      logLocalAgent("fallback path: api/html/cloud");
      return {
        html: null,
        images: [],
        title,
        providerType: "local_agent",
        htmlSuccess: false,
        imageSuccess: images.length > 0,
        agentSuccess: false,
        stageError: "local-agent-failed",
        error: validation.reason ?? "no-usable-data",
        reason: "local-agent-failed",
        errorCategory: "unknown",
        durationMs,
      };
    }

    const hasProductData = Boolean(title && priceValue > 0);
    logLocalAgent(`request succeeded (${durationMs}ms)`);

    return {
      html: typeof data.html === "string" && data.html.length > 0 ? data.html : null,
      images,
      title,
      price: priceValue,
      variants: data.variants,
      providerType: "local_agent",
      htmlSuccess: hasProductData,
      imageSuccess: images.length > 0,
      agentSuccess: true,
      finalSuccessReason: data.quality?.finalSuccessReason ?? "local-agent-success",
      durationMs,
    };
  } catch (err) {
    const categorized = categorizeLocalAgentError(err);
    logLocalAgent(`request failed category: ${categorized.category}`);
    logLocalAgent("fallback path: api/html/cloud");
    return {
      html: null,
      images: [],
      providerType: "local_agent",
      htmlSuccess: false,
      imageSuccess: false,
      agentSuccess: false,
      stageError: "local-agent-failed",
      error: categorized.category === "timeout" ? "local-agent-timeout" : categorized.message,
      reason: "local-agent-failed",
      errorCategory: categorized.category,
      durationMs: Date.now() - start,
    };
  }
}
