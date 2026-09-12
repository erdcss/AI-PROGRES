import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { RequestPacer, TrendyolRateLimitError } from "../../browser-worker/request-pacing";
import { collectReviewPages, type ReviewBatch } from "../../browser-worker/review-pagination";
import { classifyPageContent, shouldRetryNavigation, workerErrorCategoryFromDiagnostics } from "../../browser-worker/page-diagnostics";
import { inferBrowserWorkerBlocked, scrapeTrendyolWithBrowserWorker } from "../services/browser-worker-client.service";
import { createTrendyolReviewsClient } from "../../client/src/lib/trendyol-reviews-client";

test("shared request budget serializes concurrent product/review starts", async () => {
  let now = 1000;
  const pacer = new RequestPacer(2500, () => now, async ms => { now += ms; });
  const starts: number[] = [];
  await Promise.all([1, 2, 3].map(() => pacer.run(async () => { starts.push(now); })));
  assert.deepEqual(starts, [1000, 3500, 6000]);
});

test("429 blocks queued requests and honors Retry-After without shortening it", async () => {
  let now = 1000;
  const pacer = new RequestPacer(2500, () => now, async ms => { now += ms; });
  let requests = 0;
  const first = pacer.run(async () => { requests++; pacer.pause("120"); });
  const queued = pacer.run(async () => { requests++; });
  await first;
  await assert.rejects(queued, TrendyolRateLimitError);
  assert.equal(requests, 1);
  assert.equal(pacer.retryAfterMs, 120_000);
  pacer.pause("1");
  assert.equal(pacer.retryAfterMs, 120_000);
  now += 120_000;
  await pacer.run(async () => { requests++; });
  assert.equal(requests, 2);
  pacer.pause(new Date(now + 180_000).toUTCString());
  assert.equal(pacer.retryAfterMs, 180_000);
});

test("a short HTTP 429 page is rate limiting, never a bot challenge", () => {
  const diag = classifyPageContent({ html: "Too Many Requests", navigationStatus: 429,
    finalUrl: "https://www.trendyol.com/test/item-p-814869537" });
  assert.equal(diag.contentClass, "rate-limit");
  assert.equal(diag.challengeBlocked, false);
  assert.equal(shouldRetryNavigation(diag), false);
  assert.equal(workerErrorCategoryFromDiagnostics(diag), "rate-limit");
  assert.equal(inferBrowserWorkerBlocked({ html: "Too Many Requests", diagnostics: diag }), false);
});

const batch = (ids: number[], totalPages = 3): ReviewBatch => ({ ok: true, status: 200,
  reviews: ids.map(id => ({ id, comment: `Review ${id}`, rate: 5 })), summary: { totalPages } });

test("review pagination retains all unique pages and resumes at the first failed page", async () => {
  const requested: number[] = [];
  const result = await collectReviewPages({ maxPages: 10, deadline: Date.now() + 60_000,
    fetchPage: async index => { requested.push(index); return index === 2 ?
      { ok: false, status: 429, reviews: [], summary: null, retryAfterMs: 90_000 } : batch(index ? [2, 3] : [1, 2]); } });
  assert.deepEqual(requested, [0, 1, 2]);
  assert.deepEqual(result.reviews.map(r => r.id), [1, 2, 3]);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.totalPages, 3);
  assert.equal(result.nextPage, 2);
  assert.equal(result.partial, true);
  assert.equal(result.retryAfterMs, 90_000);
  const resumed = await collectReviewPages({ startPage: result.nextPage!, maxPages: 10,
    deadline: Date.now() + 60_000, fetchPage: async index => { assert.equal(index, 2); return batch([4]); } });
  assert.equal(resumed.partial, false);
  assert.equal(resumed.pagesFetched, 1);
  assert.equal(resumed.nextPage, null);
});

test("first-page errors reject; a verified empty review array is zero reviews", async () => {
  await assert.rejects(collectReviewPages({ maxPages: 10, deadline: Date.now() + 60_000,
    fetchPage: async () => ({ ok: false, status: 418, reviews: [], summary: null }) }), /418/);
  const empty = await collectReviewPages({ maxPages: 10, deadline: Date.now() + 60_000,
    fetchPage: async () => batch([], 0) });
  assert.deepEqual(empty.reviews, []);
  assert.equal(empty.partial, false);
});

