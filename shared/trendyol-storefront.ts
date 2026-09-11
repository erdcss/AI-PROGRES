/** Public storefront preferences; product, seller and variant parameters stay intact. */
export function isTrendyolStorefrontHost(hostname: string): boolean {
  return ["trendyol.com", "www.trendyol.com"].includes(hostname.toLowerCase());
}

export function withTrendyolTurkeyStorefront(raw: string): string {
  const url = new URL(raw);
  if (!isTrendyolStorefrontHost(url.hostname)) return raw;
  url.searchParams.set("storefrontId", "1");
  url.searchParams.set("countryCode", "TR");
  url.searchParams.set("language", "tr");
  return url.toString();
}

export function isTrendyolCountrySelection(raw?: string | null): boolean {
  try {
    const url = new URL(raw || "");
    return isTrendyolStorefrontHost(url.hostname) &&
      /^\/(?:[a-z]{2}\/)?select-country\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}
