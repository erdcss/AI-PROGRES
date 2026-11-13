/** Fiyatlar yalnızca ürün sayfasından okunabildiğinde doğrulanmış sayılır. */
export interface TrackingPriceResearchOffer {
  site: string;
  title: string;
  url: string;
  price: number | null;
  currency: "TRY" | null;
  verified: boolean;
  isSource: boolean;
  checkedAt: string | null;
  imageUrl?: string | null;
  discoveryMethod?: "source" | "web" | "visual" | "marketplace";
  matchScore?: number;
  listedPrice?: number | null;
  availability?: "in_stock" | "out_of_stock" | "unknown";
  verificationNote?: string | null;
}

export interface TrackingPriceResearchReport {
  trackedProductId: number;
  productTitle: string;
  sourceUrl: string;
  sourcePrice: number | null;
  searchedAt: string;
  provider: string;
  queries: string[];
  resultsFound: number;
  checkedCount: number;
  offers: TrackingPriceResearchOffer[];
  summary: {
    verifiedCount: number;
    lowestPrice: number | null;
    highestPrice: number | null;
    averagePrice: number | null;
  };
  warnings: string[];
  referenceImageUrl?: string | null;
  visualAnalysis?: string | null;
  visualMatchProvider?: string | null;
  visualSearchPerformed?: boolean;
  researchLinks?: Array<{ label: string; url: string }>;
  searchedSites?: number;
  researchVersion?: number;
}
