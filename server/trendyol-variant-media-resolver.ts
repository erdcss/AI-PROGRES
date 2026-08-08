export interface TrendyolResolvedVariant {
  id: string;
  color: string;
  size: string;
  inStock: boolean;
  stockCount: number;
  price: number | string;
  discountedPrice?: number | string;
  barcode?: string;
  sku?: string;
  images: string[];
  featuredImage: string;
  mediaGroupKey: string;
  sourceContentId?: number | string;
}

export interface TrendyolVariantMediaGroup {
  key: string;
  optionName: 'Renk';
  optionValue: string;
  sourceContentId?: number | string;
  images: string[];
  featuredImage: string;
  variantIds: string[];
  matchMethod: 'product-state' | 'variant-state' | 'product-gallery-fallback';
  confidence: number;
}

export interface TrendyolVariantResolution {
  mediaDrivingOption: 'Renk' | null;
  productContentId?: number | string;
  variantMediaGroups: TrendyolVariantMediaGroup[];
  variants: {
    colors: Array<{ name: string; inStock: boolean; availableSizes: string[]; mediaGroupKey?: string; featuredImage?: string }>;
    sizes: Array<{ name: string; inStock: boolean; availableColors: string[] }>;
    colorVariants: Array<any>;
    sizeDetails: Array<any>;
    stockMatrix: Record<string, any>;
    allVariants: TrendyolResolvedVariant[];
  };
}

function normalizeImageUrl(input: any): string {
  const raw = typeof input === 'string' ? input : input?.url || input?.src || input?.imageUrl || '';
  if (!raw || typeof raw !== 'string') return '';
  let url = raw.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('/')) url = `https://cdn.dsmcdn.com${url}`;
  return url;
}

/** Query + mnresize farklarını yok say; farklı dosya yollarını birleştirme. */
function imageDedupeKey(url: string): string {
  return url
    .replace(/\?.*$/, '')
    .replace(/\/mnresize\/\d+\/\d+\//gi, '/')
    .toLowerCase();
}

function uniqueImages(items: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items || []) {
    const url = normalizeImageUrl(item);
    if (!url || !url.includes('dsmcdn.com')) continue;
    const clean = imageDedupeKey(url);
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(url);
  }
  return out;
}

/** Parses a JS object assigned after the given marker without relying on a fragile non-greedy regex. */
export function extractTrendyolProductState(html: string): any | null {
  const markers = [
    'window.__PRODUCT_DETAIL_APP_INITIAL_STATE__',
    '__PRODUCT_DETAIL_APP_INITIAL_STATE__'
  ];

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) continue;
    const equalsIndex = html.indexOf('=', markerIndex + marker.length);
    if (equalsIndex < 0) continue;
    const start = html.indexOf('{', equalsIndex + 1);
    if (start < 0) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function readAttributeName(value: any): string {
  return String(value || '').trim().toLocaleLowerCase('tr-TR');
}

function isColorAttribute(name: string): boolean {
  const n = readAttributeName(name);
  return n.includes('renk') || n === 'color' || n === 'colour';
}

function isSizeAttribute(name: string): boolean {
  const n = readAttributeName(name);
  return n.includes('beden') || n.includes('numara') || n === 'size';
}

function readVariantOptions(variant: any, product: any): { color: string; size: string } {
  let color = String(variant?.color || variant?.colorName || '').trim();
  let size = String(variant?.size || variant?.sizeName || '').trim();

  const attributePairs = [
    [variant?.attributeName, variant?.attributeValue],
    [variant?.attributeName1, variant?.attributeValue1],
    [variant?.attributeName2, variant?.attributeValue2],
    [variant?.attributeName3, variant?.attributeValue3]
  ];
  for (const [name, value] of attributePairs) {
    if (!value) continue;
    if (!color && isColorAttribute(String(name || ''))) color = String(value).trim();
    if (!size && isSizeAttribute(String(name || ''))) size = String(value).trim();
  }

  // Trendyol payloads often carry only values; infer the common Color/Size ordering conservatively.
  if (!color && variant?.attributeValue1 && variant?.attributeValue2) color = String(variant.attributeValue1).trim();
  if (!size && variant?.attributeValue1 && variant?.attributeValue2) size = String(variant.attributeValue2).trim();
  if (!size && variant?.attributeValue && !color) size = String(variant.attributeValue).trim();

  const attrs = product?.attributes || product?.productAttributes || [];
  if (!color && Array.isArray(attrs)) {
    const colorAttr = attrs.find((a: any) => isColorAttribute(a?.name || a?.attributeName || a?.key));
    color = String(colorAttr?.value || colorAttr?.attributeValue || '').trim();
  }

  color = color || String(product?.color || product?.colorName || '').trim() || 'Standart';
  size = size || 'Standart';
  return { color, size };
}

