import { memorySystem } from './memory-system';
import { shopifyIntegration } from './shopify-integration';
import { telegramIntegration } from './telegram-integration';
import { scrapeProductData } from './enhanced-scraper-integration';

export class MonitoringService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private checkInterval: number = 60000) {} // Default 1 minute

  // Monitoring service başlat
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Monitoring service zaten çalışıyor');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkProducts();
    }, this.checkInterval);

    console.log(`🔄 Monitoring service başlatıldı (${this.checkInterval/1000}s aralıklarla)`);
  }

  // Monitoring service durdur
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ Monitoring service durduruldu');
  }

  // İzlenmesi gereken ürünleri kontrol et
  private async checkProducts(): Promise<void> {
    try {
      const productsToCheck = await memorySystem.getProductsToMonitor();
      
      if (productsToCheck.length === 0) {
        return;
      }

      console.log(`🔍 ${productsToCheck.length} ürün kontrol ediliyor...`);

      for (const product of productsToCheck) {
        await this.checkSingleProduct(product);
        
        // Rate limiting için kısa bekleme
        await this.sleep(2000);
      }

    } catch (error) {
      console.error('❌ Monitoring kontrol hatası:', error);
    }
  }

  // Tekil ürün kontrolü
  private async checkSingleProduct(product: any): Promise<void> {
    try {
      console.log(`🔍 Kontrol ediliyor: ${product.title}`);

      // Mevcut varyantları al
      const currentVariants = await memorySystem.getProductVariants(product.id);
      
      // Trendyol'dan güncel verileri çek
      const freshData = await this.scrapeProductData(product.trendyolUrl);
      
      if (!freshData) {
        await memorySystem.incrementFailureCount(product.id);
        console.log(`❌ Veri çekilemedi: ${product.title}`);
        return;
      }

      // Güncel varyantları kaydet (değişiklikleri otomatik algılar)
      const updatedVariants = await memorySystem.saveVariants(product.id, freshData.variants || []);

      // Değişiklikleri Shopify'a senkronize et
      await this.syncChangesToShopify(product, currentVariants, updatedVariants);

      // İzleme programını güncelle
      await memorySystem.updateMonitoringSchedule(product.id);

    } catch (error) {
      console.error(`❌ ${product.title} kontrol hatası:`, error);
      await memorySystem.incrementFailureCount(product.id);
    }
  }

  // Trendyol'dan ürün verilerini çek
  private async scrapeProductData(url: string): Promise<any> {
    try {
      return await scrapeProductData(url);
    } catch (error) {
      console.error('Scraping hatası:', error);
      return null;
    }
  }

  // Değişiklikleri Shopify'a senkronize et
  private async syncChangesToShopify(
    product: any, 
    oldVariants: any[], 
    newVariants: any[]
  ): Promise<void> {
    if (!product.shopifyProductId) {
      // Ürün henüz Shopify'da yoksa oluştur
      const shopifyId = await shopifyIntegration.createProduct(product, newVariants);
      if (shopifyId) {
        console.log(`✅ Shopify'da ürün oluşturuldu: ${product.title}`);
      }
      return;
    }

    // Varyant değişikliklerini kontrol et ve senkronize et
    for (let i = 0; i < newVariants.length; i++) {
      const newVariant = newVariants[i];
      const oldVariant = oldVariants.find(v => 
        v.color === newVariant.color && v.size === newVariant.size
      );

      if (!oldVariant) {
        // Yeni varyant - tam sync gerekebilir
        continue;
      }

      // Fiyat değişikliği kontrolü
      if (parseFloat(oldVariant.trendyolPrice) !== parseFloat(newVariant.trendyolPrice)) {
        const updated = await shopifyIntegration.updateProductPrice(product, newVariant);
        if (updated) {
          console.log(`💰 Shopify fiyat güncellendi: ${newVariant.color} ${newVariant.size}`);
        }
      }

      // Stok değişikliği kontrolü
      if (oldVariant.stockCount !== newVariant.stockCount) {
        const updated = await shopifyIntegration.updateProductStock(product, newVariant);
        if (updated) {
          console.log(`📦 Shopify stok güncellendi: ${newVariant.color} ${newVariant.size}`);
        }
      }

      // Stok durumu değişikliği kontrolü
      if (oldVariant.inStock !== newVariant.inStock) {
        const updated = await shopifyIntegration.updateVariantStatus(product, newVariant);
        if (updated) {
          console.log(`🔄 Shopify varyant durumu güncellendi: ${newVariant.color} ${newVariant.size}`);
        }
      }
    }
  }

  // Yeni ürün izlemeye ekle
  async addProductToMonitoring(productUrl: string): Promise<boolean> {
    try {
      // Önce ürünü scrape et ve kaydet
      const productData = await this.scrapeProductData(productUrl);
      if (!productData) {
        console.log('❌ Ürün verisi alınamadı, izlemeye eklenemedi');
        return false;
      }

      // Memory system'e kaydet
      const savedProduct = await memorySystem.saveProduct({
        url: productUrl,
        ...productData
      });

      console.log(`✅ Ürün izlemeye eklendi: ${savedProduct.title}`);
      return true;

    } catch (error) {
      console.error('Ürün izlemeye ekleme hatası:', error);
      return false;
    }
  }

  // Ürünü izlemeden çıkar
  async removeProductFromMonitoring(productId: number): Promise<boolean> {
    try {
      await memorySystem.updateMonitoringSchedule(productId, 0); // İzlemeyi durdur
      console.log(`⏹️ Ürün izlemeden çıkarıldı (ID: ${productId})`);
      return true;
    } catch (error) {
      console.error('Ürün izlemeden çıkarma hatası:', error);
      return false;
    }
  }

  // Monitoring istatistikleri
  async getMonitoringStats(): Promise<any> {
    try {
      const activeProducts = await memorySystem.getActiveProducts();
      const productsToMonitor = await memorySystem.getProductsToMonitor();
      
      return {
        totalProducts: activeProducts.length,
        monitoredProducts: productsToMonitor.length,
        isRunning: this.isRunning,
        checkInterval: this.checkInterval,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      console.error('Monitoring stats hatası:', error);
      return {
        totalProducts: 0,
        monitoredProducts: 0,
        isRunning: this.isRunning,
        checkInterval: this.checkInterval,
        lastCheck: null
      };
    }
  }

  // Utility: sleep function
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const monitoringService = new MonitoringService(300000); // 5 dakika aralıklarla