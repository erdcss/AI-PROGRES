import type { Express } from "express";
import { syncShopifyCategorySummary } from "../services/shopify-category-sync.service";

export function registerShopifyCategoryRoutes(app: Express): void {
  app.get("/api/shopify/categories", async (_req, res) => {
    try {
      const summary = await syncShopifyCategorySummary();
      res.json(summary);
    } catch (error) {
      console.error("[ShopifyCategories] sync failed:", error);
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Shopify kategori senkronizasyonu başarısız",
      });
    }
  });
}
