/**
 * Doğrudan Görsel Çekme Endpoint'i
 * Puppeteer kullanmadan sadece JSON-LD'den görselleri çeker
 */

import { Express } from 'express';
import { urlSchema } from '@shared/schema';
import { getAllProductImages } from './image-extractor';
import { handleError } from './errors';

/**
 * Doğrudan görsel çekme endpoint'ini kaydeder
 */
export function registerDirectImageEndpoint(app: Express) {
  // Sadece görselleri getiren basit endpoint
  app.post('/api/direct-images', async (req, res) => {
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
      console.log(`Doğrudan görsel çekiliyor: ${url}`);
      
      // Görselleri doğrudan çek
      const allImages = await getAllProductImages(url);
      
      // Başarılı yanıt döndür
      return res.status(200).json({ 
        url,
        images: allImages,
        count: allImages.length,
        message: "Tüm görseller başarıyla çekildi"
      });
    } catch (error: any) {
      // Hata durumunda
      const errorResponse = handleError(error);
      return res.status(errorResponse.status).json({
        message: errorResponse.message,
        details: errorResponse.details
      });
    }
  });

  console.log("Doğrudan görsel çekme endpoint'i başarıyla kaydedildi");
}