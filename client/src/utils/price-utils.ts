// Standart fiyat interface'i
export interface StandardPrice {
  original: number;
  withProfit: number;
  formatted: string;
  profitFormatted: string;
  profitAmount: number;
  profitPercentage: number;
  currency: string;
}

// Price type guard
export function isValidPrice(price: any): boolean {
  if (typeof price === 'number') return price > 0;
  if (typeof price === 'object' && price !== null) {
    return (price.original > 0) || (price.withProfit > 0) || (typeof price.formatted === 'string');
  }
  return false;
}

// Ana fiyat normalizer - tüm fiyat formatlarını standart formata çevirir
export function normalizePrice(price: any, defaultProfitMargin = 0.10): StandardPrice {
  let original = 0;
  let withProfit = 0;

  // Different input format handling
  if (typeof price === 'number') {
    original = price;
    withProfit = Math.round(price * (1 + defaultProfitMargin) * 100) / 100;
  } else if (typeof price === 'object' && price !== null) {
    // API response format with original and withProfit
    if (price.original && price.withProfit) {
      original = Number(price.original);
      withProfit = Number(price.withProfit);
      if (withProfit <= original) {
        withProfit = Math.round(original * (1 + defaultProfitMargin) * 100) / 100;
      }
    }
    // Legacy format with profitFormatted
    else if (price.profitFormatted) {
      original = parseTurkishDisplayPrice(String(price.profitFormatted));
      if (original > 0) {
        withProfit = original;
        original = Math.round(withProfit / (1 + defaultProfitMargin) * 100) / 100;
      }
    }
    // Format with formatted field
    else if (price.formatted) {
      original = parseTurkishDisplayPrice(String(price.formatted));
      withProfit = Math.round(original * (1 + defaultProfitMargin) * 100) / 100;
    }
  } else if (typeof price === 'string') {
    original = parseTurkishDisplayPrice(price);
    withProfit = Math.round(original * (1 + defaultProfitMargin) * 100) / 100;
  }

  const profitAmount = Math.round((withProfit - original) * 100) / 100;
  const profitPercentage = original > 0 ? Math.round((profitAmount / original) * 10000) / 100 : 0;

  return {
    original,
    withProfit,
    formatted: `${original.toFixed(2)} TL`,
    profitFormatted: `${withProfit.toFixed(2)} TL`,
    profitAmount,
    profitPercentage,
    currency: 'TL'
  };
}

/** 26.000 / 26.000,00 / 23500 TL → sayı */
function parseTurkishDisplayPrice(input: string): number {
  const clean = input
    .replace(/[₺]/g, '')
    .replace(/\bTL\b/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!clean) return 0;

  const trFull = clean.match(/^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/);
  if (trFull) {
    return parseFloat(`${trFull[1].replace(/\./g, '')}.${trFull[2]}`);
  }
  const trThousands = clean.match(/^(\d{1,3}(?:\.\d{3})+)$/);
  if (trThousands) {
    return Number(trThousands[1].replace(/\./g, ''));
  }
  const commaDec = clean.match(/^(\d+),(\d{1,2})$/);
  if (commaDec) {
    return parseFloat(`${commaDec[1]}.${commaDec[2]}`);
  }
  const usDec = clean.match(/^(\d+)\.(\d{1,2})$/);
  if (usDec) {
    return parseFloat(`${usDec[1]}.${usDec[2]}`);
  }
  const plain = clean.match(/^(\d+)$/);
  if (plain) return Number(plain[1]);

  const fallback = parseFloat(clean.replace(/[^\d]/g, ''));
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

// Fiyat gösterim utility'leri
export function formatOriginalPrice(price: StandardPrice): string {
  return `${price.original.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

export function formatSalePrice(price: StandardPrice): string {
  return `${price.withProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

export function formatProfitAmount(price: StandardPrice): string {
  return `+${price.profitAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

export function formatProfitPercentage(price: StandardPrice): string {
  return `+%${price.profitPercentage.toFixed(1)}`;
}

// Manual price editing için validation
export function validatePriceInput(input: string): { isValid: boolean; value?: number; error?: string } {
  if (!input || input.trim() === '') {
    return { isValid: false, error: 'Fiyat boş olamaz' };
  }

  const value = parseTurkishDisplayPrice(input);

  if (isNaN(value) || value <= 0) {
    return { isValid: false, error: 'Geçerli bir fiyat giriniz' };
  }

  if (value > 500000) {
    return { isValid: false, error: 'Fiyat 500.000 TL\'den fazla olamaz' };
  }

  if (value < 0.01) {
    return { isValid: false, error: 'Fiyat 0.01 TL\'den az olamaz' };
  }

  return { isValid: true, value };
}

// Price editing interface
export interface PriceEditRequest {
  originalPrice: number;
  profitMargin?: number; // Optional custom profit margin
}

export function calculatePriceWithCustomMargin(originalPrice: number, profitMargin: number): StandardPrice {
  const withProfit = Math.round(originalPrice * (1 + profitMargin) * 100) / 100;
  
  return {
    original: originalPrice,
    withProfit,
    formatted: `${originalPrice.toFixed(2)} TL`,
    profitFormatted: `${withProfit.toFixed(2)} TL`,
    profitAmount: Math.round((withProfit - originalPrice) * 100) / 100,
    profitPercentage: Math.round((profitMargin * 100) * 100) / 100,
    currency: 'TL'
  };
}

/**
 * Gösterim için fiyat normalizasyonu.
 * Sunucu zaten TL döndürür (20.999 TL → 20999). Eski kuruş /100 dönüşümü
 * 5+ basamaklı gerçek TL fiyatları bozduğu için kaldırıldı.
 */
export function normalizeTrendyolDisplayPrice(price: any, defaultProfitMargin = 0.10): StandardPrice {
  return normalizePrice(price, defaultProfitMargin);
}