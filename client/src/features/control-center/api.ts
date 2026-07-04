import type { ControlCenterSummary, ImportJobRow } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchControlCenterSummary() {
  return fetchJson<ControlCenterSummary>("/api/control-center/summary");
}

export function fetchControlCenterHealth() {
  return fetchJson<Record<string, unknown>>("/api/control-center/health");
}

export function fetchImportJobs(page = 1, status?: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status) params.set("status", status);
  return fetchJson<{ items: ImportJobRow[]; total: number; totalPages: number }>(
    `/api/import-jobs?${params}`,
  );
}

export async function createImportJob(sourceUrl: string) {
  const res = await fetch("/api/import-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceUrl,
      sourcePlatform: "trendyol",
      scrapeMode: "auto",
      uploadMode: "manual_approval",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "İş oluşturulamadı");
  return data as { jobId: string; status: string };
}

export async function approveImportJob(jobId: string) {
  const res = await fetch(`/api/import-jobs/${jobId}/approve`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Onay başarısız");
  return data;
}
