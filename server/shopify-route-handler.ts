import type { Request, Response } from 'express';
import { handleShopifyProductUpload } from './shopify-upload-service';
import { getRequestId } from './request-context';

/** Standart Shopify ürün gönderme — POST /api/shopify/products ve alias'lar */
export async function handleShopifyProductsRoute(req: Request, res: Response): Promise<void> {
  const requestId = getRequestId(req);
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;

  try {
    const productData = req.body?.productData || req.body;
    const result = await handleShopifyProductUpload({
      productData,
      csvContent: req.body?.csvContent,
      productTitle: req.body?.productTitle || productData?.title,
      sourceUrl:
        req.body?.sourceUrl ||
        req.body?.trendyolUrl ||
        productData?.sourceUrl ||
        productData?.originalUrl,
      customTags: req.body?.customTags,
      approvedForShopify: req.body?.approvedForShopify === true,
      titleEdited: req.body?.titleEdited === true,
      titleSource: req.body?.titleSource || productData?.titleSource,
      scrapedTitle: req.body?.scrapedTitle || productData?.scrapedTitle,
      dryRun,
      requestId,
    });

    const httpStatus =
      typeof result.httpStatus === 'number'
        ? result.httpStatus
        : result.success
          ? 200
          : 400;

    res.status(httpStatus).json({ ...result, requestId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sunucu hatası';
    res.status(500).json({ success: false, error: message, step: 'server_error', requestId });
  }
}
