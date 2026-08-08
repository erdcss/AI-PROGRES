/**
 * Trendyol ban / WAF guard — tek kaynak BlockSignal + circuit breaker + backoff.
 * Process-memory: restart ile sıfırlanır.
 */
import {
  isBlockedTrendyolHtml,
  isBlockedTrendyolTitle,
} from "@shared/trendyol-bot-detection";

export type TrendyolBlockKind =
  | "cloudflare"
  | "upstream-556"
  | "captcha"
  | "access-denied"
  | "rate-limit"
  | "bot-challenge"
  | "unknown";

export type TrendyolBlockSource =
  | "api"
  | "html"
  | "puppeteer"
  | "browser_worker"
  | "pipeline";

export type BlockSignal = {
  kind: TrendyolBlockKind;
  source: TrendyolBlockSource;
  httpStatus?: number;
  contentClass?: string;
  detail?: string;
};

export type TrendyolBlockStatus = {
  open: boolean;
  remainingMs: number;
  /** Epoch ms — circuit açıkken bitiş zamanı; kapalıysa null */
  openUntil: number | null;
  lastKind: TrendyolBlockKind | null;
  lastSource: TrendyolBlockSource | null;
  consecutiveFails: number;
  openedAt: number | null;
  cooldownMs: number;
  threshold: number;
};

type GuardState = {
  consecutiveFails: number;
  openUntil: number;
  lastKind: TrendyolBlockKind | null;
  lastSource: TrendyolBlockSource | null;
  openedAt: number | null;
};

