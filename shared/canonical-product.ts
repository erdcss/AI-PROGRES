/** Tek kaynaklı canonical ürün modeli — tüm scraper çıktıları buraya normalize edilir */

export type ProvenanceField<T = unknown> = {
  value?: T | null;
  source: string;
  confidence: number;
  verified?: boolean;
  verifiedCount?: number;
  rawCount?: number;
  uniqueCount?: number;
  confirmedCount?: number;
  inferredCount?: number;
  quantityVerified?: boolean;
  exactCount?: number;
  availabilityOnlyCount?: number;
};

export type QualityProvenance = {
  title: ProvenanceField<string | null>;
  price: ProvenanceField<number | null>;
  images: ProvenanceField;
  variants: ProvenanceField;
  stock: ProvenanceField;
};

export type CanonicalProductQuality = {
  score: number;
  status: "approved" | "manual_review" | "blocked";
  reasons: string[];
  warnings: string[];
  blockers: string[];
  provenance?: QualityProvenance;
  titleSource?: string;
  priceSource?: string;
  imageSource?: string;
  variantSource?: string;
};

export type VariantEvidence = {
  sourceVariantId?: string | null;
  sourceProductId?: string | null;
  sourceListingId?: string | null;
  sourceMerchantId?: string | null;
  colorProductId?: string | null;
  evidenceSource?:
    | "api_listing"
    | "all_variants"
    | "stock_map"
    | "dom_buttons"
    | "script_state"
    | "color_size_cross"
    | "inferred_matrix"
    | "unknown";
  evidenceUrl?: string | null;
  availabilityVerified?: boolean;
  stockQuantityVerified?: boolean;
  priceVerified?: boolean;
  synthetic?: boolean;
};

export type CanonicalVariantOption = {
  name: string;
  values: string[];
};

export type CanonicalImage = {
  url: string;
  identity?: string;
  source?: string;
  productId?: string | null;
  colorProductId?: string | null;
  verified?: boolean;
};

export type CanonicalVariant = {
  sourceVariantId: string | null;
  option1Name: string | null;
  option1Value: string | null;
  option2Name: string | null;
  option2Value: string | null;
  option3Name: string | null;
  option3Value: string | null;
  sku: string | null;
  /** @deprecated use sourcePrice */
  price: number | null;
  sourcePrice: number | null;
  calculatedShopifyPrice: number | null;
  sourcePriceVerified?: boolean;
  available: boolean | null;
  stockQuantity: number | null;
  stockSource?: "exact" | "availability_only" | "unknown";
  stockConfidence?: number;
  stockQuantityVerified?: boolean;
  imageUrl: string | null;
  synthetic?: boolean;
  evidence?: VariantEvidence;
};

export type StageErrorDiagnostic = {
  code: string;
  stage?: string;
  recovered?: boolean;
  fatal?: boolean;
  durationMs?: number;
};

export type CanonicalProductDiagnostics = {
  scrapeRunId?: string;
  extractionMethod?: string;
  stageErrors?: string[];
  recoveredStageErrors?: string[];
  stageErrorDetails?: StageErrorDiagnostic[];
  pipelineDurationMs?: number;
  partialSuccess?: boolean;
  chromiumSource?: string;
  titleSource?: string;
  priceSource?: string;
  imageSource?: string;
  variantSource?: string;
  priceVerified?: boolean;
  uniqueImageCount?: number;
  rawImageCount?: number;
  [key: string]: unknown;
};

export type PriceRuleResult = {
  ruleId?: number | null;
  sourcePrice: number;
  markupType?: string;
  markupValue?: number;
  calculatedPrice: number;
};

export type CanonicalProduct = {
  sourcePlatform: string;
  sourceUrl: string;
  sourceProductId: string | null;
  title: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  currency: string;
  /** Kaynak fiyat (Trendyol) */
  sourcePrice: number | null;
  sourceOriginalPrice: number | null;
  /** @deprecated use sourcePrice */
  originalPrice: number | null;
  /** @deprecated use calculatedShopifyPrice */
  sellingPrice: number | null;
  calculatedShopifyPrice: number | null;
  priceRuleResult?: PriceRuleResult | null;
  images: string[];
  imageDetails?: CanonicalImage[];
  options: CanonicalVariantOption[];
  variants: CanonicalVariant[];
  blockedVariants?: CanonicalVariant[];
  features: Array<{ key: string; value: string }>;
  tags: string[];
  quality: CanonicalProductQuality | null;
  diagnostics: CanonicalProductDiagnostics;
};

export const PLACEHOLDER_TITLES = new Set([
  "ürün",
  "product",
  "marka",
  "trendyol ürünü",
  "slicing attribute product",
  "ürün bilgisi alınamadı",
  "erişim engellendi",
]);

export const FAKE_DEFAULTS = new Set([
  "varsayılan",
  "standart",
  "tek beden",
  "default",
  "bilinmiyor",
]);
