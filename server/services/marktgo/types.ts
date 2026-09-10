export type MarktGoEnvironment = "production" | "test";

export type MarktGoMe = {
  app?: string;
  name?: string;
  environment?: string;
  scopes?: string[];
  [key: string]: unknown;
};

export type ImportedReviewInput = {
  externalReviewId?: string;
  rating: number;
  comment?: string;
  reviewerName?: string;
  createdAt?: string;
  images?: string[];
  approved?: boolean;
};

export type MarktGoProductPayload = {
  name: string;
  description?: string;
  categoryId?: number;
  brand?: string;
  price: number;
  discountPrice?: number | null;
  /** Kaynak/alış fiyatı. MARKT-GO hareket kaydında ayrı tutulur. */
  purchasePrice?: number | null;
  stock?: number;
  images?: string[];
  tags?: string[];
  status?: "active" | "draft" | "passive";
  externalId: string;
  sourceSite?: string;
  sourceUrl?: string;
  arrivedAt?: string | null;
  reviews?: ImportedReviewInput[];
};

export type MarktGoVariantPayload = {
  option1?: string;
  option2?: string;
  option3?: string;
  sku?: string;
  barcode?: string;
  stock?: number;
  price?: number;
  discountPrice?: number | null;
};

export type NormalizedRemoteProduct = {
  title: string;
  description: string | null;
  price: number | null;
  discountPrice: number | null;
  stock: number | null;
  images: string[];
  variants: Array<{
    id?: string;
    option1?: string;
    option2?: string;
    sku?: string;
    stock?: number | null;
    price?: number | null;
    imageUrl?: string | null;
  }>;
  category: string | null;
  brand: string | null;
  updatedAt: string | null;
};

export type SyncStep =
  | "product_create"
  | "product_lookup"
  | "images"
  | "variants"
  | "variant_images"
  | "inventory"
  | "pricing"
  | "reviews"
  | "done";

export type SyncProgress = {
  step: SyncStep;
  label: string;
  ok: boolean;
  detail?: string;
};

export type LocalProductInput = {
  localProductId: string;
  title: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  sourceUrl?: string | null;
  /** MARKT-GO satış/listing fiyatı. */
  price: number;
  discountPrice?: number | null;
  /** Kaynak pazaryerinden çekilen gerçek alış maliyeti. */
  purchasePrice?: number | null;
  stock?: number | null;
  images?: string[];
  tags?: string[];
  /** Scrape aşamasında elde edilmiş gerçek yorum kayıtları. */
  reviews?: ImportedReviewInput[];
  /** Kaynak ürünün bildirdiği değerlendirme/yorum adedi; 0-yorum sessiz başarısını yakalamak için. */
  expectedReviewCount?: number | null;
  variants?: Array<{
    localVariantId: string;
    option1?: string;
    option2?: string;
    sku?: string;
    barcode?: string;
    stock?: number | null;
    price?: number | null;
    imageUrl?: string | null;
  }>;
  trackedProductId?: number | null;
};