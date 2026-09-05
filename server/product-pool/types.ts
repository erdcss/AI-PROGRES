export interface ProductPoolFeature {
  name: string;
  value: string;
}

/** Shopify option boyutu — en fazla 3 (option1/2/3) */
export interface ProductPoolVariantOption {
  name: string;
  values: string[];
}

export interface ProductPoolVariant {
  title: string;
  sku?: string;
  asin?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  price?: number | null;
  compareAtPrice?: number | null;
  inStock?: boolean;
  image?: string | null;
}

export interface ProductPoolReview {
  externalReviewId?: string;
  rating: number;
  comment?: string;
  reviewerName?: string;
  createdAt?: string;
  images?: string[];
  approved?: boolean;
}

export interface ProductPoolProduct {
  title: string;
  sourceUrl: string;
  siteName: string;
  siteLogoUrl: string;
  brand?: string;
  sku?: string;
  currency: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  salePrice: number;
  images: string[];
  features: ProductPoolFeature[];
  /** Kaynak siteden çekilmiş gerçek yorum kayıtları. */
  reviews?: ProductPoolReview[];
  /** Kaynak sayfada görülen toplam değerlendirme/yorum adedi. */
  reviewCount?: number | null;
  /** Renk / beden vb. seçenek eksenleri */
  variantOptions?: ProductPoolVariantOption[];
  /** Seçenek kombinasyonları (Shopify variants) */
  variants?: ProductPoolVariant[];
  inStock: boolean;
  scrapedAt: string;
  /** Otomatik / manuel ürün etiketleri (MARKT-GO koleksiyon koşulları) */
  tags?: string[];
}

export interface ProductPoolTrackItem {
  id: string;
  sourceUrl: string;
  title: string;
  siteName: string;
  siteLogoUrl: string;
  price: number;
  salePrice: number;
  inStock?: boolean;
  shopifyPrice?: number;
  shopifyProductId?: string;
  image?: string;
  tags?: string[];
  addedAt: string;
  lastCheckedAt?: string;
  removed?: boolean;
}
