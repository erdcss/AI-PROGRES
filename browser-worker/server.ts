import "dotenv/config";
import express from "express";
import { chromium, type Browser, type BrowserContext } from "playwright";

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.BROWSER_WORKER_TOKEN?.trim();
const NAV_TIMEOUT_MS = Number(process.env.BROWSER_NAV_TIMEOUT_MS ?? 40_000);
const STARTED_AT = Date.now();

if (!TOKEN) {
  console.error("BROWSER_WORKER_TOKEN tanımlı değil — worker başlatılamıyor.");
  process.exit(1);
}

let browser: Browser | null = null;
let browserReady = false;

export type BrowserWorkerErrorCategory =
  | "timeout"
  | "blocked"
  | "navigation"
  | "auth"
  | "invalid-url"
  | "unknown";

function extractToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const header = req.headers["x-browser-worker-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    return true;
  }
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === "0.0.0.0") return true;
  return false;
}

export function validatePublicHttpUrl(raw: string): URL {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new Error("invalid-url");
  const u = new URL(trimmed);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid-url");
  if (isPrivateHost(u.hostname)) throw new Error("invalid-url");
  return u;
}

function extractBalancedJsonObject(html: string, startIndex: number): unknown | null {
  const open = html.indexOf("{", startIndex);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseTrendyolProductDetailState(html: string): Record<string, unknown> | null {
  const markers = [
    "window.__PRODUCT_DETAIL_APP_INITIAL_STATE__=",
    "window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ =",
    "__PRODUCT_DETAIL_APP_INITIAL_STATE__=",
    "__PRODUCT_DETAIL_APP_INITIAL_STATE__ =",
  ];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const state = extractBalancedJsonObject(html, idx + marker.length);
    if (state && typeof state === "object") return state as Record<string, unknown>;
  }
  return null;
}

function extractJsonLdFromHtml(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1].trim()));
    } catch {
      // skip invalid blocks
    }
  }
  return results;
}

function buildRawProductJson(state: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!state) return null;
  const product = state.product;
  if (product && typeof product === "object") return product as Record<string, unknown>;
  return state;
}

async function ensureBrowser(): Promise<Browser> {
  if (browser && browserReady) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  browserReady = true;
  return browser;
}

async function withPage<T>(fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const b = await ensureBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "tr-TR",
    viewport: { width: 1366, height: 900 },
  });
  try {
    return await fn(context);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function fetchPageHtml(url: string): Promise<{
  html: string;
  finalUrl: string;
  status: number;
  durationMs: number;
}> {
  const start = Date.now();
  return withPage(async (context) => {
    const page = await context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
      await page.waitForTimeout(1500);
      const html = await page.content();
      return {
        html,
        finalUrl: page.url(),
        status: response?.status() ?? 0,
        durationMs: Date.now() - start,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  });
}

function categorizePlaywrightError(err: unknown): BrowserWorkerErrorCategory {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  if (lower.includes("net::err_blocked") || lower.includes("access denied")) return "blocked";
  if (lower.includes("navigation") || lower.includes("err_name_not_resolved")) return "navigation";
  if (message === "invalid-url") return "invalid-url";
  return "unknown";
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "browser-worker",
    browserReady,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    version: "1.0.0",
  });
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractToken(req);
  if (!token || token !== TOKEN) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      errorCategory: "auth" satisfies BrowserWorkerErrorCategory,
    });
  }
  return next();
}

app.post("/scrape/html", requireAuth, async (req, res) => {
  const start = Date.now();
  try {
    const parsed = validatePublicHttpUrl(String(req.body?.url ?? ""));
    const url = parsed.toString();
    const page = await fetchPageHtml(url);
    return res.json({
      ok: true,
      url,
      finalUrl: page.finalUrl,
      status: page.status,
      html: page.html,
      durationMs: page.durationMs,
    });
  } catch (err) {
    const category = categorizePlaywrightError(err);
    const status = category === "invalid-url" ? 400 : category === "auth" ? 401 : 422;
    return res.status(status).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCategory: category,
      durationMs: Date.now() - start,
    });
  }
});

app.post("/scrape/trendyol", requireAuth, async (req, res) => {
  const start = Date.now();
  try {
    const parsed = validatePublicHttpUrl(String(req.body?.url ?? ""));
    const url = parsed.toString();
    if (!url.includes("trendyol.com")) {
      return res.status(400).json({
        ok: false,
        error: "Trendyol URL gerekli",
        errorCategory: "invalid-url" satisfies BrowserWorkerErrorCategory,
      });
    }

    const page = await fetchPageHtml(url);
    const state = parseTrendyolProductDetailState(page.html);
    const rawProductJson = buildRawProductJson(state);
    const jsonLd = extractJsonLdFromHtml(page.html);

    return res.json({
      ok: true,
      url,
      finalUrl: page.finalUrl,
      status: page.status,
      html: page.html,
      jsonLd,
      rawProductJson: rawProductJson ?? {},
      durationMs: page.durationMs,
    });
  } catch (err) {
    const category = categorizePlaywrightError(err);
    const status = category === "invalid-url" ? 400 : 422;
    return res.status(status).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCategory: category,
      durationMs: Date.now() - start,
    });
  }
});

async function boot() {
  try {
    await ensureBrowser();
    console.log("Browser Worker: Chromium hazır");
  } catch (err) {
    browserReady = false;
    console.error("Browser Worker: Chromium başlatılamadı", err instanceof Error ? err.message : err);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Browser Worker running on http://0.0.0.0:${PORT}`);
    console.log("  GET  /health");
    console.log("  POST /scrape/html");
    console.log("  POST /scrape/trendyol");
  });
}

boot().catch((err) => {
  console.error("Browser Worker fatal:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  if (browser) await browser.close().catch(() => undefined);
  process.exit(0);
});
