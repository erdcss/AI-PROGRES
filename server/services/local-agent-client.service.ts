import axios from "axios";
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

const LOCAL_AGENT_TIMEOUT_MS = 65_000;

function getAgentConfig() {
  const secrets = getInternalSourceAccessSecrets();
  return {
    endpoint: secrets.localAgentEndpoint,
    token: secrets.localAgentToken,
    configured: Boolean(secrets.localAgentEndpoint && secrets.localAgentToken),
  };
}

export function isLocalAgentConfigured(): boolean {
  return getAgentConfig().configured;
}

/** Endpoint hostname maskeli — secret dönmez */
export function maskLocalAgentEndpoint(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    const u = new URL(endpoint);
    return `***.${u.hostname.split(".").slice(-2).join(".")}`;
  } catch {
    return "***configured***";
  }
}

export async function pingLocalAgentHealth(): Promise<boolean> {
  const { endpoint } = getAgentConfig();
  if (!endpoint) return false;

  const base = endpoint.replace(/\/$/, "");
  try {
    const res = await axios.get(`${base}/health`, {
      timeout: 8000,
      validateStatus: (s) => s < 500,
    });
    return res.status === 200 && res.data?.ok === true;
  } catch {
    return false;
  }
}

export async function callLocalScrapeAgent(url: string): Promise<GatewayFetchResult & {
  agentSuccess: boolean;
  finalSuccessReason?: string;
  stageError?: string;
}> {
  const start = Date.now();
  const { endpoint, token, configured } = getAgentConfig();

  if (!configured || !endpoint || !token) {
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
      durationMs: Date.now() - start,
    };
  }

  const base = endpoint.replace(/\/$/, "");
  const scrapeUrl = `${base}/scrape`;

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

    if (response.status === 401) {
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
        durationMs,
      };
    }

    if (!data?.success) {
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
        durationMs,
      };
    }

    const htmlSize = data.rawDiagnostics?.htmlSize ?? 0;
    const hasProductData = Boolean(title && priceValue > 0);

    return {
      html: null,
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
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes("timeout");
    return {
      html: null,
      images: [],
      providerType: "local_agent",
      htmlSuccess: false,
      imageSuccess: false,
      agentSuccess: false,
      stageError: "local-agent-failed",
      error: isTimeout ? "local-agent-timeout" : message,
      reason: "local-agent-failed",
      durationMs: Date.now() - start,
    };
  }
}
