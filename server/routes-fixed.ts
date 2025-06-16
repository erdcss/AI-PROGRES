import type { Express } from "express";
import { createServer, type Server } from "http";
import { generateShopifyCSV } from './shopify-export-fixed';

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}${urlObj.search}`;
    return normalizedUrl;
  } catch (error) {
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

      console.log("Scrape isteği alındı");
      const originalUrl = url;
      const normalizedUrl = normalizeUrl(url);
      console.log(`URL normalize edildi: ${originalUrl} -> ${normalizedUrl}`);

      // Extract product ID from URL
      const productIdMatch = normalizedUrl.match(/p-(\d+)/);
      const productId = productIdMatch ? productIdMatch[1] : null;

      // Handle all Trendyol URLs with proper stock detection
      if (normalizedUrl.includes('trendyol.com/')) {
        console.log("Trendyol ürün verisi işleniyor...");
        
        if (normalizedUrl.includes('modagen')) {
          const { handleModagenProduct } = await import('./modagen-handler');
          const result = await handleModagenProduct(normalizedUrl, productId || '');
          return res.status(200).json(result);
        }
        
        // Use working Trendyol handler for all other products
        const { handleTrendyolProduct } = await import('./working-trendyol-handler');
        const result = await handleTrendyolProduct(normalizedUrl, productId || '');
        return res.status(200).json(result);
      }

      // For non-Trendyol URLs, return error
      return res.status(400).json({ 
        message: "Sadece Trendyol URL'leri desteklenmektedir",
        supportedDomains: ["trendyol.com"]
      });

    } catch (error) {
      console.error("Scraping hatası:", error);
      return res.status(500).json({ 
        message: "Ürün verisi çekilirken hata oluştu",
        error: error instanceof Error ? error.message : "Bilinmeyen hata"
      });
    }
  });

  app.get("/api/history", async (req: any, res: any) => {
    res.json({ urls: [] });
  });

  const httpServer = createServer(app);
  return httpServer;
}