function readNumberPrice(value: any): number | string {
  if (value == null) return 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return value?.discountedPrice ?? value?.sellingPrice?.value ?? value?.originalPrice ?? value?.value ?? 0;
}

function slugPart(value: string): string {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'standart';
}

function collectKnownColorMedia(product: any, productImages: string[]): Map<string, { images: string[]; contentId?: any; method: TrendyolVariantMediaGroup['matchMethod']; confidence: number }> {
  const map = new Map<string, any>();
  const put = (name: any, images: any[], contentId?: any, method: TrendyolVariantMediaGroup['matchMethod'] = 'variant-state', confidence = 0.98) => {
    const color = String(name || '').trim();
    if (!color) return;
    const normalized = uniqueImages(images || []);
    const existing = map.get(color);
    const merged = uniqueImages([...(existing?.images || []), ...normalized]);
    map.set(color, { images: merged, contentId: contentId ?? existing?.contentId, method, confidence: Math.max(confidence, existing?.confidence || 0) });
  };

  // The current Trendyol content page owns its gallery. Bind that gallery to the page's explicit color attribute.
  let currentColor = String(product?.color || product?.colorName || '').trim();
  const currentAttrs = product?.attributes || product?.productAttributes || [];
  if (!currentColor && Array.isArray(currentAttrs)) {
    const colorAttr = currentAttrs.find((a: any) => isColorAttribute(a?.name || a?.attributeName || a?.key));
    currentColor = String(colorAttr?.value || colorAttr?.attributeValue || '').trim();
  }
  if (currentColor && productImages.length) put(currentColor, productImages, product?.id || product?.contentId, 'product-state', 1);

  for (const color of product?.colorOptions || []) put(color?.name || color?.colorName || color?.value, color?.images || [color?.image], color?.contentId || color?.id, 'variant-state', 1);
  if (product?.colorImages && typeof product.colorImages === 'object') {
    for (const [name, images] of Object.entries(product.colorImages)) put(name, Array.isArray(images) ? images : [images], undefined, 'variant-state', 1);
  }
  for (const slicer of product?.slicingAttributes || product?.slicerAttributes || product?.slicers || []) {
    for (const value of slicer?.values || slicer?.items || []) {
      put(value?.name || value?.value || value?.attributeValue, value?.images || [value?.image], value?.contentId || value?.productId, 'variant-state', 1);
    }
  }
  return map;
}

