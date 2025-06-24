import { enhancedScraper } from './enhanced-trendyol-scraper';

// Enhanced scraper modülünü kontrol et ve gerekirse düzelt
export async function scrapeProductData(url: string): Promise<any> {
  try {
    // Enhanced scraper'ı kullan
    if (enhancedScraper && typeof enhancedScraper.scrapeProduct === 'function') {
      return await enhancedScraper.scrapeProduct(url);
    }
    
    // Fallback: enhanced-trendyol-scraper dosyasından direkt import
    const { scrapeWithEnhancedMethod } = await import('./enhanced-trendyol-scraper');
    return await scrapeWithEnhancedMethod(url);
    
  } catch (error) {
    console.error('Enhanced scraper hatası:', error);
    return null;
  }
}