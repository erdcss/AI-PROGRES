import { scrapeWithEnhancedMethod } from './enhanced-trendyol-scraper';

// Enhanced scraper modülünü kontrol et ve gerekirse düzelt
export async function scrapeProductData(url: string): Promise<any> {
  try {
    // Enhanced scraper'ı kullan
    return await scrapeWithEnhancedMethod(url);
    
    // Fallback: enhanced-trendyol-scraper dosyasından direkt import
    const { scrapeWithEnhancedMethod } = await import('./enhanced-trendyol-scraper');
    return await scrapeWithEnhancedMethod(url);
    
  } catch (error) {
    console.error('Enhanced scraper hatası:', error);
    return null;
  }
}