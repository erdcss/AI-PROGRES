/**
 * Tüm Görseleri Çeken API Endpoint
 */
import { Express } from 'express';
import { urlSchema } from '@shared/schema';
import { extractAllImagesFromJsonLD } from './json-ld-extractor';

/**
 * Trendyol ürünlerindeki tüm görselleri filtreleme olmadan çeken endpoint
 */
export function registerAllImagesRoute(app: Express) {
  // Yeni endpoint - Tüm görseleri çek
  app.post('/api/all-images', async (req, res) => {
    try {
      // URL doğrulama
      const result = urlSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Geçersiz URL formatı",
          details: result.error.message
        });
      }

      const { url } = result.data;
      console.log(`Tüm görseller çekiliyor: ${url}`);
      
      // JSON-LD'den tüm görselleri çek
      const allImages = await extractAllImagesFromJsonLD(url);
      
      // Başarılı yanıt
      return res.status(200).json({ 
        url,
        images: allImages,
        count: allImages.length,
        message: "Tüm görseller başarıyla çekildi"
      });
    } catch (error: any) {
      // Hata durumunda
      return res.status(500).json({ 
        message: "Görsel çekme işlemi başarısız oldu",
        error: error.message
      });
    }
  });

  console.log("Tüm görselleri çeken endpoint başarıyla kaydedildi.");
}