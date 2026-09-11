import type { Page, Response } from "playwright";
import {
  isTrendyolCountrySelection,
  isTrendyolStorefrontHost,
  withTrendyolTurkeyStorefront,
} from "../shared/trendyol-storefront";

/** Use the Turkish storefront even when the worker runs outside Türkiye. */
export async function gotoTrendyolPage(
  page: Page,
  requestedUrl: string,
  timeoutMs: number,
): Promise<Response | null> {
  const target = withTrendyolTurkeyStorefront(requestedUrl);
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  let response = await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: remaining(),
  });
  if (!isTrendyolCountrySelection(page.url()) || (response?.status() ?? 200) >= 400) {
    return response;
  }

  // Select the public Türkiye store once, in this same context so its preferences
  // survive the return to the product. Never retry challenge or login pages here.
  const turkeyLink = page.getByRole("link", { name: /^(?:Trendyol\s+)?(?:Türkiye|Turkey)$/i }).first();
  if (remaining() < 1_000 || !(await turkeyLink.isVisible())) return response;
  const href = await turkeyLink.getAttribute("href");
  if (!href) return response;
  const destination = new URL(href, page.url());
  if (!isTrendyolStorefrontHost(destination.hostname) ||
      !["http:", "https:"].includes(destination.protocol) ||
      !["/", "/tr", "/tr/"].includes(destination.pathname)) return response;

  await turkeyLink.click({ timeout: Math.min(5_000, remaining()) });
  if (remaining() < 1_000) return response;
  response = await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: remaining(),
  });
  return response;
}
