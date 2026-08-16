export const DESTINATION_PROVIDER = {
  SHOPIFY: "shopify",
  MARKTGO: "marktgo",
} as const;

export type DestinationProviderId =
  (typeof DESTINATION_PROVIDER)[keyof typeof DESTINATION_PROVIDER];

export const MARKTGO_REQUIRED_SCOPES = [
  "products.read",
  "products.create",
  "products.update",
  "variants.read",
  "variants.create",
  "variants.update",
  "inventory.read",
  "inventory.update",
  "pricing.read",
  "pricing.update",
  "media.read",
  "media.create",
  "categories.read",
  "brands.read",
] as const;

export function isDestinationProvider(v: unknown): v is DestinationProviderId {
  return v === DESTINATION_PROVIDER.SHOPIFY || v === DESTINATION_PROVIDER.MARKTGO;
}

export function sendButtonLabel(provider: DestinationProviderId | "multi"): string {
  if (provider === DESTINATION_PROVIDER.SHOPIFY) return "Shopify'a Gönder";
  if (provider === DESTINATION_PROVIDER.MARKTGO) return "MARKT-GO'ya Gönder";
  return "Hedefe Gönder";
}