test("maxPages is a batch limit, not a fabricated total page count", async () => {
  const result = await collectReviewPages({ maxPages: 2, deadline: Date.now() + 60_000,
    fetchPage: async index => batch([index + 1], 40) });
  assert.equal(result.totalPages, 40);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.nextPage, 2);
});

const url = "https://www.trendyol.com/pirantech/test-p-814869537";
const review = (id: string) => ({ id, body: `Review ${id}`, rating: 5 });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

test("review client coalesces duplicate cards, follows batches and caches complete results", async () => {
  const pages: number[] = [];
  const client = createTrendyolReviewsClient((async (_url, init) => {
    const start = JSON.parse(String(init?.body)).startPage;
    pages.push(start);
    return response({ success: true, productTitle: "Test", reviews: [review(String(start))],
      meta: start === 0 ? { partial: true, nextPage: 10 } : { partial: false, nextPage: null } });
  }) as typeof fetch, async () => undefined);
  const [a, b] = await Promise.all([client(url), client(url)]);
  assert.deepEqual(pages, [0, 10]);
  assert.equal(a.reviews.length, 2);
  assert.deepEqual(a, b);
  await client(url);
  assert.deepEqual(pages, [0, 10]);
});

test("review client preserves comments during cooldown and resumes instead of starting over", async () => {
  let now = 1000;
  const pages: number[] = [];
  const client = createTrendyolReviewsClient((async (_url, init) => {
    const start = JSON.parse(String(init?.body)).startPage;
    pages.push(start);
    return response({ success: true, productTitle: "Test", reviews: [review(String(start))],
      meta: start === 0 ? { partial: true, nextPage: 1, retryAfterMs: 120_000, warning: "HTTP 429" } : { partial: false } });
  }) as typeof fetch, async () => undefined, () => now);
  const partial = await client(url);
  assert.equal(partial.partial, true);
  assert.equal(partial.reviews.length, 1);
  await client(url);
  assert.deepEqual(pages, [0]);
  now += 120_000;
  const full = await client(url);
  assert.deepEqual(pages, [0, 1]);
  assert.equal(full.reviews.length, 2);
  assert.equal(full.partial, false);
});

test("failed review requests are not cached as successful zero-review products", async () => {
  let calls = 0;
  const client = createTrendyolReviewsClient((async () => {
    calls++; return response({ success: false, error: "upstream failed" }, 502);
  }) as typeof fetch, async () => undefined);
  assert.equal((await client(url)).success, false);
  assert.equal((await client(url)).success, false);
  assert.equal(calls, 2);
});

test("worker client forwards 429 and Retry-After without recording a ban", async () => {
  const oldAdapter = axios.defaults.adapter;
  const oldUrl = process.env.BROWSER_WORKER_URL;
  const oldToken = process.env.BROWSER_WORKER_TOKEN;
  process.env.BROWSER_WORKER_URL = "https://worker.test";
  process.env.BROWSER_WORKER_TOKEN = "test-token";
  axios.defaults.adapter = async config => ({ config, status: 429, statusText: "Too Many Requests", headers: {},
    data: { ok: false, status: 429, errorCategory: "rate-limit", retryAfterMs: 125_000, html: "Too Many Requests" } });
  try {
    const result = await scrapeTrendyolWithBrowserWorker(url);
    assert.equal(result.stageError, "trendyol-rate-limited");
    assert.equal(result.errorCategory, "rate-limit");
    assert.equal(result.retryAfterMs, 125_000);
  } finally {
    axios.defaults.adapter = oldAdapter;
    if (oldUrl === undefined) delete process.env.BROWSER_WORKER_URL; else process.env.BROWSER_WORKER_URL = oldUrl;
    if (oldToken === undefined) delete process.env.BROWSER_WORKER_TOKEN; else process.env.BROWSER_WORKER_TOKEN = oldToken;
  }
});
