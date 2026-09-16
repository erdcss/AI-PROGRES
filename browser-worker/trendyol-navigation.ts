import type { Page, Response } from "playwright";
import {
  isTrendyolCountrySelection,
  isTrendyolStorefrontHost,
  withTrendyolTurkeyStorefront,
} from "../shared/trendyol-storefront";

import { trendyolPacer } from "./request-pacing";

const MIN_NAVIGATION_BUDGET_MS = 1_500;

/** Use the Turkish storefront even when the worker runs outside Türkiye. */
export async function gotoTrendyolPage(
  page: Page,
  requestedUrl: string,
  timeoutMs: number,
): Promise<Response | null> {
  const target = withTrendyolTurkeyStorefront(requestedUrl);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const remaining = () => Math.max(0, deadline - Date.now());
  const navigationBudget = () => {
    const left = remaining();
    if (left < MIN_NAVIGATION_BUDGET_MS) {
      throw new Error(`navigation-timeout-budget-exhausted (${left}ms remaining)`);
    }
    return left;
  };
  const navigate = () => trendyolPacer.run(async () => {
    const response = await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: navigationBudget(),
    });
    if (response?.status() === 429) trendyolPacer.pause(response.headers?.()["retry-after"]);
    return response;
  });
  let response = await navigate();
  if (!isTrendyolCountrySelection(page.url()) || (response?.status() ?? 200) >= 400) {
    return response;
  }

  // Select the public Türkiye store once, in this same context so its preferences
  // survive the return to the product. Never retry challenge or login pages here.
  const turkeyLink = page.getByRole("link", { name: /^(?:Trendyol\s+)?(?:Türkiye|Turkey)$/i }).first();
  if (remaining() < MIN_NAVIGATION_BUDGET_MS || !(await turkeyLink.isVisible())) return response;
  const href = await turkeyLink.getAttribute("href");
  if (!href) return response;
  const destination = new URL(href, page.url());
  if (!isTrendyolStorefrontHost(destination.hostname) ||
      !["http:", "https:"].includes(destination.protocol) ||
      !["/", "/tr", "/tr/"].includes(destination.pathname)) return response;

  await turkeyLink.click({ timeout: Math.min(5_000, navigationBudget()) });
  if (remaining() < MIN_NAVIGATION_BUDGET_MS) return response;
  response = await navigate();
  return response;
}
