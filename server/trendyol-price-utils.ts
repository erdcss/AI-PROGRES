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

  // Öncelik 2: yalnızca normal satış fiyatı (sellingPrice).
  // Plus / sepette / discountedPrice ASLA fiyat kaynağı değildir.
  const sellingCandidates = [
    readNestedPriceValue(price?.sellingPrice),
    readNestedPriceValue(root.sellingPrice),
    readNestedPriceValue(priceInfo?.sellingPrice),
  ].filter((value) => value > 0);

  return sellingCandidates.length > 0 ? Math.max(...sellingCandidates) : 0;
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
  const dom = input.domPrice ?? 0;

  /** Yalnızca ~100× kuruş/TL düzeltmesi veya güvenilir tek kaynak */
  const recover = (base: number, candidate: number): number => {
    if (candidate <= 0) return base;
    if (base <= 0) return candidate;
    return pickPlausibleTrendyolPrice(base, candidate);
  };

  if (fromProduct > 0) {
    let best = fromProduct;
    // API 12875 kuruş → 128.75 TL yanlışlığı: DOM/JSON-LD 12.885 TL ile düzelt
    best = recover(best, dom);
    best = recover(best, jsonLd);
    if (scriptPrices.length === 1) {
      best = recover(best, scriptPrices[0]);
    } else {
      for (const sp of scriptPrices) {
        const lo = Math.min(best, sp);
        const hi = Math.max(best, sp);
        if (lo > 0 && Math.abs(hi / lo - 100) < 1.05) {
          best = recover(best, sp);
        }
      }
    }
    return best;
  }

  // Tek originalPrice script değeri güvenilir (ör. Daniel Klein → 2750 TL)
  if (scriptPrices.length === 1) {
    return recover(recover(scriptPrices[0], jsonLd), dom);
  }

  // Birden fazla script fiyatı = öneri/çapraz satış karışımı → JSON-LD ürün fiyatı
  if (scriptPrices.length > 1 && jsonLd > 0) {
    return recover(jsonLd, dom);
  }

  if (jsonLd > 0) return recover(jsonLd, dom);

  if (scriptPrices.length > 0) {
    return recover(Math.min(...scriptPrices), dom);
  }

  return dom;
}

export function parseTurkishPriceText(text: string): number {
  if (!text) return 0;

  // Sepette / Plus öneklerini temizle; gömülü binlik fiyat kalsın
  let clean = text
    .replace(/[₺]/g, "")
    .replace(/\bTL\b/gi, "")
    .replace(/sepette\s*/gi, "")
    .replace(/trendyol\s*plus\s*/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (!clean) return 0;

  // 26.000,00 / 1.234.567,89 — binlik nokta + ondalık virgül
  const trThousands = clean.match(/^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/);
  if (trThousands) {
    const intPart = trThousands[1].replace(/\./g, "");
    const dec = trThousands[2].padEnd(2, "0").slice(0, 2);
    return parseFloat(`${intPart}.${dec}`);
  }

  // 26.000 / 23.500 / 1.250.000 — yalnızca binlik ayırıcı (ondalık yok)
  // NOT: "23.50" (1–2 hane) buraya düşmez; aşağıdaki US ondalığa gider.
  const trThousandsInt = clean.match(/^(\d{1,3}(?:\.\d{3})+)$/);
  if (trThousandsInt) {
    return Number(trThousandsInt[1].replace(/\./g, ""));
  }

  // 26000,50 / 799,00
  const decimalComma = clean.match(/^(\d+),(\d{1,2})$/);
  if (decimalComma) {
    return parseFloat(`${decimalComma[1]}.${decimalComma[2]}`);
  }

  // 26000.50 — US ondalık (noktadan sonra en fazla 2 hane)
  const decimalDot = clean.match(/^(\d+)\.(\d{1,2})$/);
  if (decimalDot) {
    return parseFloat(`${decimalDot[1]}.${decimalDot[2]}`);
  }

  // Metin içinde gömülü: "...26.000,00..."
  const embeddedTr = clean.match(/(\d{1,3}(?:\.\d{3})+),(\d{2})/);
  if (embeddedTr) {
    const intPart = embeddedTr[1].replace(/\./g, "");
    return parseFloat(`${intPart}.${embeddedTr[2]}`);
  }

  const embeddedThousands = clean.match(/(\d{1,3}(?:\.\d{3})+)/);
  if (embeddedThousands) {
    return Number(embeddedThousands[1].replace(/\./g, ""));
  }

  // Düz rakam (26000) — görünen fiyat zaten TL; kuruşa çevirme
  const digits = clean.match(/^(\d+)$/);
  if (digits) {
    return Number(digits[1]);
  }

  const anyDigits = clean.match(/(\d+)/);
  if (anyDigits) {
    return Number(anyDigits[1]);
  }

  return 0;
}

/**
 * API/script sayısal değerleri kuruş → TL.
 * `source: "dom"` = değer zaten TL (metin/JSON-LD).
 * `source: "api"` = Trendyol product state `price.*.value` kuruş alanları.
 */
export function normalizeTrendyolKurus(
  value: number,
  source: "api" | "dom" = "api",
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (source === "dom") {
    return Math.round(value * 100) / 100;
  }

  // Trendyol API kuruş: 61000 → 610 TL, 27992 → 279.92 TL, 2350000 → 23500 TL
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

/**
 * Ham sayı TL mi kuruş mu?
 * Trendyol API kuruşları yalnızca `{ value: N }` → normalizeTrendyolKurus(..., "api") ile gelir.
 * Düz sayı / JSON-LD / DOM’dan gelen 12875 (= 12.875 TL) ASLA 100’e bölünmez.
 * Yalnızca ≥ 1_000_000 (ör. 1_287_500 kuruş = 12.875 TL) güvenle kuruş kabul edilir.
 */
function normalizeBareNumericPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (!Number.isInteger(value)) {
    return Math.round(value * 100) / 100;
  }

  // 1_000_000+ = pahalı ürünün kuruş karşılığı (12.875 TL → 1_287_500)
  if (value >= 1_000_000) {
    return normalizeTrendyolKurus(value, "api");
  }

  // 5+ basamaklı düz TL (12875, 26000, 23500…) olduğu gibi kalır
  return Math.round(value * 100) / 100;
}

export function normalizeTrendyolPriceValue(raw: unknown): number {
  if (typeof raw === "number") {
    return normalizeBareNumericPrice(raw);
  }

  if (typeof raw === "string") {
    const fromText = parseTurkishPriceText(raw);
    if (fromText > 0) return fromText;
    const n = Number(raw.replace(/[^\d.,]/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? normalizeBareNumericPrice(n) : 0;
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

  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  // Tam ~100× fark: kuruş/TL karışıklığı (128.75 vs 12.875 TL)
  // Makul ürün fiyatı aralığındaysa büyük olanı (gerçek TL) seç.
  if (lo > 0 && Math.abs(hi / lo - 100) < 1.05) {
    if (hi >= 29 && hi <= 500_000) return hi;
  }

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
