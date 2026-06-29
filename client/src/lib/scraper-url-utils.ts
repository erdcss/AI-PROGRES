import type { DragEvent } from "react";

export type UrlQueueStatus = "pending" | "processing" | "success" | "error";

export interface UrlQueueItem {
  url: string;
  status: UrlQueueStatus;
  error?: string;
}

export function isSupportedProductUrl(raw: string): boolean {
  const url = raw.trim().toLowerCase();
  return (
    url.includes("trendyol.com") ||
    url.includes("ty.gl/") ||
    url.includes("arcelik.com.tr") ||
    url.includes("pttavm.com")
  );
}

/** Canonical URL — hostname küçük harf, trailing slash kaldır, hash temizle */
export function normalizeProductUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.;]+$/g, "");
  if (!trimmed) return null;

  try {
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const parsed = new URL(href);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    const normalized = parsed.toString();
    return isSupportedProductUrl(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function dedupeNormalizedUrls(rawUrls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawUrls) {
    const normalized = normalizeProductUrl(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export function parseUrlsFromText(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  const candidates = [
    ...text.split(/\r?\n/),
    ...(text.match(urlPattern) ?? []),
  ];
  return dedupeNormalizedUrls(candidates.map((u) => u.trim()).filter(Boolean));
}

export function extractDroppedUrls(e: DragEvent): string[] {
  const candidates: string[] = [];

  const plain = e.dataTransfer.getData("text/plain");
  if (plain) {
    candidates.push(...plain.split(/\r?\n/));
    for (const match of plain.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      candidates.push(match[0]);
    }
  }

  const uriList = e.dataTransfer.getData("text/uri-list");
  if (uriList) {
    candidates.push(
      ...uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
    );
  }

  const html = e.dataTransfer.getData("text/html");
  if (html) {
    for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
      candidates.push(match[1]);
    }
  }

  return dedupeNormalizedUrls(candidates);
}

export function mergeUrlsIntoQueue(
  prev: UrlQueueItem[],
  normalizedUrls: string[],
): { next: UrlQueueItem[]; added: number } {
  const existing = new Set(prev.map((item) => item.url));
  const toAdd = normalizedUrls.filter((url) => !existing.has(url));
  if (toAdd.length === 0) {
    return { next: prev, added: 0 };
  }
  const next = [
    ...prev,
    ...toAdd.map((url) => ({ url, status: "pending" as const })),
  ];
  return { next, added: toAdd.length };
}

export type UrlIngestSource = "drop" | "paste" | "manual" | "browser" | "bulk";

export function buildIngestFingerprint(
  source: UrlIngestSource,
  urls: string[],
): string {
  return `${source}:${urls.join("\u0001")}`;
}

export function shouldSkipDuplicateIngest(
  last: { fingerprint: string; at: number } | null,
  fingerprint: string,
  windowMs = 500,
): boolean {
  if (!last) return false;
  return last.fingerprint === fingerprint && Date.now() - last.at < windowMs;
}
