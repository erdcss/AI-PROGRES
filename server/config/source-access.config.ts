import { isCloudRuntime } from "@shared/deploy-runtime";

export type InternalProviderType =
  | "browser_worker"
  | "local_agent"
  | "generic_proxy"
  | "scraping_api";

export type SourceAccessProviderConfig = {
  type: InternalProviderType;
  enabled: boolean;
  priority: number;
};

function envFlag(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function externalLocalAgentEnabled(): boolean {
  if (isCloudRuntime()) return true;
  return process.env.USE_EXTERNAL_LOCAL_AGENT === "true";
}

/** Sunucu tarafı kaynak erişim sağlayıcıları — kullanıcı arayüzünden yönetilmez */
export function getSourceAccessProviderRegistry(): SourceAccessProviderConfig[] {
  const secrets = getInternalSourceAccessSecrets();
  return [
    {
      type: "browser_worker",
      enabled: envFlag(secrets.browserWorkerEndpoint) && envFlag(secrets.browserWorkerToken),
      priority: 0,
    },
    {
      type: "local_agent",
      enabled:
        envFlag(secrets.localAgentEndpoint) &&
        envFlag(secrets.localAgentToken) &&
        externalLocalAgentEnabled(),
      priority: 1,
    },
    {
      type: "generic_proxy",
      enabled: envFlag(secrets.proxyUrl ?? undefined),
      priority: 2,
    },
    {
      type: "scraping_api",
      enabled: envFlag(secrets.scrapingApiEndpoint) && envFlag(secrets.scrapingApiKey),
      priority: 3,
    },
  ];
}

export function getEnabledInternalProviders(): SourceAccessProviderConfig[] {
  return getSourceAccessProviderRegistry()
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);
}

export function hasAnyInternalProvider(): boolean {
  return getEnabledInternalProviders().length > 0;
}

export function getInternalSourceAccessSecrets() {
  const browserWorkerEndpoint =
    process.env.BROWSER_WORKER_URL?.trim() ||
    process.env.BROWSER_WORKER_ENDPOINT?.trim() ||
    null;
  return {
    browserWorkerEndpoint,
    browserWorkerToken: process.env.BROWSER_WORKER_TOKEN?.trim() || null,
    proxyUrl: process.env.INTERNAL_PROXY_URL?.trim() || null,
    scrapingApiEndpoint: process.env.INTERNAL_SCRAPING_API_ENDPOINT?.trim() || null,
    scrapingApiKey: process.env.INTERNAL_SCRAPING_API_KEY?.trim() || null,
    localAgentEndpoint: process.env.INTERNAL_LOCAL_AGENT_ENDPOINT?.trim() || null,
    localAgentToken: process.env.INTERNAL_LOCAL_AGENT_TOKEN?.trim() || null,
  };
}

export function pickPrimaryInternalProviderType(): InternalProviderType | "none" {
  return getEnabledInternalProviders()[0]?.type ?? "none";
}
