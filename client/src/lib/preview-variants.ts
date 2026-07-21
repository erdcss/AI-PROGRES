export type PreviewVariantRow = {
  color: string;
  size: string;
  inStock: boolean;
  image?: string;
  images?: string[];
  sourceProductId?: string;
  sourceUrl?: string;
  listingId?: string;
  price?: string | number;
  stockCount?: number | null;
};

/** CSV yalnızca stoktakileri taşır; önizleme stok dışı bedenleri de göstermek için birleştirir. */
export function mergeCanonicalPreviewVariants(canonical?: {
  variants?: PreviewVariantRow[];
  outOfStockVariants?: PreviewVariantRow[];
}): PreviewVariantRow[] {
  const map = new Map<string, PreviewVariantRow>();
  for (const v of canonical?.outOfStockVariants ?? []) {
    const key = `${(v.color || "").trim().toLowerCase()}|${(v.size || "").trim().toLowerCase()}`;
    map.set(key, {
      color: v.color || "",
      size: v.size || "",
      inStock: false,
      image: v.image,
      images: v.images,
      sourceProductId: v.sourceProductId,
      sourceUrl: v.sourceUrl,
      listingId: v.listingId,
      price: v.price,
      stockCount: v.stockCount,
    });
  }
  for (const v of canonical?.variants ?? []) {
    const key = `${(v.color || "").trim().toLowerCase()}|${(v.size || "").trim().toLowerCase()}`;
    map.set(key, {
      color: v.color || "",
      size: v.size || "",
      inStock: v.inStock !== false,
      image: v.image,
      images: v.images,
      sourceProductId: v.sourceProductId,
      sourceUrl: v.sourceUrl,
      listingId: v.listingId,
      price: v.price,
      stockCount: v.stockCount,
    });
  }
  return [...map.values()];
}

export function resolvePreviewVariants(product: {
  canonicalProduct?: {
    variants?: PreviewVariantRow[];
    outOfStockVariants?: PreviewVariantRow[];
  };
  variants?: {
    items?: PreviewVariantRow[];
    allVariants?: PreviewVariantRow[];
    sizes?: string[];
  };
}): { source: string; variants: PreviewVariantRow[]; sizes: string[] } {
  const canonical = mergeCanonicalPreviewVariants(product.canonicalProduct);
  if (canonical.length) {
    const sizes = [...new Set(canonical.map((v) => v.size).filter(Boolean))];
    console.log("[PreviewTrace] source=canonicalProduct");
    console.log(`[PreviewTrace] displayedSizes=${sizes.join(",")}`);
    console.log(`[PreviewTrace] displayedVariantCount=${canonical.length}`);
    return { source: "canonicalProduct", variants: canonical, sizes };
  }

  const items = product.variants?.items;
  if (items?.length) {
    const sizes = [...new Set(items.map((v) => v.size).filter(Boolean))];
    console.log("[PreviewTrace] source=variants.items");
    console.log(`[PreviewTrace] displayedSizes=${sizes.join(",")}`);
    console.log(`[PreviewTrace] displayedVariantCount=${items.length}`);
    return { source: "variants.items", variants: items, sizes };
  }

  const allVariants = product.variants?.allVariants;
  if (allVariants?.length) {
    const sizes = [...new Set(allVariants.map((v) => v.size).filter(Boolean))];
    console.log("[PreviewTrace] source=variants.allVariants");
    console.log(`[PreviewTrace] displayedSizes=${sizes.join(",")}`);
    console.log(`[PreviewTrace] displayedVariantCount=${allVariants.length}`);
    return { source: "variants.allVariants", variants: allVariants, sizes };
  }

  console.log("[PreviewTrace] source=empty");
  return { source: "empty", variants: [], sizes: [] };
}
