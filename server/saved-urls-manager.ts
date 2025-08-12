import { db } from './db';
import { urlTracking } from '@shared/schema';
import { eq, like, desc, or } from 'drizzle-orm';

export class SavedUrlsManager {
  // Kayıtlı URL'leri ara - başlık, marka, URL ile
  async searchSavedUrls(query: string): Promise<any[]> {
    try {
      const searchTerm = `%${query}%`;
      
      const results = await db
        .select({
          id: urlTracking.id,
          url: urlTracking.url,
          productTitle: urlTracking.productTitle,
          currentPrice: urlTracking.currentPrice,
          originalPrice: urlTracking.originalPrice,
          currency: urlTracking.currency,
          status: urlTracking.status,
          isTracking: urlTracking.isTracking,
          lastChecked: urlTracking.lastChecked,
          createdAt: urlTracking.createdAt,
          extractedData: urlTracking.extractedData
        })
        .from(urlTracking)
        .where(
          or(
            like(urlTracking.productTitle, searchTerm),
            like(urlTracking.url, searchTerm)
          )
        )
        .orderBy(desc(urlTracking.createdAt))
        .limit(20);

      // Extracted data'dan brand bilgisini al
      const enrichedResults = results.map(result => {
        const extractedData = result.extractedData as any;
        const brand = extractedData?.brand || 'Bilinmeyen Marka';
        
        return {
          ...result,
          brand,
          searchRelevance: this.calculateRelevance(query, result.productTitle, result.url, brand)
        };
      });

      // Relevance'a göre sırala
      return enrichedResults.sort((a, b) => b.searchRelevance - a.searchRelevance);
      
    } catch (error) {
      console.error('❌ URL arama hatası:', error);
      return [];
    }
  }

  // Tüm kayıtlı URL'leri getir
  async getAllSavedUrls(): Promise<any[]> {
    try {
      const results = await db
        .select({
          id: urlTracking.id,
          url: urlTracking.url,
          productTitle: urlTracking.productTitle,
          currentPrice: urlTracking.currentPrice,
          originalPrice: urlTracking.originalPrice,
          currency: urlTracking.currency,
          status: urlTracking.status,
          isTracking: urlTracking.isTracking,
          lastChecked: urlTracking.lastChecked,
          createdAt: urlTracking.createdAt,
          extractedData: urlTracking.extractedData
        })
        .from(urlTracking)
        .orderBy(desc(urlTracking.createdAt))
        .limit(50);

      // Brand bilgisini ekle
      return results.map(result => {
        const extractedData = result.extractedData as any;
        const brand = extractedData?.brand || 'Bilinmeyen Marka';
        
        return {
          ...result,
          brand
        };
      });
      
    } catch (error) {
      console.error('❌ URL listesi getirme hatası:', error);
      return [];
    }
  }

  // Popüler/sık aranan URL'leri getir
  async getPopularUrls(): Promise<any[]> {
    try {
      const results = await db
        .select({
          id: urlTracking.id,
          url: urlTracking.url,
          productTitle: urlTracking.productTitle,
          currentPrice: urlTracking.currentPrice,
          originalPrice: urlTracking.originalPrice,
          currency: urlTracking.currency,
          status: urlTracking.status,
          isTracking: urlTracking.isTracking,
          lastChecked: urlTracking.lastChecked,
          createdAt: urlTracking.createdAt,
          checkCount: urlTracking.checkCount,
          extractedData: urlTracking.extractedData
        })
        .from(urlTracking)
        .where(eq(urlTracking.status, 'active'))
        .orderBy(desc(urlTracking.checkCount))
        .limit(10);

      return results.map(result => {
        const extractedData = result.extractedData as any;
        const brand = extractedData?.brand || 'Bilinmeyen Marka';
        
        return {
          ...result,
          brand
        };
      });
      
    } catch (error) {
      console.error('❌ Popüler URLler getirme hatası:', error);
      return [];
    }
  }

  // Son eklenen URL'leri getir
  async getRecentUrls(limit: number = 10): Promise<any[]> {
    try {
      const results = await db
        .select({
          id: urlTracking.id,
          url: urlTracking.url,
          productTitle: urlTracking.productTitle,
          currentPrice: urlTracking.currentPrice,
          originalPrice: urlTracking.originalPrice,
          currency: urlTracking.currency,
          status: urlTracking.status,
          isTracking: urlTracking.isTracking,
          lastChecked: urlTracking.lastChecked,
          createdAt: urlTracking.createdAt,
          extractedData: urlTracking.extractedData
        })
        .from(urlTracking)
        .orderBy(desc(urlTracking.createdAt))
        .limit(limit);

      return results.map(result => {
        const extractedData = result.extractedData as any;
        const brand = extractedData?.brand || 'Bilinmeyen Marka';
        
        return {
          ...result,
          brand
        };
      });
      
    } catch (error) {
      console.error('❌ Son URLler getirme hatası:', error);
      return [];
    }
  }

  // URL'nin var olup olmadığını kontrol et
  async isUrlSaved(url: string): Promise<boolean> {
    try {
      const [existing] = await db
        .select({ id: urlTracking.id })
        .from(urlTracking)
        .where(eq(urlTracking.url, url))
        .limit(1);

      return !!existing;
    } catch (error) {
      console.error('❌ URL kontrol hatası:', error);
      return false;
    }
  }

  // Relevance hesaplama
  private calculateRelevance(query: string, title: string, url: string, brand: string): number {
    const queryLower = query.toLowerCase();
    const titleLower = title?.toLowerCase() || '';
    const urlLower = url?.toLowerCase() || '';
    const brandLower = brand?.toLowerCase() || '';
    
    let score = 0;
    
    // Başlıkta tam eşleşme
    if (titleLower.includes(queryLower)) {
      score += 10;
    }
    
    // Marka eşleşmesi
    if (brandLower.includes(queryLower)) {
      score += 8;
    }
    
    // URL eşleşmesi
    if (urlLower.includes(queryLower)) {
      score += 5;
    }
    
    // Kelime bazlı eşleşme
    const queryWords = queryLower.split(' ');
    queryWords.forEach(word => {
      if (word.length > 2) {
        if (titleLower.includes(word)) score += 3;
        if (brandLower.includes(word)) score += 2;
      }
    });
    
    return score;
  }

  // URL'yi sil
  async deleteUrl(url: string): Promise<boolean> {
    try {
      await db
        .delete(urlTracking)
        .where(eq(urlTracking.url, url));
      
      console.log(`🗑️ URL silindi: ${url}`);
      return true;
    } catch (error) {
      console.error('❌ URL silme hatası:', error);
      return false;
    }
  }

  // İstatistikler
  async getUrlStats(): Promise<any> {
    try {
      const allUrls = await db.select().from(urlTracking);
      
      const stats = {
        totalUrls: allUrls.length,
        activeTracking: allUrls.filter(u => u.isTracking).length,
        priceChangeCount: allUrls.filter(u => u.lastPriceChange).length,
        averagePrice: allUrls.length > 0 
          ? allUrls.reduce((sum, u) => sum + parseFloat(u.currentPrice || '0'), 0) / allUrls.length 
          : 0,
        recentUrls: allUrls.filter(u => {
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          return u.createdAt && u.createdAt > dayAgo;
        }).length
      };
      
      return stats;
    } catch (error) {
      console.error('❌ İstatistik hesaplama hatası:', error);
      return {
        totalUrls: 0,
        activeTracking: 0,
        priceChangeCount: 0,
        averagePrice: 0,
        recentUrls: 0
      };
    }
  }
}

export const savedUrlsManager = new SavedUrlsManager();