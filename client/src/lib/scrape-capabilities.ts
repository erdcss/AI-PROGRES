export type ScrapeCapabilities = {
  isCloudRuntime: boolean;
  puppeteerAllowed: boolean;
  browserUiEnabled: boolean;
  platform?: string;
  envLoaded?: boolean;
  chromiumResolved?: boolean;
  chromiumExists?: boolean;
  chromiumSource?: string;
  localPuppeteerReady?: boolean;
  browserWorkerConfigured?: boolean;
  browserWorkerHealthy?: boolean;
  localAgentConfigured?: boolean;
  localAgentHealthy?: boolean;
  localAgentEphemeral?: boolean;
  selectedProviders?: string[];
  warnings?: string[];
  fatal?: boolean;
  globalTimeoutMs?: number;
  defaultScrapeMode: string;
  pipelineEndpoint?: string;
};

let cached: ScrapeCapabilities | null = null;

export async function fetchScrapeCapabilities(force = false): Promise<ScrapeCapabilities> {
  if (cached && !force) return cached;
  try {
    const res = await fetch("/api/runtime/scrape-capabilities", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cached = (await res.json()) as ScrapeCapabilities;
    return cached;
  } catch {
    return {
      isCloudRuntime: false,
      puppeteerAllowed: true,
      browserUiEnabled: true,
      defaultScrapeMode: "auto-fast",
    };
  }
}

export function formatScrapeCapabilitiesSummary(cap: ScrapeCapabilities): string {
  const providers = cap.selectedProviders?.join(" → ") || "trendyol_api → direct_html";
  return `Providers: ${providers} | BW: ${cap.browserWorkerHealthy ? "ok" : "off"} | Agent: ${cap.localAgentHealthy ? "ok" : "off"}`;
}