export function resolveTrendyolVariantMedia(html: string, fallbackProductImages: string[] = []): TrendyolVariantResolution {
  const state = extractTrendyolProductState(html);
  const product = state?.product || state?.result?.product || state?.result || {};
  const productImages = uniqueImages([...(product?.images || []), ...fallbackProductImages]);
  const productContentId = product?.id || product?.contentId || state?.productId;
  const knownColorMedia = collectKnownColorMedia(product, productImages);
  const rawVariants = Array.isArray(product?.allVariants) ? product.allVariants : Array.isArray(product?.variants) ? product.variants : [];

  const allVariants: TrendyolResolvedVariant[] = [];
  const stockMatrix: Record<string, any> = {};
  const groupMap = new Map<string, TrendyolVariantMediaGroup>();

  rawVariants.forEach((variant: any, index: number) => {
    const { color, size } = readVariantOptions(variant, product);
    const variantImages = uniqueImages(variant?.images || [variant?.image]);
    const known = knownColorMedia.get(color);
    const groupImages = uniqueImages([...(known?.images || []), ...variantImages]);
    const images = groupImages.length ? groupImages : (rawVariants.length <= 1 ? productImages : []);
    const sourceContentId = variant?.contentId || variant?.productId || known?.contentId || productContentId;
    const mediaGroupKey = `color:${slugPart(color)}`;
    const featuredImage = images[0] || '';
    const inStock = variant?.inStock !== false && variant?.isAvailable !== false && variant?.available !== false && (variant?.quantity == null || Number(variant.quantity) > 0);
    const stockCount = Number(variant?.stockCount ?? variant?.quantity ?? (inStock ? 1 : 0)) || 0;
    const id = String(variant?.itemNumber || variant?.id || variant?.sku || variant?.barcode || `${sourceContentId || 'product'}-${index}`);
    const resolved: TrendyolResolvedVariant = {
      id, color, size, inStock, stockCount,
      price: readNumberPrice(variant?.price) || readNumberPrice(product?.price),
      discountedPrice: variant?.price?.discountedPrice,
      barcode: variant?.barcode,
      sku: variant?.sku || variant?.itemNumber,
      images,
      featuredImage,
      mediaGroupKey,
      sourceContentId
    };
    allVariants.push(resolved);
    stockMatrix[`${color}-${size}`] = { ...resolved };

    const existing = groupMap.get(mediaGroupKey);
    const method = known?.method || (variantImages.length ? 'variant-state' : 'product-gallery-fallback');
    const confidence = known?.confidence || (variantImages.length ? 0.98 : rawVariants.length <= 1 ? 0.85 : 0.4);
    if (!existing) {
      groupMap.set(mediaGroupKey, {
        key: mediaGroupKey,
        optionName: 'Renk',
        optionValue: color,
        sourceContentId,
        images,
        featuredImage,
        variantIds: [id],
        matchMethod: method,
        confidence
      });
    } else {
      existing.images = uniqueImages([...existing.images, ...images]);
      existing.featuredImage = existing.featuredImage || existing.images[0] || '';
      if (!existing.variantIds.includes(id)) existing.variantIds.push(id);
      existing.confidence = Math.max(existing.confidence, confidence);
    }
  });

  // If Trendyol exposes a color/slicer group but no allVariants, preserve the current product as one authentic group.
  if (allVariants.length === 0 && productContentId) {
    let color = String(product?.color || product?.colorName || '').trim();
    const attrs = product?.attributes || product?.productAttributes || [];
    if (!color && Array.isArray(attrs)) {
      const colorAttr = attrs.find((a: any) => isColorAttribute(a?.name || a?.attributeName || a?.key));
      color = String(colorAttr?.value || colorAttr?.attributeValue || '').trim();
    }
    color = color || 'Standart';
    const mediaGroupKey = `color:${slugPart(color)}`;
    groupMap.set(mediaGroupKey, {
      key: mediaGroupKey, optionName: 'Renk', optionValue: color, sourceContentId: productContentId,
      images: productImages, featuredImage: productImages[0] || '', variantIds: [],
      matchMethod: 'product-state', confidence: color === 'Standart' ? 0.6 : 0.95
    });
  }

  const variantMediaGroups = Array.from(groupMap.values());
  const colors = variantMediaGroups.map(group => {
    const members = allVariants.filter(v => v.mediaGroupKey === group.key);
    return {
      name: group.optionValue,
      inStock: members.length ? members.some(v => v.inStock) : true,
      availableSizes: members.filter(v => v.inStock).map(v => v.size).filter((v, i, a) => a.indexOf(v) === i),
      mediaGroupKey: group.key,
      featuredImage: group.featuredImage
    };
  });
  const uniqueSizes = Array.from(new Set(allVariants.map(v => v.size)));
  const sizes = uniqueSizes.map(size => ({
    name: size,
    inStock: allVariants.some(v => v.size === size && v.inStock),
    availableColors: allVariants.filter(v => v.size === size && v.inStock).map(v => v.color).filter((v, i, a) => a.indexOf(v) === i)
  }));
  const colorVariants = variantMediaGroups.map(group => ({
    colorName: group.optionValue,
    mainImage: group.featuredImage,
    images: group.images,
    mediaGroupKey: group.key,
    sourceContentId: group.sourceContentId,
    sizes: allVariants.filter(v => v.mediaGroupKey === group.key).map(v => ({
      sizeName: v.size, inStock: v.inStock, stockCount: v.stockCount, price: v.price, sku: v.sku, featuredImage: v.featuredImage
    })),
    availableSizes: allVariants.filter(v => v.mediaGroupKey === group.key && v.inStock).map(v => v.size),
    totalStock: allVariants.filter(v => v.mediaGroupKey === group.key && v.inStock).reduce((sum, v) => sum + v.stockCount, 0)
  }));

  return {
    mediaDrivingOption: variantMediaGroups.some(g => g.optionValue !== 'Standart') ? 'Renk' : null,
    productContentId,
    variantMediaGroups,
    variants: { colors, sizes, colorVariants, sizeDetails: [], stockMatrix, allVariants }
  };
}

