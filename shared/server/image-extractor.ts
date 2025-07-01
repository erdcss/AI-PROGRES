/**
 * Trendyol Görsel Çıkarıcı
 * Ultimate kesin çözüm sistemi
 */

import { extractUltimateImages } from './ultimate-image-extractor';

/**
 * Verilen ürün URL'sinden tüm görselleri çeker - Ultimate çözüm
 * @param url Ürün URL'si
 * @returns Benzersiz kaliteli görsellerin listesi
 */
export async function extractImages(url: string): Promise<string[]> {
  console.log('🎯 Ultimate Image Extractor başlatılıyor...');
  console.log(`📍 URL: ${url}`);
  
  try {
    // Ultimate Image Extractor ile kesin çözüm
    const images = await extractUltimateImages(url);
    
    console.log(`✅ Ultimate Extractor tamamlandı: ${images.length} benzersiz kaliteli görsel`);
    return images;
    
  } catch (error) {
    console.error('❌ Ultimate Image Extractor hatası:', error);
    return [];
  }
}