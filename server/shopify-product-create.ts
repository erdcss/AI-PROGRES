import { getValidShopifyAccessToken, shopifyAdminFetch } from './shopify-token-manager';
import {
  buildShopifyProductApiPayload,
  formatShopifyApiError,
  type NormalizedShopifyProductInput,
} from './shopify-payload-validator';

export async function createShopifyProductFromNormalized(
  normalized: NormalizedShopifyProductInput,
  opts: {
    customTags?: string[];
    status?: 'draft' | 'active';
    tokenSource?: string;
  } = {},
): Promise<{
  success: boolean;
  productId?: string;
  handle?: string;
  status?: string;
  adminUrl?: string;
  message: string;
  product?: Record<string, unknown>;
  httpStatus?: number;
  shopifyErrors?: unknown;
}> {
  let tokenInfo;
  try {
    tokenInfo = await getValidShopifyAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Shopify kimlik bilgileri bulunamadı';
    console.error('[SHOPIFY_SEND] failed', {
      status: 401,
      code: 'missing_credentials',
      message,
      shopifyErrors: null,
    });
    return {
      success: false,
      httpStatus: 401,
      message,
    };
  }

  const shopDomain = tokenInfo.shopDomain;
  const tokenSource = opts.tokenSource || tokenInfo.source;

  console.log('[SHOPIFY_SEND] start', {
    title: normalized.title,
    shopDomain,
    tokenSource,
  });

  const payload = buildShopifyProductApiPayload(normalized, {
    customTags: opts.customTags,
    status: opts.status ?? 'draft',
  });

  try {
    const { response } = await shopifyAdminFetch('/products.json', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let body: unknown = responseText;
    try {
      body = JSON.parse(responseText);
    } catch {
      /* plain text */
    }

    if (!response.ok) {
      console.error('[SHOPIFY_SEND] failed', {
        status: response.status,
        code: response.status === 422 ? 'validation_error' : 'shopify_api_error',
        message: formatShopifyApiError(response.status, body),
        shopifyErrors: (body as Record<string, unknown>)?.errors ?? body,
      });
      return {
        success: false,
        httpStatus: response.status,
        message: formatShopifyApiError(response.status, body),
        shopifyErrors: (body as Record<string, unknown>)?.errors ?? body,
      };
    }

    const result = body as { product?: Record<string, unknown> };
    const product = result.product ?? {};
    const productId = product.id != null ? String(product.id) : undefined;
    const handle = product.handle != null ? String(product.handle) : undefined;
    const productStatus = product.status != null ? String(product.status) : 'draft';
    const adminUrl = productId
      ? `https://${shopDomain}/admin/products/${productId}`
      : undefined;

    console.log('[SHOPIFY_SEND] success', { productId, handle });

    return {
      success: true,
      productId,
      handle,
      status: productStatus,
      adminUrl,
      message: 'Ürün Shopify\'a draft olarak eklendi',
      product,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    console.error('[SHOPIFY_SEND] failed', {
      status: 500,
      code: 'network_error',
      message,
      shopifyErrors: null,
    });
    return {
      success: false,
      httpStatus: 500,
      message: `Shopify bağlantı hatası: ${message}`,
    };
  }
}