const state: GuardState = {
  consecutiveFails: 0,
  openUntil: 0,
  lastKind: null,
  lastSource: null,
  openedAt: null,
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getBlockThreshold(): number {
  return envInt("TRENDYOL_BLOCK_THRESHOLD", 3);
}

export function getBlockCooldownMs(): number {
  return envInt("TRENDYOL_BLOCK_COOLDOWN_MS", 600_000);
}

export function getBlockBackoffBaseMs(): number {
  return envInt("TRENDYOL_BLOCK_BACKOFF_MS", 2_000);
}

/** Opsiyonel HTTP(S) proxy — Direct HTML / axios */
export function resolveTrendyolHttpProxy(): string | null {
  const v =
    process.env.TRENDYOL_HTTP_PROXY?.trim() ||
    process.env.INTERNAL_PROXY_URL?.trim() ||
    "";
  return v || null;
}

export function isTrendyolCircuitOpen(now = Date.now()): boolean {
  return state.openUntil > now;
}

export function getTrendyolBlockStatus(now = Date.now()): TrendyolBlockStatus {
  const remainingMs = Math.max(0, state.openUntil - now);
  return {
    open: remainingMs > 0,
    remainingMs,
    openUntil: remainingMs > 0 ? state.openUntil : null,
    lastKind: state.lastKind,
    lastSource: state.lastSource,
    consecutiveFails: state.consecutiveFails,
    openedAt: state.openedAt,
    cooldownMs: getBlockCooldownMs(),
    threshold: getBlockThreshold(),
  };
}

export function formatCircuitOpenUserMessage(status = getTrendyolBlockStatus()): string {
  const mins = Math.max(1, Math.ceil(status.remainingMs / 60_000));
  const kindLabel =
    status.lastKind === "upstream-556"
      ? "HTTP 556"
      : status.lastKind === "cloudflare"
        ? "Cloudflare"
        : status.lastKind === "captcha"
          ? "Captcha"
          : status.lastKind === "rate-limit"
            ? "Rate limit"
            : status.lastKind === "bot-challenge"
              ? "Bot challenge"
              : status.lastKind === "access-denied"
                ? "Access denied"
                : "WAF/bot koruması";
  return `Trendyol erişimi engelledi (${kindLabel}). Yaklaşık ${mins} dk bekleyin; tekrar denemek engeli uzatabilir.`;
}

export function classifyTrendyolBlock(input: {
  source: TrendyolBlockSource;
  httpStatus?: number | null;
  html?: string | null;
  title?: string | null;
  bodyPreview?: string | null;
  contentClass?: string | null;
  errorCategory?: string | null;
  errorMessage?: string | null;
}): BlockSignal | null {
  const status = Number(input.httpStatus) || 0;
  const contentClass = (input.contentClass || "").toLowerCase();
  const errCat = (input.errorCategory || "").toLowerCase();
  const msg = `${input.errorMessage || ""} ${input.bodyPreview || ""}`.toLowerCase();
  const html = input.html || "";
  const title = input.title || "";

  if (status === 556 || contentClass === "upstream-556" || /status code 556|\b556\b/.test(msg)) {
    return {
      kind: "upstream-556",
      source: input.source,
      httpStatus: status || 556,
      contentClass: contentClass || "upstream-556",
      detail: input.errorMessage || undefined,
    };
  }

  if (status === 429 || /too many requests|rate.?limit/i.test(msg)) {
    return {
      kind: "rate-limit",
      source: input.source,
      httpStatus: status || 429,
      contentClass: contentClass || undefined,
      detail: input.errorMessage || undefined,
    };
  }

  if (
    contentClass === "captcha" ||
    /captcha/i.test(msg) ||
    /captcha/i.test(html.slice(0, 8000))
  ) {
    return {
      kind: "captcha",
      source: input.source,
      httpStatus: status || undefined,
      contentClass: contentClass || "captcha",
      detail: input.errorMessage || undefined,
    };
  }

  if (
    contentClass === "cloudflare-challenge" ||
    /cloudflare|cf-browser-verification|challenge-platform|just a moment|attention required/i.test(
      msg,
    ) ||
    /cf-browser-verification|challenge-platform/i.test(html.slice(0, 12_000))
  ) {
    return {
      kind: "cloudflare",
      source: input.source,
      httpStatus: status || undefined,
      contentClass: contentClass || "cloudflare-challenge",
      detail: input.errorMessage || undefined,
    };
  }

  if (
    contentClass === "bot-challenge" ||
    errCat === "blocked" ||
    /bot challenge|bot-challenge|challengeBlocked/i.test(msg)
  ) {
    return {
      kind: "bot-challenge",
      source: input.source,
      httpStatus: status || undefined,
      contentClass: contentClass || "bot-challenge",
      detail: input.errorMessage || undefined,
    };
  }

  if (
    status === 403 ||
    contentClass === "access-denied" ||
    /access denied|"statusCode"\s*:\s*403/i.test(msg) ||
    /"statusCode"\s*:\s*403/.test(html.slice(0, 8000))
  ) {
    // Temiz ürün HTML'i 403 değilse product marker varsa engel sayma
    if (html && !isBlockedTrendyolHtml(html) && html.includes("__PRODUCT_DETAIL_APP_INITIAL_STATE__")) {
      /* fall through */
    } else {
      return {
        kind: "access-denied",
        source: input.source,
        httpStatus: status || 403,
        contentClass: contentClass || "access-denied",
        detail: input.errorMessage || undefined,
      };
    }
  }

  if (title && isBlockedTrendyolTitle(title)) {
    return {
      kind: /cloudflare|attention|just a moment/i.test(title)
        ? "cloudflare"
        : "bot-challenge",
      source: input.source,
      httpStatus: status || undefined,
      detail: `blocked-title:${title.slice(0, 80)}`,
    };
  }

  if (html && isBlockedTrendyolHtml(html)) {
    return {
      kind: "unknown",
      source: input.source,
      httpStatus: status || undefined,
      contentClass: contentClass || "blocked-html",
      detail: input.errorMessage || undefined,
    };
  }

  if (
    [
      "empty-document",
      "empty-body",
      "about-blank",
      "unknown-thin",
      "unknown-blocked-response",
    ].includes(contentClass)
  ) {
    return {
      kind: "bot-challenge",
      source: input.source,
      contentClass,
      detail: input.errorMessage || undefined,
    };
  }

  return null;
}

/** Confirmed WAF: aynı job içinde Direct HTML hammer etme */
export function shouldSkipDirectHtmlAfterBlock(signal: BlockSignal | null): boolean {
  if (!signal) return false;
  return (
    signal.kind === "cloudflare" ||
    signal.kind === "upstream-556" ||
    signal.kind === "captcha" ||
    signal.kind === "bot-challenge" ||
    signal.kind === "access-denied" ||
    signal.kind === "rate-limit"
  );
}

export function recordTrendyolBlock(signal: BlockSignal, now = Date.now()): TrendyolBlockStatus {
  state.consecutiveFails += 1;
  state.lastKind = signal.kind;
  state.lastSource = signal.source;

  const threshold = getBlockThreshold();
  if (state.consecutiveFails >= threshold) {
    const cooldown = getBlockCooldownMs();
    state.openUntil = now + cooldown;
    state.openedAt = now;
    console.warn("[TRENDYOL_BLOCK] circuit OPEN", {
      kind: signal.kind,
      source: signal.source,
      consecutiveFails: state.consecutiveFails,
      cooldownMs: cooldown,
    });
  } else {
    console.warn("[TRENDYOL_BLOCK] recorded", {
      kind: signal.kind,
      source: signal.source,
      consecutiveFails: state.consecutiveFails,
      threshold,
    });
  }

  return getTrendyolBlockStatus(now);
}

export function recordTrendyolSuccess(now = Date.now()): void {
  if (state.consecutiveFails > 0 || isTrendyolCircuitOpen(now)) {
    console.log("[TRENDYOL_BLOCK] success — consecutive fails cleared", {
      previousFails: state.consecutiveFails,
    });
  }
  state.consecutiveFails = 0;
  state.openUntil = 0;
  state.openedAt = null;
  // lastKind/source kept for diagnostics
}

/** Jitter'lı exponential backoff (engel sonrası) */
export function computeTrendyolBlockBackoffMs(consecutiveFails = state.consecutiveFails): number {
  const base = getBlockBackoffBaseMs();
  const exp = Math.min(6, Math.max(0, consecutiveFails));
  const raw = base * Math.pow(2, exp);
  const jitter = Math.floor(Math.random() * base);
  return Math.min(60_000, raw + jitter);
}

export async function waitTrendyolBlockBackoff(
  consecutiveFails = state.consecutiveFails,
): Promise<number> {
  const ms = computeTrendyolBlockBackoffMs(consecutiveFails);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  return ms;
}

/** Test / admin reset */
export function __resetTrendyolBlockGuardForTests(): void {
  state.consecutiveFails = 0;
  state.openUntil = 0;
  state.lastKind = null;
  state.lastSource = null;
  state.openedAt = null;
}

export function mapBlockSignalToStageError(
  signal: BlockSignal,
): "trendyol-blocked" | "upstream-556" | "trendyol-circuit-open" | "browser-worker-blocked" {
  if (signal.source === "browser_worker") return "browser-worker-blocked";
  if (signal.kind === "upstream-556") return "upstream-556";
  return "trendyol-blocked";
}
