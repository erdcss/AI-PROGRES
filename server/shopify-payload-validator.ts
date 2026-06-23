export interface NormalizedShopifyProductInput {
  title: string;
  brand: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  price: { original: number; withProfit: number };
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{ color: string; size: string; inStock: boolean; price?: number }>;
  };
  sourceUrl?: string;
}

export interface PayloadValidationResult {
  valid: boolean;
  errors: string[];
  payload?: NormalizedShopifyProductInput;
}

function toDecimalString(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function extractPrice(raw: unknown): { original: number; withProfit: number } {
  if (typeof raw === 'number' && raw > 0) {
    const withProfit = Math.round(raw * 1.1 * 100) / 100;
    return { original: raw, withProfit };
  }
  if (raw && typeof raw === 'object') {
    const p = raw as Record<string, unknown>;
    const original = Number(p.original ?? p.sellingPrice ?? 0) || 0;
    const withProfit = Number(p.withProfit ?? (original > 0 ? original * 1.1 : 0)) || 0;
    if (original > 0 || withProfit > 0) {
      return {
        original: original || withProfit / 1.1,
        withProfit: withProfit || original * 1.1,
      };
    }
  }
  return { original: 0, withProfit: 0 };
}

function normalizeImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === 'string') return img.trim();
      if (img && typeof img === 'object' && 'url' in img) return String((img as { url: string }).url).trim();
      return '';
    })
    .filter((u) => u.startsWith('http'));
}

function safeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeTrendyolProductForShopify(productData: any): NormalizedShopifyProductInput {
  const title = String(productData?.title || '').trim();
  const brand = String(productData?.brand || productData?.vendor || 'Marka').trim();
  const price = extractPrice(productData?.price);
  const images = normalizeImages(productData?.images);
  const variants = productData?.variants || {};
  const allVariants = Array.isArray(variants.allVariants) ? variants.allVariants : [];
  const colors = Array.isArray(variants.colors) ? variants.colors : [];
  const sizes = Array.isArray(variants.sizes) ? variants.sizes : [];

  const normalizedVariants =
    allVariants.length > 0
      ? allVariants.map((v: any) => ({
          color: String(v.color || 'Standart').trim() || 'Standart',
          size: String(v.size || 'Tek Beden').trim() || 'Tek Beden',
          inStock: v.inStock !== false,
          price: v.price,
        }))
      : [{ color: colors[0] || 'Standart', size: sizes[0] || 'Tek Beden', inStock: true }];

  const tagsRaw = productData?.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map(String)
    : typeof tagsRaw === 'string'
      ? tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

  const description = String(productData?.description || '').trim();

  return {
    title,
    brand,
    bodyHtml: description ? `<p>${safeHtml(description)}</p>` : `<p>${safeHtml(title)}</p>`,
    vendor: brand,
    productType: String(productData?.category || productData?.product_type || 'Genel').trim() || 'Genel',
    tags,
    price: {
      original: price.original,
      withProfit: price.withProfit > 0 ? price.withProfit : Math.round(price.original * 1.1 * 100) / 100,
    },
    images,
    variants: {
      colors: colors.length ? colors : [normalizedVariants[0].color],
      sizes: sizes.length ? sizes : [normalizedVariants[0].size],
      allVariants: normalizedVariants,
    },
    sourceUrl: productData?.sourceUrl || productData?.originalUrl || productData?.url,
  };
}

export function validateShopifyPayload(input: NormalizedShopifyProductInput): PayloadValidationResult {
  const errors: string[] = [];

  if (!input.title || input.title.length < 2) errors.push('title zorunlu (min 2 karakter)');
  if (!input.price.withProfit || input.price.withProfit <= 0) errors.push('price geçersiz — fiyat bulunamadı');
  if (!input.variants.allVariants.length) errors.push('en az 1 variant gerekli');
  if (!input.images.length) errors.push('en az 1 geçerli görsel URL gerekli');

  for (const v of input.variants.allVariants) {
    if (!toDecimalString(input.price.withProfit)) errors.push('variant fiyat formatı hatalı');
    break;
  }

  if (errors.length) return { valid: false, errors };
  return { valid: true, errors: [], payload: input };
}

export function formatShopifyApiError(status: number, body: unknown): string {
  const data = body as Record<string, unknown> | undefined;
  const errors = data?.errors;
  if (status === 401) return 'Token geçersiz veya süresi dolmuş — Shopify Admin Token veya OAuth yenileyin';
  if (status === 403) return 'Yetki/scope eksik — write_products iznini kontrol edin';
  if (status === 422) {
    const detail = typeof errors === 'string' ? errors : JSON.stringify(errors || data);
    return `Shopify ürün payload hatası: ${detail}`;
  }
  return `Shopify API hatası (${status}): ${typeof errors === 'string' ? errors : JSON.stringify(errors || data || '')}`;
}
