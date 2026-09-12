/** One shared budget for product navigation and review pagination. */
export class TrendyolRateLimitError extends Error {
  readonly status = 429;
  readonly errorCategory = "rate-limit";
  constructor(readonly retryAfterMs: number) {
    super(`Trendyol HTTP 429 — ${Math.ceil(retryAfterMs / 1000)} saniye bekleyin.`);
  }
}

export class RequestPacer {
  private tail: Promise<unknown> = Promise.resolve();
  private nextStart = 0;
  private cooldownUntil = 0;
  constructor(
    private readonly intervalMs = 2_500,
    private readonly now = Date.now,
    private readonly sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
  ) {}
  get retryAfterMs(): number { return Math.max(0, this.cooldownUntil - this.now()); }
  pause(retryAfter?: string | null): number {
    const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
    const date = retryAfter ? Date.parse(retryAfter) : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000 :
      Number.isFinite(date) ? date - this.now() : 60_000;
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + Math.max(60_000, delay));
    return this.retryAfterMs;
  }
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(async () => {
      if (this.retryAfterMs > 0) throw new TrendyolRateLimitError(this.retryAfterMs);
      const wait = this.nextStart - this.now();
      if (wait > 0) await this.sleep(wait);
      if (this.retryAfterMs > 0) throw new TrendyolRateLimitError(this.retryAfterMs);
      this.nextStart = this.now() + this.intervalMs;
      return task();
    });
    this.tail = result;
    return result;
  }
}

export const trendyolPacer = new RequestPacer();
