import type { Express } from "express";
import { WEB_HOOK_SITES } from "@shared/web-hooks-sites";
import {
  addWeboTagsToProducts,
  buildWeboShopifyTags,
  ensureWeboTable,
  getWebHooksSchema,
  getWeboProductById,
  getWeboSiteCatalog,
  listPendingWeboProducts,
  listWeboEvents,
  markWeboTransferred,
  purgeWeboAlreadyOnShopify,
  normalizeWeboTags,
  upsertWeboProduct,
} from "../services/webo.service";
import {
  ensureWeboDiscoveryScheduler,
  getWeboDiscoveryStatus,
  runWeboDiscoveryCycle,
  setWeboDiscoveryEnabled,
} from "../services/webo-discovery.service";

export function registerWeboRoutes(app: Express): void {
  ensureWeboDiscoveryScheduler();

  app.get("/api/web-hooks/sites", (_req, res) => {
    res.json({ success: true, sites: WEB_HOOK_SITES });
  });

  app.get("/api/web-hooks/schema", async (_req, res) => {
    try {
      await purgeWeboAlreadyOnShopify().catch(() => 0);
      const schema = await getWebHooksSchema(getWeboDiscoveryStatus());
      return res.json({ success: true, schema });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/web-hooks/events", async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const events = await listWeboEvents(limit);
      return res.json({ success: true, events, discovery: getWeboDiscoveryStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/web-hooks/discovery/run", async (req, res) => {
    try {
      const enrich = Boolean(req.body?.enrich);
      const summary = await runWeboDiscoveryCycle("manual", { enrich });
      return res.json({
        success: true,
        summary,
        discovery: getWeboDiscoveryStatus(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/web-hooks/discovery/toggle", async (req, res) => {
    try {
      const enabled = req.body?.enabled;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ success: false, error: "enabled boolean zorunlu" });
      }
      setWeboDiscoveryEnabled(enabled);
      return res.json({ success: true, discovery: getWeboDiscoveryStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/web-hooks/purge-shopify", async (_req, res) => {
    try {
      const marked = await purgeWeboAlreadyOnShopify();
      return res.json({ success: true, marked });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/webo/sites", async (_req, res) => {
    try {
      const sites = await getWeboSiteCatalog();
      return res.json({ success: true, sites });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/webo/products", async (req, res) => {
    try {
      await ensureWeboTable();
      await purgeWeboAlreadyOnShopify().catch(() => 0);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
      const siteId = String(req.query.siteId || "").trim() || null;
      const products = await listPendingWeboProducts(limit, siteId);
      return res.json({
        success: true,
        products,
        total: products.length,
        note: "Yalnızca Shopify mağazasında olmayan keşif ürünleri",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/mobile/webo/tags", async (req, res) => {
    try {
      const tags = normalizeWeboTags(req.body?.tags);
      if (!tags.length) {
        return res.status(400).json({ success: false, error: "etiket zorunlu" });
      }
      const rawIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
      const ids = rawIds
        .map((v: unknown) => Number(v))
        .filter((n: number) => Number.isFinite(n) && n > 0);
      if (!ids.length) {
        return res.status(400).json({ success: false, error: "ürün seçimi zorunlu" });
      }
      const updated = await addWeboTagsToProducts(ids, tags);
      return res.json({ success: true, updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.get("/api/mobile/webo/products/:id", async (req, res) => {
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
      return res.json({ success: true, product });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });

  app.post("/api/mobile/webo/discovery/run", async (_req, res) => {
    try {
      const summary = await runWeboDiscoveryCycle("mobile", { enrich: true });
      return res.json({
        success: true,
        summary,
        discovery: getWeboDiscoveryStatus(),
      });
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
          tags: buildWeboShopifyTags(product),
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

  /** Manuel / test: ürün kuyruğa ekle (Shopify'da varsa elenir) */
  app.post("/api/web-hooks/ingest", async (req, res) => {
    try {
      const row = await upsertWeboProduct(req.body || {});
      if (!row || row.skipped === "invalid") {
        return res.status(400).json({ success: false, error: "geçersiz ürün" });
      }
      if (row.skipped === "shopify") {
        return res.json({
          success: true,
          skipped: "shopify",
          message: "Ürün zaten Shopify mağazasında — Webo kuyruğuna alınmadı",
        });
      }
      return res.json({ success: true, id: row.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  });
}
