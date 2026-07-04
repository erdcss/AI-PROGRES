import type { PriceRule } from "@shared/schema";

export type PriceRuleEngineInput = {
  sourcePrice: number;
  currentShopifyPrice?: number | null;
  rules: PriceRule[];
  currency?: string;
};

export type PriceRuleEngineOutput = {
  calculatedPrice: number | null;
  appliedRules: string[];
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
};

function roundTo90(price: number): number {
  const base = Math.floor(price);
  return base + 0.9;
}

function roundTo99(price: number): number {
  const base = Math.floor(price);
  return base + 0.99;
}

export function calculatePriceWithRules(input: PriceRuleEngineInput): PriceRuleEngineOutput {
  const { sourcePrice, currentShopifyPrice, rules } = input;
  const appliedRules: string[] = [];
  const warnings: string[] = [];

  if (!rules.length) {
    if (currentShopifyPrice != null && currentShopifyPrice > 0) {
      return {
        calculatedPrice: currentShopifyPrice,
        appliedRules: [],
        warnings: ["Fiyat kuralı yok — mevcut Shopify fiyatı korunuyor"],
        blocked: false,
      };
    }
    return {
      calculatedPrice: null,
      appliedRules: [],
      warnings: ["Fiyat kuralı yok — manuel inceleme gerekli"],
      blocked: true,
      blockReason: "no_price_rules",
    };
  }

  if (sourcePrice <= 0) {
    return {
      calculatedPrice: null,
      appliedRules: [],
      warnings: ["Kaynak fiyat geçersiz"],
      blocked: true,
      blockReason: "invalid_source_price",
    };
  }

  let price = sourcePrice;
  const activeRules = rules.filter((r) => r.isActive !== false);

  for (const rule of activeRules) {
    const ruleType = rule.ruleType;
    const value = parseFloat(String(rule.value || "0"));

    switch (ruleType) {
      case "fixed_markup":
        price += value;
        appliedRules.push(`fixed_markup:+${value}`);
        break;
      case "percentage_markup":
        price += price * (value / 100);
        appliedRules.push(`percentage_markup:${value}%`);
        break;
      case "minimum_price":
        if (price < value) {
          price = value;
          appliedRules.push(`minimum_price:${value}`);
        }
        break;
      case "maximum_price":
        if (price > value) {
          price = value;
          appliedRules.push(`maximum_price:${value}`);
        }
        break;
      case "round_to_90":
        price = roundTo90(price);
        appliedRules.push("round_to_90");
        break;
      case "round_to_99":
        price = roundTo99(price);
        appliedRules.push("round_to_99");
        break;
      case "max_increase_percent":
        if (currentShopifyPrice && currentShopifyPrice > 0) {
          const max = currentShopifyPrice * (1 + value / 100);
          if (price > max) {
            warnings.push(`Artış %${value} sınırını aşıyor`);
            price = max;
            appliedRules.push(`max_increase_percent:${value}%`);
          }
        }
        break;
      case "max_decrease_percent":
        if (currentShopifyPrice && currentShopifyPrice > 0) {
          const min = currentShopifyPrice * (1 - value / 100);
          if (price < min) {
            warnings.push(`Düşüş %${value} sınırını aşıyor`);
            price = min;
            appliedRules.push(`max_decrease_percent:${value}%`);
          }
        }
        break;
      default:
        warnings.push(`Bilinmeyen kural tipi: ${ruleType}`);
    }
  }

  return {
    calculatedPrice: Math.round(price * 100) / 100,
    appliedRules,
    warnings,
    blocked: false,
  };
}
