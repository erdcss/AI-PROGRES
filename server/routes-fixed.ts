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
        
        // Use simple Trendyol handler for basic data extraction
        const { scrapeSimpleTrendyolProduct } = await import('./simple-trendyol-scraper');
        const result = await scrapeSimpleTrendyolProduct(normalizedUrl);
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

  // CSV download endpoint
  app.get('/api/download-csv', (req, res) => {
    try {
      const csvPath = path.join('/home/runner/workspace', 'shopify-urunler.csv');
      
      if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ error: 'CSV dosyası bulunamadı' });
      }
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="shopify-urunler.csv"');
      
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      res.send('\uFEFF' + csvContent); // Add BOM for Excel compatibility
      
      console.log('📥 CSV dosyası indirildi');
    } catch (error) {
      console.error('❌ CSV indirme hatası:', error);
      res.status(500).json({ error: 'CSV indirme hatası' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}