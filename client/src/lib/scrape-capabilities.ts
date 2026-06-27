export type ScrapeCapabilities = {
  isCloudRuntime: boolean;
  puppeteerAllowed: boolean;
  browserUiEnabled: boolean;
  defaultScrapeMode: string;
  pipelineEndpoint?: string;
};

let cached: ScrapeCapabilities | null = null;

export async function fetchScrapeCapabilities(): Promise<ScrapeCapabilities> {
  if (cached) return cached;
  try {
    const res = await fetch("/api/runtime/scrape-capabilities");
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
