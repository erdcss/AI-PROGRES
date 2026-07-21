/** Takip sisteminde fiyat/stok mantık kontrolleri */

export const MIN_PLAUSIBLE_TRENDYOL_PRICE = 29;
export const MAX_PLAUSIBLE_TRENDYOL_PRICE = 500_000;
export const SUSPICIOUS_DEFAULT_PRICES = [50, 99, 100] as const;

export function isPlausibleProductPrice(price: unknown): price is number {
  const n = typeof price === "number" ? price : Number(price);
  return (
    Number.isFinite(n) &&
    n >= MIN_PLAUSIBLE_TRENDYOL_PRICE &&
    n <= MAX_PLAUSIBLE_TRENDYOL_PRICE
  );
}

export function isSuspiciousDefaultPrice(price: number): boolean {
  const rounded = Math.round(price);
  return (SUSPICIOUS_DEFAULT_PRICES as readonly number[]).includes(rounded);
}

/** Küçük tam sayı (stok) pahalı ürün fiyatı sanılmış olabilir */
export function looksLikeStockMisread(price: number, referencePrice?: number | null): boolean {
  if (!Number.isFinite(price) || !Number.isInteger(price) || price < 1 || price > 99) {
    return false;
  }
  if (referencePrice != null && referencePrice >= 150 && price <= 25) return true;
  if (referencePrice != null && referencePrice >= 500 && price <= 50) return true;
  return false;
}

export type FetchedPriceValidation = {
  ok: boolean;
  acceptAsBaseline: boolean;
  reason?: string;
};

/** Yeni çekilen fiyat güvenilir mi? */
export function validateFetchedPrice(
  newPrice: number,
  baselinePrice?: number | null,
): FetchedPriceValidation {
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, acceptAsBaseline: false, reason: "Fiyat alınamadı" };
  }

  if (!isPlausibleProductPrice(newPrice)) {
    return {
      ok: false,
      acceptAsBaseline: false,
      reason: `Fiyat makul aralıkta değil (${newPrice} ₺)`,
    };
  }

  if (isSuspiciousDefaultPrice(newPrice)) {
    return {
      ok: false,
      acceptAsBaseline: false,
      reason: "Şüpheli varsayılan fiyat (100/99/50 ₺)",
    };
  }

  if (baselinePrice != null && isPlausibleProductPrice(baselinePrice)) {
    if (looksLikeStockMisread(newPrice, baselinePrice)) {
      return {
        ok: false,
        acceptAsBaseline: false,
        reason: "Stok sayısı fiyat olarak okunmuş olabilir",
      };
    }

    const ratio = newPrice / baselinePrice;
    if (ratio >= 4 || ratio <= 0.25) {
      return {
        ok: false,
        acceptAsBaseline: false,
        reason: `Bilinen fiyattan çok farklı (${baselinePrice} ₺ → ${newPrice} ₺)`,
      };
    }
  }

  return { ok: true, acceptAsBaseline: true };
}

export type PriceChangeAssessment = {
  shouldRecord: boolean;
  confidence: number;
  status: "pending" | "manual_review";
  reason?: string;
};

/** İki güvenilir fiyat arasındaki değişimi değerlendir */
export function assessPriceChange(oldPrice: number, newPrice: number): PriceChangeAssessment {
  if (!isPlausibleProductPrice(oldPrice) || isSuspiciousDefaultPrice(oldPrice)) {
    return {
      shouldRecord: false,
      confidence: 0,
      status: "manual_review",
      reason: "Önceki fiyat güvenilir değil — kayıt oluşturulmadı",
    };
  }

  if (!isPlausibleProductPrice(newPrice) || isSuspiciousDefaultPrice(newPrice)) {
    return {
      shouldRecord: false,
      confidence: 0,
      status: "manual_review",
      reason: "Yeni fiyat güvenilir değil",
    };
  }

  if (looksLikeStockMisread(oldPrice, newPrice) || looksLikeStockMisread(newPrice, oldPrice)) {
    return {
      shouldRecord: false,
      confidence: 0,
      status: "manual_review",
      reason: "Stok/fiyat karışması olası",
    };
  }

  const ratio = newPrice / oldPrice;
  const pct = Math.abs((newPrice - oldPrice) / oldPrice) * 100;

  if (ratio >= 3 || ratio <= 1 / 3) {
    return {
      shouldRecord: true,
      confidence: 35,
      status: "manual_review",
      reason: `Aşırı fiyat farkı (%${pct.toFixed(0)}) — manuel doğrulama gerekli`,
    };
  }

  if (pct >= 40) {
    return {
      shouldRecord: true,
      confidence: 65,
      status: "manual_review",
      reason: "Büyük fiyat değişimi",
    };
  }

  return { shouldRecord: true, confidence: 95, status: "pending" };
}

/** Snapshot fiyatını baseline ile düzelt */
export function resolveReliableBaselinePrice(
  snapshotPrice: number | null,
  knownGoodPrice?: number | null,
): number | null {
  const baseline =
    knownGoodPrice != null && isPlausibleProductPrice(knownGoodPrice)
      ? knownGoodPrice
      : null;

  if (snapshotPrice == null || !Number.isFinite(snapshotPrice)) {
    return baseline;
  }

  const snapOk = isPlausibleProductPrice(snapshotPrice) && !isSuspiciousDefaultPrice(snapshotPrice);
  const snapLooksLikeStock = baseline != null && looksLikeStockMisread(snapshotPrice, baseline);

  if (!snapOk || snapLooksLikeStock) {
    return baseline ?? (snapOk ? snapshotPrice : null);
  }

  return snapshotPrice;
}

/** Kararlı varyant anahtarı — indeks içermez */
export function stableVariantKey(parts: {
  color?: string | null;
  size?: string | null;
  option1?: string | null;
  option2?: string | null;
  key?: string | null;
  sku?: string | null;
}): string {
  const explicitKey = String(parts.key ?? "").trim();
  if (explicitKey) return explicitKey.toLocaleLowerCase("tr-TR");
  const color = String(parts.color ?? parts.option1 ?? "Varsayılan").trim();
  const size = String(parts.size ?? parts.option2 ?? parts.sku ?? "Tek Beden").trim();
  return `${color}::${size}`.toLowerCase();
}
