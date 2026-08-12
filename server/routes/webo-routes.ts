import type { Express } from "express";
import { WEB_HOOK_SITES } from "@shared/web-hooks-sites";
import {
  ensureWeboTable,
  getWebHooksSchema,
  getWeboProductById,
  listPendingWeboProducts,
  markWeboTransferred,
  upsertWeboProduct,
} from "../services/webo.service";

export function registerWeboRoutes(app: Express): void {
  app.get("/api/web-hooks/sites", (_req, res) => {
    res.json({ success: true, sites: WEB_HOOK_SITES });
  });

  app.get("/api/web-hooks/schema", async (_req, res) => {
    try {
      const schema = await getWebHooksSchema();
      return res.json({ success: true, schema });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/webo/products", async (req, res) => {
    try {
      await ensureWeboTable();
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60));
      const products = await listPendingWeboProducts(limit);
      return res.json({ success: true, products, total: products.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/mobile/webo/products/:id/shopify-transfer", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, error: "geçersiz id" });
      }
      const product = await getWeboProductById(id);
      if (!product) {
        return res.status(404).json({ success: false, error: "ürün bulunamadı" });
      }
      if (product.shopifyProductId) {
        return res.status(409).json({ success: false, error: "ürün zaten Shopify'da" });
      }

      const salePrice = Number(product.salePrice || product.price || 0);
      if (!(salePrice > 0)) {
        return res.status(400).json({ success: false, error: "geçerli fiyat yok" });
      }

      // Shopify Admin API ile aktar
      const { shopifyAdminFetch, parseShopifyAdminResponse } = await import(
        "../shopify-token-manager"
      );
      const {
        buildProductPoolDescriptionHtml,
        filterProductImagesForShopify,
        rejectNonJpegProductPlaceholders,
      } = await import("../product-pool/scrape");

      const PROFIT_MARGIN = 0.1;
      const shopifyPrice = Math.round(salePrice * (1 + PROFIT_MARGIN) * 100) / 100;
      const price = shopifyPrice.toFixed(2);
      const imageList = (
        product.images?.length
          ? product.images
          : product.imageUrl
            ? [product.imageUrl]
            : []
      ).filter((u): u is string => typeof u === "string" && u.startsWith("http"));
      const safeImages = await rejectNonJpegProductPlaceholders(
        filterProductImagesForShopify(imageList, product.siteLogoUrl),
      );
      const images = safeImages.map((src, i) => ({ src, position: i + 1 }));
      const bodyHtml = buildProductPoolDescriptionHtml([]);

      const payload = {
        product: {
          title: product.title,
          body_html: bodyHtml,
          vendor: product.brand || product.siteName || "Webo",
          product_type: "Webo",
          tags: ["webo", product.siteName, product.source].filter(Boolean).join(", "),
          status: "active",
          published: true,
          variants: [{ price, inventory_management: null, sku: product.sku || undefined }],
          images,
        },
      };

      const { response } = await shopifyAdminFetch("/products.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await parseShopifyAdminResponse(response)) as {
        product?: { id?: number; handle?: string };
        errors?: unknown;
      };

      if (!response.ok || !body?.product?.id) {
        const err =
          typeof body?.errors === "string"
            ? body.errors
            : body?.errors
              ? JSON.stringify(body.errors)
              : `Shopify yükleme başarısız (HTTP ${response.status})`;
        return res.status(500).json({ success: false, error: err });
      }

      const shopifyProductId = String(body.product.id);
      await markWeboTransferred({ id: product.id, shopifyProductId });

      try {
        const { publishShopifyTransferToMobile } = await import(
          "../services/shopify-memory-upsert.service"
        );
        await publishShopifyTransferToMobile({
          shopifyProductId,
          title: product.title,
          handle: body.product.handle,
          vendor: product.brand || product.siteName || "Webo",
          productType: "Webo",
          status: "active",
          price: shopifyPrice,
          images: safeImages,
          sourceUrl: product.sourceUrl,
          sourceLabel: "Webo",
          shopifyProduct: (body.product as Record<string, unknown>) || null,
        });
      } catch (err) {
        console.warn("[webo] mobil yayın atlandı:", err);
      }

      return res.json({
        success: true,
        productId: shopifyProductId,
        handle: body.product.handle,
        shopifyPrice,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  /** Manuel / test: ürün kuyruğa ekle */
  app.post("/api/web-hooks/ingest", async (req, res) => {
    try {
      const row = await upsertWeboProduct(req.body || {});
      if (!row) return res.status(400).json({ success: false, error: "geçersiz ürün" });
      return res.json({ success: true, id: row.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });
}
