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
    }
    // Legacy format with profitFormatted
    else if (price.profitFormatted) {
      const profitMatch = price.profitFormatted.match(/(\d+[.,]\d+|\d+)/);
      if (profitMatch) {
        withProfit = parseFloat(profitMatch[1].replace(',', '.'));
        original = Math.round(withProfit / (1 + defaultProfitMargin) * 100) / 100;
      }
    }
    // Format with formatted field
    else if (price.formatted) {
      const formattedMatch = price.formatted.match(/(\d+[.,]\d+|\d+)/);
      if (formattedMatch) {
        original = parseFloat(formattedMatch[1].replace(',', '.'));
        withProfit = Math.round(original * (1 + defaultProfitMargin) * 100) / 100;
      }
    }
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

  // Remove currency symbols and spaces
  const cleanInput = input.replace(/[₺TLtl\s]/g, '').replace(',', '.');
  const value = parseFloat(cleanInput);

  if (isNaN(value) || value <= 0) {
    return { isValid: false, error: 'Geçerli bir fiyat giriniz' };
  }

  if (value > 50000) {
    return { isValid: false, error: 'Fiyat 50.000 TL\'den fazla olamaz' };
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