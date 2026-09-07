/**
 * MARKT-GO External Catalog API v1 client.
 * Does not import Shopify Admin helpers.
 *
 * api.turmarkt.com bazen eksik ara sertifika zinciri yüzünden Node TLS
 * doğrulamasında düşer (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Bu durumda bir kez
 * gevşek TLS ile yeniden dener; MARKTGO_TLS_INSECURE=true ile kalıcı açılır.
 */
import https from "https";
import http from "http";
import { URL } from "url";
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

function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec > 0) return Math.min(60_000, sec * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.min(60_000, Math.max(0, when - Date.now()));
  return null;
}

function envTlsInsecure(): boolean {
  const v = String(process.env.MARKTGO_TLS_INSECURE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isTlsCertError(err: unknown): boolean {
  const any = err as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  const code = String(any?.code || any?.cause?.code || "");
  const msg = String(any?.message || any?.cause?.message || err || "");
  return (
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "CERT_HAS_EXPIRED" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    /unable to verify the first certificate|self[- ]?signed|certificate/i.test(msg)
  );
}

type RawResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
};

let tlsFallbackWarned = false;

function requestOnce(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
  insecureTls: boolean,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const agent = isHttps
      ? new https.Agent({ rejectUnauthorized: !insecureTls, keepAlive: true })
      : undefined;

    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        agent,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const headerMap: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v == null) continue;
            headerMap[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
          }
          resolve({
            status: res.statusCode || 0,
            headers: headerMap,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy();
      reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function marktGoHttp(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<RawResponse> {
  const preferInsecure = envTlsInsecure();
  try {
    return await requestOnce(url, method, headers, body, timeoutMs, preferInsecure);
  } catch (err) {
    if (!preferInsecure && isTlsCertError(err)) {
      if (!tlsFallbackWarned) {
        tlsFallbackWarned = true;
        console.warn(
          "[marktgo] TLS sertifika zinciri doğrulanamadı — güvenli olmayan TLS ile yeniden deneniyor (MARKTGO_TLS_INSECURE=true ile kalıcı yapabilirsiniz)",
        );
      }
      return requestOnce(url, method, headers, body, timeoutMs, true);
    }
    throw err;
  }
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
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        };
        if (opts?.body !== undefined) headers["Content-Type"] = "application/json";
        if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

        const body =
          opts?.body !== undefined ? JSON.stringify(opts.body) : undefined;
        if (body) headers["Content-Length"] = String(Buffer.byteLength(body));

        const res = await marktGoHttp(url, method, headers, body, this.timeoutMs);

        let json: unknown = null;
        try {
          json = res.text ? JSON.parse(res.text) : null;
        } catch {
          json = null;
        }

        if (res.status >= 200 && res.status < 300) {
          return (json ?? ({} as T)) as T;
        }

        const err = normalizeMarktGoHttpError(res.status, res.text);
        if (res.status === 429) {
          const wait = parseRetryAfter(res.headers["retry-after"]) ?? 500 * 2 ** attempt;
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
        const tls = isTlsCertError(err);
        lastErr = aborted
          ? new MarktGoApiError("MARKT-GO isteği zaman aşımına uğradı.", 0, "timeout", true)
          : new MarktGoApiError(
              tls
                ? "MARKT-GO TLS sertifikası doğrulanamadı. MARKTGO_TLS_INSECURE=true deneyin."
                : redactSecrets((err as Error)?.message || "MARKT-GO ağına ulaşılamadı."),
              0,
              tls ? "tls" : "network",
              true,
            );
        if (attempt < maxAttempts && lastErr.retryable) {
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }
        throw lastErr;
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

/** Auth gerektirmeyen mutlak URL (ör. /api/public/web-site-settings). */
export async function fetchMarktGoAbsoluteJson<T = unknown>(
  url: string,
  timeoutMs = 20_000,
): Promise<T> {
  const res = await marktGoHttp(url, "GET", { Accept: "application/json" }, undefined, timeoutMs);
  let json: unknown = null;
  try {
    json = res.text ? JSON.parse(res.text) : null;
  } catch {
    json = null;
  }
  if (res.status >= 200 && res.status < 300) {
    return (json ?? ({} as T)) as T;
  }
  throw normalizeMarktGoHttpError(res.status, res.text);
}
