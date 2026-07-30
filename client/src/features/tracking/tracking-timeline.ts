/** Takip zaman damgalarını okunabilir Türkçe metne çevirir */

export function formatTrackingDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type TrackingTimelinePoint = {
  label: string;
  at: string | Date | null | undefined;
};

export function buildProductTrackingTimeline(input: {
  productCreatedAt?: string | Date | null;
  shopifyTransferredAt?: string | Date | null;
  productLastCheckedAt?: string | Date | null;
  productLastSuccessAt?: string | Date | null;
  productLastShopifySyncAt?: string | Date | null;
  changeDetectedAt?: string | Date | null;
  changeAppliedAt?: string | Date | null;
}): TrackingTimelinePoint[] {
  return [
    { label: "Takibe alındı", at: input.productCreatedAt },
    { label: "Shopify'a aktarıldı", at: input.shopifyTransferredAt },
    { label: "Değişiklik tespit", at: input.changeDetectedAt },
    { label: "Shopify'da güncellendi", at: input.changeAppliedAt ?? input.productLastShopifySyncAt },
    { label: "Son kontrol", at: input.productLastCheckedAt ?? input.productLastSuccessAt },
  ].filter((p) => p.at);
}
