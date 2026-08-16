/**
 * MARKT-GO External Catalog API v1 client.
 * Does not import Shopify Admin helpers.
 */
import { redactSecrets } from "../../lib/secret-crypto";
import { MarktGoApiError, normalizeMarktGoHttpError } from "./errors";

export type MarktGoClientOptions = {
  baseUrl: string;
  accessToken: string;
  timeoutMs?: number;
};

function joinUrl(base: string, path: string): string {
  const b = String(base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec > 0) return Math.min(60_000, sec * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.min(60_000, Math.max(0, when - Date.now()));
  return null;
}

export class MarktGoClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly timeoutMs: number;

  constructor(opts: MarktGoClientOptions) {
    this.baseUrl = String(opts.baseUrl || "").trim();
    this.accessToken = String(opts.accessToken || "").trim();
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    if (!this.baseUrl) throw new MarktGoApiError("MARKT-GO API Base URL eksik", 0, "config");
    if (!this.accessToken) throw new MarktGoApiError("MARKT-GO access token eksik", 0, "config");
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts?: { body?: unknown; idempotencyKey?: string; retry?: boolean },
  ): Promise<T> {
    const url = joinUrl(this.baseUrl, path);
    const maxAttempts = opts?.retry === false ? 1 : 2;
    let lastErr: MarktGoApiError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        };
        if (opts?.body !== undefined) headers["Content-Type"] = "application/json";
        if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

        const res = await fetch(url, {
          method,
          headers,
          body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });

        const text = await res.text();
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (res.ok) {
          return (json ?? ({} as T)) as T;
        }

        const err = normalizeMarktGoHttpError(res.status, text);
        if (res.status === 429) {
          const wait = parseRetryAfter(res.headers.get("retry-after")) ?? 500 * 2 ** attempt;
          lastErr = err;
          if (attempt < maxAttempts) {
            await sleep(wait);
            continue;
          }
        }
        if (err.retryable && attempt < maxAttempts) {
          lastErr = err;
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      } catch (err) {
        if (err instanceof MarktGoApiError) throw err;
        const aborted = (err as Error)?.name === "AbortError";
        lastErr = aborted
          ? new MarktGoApiError("MARKT-GO isteği zaman aşımına uğradı.", 0, "timeout", true)
          : new MarktGoApiError(
              redactSecrets((err as Error)?.message || "MARKT-GO ağına ulaşılamadı."),
              0,
              "network",
              true,
            );
        if (attempt < maxAttempts && lastErr.retryable) {
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }
        throw lastErr;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr || new MarktGoApiError("MARKT-GO isteği başarısız", 0, "unknown");
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body?: unknown, idempotencyKey?: string) {
    return this.request<T>("POST", path, { body, idempotencyKey });
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, { body });
  }
}

export function createMarktGoClient(opts: MarktGoClientOptions): MarktGoClient {
  return new MarktGoClient(opts);
}
