import { randomBytes } from "crypto";

/** Program içi benzersiz ürün kimliği — Shopify güncellemelerinde doğru ürün eşleşmesi için */
export function generateTrackingUid(input: {
  sourceSite?: string;
  sourceProductId?: string | null;
  sourceUrl: string;
}): string {
  const pid =
    input.sourceProductId?.trim() ||
    input.sourceUrl.match(/p-(\d+)/)?.[1] ||
    randomBytes(3).toString("hex");
  const suffix = randomBytes(4).toString("hex");
  const site = (input.sourceSite || "ty").slice(0, 3).toUpperCase();
  return `TRK-${site}-${pid}-${suffix}`.toUpperCase();
}

export function generateVariantUid(
  trackingUid: string,
  option1?: string | null,
  option2?: string | null,
  sku?: string | null,
): string {
  const parts = [option1, option2, sku]
    .filter((p) => p && String(p).trim())
    .map((p) =>
      String(p)
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9\-_.]/g, "")
        .slice(0, 24),
    );
  const key = parts.join("_") || "DEFAULT";
  return `${trackingUid}-V-${key}`.toUpperCase();
}