/** imagesByColor + mevcut allVariants üzerinden mediaGroupKey / featuredImage bağlar (HTML opsiyonel). */
export function applyTrendyolVariantMediaToScrapeResult(
  result: Record<string, unknown>,
  opts?: { html?: string | null },
): TrendyolVariantResolution | null {
  const fallbackImages = Array.isArray(result.images)
    ? (result.images as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  let fromHtml: TrendyolVariantResolution | null = null;
  if (opts?.html && opts.html.length > 200) {
    try {
      fromHtml = resolveTrendyolVariantMedia(opts.html, fallbackImages);
    } catch {
      fromHtml = null;
    }
  }

  const imagesByColor: Record<string, string[]> = {
    ...(typeof result.imagesByColor === "object" &&
    result.imagesByColor &&
    !Array.isArray(result.imagesByColor)
      ? (result.imagesByColor as Record<string, string[]>)
      : {}),
  };

  if (fromHtml) {
    for (const group of fromHtml.variantMediaGroups) {
      const name = group.optionValue;
      if (!name || name === "Standart") continue;
      const existing = imagesByColor[name] || [];
      imagesByColor[name] = uniqueImages([...existing, ...group.images]);
    }
    if (fromHtml.productContentId != null) {
      result.productContentId = fromHtml.productContentId;
    }
    if (fromHtml.mediaDrivingOption) {
      result.mediaDrivingOption = fromHtml.mediaDrivingOption;
    }
  }

  if (result.productContentId == null) {
    const fromFields =
      result.productId ?? result.contentId ?? result.id ?? result.parsedProductId;
    if (fromFields != null && String(fromFields).trim()) {
      result.productContentId = fromFields as string | number;
    } else {
      const src = String(result.sourceUrl || result.url || "");
      const m = src.match(/-p-(\d+)/i) || src.match(/\/(\d{6,})(?:\?|$)/);
      if (m?.[1]) result.productContentId = m[1];
    }
  }
  if (result.productMainId == null) {
    const main =
      result.productMainId ??
      (result as { product?: { productMainId?: unknown } }).product?.productMainId;
    if (main != null) result.productMainId = main as string | number;
  }

  const variantsBag = result.variants as
    | { allVariants?: Array<Record<string, unknown>>; colors?: unknown }
    | undefined;
  const allVariants = Array.isArray(variantsBag?.allVariants) ? variantsBag!.allVariants! : [];

  const colorNames = new Set<string>();
  for (const v of allVariants) {
    const c = String(v.color || "").trim();
    if (c) colorNames.add(c);
  }
  for (const key of Object.keys(imagesByColor)) {
    if (key.trim()) colorNames.add(key.trim());
  }

  const findGallery = (color: string): string[] => {
    if (imagesByColor[color]?.length) return uniqueImages(imagesByColor[color]);
    const hit = Object.entries(imagesByColor).find(
      ([k]) => k.toLocaleLowerCase("tr-TR") === color.toLocaleLowerCase("tr-TR"),
    );
    return hit ? uniqueImages(hit[1]) : [];
  };

  const groupMap = new Map<string, TrendyolVariantMediaGroup>();

  for (const color of colorNames) {
    const gallery = findGallery(color);
    const key = `color:${slugPart(color)}`;
    const htmlGroup = fromHtml?.variantMediaGroups.find(
      (g) => g.key === key || g.optionValue.toLocaleLowerCase("tr-TR") === color.toLocaleLowerCase("tr-TR"),
    );
    const images = uniqueImages([...(htmlGroup?.images || []), ...gallery]);
    if (!images.length && !allVariants.some((v) => String(v.color || "").trim() === color)) {
      continue;
    }
    groupMap.set(key, {
      key,
      optionName: "Renk",
      optionValue: color,
      sourceContentId:
        htmlGroup?.sourceContentId ??
        (result.productContentId as string | number | undefined),
      images: images.length ? images : uniqueImages(fallbackImages),
      featuredImage: (images[0] || fallbackImages[0] || "") as string,
      variantIds: [],
      matchMethod: htmlGroup?.matchMethod || (images.length ? "variant-state" : "product-gallery-fallback"),
      confidence: htmlGroup?.confidence ?? (images.length ? 0.95 : 0.4),
    });
  }

  for (const v of allVariants) {
    const color = String(v.color || "").trim() || "Standart";
    const key = `color:${slugPart(color)}`;
    let group = groupMap.get(key);
    if (!group) {
      const gallery = findGallery(color);
      group = {
        key,
        optionName: "Renk",
        optionValue: color,
        images: gallery.length ? gallery : uniqueImages(fallbackImages),
        featuredImage: gallery[0] || fallbackImages[0] || "",
        variantIds: [],
        matchMethod: gallery.length ? "variant-state" : "product-gallery-fallback",
        confidence: gallery.length ? 0.9 : 0.4,
      };
      groupMap.set(key, group);
    }
    const id = String(v.id || v.sku || v.barcode || `${key}-${group.variantIds.length}`);
    if (!group.variantIds.includes(id)) group.variantIds.push(id);
    v.mediaGroupKey = key;
    v.featuredImage = group.featuredImage || group.images[0] || "";
    // Varyant sırasına göre images[i] atama YOK — renk grubunun featured görseli
    v.image = v.featuredImage || v.image || "";
    if (!Array.isArray(v.images) || !(v.images as string[]).length) {
      v.images = group.images;
    }
  }

  const variantMediaGroups = Array.from(groupMap.values());
  result.variantMediaGroups = variantMediaGroups;
  result.imagesByColor = imagesByColor;
  if (!result.mediaDrivingOption) {
    result.mediaDrivingOption = variantMediaGroups.some((g) => g.optionValue !== "Standart")
      ? "Renk"
      : null;
  }

  // Flat gallery: tüm renk grupları
  const flat: string[] = [];
  const seen = new Set<string>();
  for (const g of variantMediaGroups) {
    for (const img of g.images) {
      const clean = imageDedupeKey(img);
      if (seen.has(clean)) continue;
      seen.add(clean);
      flat.push(img);
    }
  }
  if (flat.length) result.images = flat;

  return {
    mediaDrivingOption: (result.mediaDrivingOption as "Renk" | null) ?? null,
    productContentId: result.productContentId as string | number | undefined,
    variantMediaGroups,
    variants: fromHtml?.variants || {
      colors: variantMediaGroups.map((g) => ({
        name: g.optionValue,
        inStock: true,
        availableSizes: [],
        mediaGroupKey: g.key,
        featuredImage: g.featuredImage,
      })),
      sizes: [],
      colorVariants: [],
      sizeDetails: [],
      stockMatrix: {},
      allVariants: [],
    },
  };
}
