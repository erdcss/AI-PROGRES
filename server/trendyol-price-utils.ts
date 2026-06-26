/** Trendyol fiyat normalizasyonu — kuruş/TL ve Türkçe format desteği */

const PROFIT_MARGIN = 0.15;

export function parseTurkishPriceText(text: string): number {
  if (!text) return 0;

  const clean = text.replace(/[₺TLtl\s]/g, "").trim();
  if (!clean) return 0;

  const trThousands = clean.match(/^(\d{1,3}(?:\.\d{3})+),(\d{2})$/);
  if (trThousands) {
    const intPart = trThousands[1].replace(/\./g, "");
    return parseFloat(`${intPart}.${trThousands[2]}`);
  }

  const decimalComma = clean.match(/^(\d+),(\d{2})$/);
  if (decimalComma) {
    return parseFloat(`${decimalComma[1]}.${decimalComma[2]}`);
  }

  const decimalDot = clean.match(/^(\d+)\.(\d{2})$/);
  if (decimalDot) {
    return parseFloat(`${decimalDot[1]}.${decimalDot[2]}`);
  }

  const withSuffix = clean.match(/(\d{1,3}(?:\.\d{3})*),(\d{2})/);
  if (withSuffix) {
    const intPart = withSuffix[1].replace(/\./g, "");
    return parseFloat(`${intPart}.${withSuffix[2]}`);
  }

  const looseDecimal = clean.match(/(\d+)[,.](\d{2})/);
  if (looseDecimal) {
    return parseFloat(`${looseDecimal[1]}.${looseDecimal[2]}`);
  }

  const digits = clean.match(/(\d+)/);
  if (digits) {
    return normalizeTrendyolKurus(Number(digits[1]), "api");
  }

  return 0;
}

/** API/script sayısal değerleri kuruş → TL */
export function normalizeTrendyolKurus(
  value: number,
  source: "api" | "dom" = "api",
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (source === "dom") {
    return Math.round(value * 100) / 100;
  }

  if (value >= 10000) {
    return Math.round((value / 100) * 100) / 100;
  }

  if (value >= 1000 && Number.isInteger(value)) {
    const asTl = value / 100;
    if (asTl >= 1 && asTl <= 200_000) {
      return Math.round(asTl * 100) / 100;
    }
  }

  return Math.round(value * 100) / 100;
}

export function normalizeTrendyolPriceValue(raw: unknown): number {
  if (typeof raw === "number") {
    return normalizeTrendyolKurus(raw, "api");
  }

  if (typeof raw === "string") {
    const fromText = parseTurkishPriceText(raw);
    if (fromText > 0) return fromText;
    const n = Number(raw.replace(/[^\d.,]/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? normalizeTrendyolKurus(n, "api") : 0;
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of [
      "original",
      "value",
      "sellingPrice",
      "discountedPrice",
      "originalPrice",
      "currentPrice",
      "withProfit",
    ]) {
      if (record[key] != null) {
        const parsed = normalizeTrendyolPriceValue(record[key]);
        if (parsed > 0) return parsed;
      }
    }
  }

  return 0;
}

export function pickPlausibleTrendyolPrice(a: number, b: number): number {
  if (a <= 0) return b;
  if (b <= 0) return a;
  if (a > b * 20) return b;
  if (b > a * 20) return a;
  return a;
}

export function formatTryPrice(amount: number): string {
  return `${amount.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

export function buildTrendyolPriceObject(
  originalRaw: unknown,
  profitMargin = PROFIT_MARGIN,
) {
  const original = normalizeTrendyolPriceValue(originalRaw);
  const withProfit = Math.round(original * (1 + profitMargin) * 100) / 100;
  return {
    original,
    withProfit,
    currency: "TRY",
    formatted: formatTryPrice(original),
    profitFormatted: formatTryPrice(withProfit),
  };
}
