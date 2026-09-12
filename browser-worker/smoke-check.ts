import { isTrendyolStorefrontHost } from "../shared/trendyol-storefront";
import { filterValidProductImages, normalizeTrendyolImages } from "../shared/trendyol-product-images";

/** Opt-in deployment check. Uses the existing worker token locally; logs no secrets or HTML. */
export async function runConfiguredTrendyolSmokeCheck(port: number, token: string): Promise<void> {
  const configured = process.env.BROWSER_WORKER_SMOKE_URLS?.trim();
  if (!configured) return;
  let urls: unknown;
  try { urls = JSON.parse(configured); } catch { throw new Error("Smoke URLs must be a JSON array"); }
  if (!Array.isArray(urls) || urls.length > 2) throw new Error("At most two smoke URLs are allowed");
  for (const raw of urls) {
    const url = new URL(String(raw));
    const productId = url.pathname.match(/-p-(\d+)/)?.[1];
    if (!isTrendyolStorefrontHost(url.hostname) || url.protocol !== "https:" || !productId) {
      throw new Error("Smoke check requires a Trendyol HTTPS product URL");
    }
    console.log("[trendyol-smoke] start", JSON.stringify({ productId }));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/scrape/trendyol`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.toString(), includeColorFamily: false, deadlineMs: 30_000 }),
        signal: AbortSignal.timeout(35_000),
      });
      const data = await response.json() as any;
      const jsonLd = (data.jsonLd || []).flatMap((value: any) => Array.isArray(value) ? value : value?.["@graph"] || [value]);
      const product = data.rawProductJson?.product || data.rawProductJson ||
        jsonLd.find((value: any) => value?.["@type"] === "Product") || {};
      const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const price = Number(product.price?.discountedPrice?.value ?? product.price?.sellingPrice?.value ??
        product.price?.discountedPrice ?? product.price?.sellingPrice ?? offers?.price ?? offers?.lowPrice ?? 0);
      const images = filterValidProductImages(normalizeTrendyolImages(product.images || (Array.isArray(product.image) ? product.image : product.image ? [product.image] : [])));
      const resolvedProductId = String(product.id ?? product.contentId ?? (data.finalUrl ? new URL(data.finalUrl).pathname.match(/-p-(\d+)/)?.[1] : "") ?? "");
      const title = String(product.name || product.title || "");
      const ok = response.ok && data.ok === true && resolvedProductId === productId &&
        title.length > 5 && price > 0 && images.length > 0;
      console.log("[trendyol-smoke] result", JSON.stringify({
        ok, productId, resolvedProductId, title, price, imageCount: images.length,
        variantCount: Array.isArray(product.variants) ? product.variants.length : 0,
        contentClass: data.diagnostics?.contentClass,
        finalPath: data.finalUrl ? new URL(data.finalUrl).pathname : null,
        durationMs: data.durationMs, error: data.error,
      }));
    } catch (error) {
      console.warn("[trendyol-smoke] result", JSON.stringify({ ok: false, productId,
        error: error instanceof Error ? error.name : "unknown" }));
    }
  }
}
