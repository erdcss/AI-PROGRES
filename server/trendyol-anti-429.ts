/**
 * Süreç geneli Trendyol istek throttling + 429 cooldown.
 * Tüm scrape yolları (direct HTML, scenario, API) bu kuyruğu paylaşır.
 */
import {
  describeTrendyolRateLimit,
  trendyolBackoffMs,
} from "@shared/trendyol-rate-limit";

type Waiter = { resolve: () => void };

class TrendyolAnti429Gate {
  private waiters: Waiter[] = [];
  private active = 0;
  private maxConcurrent = 2;
  private minIntervalMs = 800;
  private lastStartAt = 0;
  private cooldownUntil = 0;
  private consecutiveRateLimits = 0;
  private totalRateLimits = 0;
  private mutex: Promise<void> = Promise.resolve();

  reportRateLimit(source = "unknown") {
    this.consecutiveRateLimits += 1;
    this.totalRateLimits += 1;
    const wait = trendyolBackoffMs(Math.min(this.consecutiveRateLimits, 5), {
      baseMs: 4000,
      maxMs: 120_000,
    });
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + wait);
    this.maxConcurrent = 1;
    this.minIntervalMs = Math.min(8000, 1200 + this.consecutiveRateLimits * 800);
    console.warn(
      `🛑 [anti-429] rate-limit (#${this.consecutiveRateLimits}) kaynak=${source} → ${Math.round(wait / 1000)}s cooldown, concurrency=1`,
    );
  }

  reportSuccess() {
    if (this.consecutiveRateLimits > 0) {
      this.consecutiveRateLimits = Math.max(0, this.consecutiveRateLimits - 1);
    }
    if (this.consecutiveRateLimits === 0) {
      this.maxConcurrent = 2;
      this.minIntervalMs = Math.max(600, Math.floor(this.minIntervalMs * 0.9));
    }
  }

  getStatus() {
    return {
      active: this.active,
      queued: this.waiters.length,
      maxConcurrent: this.maxConcurrent,
      minIntervalMs: Math.round(this.minIntervalMs),
      cooldownRemainingMs: Math.max(0, this.cooldownUntil - Date.now()),
      consecutiveRateLimits: this.consecutiveRateLimits,
      totalRateLimits: this.totalRateLimits,
      message: this.cooldownUntil > Date.now() ? describeTrendyolRateLimit() : null,
    };
  }

  async acquire(_label = "request"): Promise<() => void> {
    await new Promise<void>((resolve) => {
      this.waiters.push({ resolve });
      this.pump();
    });

    this.active += 1;
    this.lastStartAt = Date.now();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      this.pump();
    };
  }

  private pump() {
    this.mutex = this.mutex
      .then(async () => {
        while (this.waiters.length > 0 && this.active < this.maxConcurrent) {
          const coolLeft = this.cooldownUntil - Date.now();
          if (coolLeft > 0) {
            console.log(`⏳ [anti-429] cooldown ${Math.round(coolLeft / 1000)}s`);
            await sleep(coolLeft);
          }
          const gap = this.minIntervalMs - (Date.now() - this.lastStartAt);
          if (gap > 0 && this.active > 0) {
            await sleep(gap);
          } else if (gap > 0 && this.lastStartAt > 0) {
            await sleep(gap);
          }
          if (this.active >= this.maxConcurrent) break;
          const next = this.waiters.shift();
          if (!next) break;
          next.resolve();
          // acquire will increment active; wait a tick so it can
          await sleep(0);
        }
      })
      .catch((err) => {
        console.warn("[anti-429] pump error:", (err as Error).message);
      });
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const trendyolAnti429Gate = new TrendyolAnti429Gate();

export async function withTrendyolRateLimit<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await trendyolAnti429Gate.acquire(label);
  try {
    return await fn();
  } finally {
    release();
  }
}
