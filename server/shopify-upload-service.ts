import { generateMultiVariantShopifyCSV } from './multi-variant-csv-generator';
import { uploadProductToShopify } from './shopify-api-uploader';
import { uploadMultiUrlProductToShopify } from './multi-url-shopify-uploader';
import { runShopifyConnectionTest } from './connection-test';
import {
  normalizeTrendyolProductForShopify,
  validateShopifyPayload,
} from './shopify-payload-validator';
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
}

export async function handleShopifyProductUpload(req: ShopifyUploadRequest): Promise<Record<string, unknown>> {
  const rid = req.requestId || 'upload';
  const dryRun = req.dryRun === true;

  logStep(rid, 'shopify_upload', dryRun ? 'Dry-run başlatıldı' : 'Upload başlatıldı');

  const conn = await runShopifyConnectionTest(rid);
  if (!conn.connected) {
    return {
      success: false,
      error: conn.message,
      step: 'connection_check',
      connection: conn,
    };
  }

  const normalized = normalizeTrendyolProductForShopify(req.productData || {});
  const validation = validateShopifyPayload(normalized);

  if (normalized.price.original <= 0 || normalized.price.withProfit <= 0) {
    return {
      success: false,
      error: 'Fiyat alınamadığı için Shopify aktarımı yapılamaz.',
      step: 'price_validation',
    };
  }

  if (!req.csvContent && !validation.valid) {
    return {
      success: false,
      error: 'Payload doğrulama hatası',
      step: 'payload_validation',
      details: validation.errors,
    };
  }

  const sourceUrl =
    req.sourceUrl ||
    normalized.sourceUrl ||
    req.productData?.originalUrl ||
    req.productData?.url ||
    '';

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
        };
      }
    } catch (dbErr) {
      logStep(rid, 'duplicate_check', 'DB kontrolü atlandı', { reason: String(dbErr) });
    }
  }

  let csvContent = req.csvContent;
  if (!csvContent) {
    try {
      csvContent = await generateMultiVariantShopifyCSV({
        id: `product-${Date.now()}`,
        title: normalized.title,
        brand: normalized.brand,
        price: normalized.price,
        description: normalized.bodyHtml.replace(/<[^>]+>/g, ''),
        category: normalized.productType,
        images: normalized.images,
        variants: normalized.variants,
        features: req.productData?.features || [],
        tags: normalized.tags,
      });
    } catch (csvErr: any) {
      return {
        success: false,
        error: 'CSV oluşturulamadı',
        step: 'csv_generation',
        details: csvErr.message,
      };
    }
  }

  const payloadPreview = {
    title: normalized.title,
    vendor: normalized.vendor,
    productType: normalized.productType,
    variantCount: normalized.variants.allVariants.length,
    imageCount: normalized.images.length,
    price: normalized.price.withProfit.toFixed(2),
    tags: normalized.tags,
    sourceUrl,
  };

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      step: 'dry_run_complete',
      payload: payloadPreview,
      csvPreview: csvContent?.substring(0, 500),
      connection: {
        shopDomain: conn.shopDomain,
        shopName: conn.shopName,
        tokenSource: conn.tokenSource,
      },
    };
  }

  logStep(rid, 'shopify_upload', 'Shopify API çağrısı', { title: normalized.title });

  let uploadResult;
  if (csvContent && csvContent.length > 50) {
    uploadResult = await uploadProductToShopify(csvContent, normalized.title);
  } else {
    uploadResult = await uploadMultiUrlProductToShopify(
      {
        title: normalized.title,
        brand: normalized.brand,
        price: normalized.price,
        images: normalized.images,
        variants: normalized.variants,
      },
      normalized.title,
      req.customTags || normalized.tags
    );
  }

  if (!uploadResult.success) {
    return {
      success: false,
      error: uploadResult.message,
      step: 'shopify_api',
    };
  }

  const productId = uploadResult.productId || (uploadResult as any).shopifyProductId;
  const handle = (uploadResult as any).handle;
  const adminUrl =
    (uploadResult as any).adminUrl ||
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
        variantCount: normalized.variants.allVariants.length,
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
            sku: v.sku,
            inStock: v.inStock,
            price: normalized.price.original,
          })),
        });
        console.log(`✅ tracked_products kaydı oluşturuldu: ${normalized.title}`);
      } else {
        console.info('ℹ️ tracked_products kaydı atlandı (takip sistemi kapalı)');
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
    adminUrl,
    storeUrl: handle && conn.shopDomain ? `https://${conn.shopDomain}/products/${handle}` : undefined,
    sourceUrl,
    transferredAt: new Date().toISOString(),
    message: uploadResult.message,
  };
}
