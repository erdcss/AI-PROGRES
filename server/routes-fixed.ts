import type { Express } from "express";
import { createServer, type Server } from "http";
import { generateShopifyCSV } from './shopify-export-fixed';
import { resolveShopifyCsvPath, SHOPIFY_CSV_FILENAME } from './csv-paths';
import fs from 'fs';

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}${urlObj.search}`;
  } catch {
    return url;
  }
}

export function registerRoutes(app: Express): Server {
  app.post("/api/scrape", async (req: any, res: any) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ message: "URL gerekli" });
      }

      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl.includes('trendyol.com/')) {
        return res.status(400).json({
          message: "Sadece Trendyol URL'leri desteklenmektedir",
          supportedDomains: ["trendyol.com"],
        });
      }

      const { aiEnhancedScrape } = await import('./ai-enhanced-scraper');
      const result = await aiEnhancedScrape(normalizedUrl);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        message: "Ürün verisi çekilirken hata oluştu",
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      });
    }
  });

  app.get("/api/history", async (_req: any, res: any) => {
    res.json({ urls: [] });
  });

  app.get(`/api/download/${SHOPIFY_CSV_FILENAME}`, (req, res) => {
    try {
      const csvPath = resolveShopifyCsvPath();
      if (!csvPath) {
        return res.status(404).json({ error: 'CSV dosyası bulunamadı' });
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${SHOPIFY_CSV_FILENAME}"`);
      res.send('\uFEFF' + fs.readFileSync(csvPath, 'utf8'));
    } catch (error) {
      res.status(500).json({ error: 'CSV indirme hatası' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
