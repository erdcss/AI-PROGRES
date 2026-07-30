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

/**
 * Liste/eski fiyat → aktif satış fiyatı düşüşünü ayırt et.
 * Örn. 20999 → 17755 (~%15) tipik Trendyol liste→ödenecek geçişi.
 */
export function looksLikeListToActiveCorrection(oldPrice: number, newPrice: number): boolean {
  if (!(oldPrice > 0 && newPrice > 0) || newPrice >= oldPrice) return false;
  const ratio = newPrice / oldPrice;
  return ratio >= 0.65 && ratio <= 0.95;
}

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

  if (Math.abs(ratio - 100) < 2 || Math.abs(ratio - 0.01) < 0.002) {
    return {
      shouldRecord: false,
      confidence: 0,
      status: "manual_review",
      reason: "Kuruş/TL ölçek hatası olası — kayıt oluşturulmadı",
    };
  }

  if (ratio >= 3 || ratio <= 1 / 3) {
    return {
      shouldRecord: true,
      confidence: 35,
      status: "manual_review",
      reason: `Aşırı fiyat farkı (%${pct.toFixed(0)}) — manuel doğrulama gerekli`,
    };
  }

  if (looksLikeListToActiveCorrection(oldPrice, newPrice)) {
    return {
      shouldRecord: true,
      confidence: 92,
      status: "pending",
      reason: "Aktif satış fiyatı liste/eski fiyattan ayrıldı — Shopify güncellemesi önerilir",
    };
  }

  // Belirgin artışlar (litre fiyatı / yanlış merchant) sık yanlış alarm üretir
  if (pct >= 25 && newPrice > oldPrice) {
    return {
      shouldRecord: true,
      confidence: 55,
      status: "manual_review",
      reason: "Belirgin fiyat artışı — kaynak fiyatı manuel doğrulayın",
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

  if (pct < 0.5 && Math.abs(newPrice - oldPrice) < 1) {
    return {
      shouldRecord: false,
      confidence: 0,
      status: "pending",
      reason: "Önemsiz fiyat farkı",
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

/** Kararlı varyant anahtarı — indeks içermez; SKU beden yerine geçmez */
export function stableVariantKey(parts: {
  color?: string | null;
  size?: string | null;
  option1?: string | null;
  option2?: string | null;
  key?: string | null;
  sku?: string | null;
}): string {
  const explicitKey = String(parts.key ?? "").trim();
  if (explicitKey) {
    // "renk::beden::3" gibi indeksli anahtarları normalize et
    const segments = explicitKey.split("::").map((s) => s.trim()).filter(Boolean);
    if (segments.length >= 3 && /^\d+$/.test(segments[segments.length - 1] ?? "")) {
      return segments
        .slice(0, -1)
        .join("::")
        .toLocaleLowerCase("tr-TR");
    }
    return explicitKey.toLocaleLowerCase("tr-TR");
  }
  const color = String(parts.color ?? parts.option1 ?? "Varsayılan").trim() || "Varsayılan";
  // SKU'yu beden sanma — aksi halde siyah::ty-… ile siyah::tek beden eşleşmez ve yanlış OOS üretilir
  const rawSize = String(parts.size ?? parts.option2 ?? "").trim();
  const size = rawSize || "Tek Beden";
  return `${color}::${size}`.toLocaleLowerCase("tr-TR");
}

/** Beden yok / tek beden / varsayılan — aynı SKU sayılır */
export function isPlaceholderVariantSize(size: string | null | undefined): boolean {
  const s = String(size ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");
  if (!s) return true;
  return (
    s === "tek beden" ||
    s === "standart" ||
    s === "std" ||
    s === "one size" ||
    s === "os" ||
    s === "varsayılan" ||
    s === "default" ||
    /^ty-\d+/i.test(s) // SKU'nun yanlışlıkla beden yazıldığı durum
  );
}

/** Renk eşleşmesi + placeholder bedenler için gevşek anahtar denkliği */
export function variantKeysLooselyEqual(a: string, b: string): boolean {
  const na = a.trim().toLocaleLowerCase("tr-TR");
  const nb = b.trim().toLocaleLowerCase("tr-TR");
  if (na === nb) return true;
  const [colorA = "", sizeA = ""] = na.split("::");
  const [colorB = "", sizeB = ""] = nb.split("::");
  const colorPlaceholders = new Set(["", "varsayılan", "tek renk", "default"]);
  const colorOk =
    colorA === colorB ||
    (colorPlaceholders.has(colorA) && !colorPlaceholders.has(colorB)) ||
    (colorPlaceholders.has(colorB) && !colorPlaceholders.has(colorA));
  if (!colorOk && colorA !== colorB) return false;
  if (colorA !== colorB && !colorPlaceholders.has(colorA) && !colorPlaceholders.has(colorB)) {
    return false;
  }
  return isPlaceholderVariantSize(sizeA) && isPlaceholderVariantSize(sizeB);
}
