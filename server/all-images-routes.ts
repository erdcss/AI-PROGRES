/**
 * Tüm görselleri getiren endpoint'ler için router modülü
 */

import { Express } from 'express';
import { urlSchema } from '@shared/schema';
import { scrapeWithEnhancedImages } from './enhanced-scraper';
import { storage } from './storage';
import { handleError } from './errors';

/**
 * Tüm görselleri getiren endpoint'leri kayıt eder
 */
export function registerAllImagesRoutes(app: Express) {
  // Tüm görsellerle birlikte ürün bilgilerini getiren yeni endpoint
  app.post('/api/scrape-all-images', async (req, res) => {
    try {
      // URL validasyonu
      const result = urlSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Geçersiz URL formatı",
          details: result.error.message
        });
      }

      const { url } = result.data;
      console.log(`Tüm görsellerle birlikte ürün scrape ediliyor: ${url}`);
      
      // URL'in normalize edilmiş halini al
      const normalizedUrl = normalizeUrl(url);
      
      // Önce veritabanında bu ürünü kontrol et
      const existingProduct = await storage.getProduct(normalizedUrl);
      if (existingProduct) {
        console.log(`Ürün önbellekten alındı: ${existingProduct.title}`);
        return res.status(200).json(existingProduct);
      }
      
      // Geçmişe ekle
      storage.addToHistory(url);
      
      // Geliştirilmiş scraper ile tüm görselleri içeren ürünü çek
      const productData = await scrapeWithEnhancedImages(url);
      
      // Veritabanına kaydet
      const savedProduct = await storage.saveProduct(productData);
      console.log(`TÜM GÖRSELLERİ içeren ürün kaydedildi: ${savedProduct.title} (ID: ${savedProduct.id})`);
      
      // Başarılı yanıt döndür
      return res.status(200).json(savedProduct);
    } catch (error: any) {
      // Hata durumunda
      const errorResponse = handleError(error);
      return res.status(errorResponse.status).json({
        message: errorResponse.message,
        details: errorResponse.details
      });
    }
  });

  console.log("Tüm görselleri getiren endpoint'ler başarıyla kaydedildi");
}

/**
 * URL'i normalize eder - www. ve trailing slash'i kaldırır, sabitleme parametrelerini temizler
 */
function normalizeUrl(url: string): string {
  let normalizedUrl = url.replace(/^https?:\/\/www\./, 'https://');
  normalizedUrl = normalizedUrl.replace(/\/$/, '');
  
  // URL parametrelerini temizle
  if (normalizedUrl.includes('?')) {
    const baseUrl = normalizedUrl.split('?')[0];
    
    // Ürün ID'sini korumak için
    if (baseUrl.includes('-p-')) {
      return baseUrl;
    }
  }
  
  return normalizedUrl;
}