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
}
