import { generateMultiVariantShopifyCSV } from './multi-variant-csv-generator';
import { uploadProductToShopify } from './shopify-api-uploader';
import { runShopifyConnectionTest } from './connection-test';
import {
  normalizeTrendyolProductForShopify,
  validateShopifyPayload,
} from './shopify-payload-validator';
import { evaluateShopifyExportGate } from './shopify-export-gate';
import { createShopifyProductFromNormalized } from './shopify-product-create';
import { resolveShopifyConfig } from './shopify-credentials';
import { logStep } from './request-context';
import { db } from './db';
import { shopifyTransferredProducts } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface ShopifyUploadRequest {
  productData: any;
  csvContent?: string;
  productTitle?: string;
  sourceUrl?: string;
  customTags?: string[];
  dryRun?: boolean;
  requestId?: string;
  approvedForShopify?: boolean;
  titleEdited?: boolean;
  titleSource?: string;
  scrapedTitle?: string;
}

function mapHttpStatus(step: string, httpStatus?: number): number {
  if (httpStatus === 401 || httpStatus === 403) return httpStatus;
  if (httpStatus === 422) return 422;
  if (step === 'connection_check') return 400;
  return httpStatus && httpStatus >= 400 ? httpStatus : 400;
}

export async function handleShopifyProductUpload(
  req: ShopifyUploadRequest,
): Promise<Record<string, unknown>> {
  const rid = req.requestId || 'upload';
  const dryRun = req.dryRun === true;

  logStep(rid, 'shopify_upload', dryRun ? 'Dry-run başlatıldı' : 'Upload başlatıldı');

  const config = await resolveShopifyConfig();
  if (!config.ok) {
    return {
      success: false,
      error: config.error || 'Shopify yapılandırması eksik',
      step: 'connection_check',
      httpStatus: 401,
    };
  }

  const conn = await runShopifyConnectionTest(rid);
  if (!conn.connected) {
    return {
      success: false,
      error: conn.message,
      step: 'connection_check',
      connection: conn,
      httpStatus: 401,
    };
  }

  const normalized = normalizeTrendyolProductForShopify(req.productData || {});
  if (req.productTitle?.trim()) {
    normalized.title = req.productTitle.trim();
  }

  const sourceUrl =
    req.sourceUrl ||
    normalized.sourceUrl ||
    req.productData?.originalUrl ||
    req.productData?.url ||
    '';

  const exportGate = evaluateShopifyExportGate({
    title: normalized.title,
    scrapedTitle: req.scrapedTitle || req.productData?.scrapedTitle,
    priceOriginal: normalized.price.original,
    images: normalized.images,
    sourceUrl,
    titleSource: req.titleSource || req.productData?.titleSource,
    approvedForShopify: req.approvedForShopify === true,
    titleEdited: req.titleEdited === true,
  });

  if (!exportGate.allowed) {
    return {
      success: false,
      error: exportGate.reason,
      step: exportGate.needsTitleApproval ? 'title_approval_required' : 'export_gate',
      warning: exportGate.warning,
      needsTitleApproval: exportGate.needsTitleApproval === true,
      httpStatus: 400,
    };
  }

  const validation = validateShopifyPayload(normalized);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Payload doğrulama hatası',
      step: 'payload_validation',
      details: validation.errors,
      httpStatus: 422,
    };
  }

  if (sourceUrl) {
    try {
      const existing = await db
        .select()
        .from(shopifyTransferredProducts)
        .where(eq(shopifyTransferredProducts.sourceUrl, sourceUrl))
        .limit(1);
      if (existing[0]?.shopifyProductId) {
        return {
          success: false,
          duplicate: true,
          step: 'duplicate_check',
          error: 'Bu kaynak URL daha önce Shopify\'a aktarıldı',
          shopifyProductId: existing[0].shopifyProductId,
          adminUrl: conn.shopDomain
            ? `https://${conn.shopDomain}/admin/products/${existing[0].shopifyProductId}`
            : undefined,
          hint: 'Güncelleme için Shopify panelinden düzenleyin veya farklı URL deneyin',
          httpStatus: 409,
        };
      }
    } catch (dbErr) {
      logStep(rid, 'duplicate_check', 'DB kontrolü atlandı', { reason: String(dbErr) });
    }
  }

  const payloadPreview = {
    title: normalized.title,
    vendor: normalized.vendor,
    productType: normalized.productType,
    variantCount: normalized.variants.allVariants.length || 1,
    imageCount: normalized.images.length,
    price: normalized.price.withProfit.toFixed(2),
    tags: normalized.tags,
    sourceUrl,
    status: 'draft',
    warning: exportGate.warning,
  };

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      step: 'dry_run_complete',
      payload: payloadPreview,
      connection: {
        shopDomain: conn.shopDomain,
        shopName: conn.shopName,
        tokenSource: conn.tokenSource,
      },
    };
  }

  logStep(rid, 'shopify_upload', 'Shopify API çağrısı', { title: normalized.title });

  let uploadResult = await createShopifyProductFromNormalized(normalized, {
    customTags: req.customTags || normalized.tags,
    status: 'draft',
    tokenSource: conn.tokenSource,
  });

  if (!uploadResult.success && req.csvContent && req.csvContent.length > 50) {
    const csvResult = await uploadProductToShopify(req.csvContent, normalized.title);
    if (csvResult.success) {
      uploadResult = {
        success: true,
        productId: csvResult.productId,
        handle: csvResult.handle,
        status: 'draft',
        message: csvResult.message,
        adminUrl:
          conn.shopDomain && csvResult.productId
            ? `https://${conn.shopDomain}/admin/products/${csvResult.productId}`
            : undefined,
      };
    } else {
      uploadResult = {
        success: false,
        message: csvResult.message,
        httpStatus: 422,
      };
    }
  }

  if (!uploadResult.success) {
    return {
      success: false,
      error: uploadResult.message,
      step: 'shopify_api',
      shopifyErrors: uploadResult.shopifyErrors,
      httpStatus: mapHttpStatus('shopify_api', uploadResult.httpStatus),
    };
  }

  const productId = uploadResult.productId;
  const handle = uploadResult.handle;
  const adminUrl =
    uploadResult.adminUrl ||
    (conn.shopDomain && productId
      ? `https://${conn.shopDomain}/admin/products/${productId}`
      : undefined);

  if (sourceUrl && productId) {
    try {
      await db.insert(shopifyTransferredProducts).values({
        sourceUrl,
        shopifyProductId: String(productId),
        title: normalized.title,
        brand: normalized.brand,
        shopifyPrice: String(normalized.price.withProfit),
        originalPrice: String(normalized.price.original),
        variantCount: normalized.variants.allVariants.length || 1,
        imageCount: normalized.images.length,
      });
    } catch {
      /* non-critical */
    }
  }

  if (sourceUrl && productId && normalized.price.original > 0) {
    try {
      const { getTrackingSettings } = await import('./services/tracking-settings.service');
      const trackingSettings = await getTrackingSettings();
      if (trackingSettings.trackingEnabled) {
        const { trackingService } = await import('./services/tracking.service');
        await trackingService.registerFromShopifyUpload({
          sourceUrl,
          title: normalized.title,
          price: normalized.price.original,
          shopifyProductId: String(productId),
          shopifyHandle: handle,
          variants: normalized.variants.allVariants.map((v) => ({
            color: v.color,
            size: v.size,
            sku: (v as { sku?: string }).sku,
            inStock: v.inStock,
            price: normalized.price.original,
          })),
        });
      }
    } catch (trackErr) {
      console.warn('⚠️ Tracking kaydı oluşturulamadı (kritik değil):', trackErr);
    }
  }

  return {
    success: true,
    step: 'complete',
    shopifyId: productId,
    shopifyProductId: productId,
    handle,
    status: uploadResult.status || 'draft',
    adminUrl,
    storeUrl: handle && conn.shopDomain ? `https://${conn.shopDomain}/products/${handle}` : undefined,
    sourceUrl,
    transferredAt: new Date().toISOString(),
    message: uploadResult.message,
    warning: exportGate.warning,
  };
}
