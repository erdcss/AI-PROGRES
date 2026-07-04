import { sanitizeTrendyolVariants } from '@shared/trendyol-variant-utils';
import { buildShopifyBodyHtml } from './shopify-description-builder';
import { sanitizeShopifyTags } from '@shared/shopify-tag-sanitizer';

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

export function normalizeImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === 'string') {
        const raw = img.trim();
        const url = raw.startsWith('//') ? `https:${raw}` : raw;
        return url.startsWith('http') ? url : '';
      }
      if (img && typeof img === 'object' && 'url' in img) {
        const raw = String((img as { url: string }).url).trim();
        const url = raw.startsWith('//') ? `https:${raw}` : raw;
        return url.startsWith('http') ? url : '';
      }
      return '';
    })
    .filter(Boolean);
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
  const sanitizedVariants = sanitizeTrendyolVariants(productData?.variants, {
    productTitle: title,
  });
  const normalizedVariants = sanitizedVariants.allVariants.map((v) => ({
    color: v.color,
    size: v.size,
    inStock: v.inStock,
    price: undefined as number | undefined,
  }));

  const tagsRaw = productData?.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map(String)
    : typeof tagsRaw === 'string'
      ? tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

  const description = String(productData?.description || '').trim();
  const features = Array.isArray(productData?.features)
    ? productData.features.filter(
        (f: unknown) =>
          f &&
          typeof f === 'object' &&
          String((f as { key?: string }).key || '').trim() &&
          String((f as { value?: string }).value || '').trim(),
      )
    : [];

  const bodyHtml = buildShopifyBodyHtml({
    title,
    brand,
    description,
    category: String(productData?.category || productData?.product_type || '').trim(),
    features,
  });

  return {
    title,
    brand,
    bodyHtml,
    vendor: brand,
    productType: String(productData?.category || productData?.product_type || 'Genel').trim() || 'Genel',
    tags,
    price: {
      original: price.original,
      withProfit: price.withProfit > 0 ? price.withProfit : Math.round(price.original * 1.1 * 100) / 100,
    },
    images,
    variants: {
      colors: sanitizedVariants.colors,
      sizes: sanitizedVariants.sizes,
      allVariants: normalizedVariants,
    },
    sourceUrl: productData?.sourceUrl || productData?.originalUrl || productData?.url,
  };
}

export function validateShopifyPayload(input: NormalizedShopifyProductInput): PayloadValidationResult {
  const errors: string[] = [];

  if (!input.title || input.title.length < 2) errors.push('title zorunlu (min 2 karakter)');
  if (!input.price.withProfit || input.price.withProfit <= 0) {
    errors.push('price geçersiz — fiyat bulunamadı');
  }
  if (!input.variants.allVariants.length) errors.push('en az 1 variant gerekli');
  // Görsel zorunluluğu CSV yükleme yolunda ayrı kontrol edilir
  if (!input.images.length) {
    errors.push('en az 1 geçerli görsel URL gerekli (CSV ile yüklemede görsel sütunu kullanılabilir)');
  }

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

export interface ShopifyRestProductPayload {
  product: {
    title: string;
    body_html: string;
    vendor: string;
    product_type: string;
    tags: string;
    handle?: string;
    status: 'draft' | 'active';
    published: boolean;
    variants: Array<Record<string, unknown>>;
    images: Array<{ src: string; alt?: string; position?: number }>;
    options?: Array<{ name: string; values: string[] }>;
  };
}

function slugifyHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `product-${Date.now()}`;
}

/** Shopify REST API product create payload — draft varsayılan */
export function buildShopifyProductApiPayload(
  input: NormalizedShopifyProductInput,
  opts: { customTags?: string[]; status?: 'draft' | 'active' } = {},
): ShopifyRestProductPayload {
  const status = opts.status ?? 'draft';
  const priceStr = toDecimalString(input.price.withProfit);
  const compareAt =
    input.price.original > 0 ? toDecimalString(input.price.original) : priceStr;

  const allVariants = input.variants.allVariants.length
    ? input.variants.allVariants
    : [{ color: 'Default', size: 'Tek Beden', inStock: true }];

  const variants = allVariants.map((variant) => {
    const row: Record<string, unknown> = {
      price: priceStr,
      compare_at_price: compareAt,
      inventory_quantity: 0,
      inventory_policy: 'continue',
      requires_shipping: true,
      taxable: true,
      fulfillment_service: 'manual',
    };

    const color = String(variant.color || '').trim();
    const size = String(variant.size || '').trim();
    if (color) row.option1 = color;
    if (size) row.option2 = size;
    if (!color && !size) row.option1 = 'Default';

    return row;
  });

  const colors = [...new Set(allVariants.map((v) => v.color).filter(Boolean))];
  const sizes = [...new Set(allVariants.map((v) => v.size).filter(Boolean))];
  const hasOptions = colors.length > 0 || sizes.length > 0;

  const automaticTags: string[] = [];
  const allTags = sanitizeShopifyTags([
    ...automaticTags,
    ...(opts.customTags ?? []),
    ...input.tags,
  ]);
  const tagsString = allTags.join(', ');

  const images = input.images.map((src, index) => ({
    src,
    alt: `${input.title} - ${index + 1}`,
    position: index + 1,
  }));

  const payload: ShopifyRestProductPayload = {
    product: {
      title: input.title,
      body_html: input.bodyHtml,
      vendor: input.vendor || input.brand || 'Marka',
      product_type: input.productType || 'Genel',
      tags: tagsString,
      handle: slugifyHandle(input.title),
      status,
      published: status === 'active',
      variants,
      images,
    },
  };

  if (hasOptions) {
    payload.product.options = [
      ...(colors.length ? [{ name: 'Renk', values: colors }] : []),
      ...(sizes.length ? [{ name: 'Beden', values: sizes }] : [{ name: 'Beden', values: ['Tek Beden'] }]),
    ];
  }

  return payload;
}
