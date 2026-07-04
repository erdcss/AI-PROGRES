/** Trendyol fiyat normalizasyonu — kuruş/TL ve Türkçe format desteği */

export const TRENDYOL_PROFIT_MARGIN = 0.10;

function readNestedPriceValue(field: unknown): number {
  if (field == null) return 0;
  if (typeof field === "object" && field !== null && "value" in field) {
    return normalizeTrendyolKurus(Number((field as { value: unknown }).value), "api");
  }
  return normalizeTrendyolPriceValue(field);
}

/** Plus / sepette / indirimli metin — orijinal liste fiyatı değil */
export function isTrendyolPromotionalPriceText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("sepette") ||
    lower.includes("trendyol plus") ||
    lower.includes("plus'a özel") ||
    lower.includes("plusa özel") ||
    lower.includes("kupon") ||
    lower.includes("kampanya fiyat") ||
    lower.includes("indirimli fiyat")
  );
}

/**
 * Ürün state/API nesnesinden ORİJİNAL liste fiyatını çıkarır.
 * Trendyol Plus / sepette / discounted fiyat asla tercih edilmez.
 */
export function extractOriginalTrendyolPriceFromProduct(product: unknown): number {
  if (!product || typeof product !== "object") {
    return normalizeTrendyolPriceValue(product);
  }

  const root = product as Record<string, unknown>;
  const price = root.price as Record<string, unknown> | undefined;
  const priceInfo = root.priceInfo as Record<string, unknown> | undefined;
  const merchant = root.merchant as Record<string, unknown> | undefined;

  const originalCandidates = [
    readNestedPriceValue(price?.originalPrice),
    readNestedPriceValue(root.originalPrice),
    readNestedPriceValue(priceInfo?.originalPrice),
    readNestedPriceValue(merchant?.originalPrice),
    readNestedPriceValue(root.listPrice),
    readNestedPriceValue(price?.listPrice),
  ].filter((value) => value > 0);

  if (originalCandidates.length > 0) {
    return Math.max(...originalCandidates);
  }

  const saleCandidates = [
    readNestedPriceValue(price?.sellingPrice),
    readNestedPriceValue(price?.discountedPrice),
    readNestedPriceValue(root.sellingPrice),
    readNestedPriceValue(root.discountedPrice),
    readNestedPriceValue(priceInfo?.sellingPrice),
    readNestedPriceValue(priceInfo?.discountedPrice),
    readNestedPriceValue(priceInfo?.price),
    readNestedPriceValue(root.price),
  ].filter((value) => value > 0);

  return saleCandidates.length > 0 ? Math.max(...saleCandidates) : 0;
}

/** HTML script içindeki tüm originalPrice değerleri (benzersiz) */
export function collectOriginalPricesFromHtmlScript(html: string): number[] {
  if (!html) return [];

  const seen = new Set<number>();
  const values: number[] = [];
  const patterns = [
    /"originalPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/g,
    /"listPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const normalized = normalizeTrendyolKurus(parseInt(match[1], 10), "api");
      if (normalized > 0 && normalized < 500_000 && !seen.has(normalized)) {
        seen.add(normalized);
        values.push(normalized);
      }
    }
  }

  return values;
}

/** HTML script içindeki originalPrice / listPrice alanlarından liste fiyatı */
export function extractOriginalPriceFromHtmlScript(html: string): number {
  const values = collectOriginalPricesFromHtmlScript(html);
  return values.length === 1 ? values[0] : 0;
}

/**
 * Orijinal liste fiyatı — JSON-LD indirimli fiyatından önce script/state kullanır.
 */
export function resolveTrendyolOriginalListPrice(input: {
  html?: string;
  product?: unknown;
  jsonLdPrice?: number;
  domPrice?: number;
}): number {
  const fromProduct = input.product ? extractOriginalTrendyolPriceFromProduct(input.product) : 0;
  const scriptPrices = input.html ? collectOriginalPricesFromHtmlScript(input.html) : [];
  const jsonLd = input.jsonLdPrice ?? 0;

  if (fromProduct > 0) {
    return fromProduct;
  }

  // Tek originalPrice script değeri güvenilir (ör. Daniel Klein → 2750 TL)
  if (scriptPrices.length === 1) {
    return scriptPrices[0];
  }

  // Birden fazla script fiyatı = öneri/çapraz satış karışımı → JSON-LD ürün fiyatı
  if (scriptPrices.length > 1 && jsonLd > 0) {
    return jsonLd;
  }

  if (jsonLd > 0) return jsonLd;

  if (scriptPrices.length > 0) {
    return Math.min(...scriptPrices);
  }

  return input.domPrice ?? 0;
}

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

  // Trendyol API kuruş: 61000 → 610 TL, 35400 → 354 TL
  if (value >= 10000) {
    return Math.round((value / 100) * 100) / 100;
  }

  // 1000–9999: yalnızca tam yüzlük kuruş (6100→61); 1549 gibi değerler zaten TL
  if (value >= 1000 && Number.isInteger(value) && value % 100 === 0) {
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
      "originalPrice",
      "withProfit",
      "sale",
      "value",
      "amount",
      "current",
      "currentPrice",
      "sellingPrice",
      "discountedPrice",
      "formatted",
      "profitFormatted",
    ]) {
      if (record[key] != null) {
        const parsed = normalizeTrendyolPriceValue(record[key]);
        if (parsed > 0) return parsed;
      }
    }
  }

  return 0;
}

/** Pozitif fiyat yoksa 0 döner — csv_missing_price teşhisi için */
export function resolvePositiveTrendyolPrice(raw: unknown): number {
  const price = normalizeTrendyolPriceValue(raw);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function pickPlausibleTrendyolPrice(a: number, b: number): number {
  if (a <= 0) return b;
  if (b <= 0) return a;
  if (a > b * 20) return b;
  if (b > a * 20) return a;
  return Math.max(a, b);
}

export function formatTryPrice(amount: number): string {
  return `${amount.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

export function buildTrendyolPriceObject(
  originalRaw: unknown,
  profitMargin = TRENDYOL_PROFIT_MARGIN,
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
