import { apiFetch } from "./client";

export type MobileScrapeJob = {
  jobId: string;
  status: string;
  stage?: string;
  message?: string;
  progress?: number;
  result?: Record<string, any> | null;
  error?: string | null;
};

export type LiveScrapeJob = {
  jobId: string;
  status: string;
  progress: number;
  startedAt: string;
  elapsedMs: number;
  sourceUrl: string;
  title?: string;
  image?: string;
  error?: string;
};

export async function startTrendyolScrape(url: string, autoTagEnabled = false) {
  return apiFetch<any>("/api/trendyol-scrape", {
    method: "POST",
    body: JSON.stringify({
      url: url.trim(),
      mode: "single",
      onlyExtractData: true,
      scrapeMode: "direct-html",
      autoTagEnabled,
    }),
    timeoutMs: 30_000,
  });
}

export async function fetchTrendyolScrapeJob(jobId: string) {
  return apiFetch<any>(`/api/scrape-job/${encodeURIComponent(jobId)}`, {
    timeoutMs: 20_000,
  });
}

export async function fetchLiveTrendyolScrapeJobs() {
  return apiFetch<{ success: boolean; serverTime: string; jobs: LiveScrapeJob[] }>(
    "/api/mobile/scrape-jobs/live",
    { timeoutMs: 15_000 },
  );
}

export async function fetchMarktGoHealth() {
  return apiFetch<any>("/api/marktgo/health", { timeoutMs: 15_000 });
}

export async function sendProductToMarktGo(product: Record<string, any>) {
  return apiFetch<any>("/api/marktgo/products/sync", {
    method: "POST",
    body: JSON.stringify({ product: { ...product, fastUpload: true } }),
    timeoutMs: 90_000,
  });
}

export function normalizeScrapeProduct(raw: Record<string, any>, sourceUrl: string) {
  const priceRaw = raw?.price;
  const price =
    Number(priceRaw?.original ?? priceRaw?.sale ?? priceRaw?.amount ?? priceRaw ?? 0) || 0;
  const images = Array.isArray(raw?.images)
    ? raw.images.map((x: any) => (typeof x === "string" ? x : x?.url)).filter(Boolean)
    : [];
  const variantsRoot = raw?.variants && typeof raw.variants === "object" ? raw.variants : {};
  const variants = Array.isArray(variantsRoot?.allVariants)
    ? variantsRoot.allVariants
    : Array.isArray(raw?.variants)
      ? raw.variants
      : [];
  return {
    ...raw,
    title: String(raw?.title || raw?.productTitle || "Trendyol Ürünü"),
    brand: raw?.brand ? String(raw.brand) : undefined,
    category: raw?.category ? String(raw.category) : undefined,
    description: raw?.description ? String(raw.description) : undefined,
    sourceUrl,
    originalUrl: sourceUrl,
    salePrice: price,
    price,
    images,
    variants,
    fastUpload: true,
  };
}

export function resolveJobId(start: any): string | null {
  const value = start?.jobId ?? start?.id ?? start?.data?.jobId;
  return value ? String(value) : null;
}

export function resolveJobResult(job: any): Record<string, any> | null {
  const result = job?.result ?? job?.data?.result ?? job?.product ?? null;
  return result && typeof result === "object" ? result : null;
}

export function resolveJobProgress(job: any): number {
  const raw = Number(job?.progress ?? job?.data?.progress ?? 0);
  if (Number.isFinite(raw) && raw > 0) return raw <= 1 ? Math.round(raw * 100) : Math.min(100, Math.round(raw));
  const status = String(job?.status || "").toLowerCase();
  if (status === "success" || status === "partial_success") return 100;
  if (status.includes("process") || status.includes("run")) return 55;
  if (status.includes("queue") || status.includes("pending")) return 15;
  return 5;
}
