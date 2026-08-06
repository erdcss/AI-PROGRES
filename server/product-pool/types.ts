export interface ProductPoolFeature {
  name: string;
  value: string;
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
  inStock: boolean;
  scrapedAt: string;
}

export interface ProductPoolTrackItem {
  id: string;
  sourceUrl: string;
  title: string;
  siteName: string;
  siteLogoUrl: string;
  price: number;
  salePrice: number;
  shopifyPrice?: number;
  shopifyProductId?: string;
  image?: string;
  notes?: string;
  addedAt: string;
  lastCheckedAt?: string;
}
