export type PreviewVariantRow = {
  color: string;
  size: string;
  inStock: boolean;
};

export function resolvePreviewVariants(product: {
  canonicalProduct?: { variants?: PreviewVariantRow[] };
  variants?: {
    items?: PreviewVariantRow[];
    allVariants?: PreviewVariantRow[];
    sizes?: string[];
  };
}): { source: string; variants: PreviewVariantRow[]; sizes: string[] } {
  const canonical = product.canonicalProduct?.variants;
  if (canonical?.length) {
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
