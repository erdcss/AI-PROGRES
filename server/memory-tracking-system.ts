/**
 * Hafıza Takip Sistemi - Hafızadaki ürünlerin değişikliklerini izler
 */

import { memorySystem } from './memory-system';
import { telegramIntegration } from './telegram-integration';
import { cleanScrape } from './clean-scraper';
import { EnhancedTrendyolHandler } from './enhanced-trendyol-handler';

export interface ProductChange {
  productId: number;
  url: string;
  title: string;
  brand: string;
  changeType: 'price' | 'stock' | 'variant' | 'availability' | 'new_variant';
  oldValue: any;
  newValue: any;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class MemoryTrackingSystem {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  
  /**
   * Takip sistemini başlat
   */
  start() {
    if (this.isRunning) {
      console.log('📊 Hafıza takip sistemi zaten çalışıyor');
      return;
    }
    
    this.isRunning = true;
    console.log('🔄 Hafıza takip sistemi başlatılıyor...');
    
    // Her 30 dakikada bir kontrol et
    this.intervalId = setInterval(async () => {
      await this.checkAllProducts();
    }, 30 * 60 * 1000); // 30 dakika
    
    // İlk kontrolü hemen yap
    setTimeout(() => this.checkAllProducts(), 5000);
    
    console.log('✅ Hafıza takip sistemi başlatıldı (30 dakika aralıklarla)');
  }
  
  /**
   * Takip sistemini durdur
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ Hafıza takip sistemi durduruldu');
  }
  
  /**
   * Tüm hafızadaki ürünleri kontrol et
   */
  private async checkAllProducts() {
    try {
      console.log('🔍 Hafızadaki ürünler kontrol ediliyor...');
      
      const products = await memorySystem.getActiveProducts();
      console.log(`📦 ${products.length} ürün hafızada bulundu`);
      
      if (products.length === 0) {
        return;
      }
      
      const changes: ProductChange[] = [];
      let checkedCount = 0;
      let errorCount = 0;
      
      for (const product of products) {
        try {
          const productChanges = await this.checkSingleProduct(product);
          changes.push(...productChanges);
          checkedCount++;
          
          // Her ürün arasında kısa bekleme
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`❌ Ürün kontrol hatası (${product.trendyolUrl || product.sourceUrl}):`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ Ürün kontrolü tamamlandı: ${checkedCount} başarılı, ${errorCount} hata`);
      
      if (changes.length > 0) {
        await this.reportChanges(changes);
      } else {
        console.log('📊 Herhangi bir değişiklik tespit edilmedi');
      }
      
    } catch (error) {
      console.error('❌ Hafıza takip sistem hatası:', error);
    }
  }
  
  /**
   * Tek ürünü kontrol et
   */
  private async checkSingleProduct(product: any): Promise<ProductChange[]> {
    const changes: ProductChange[] = [];
    
    try {
      console.log(`🔍 Kontrol ediliyor: ${product.title}`);
      
      // Güncel ürün bilgisini çek
      let currentData;
      const productUrl = product.trendyolUrl || product.sourceUrl;
      if (productUrl && productUrl.includes('trendyol.com')) {
        const result = await EnhancedTrendyolHandler.extractProduct(productUrl);
        if (result.success && result.data) {
          currentData = result.data;
        }
      }
      
      if (!currentData) {
        // Fallback olarak clean scraper kullan
        const cleanResult = await cleanScrape(productUrl);
        if (cleanResult.success) {
          currentData = cleanResult;
        }
      }
      
      if (!currentData) {
        console.log(`⚠️ ${product.title} için güncel veri alınamadı`);
        return changes;
      }
      
      // Fiyat değişikliği kontrolü
      if (product.price && currentData.price) {
        const oldPrice = typeof product.price === 'object' ? product.price.original : product.price;
        const newPrice = typeof currentData.price === 'object' ? currentData.price.original : currentData.price;
        
        if (oldPrice !== newPrice) {
          const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;
          changes.push({
            productId: product.id,
            url: productUrl,
            title: product.title,
            brand: product.brand,
            changeType: 'price',
            oldValue: oldPrice,
            newValue: newPrice,
            timestamp: new Date(),
            severity: Math.abs(priceChange) > 20 ? 'high' : Math.abs(priceChange) > 10 ? 'medium' : 'low'
          });
        }
      }
      
      // Stok değişikliği kontrolü
      if (product.variants && currentData.variants) {
        for (const oldVariant of product.variants) {
          const newVariant = currentData.variants.find((v: any) => 
            v.color === oldVariant.color && v.size === oldVariant.size
          );
          
          if (newVariant && oldVariant.inStock !== newVariant.inStock) {
            changes.push({
              productId: product.id,
              url: productUrl,
              title: product.title,
              brand: product.brand,
              changeType: 'stock',
              oldValue: { 
                variant: `${oldVariant.color} - ${oldVariant.size}`, 
                inStock: oldVariant.inStock 
              },
              newValue: { 
                variant: `${newVariant.color} - ${newVariant.size}`, 
                inStock: newVariant.inStock 
              },
              timestamp: new Date(),
              severity: newVariant.inStock ? 'medium' : 'high'
            });
          }
        }
        
        // Yeni varyant kontrolü
        const oldVariantKeys = product.variants.map((v: any) => `${v.color}-${v.size}`);
        const newVariantKeys = currentData.variants.map((v: any) => `${v.color}-${v.size}`);
        
        for (const newKey of newVariantKeys) {
          if (!oldVariantKeys.includes(newKey)) {
            const [color, size] = newKey.split('-');
            changes.push({
              productId: product.id,
              url: productUrl,
              title: product.title,
              brand: product.brand,
              changeType: 'new_variant',
              oldValue: null,
              newValue: { color, size },
              timestamp: new Date(),
              severity: 'medium'
            });
          }
        }
      }
      
      // Ürün bilgilerini hafızada güncelle
      if (changes.length > 0) {
        await memorySystem.updateProduct(product.id, {
          price: currentData.price,
          variants: currentData.variants,
          lastChecked: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error(`❌ Ürün kontrol hatası: ${product.title}`, error);
    }
    
    return changes;
  }
  
  /**
   * Değişiklikleri Telegram'a rapor et
   */
  private async reportChanges(changes: ProductChange[]) {
    try {
      const highPriorityChanges = changes.filter(c => c.severity === 'high' || c.severity === 'critical');
      const mediumPriorityChanges = changes.filter(c => c.severity === 'medium');
      const lowPriorityChanges = changes.filter(c => c.severity === 'low');
      
      // Yüksek öncelikli değişiklikler için anında bildirim
      if (highPriorityChanges.length > 0) {
        for (const change of highPriorityChanges) {
          await this.sendChangeNotification(change);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
        }
      }
      
      // Orta ve düşük öncelikli değişiklikler için toplu bildirim
      if (mediumPriorityChanges.length > 0 || lowPriorityChanges.length > 0) {
        await this.sendBulkChangeNotification([...mediumPriorityChanges, ...lowPriorityChanges]);
      }
      
      console.log(`📱 ${changes.length} değişiklik Telegram'a raporlandı`);
      
    } catch (error) {
      console.error('❌ Telegram rapor hatası:', error);
    }
  }
  
  /**
   * Tek değişiklik bildirimi gönder
   */
  private async sendChangeNotification(change: ProductChange) {
    let icon = '📊';
    let title = 'ÜRÜN DEĞİŞİKLİĞİ';
    
    switch (change.changeType) {
      case 'price':
        icon = '💰';
        title = 'FİYAT DEĞİŞİKLİĞİ';
        break;
      case 'stock':
        icon = change.newValue.inStock ? '✅' : '❌';
        title = change.newValue.inStock ? 'STOKA GİRDİ' : 'STOKTAN ÇIKTI';
        break;
      case 'new_variant':
        icon = '🆕';
        title = 'YENİ VARYANT';
        break;
      case 'availability':
        icon = '🚨';
        title = 'SATIŞ DURUMU';
        break;
    }
    
    let message = `${icon} <b>${title}</b>\n\n`;
    message += `📦 <b>Ürün:</b> ${change.title}\n`;
    message += `🏢 <b>Marka:</b> ${change.brand}\n`;
    message += `🕐 <b>Zaman:</b> ${change.timestamp.toLocaleString('tr-TR')}\n\n`;
    
    switch (change.changeType) {
      case 'price':
        const priceChange = ((change.newValue - change.oldValue) / change.oldValue) * 100;
        message += `💰 <b>Eski Fiyat:</b> ${change.oldValue.toFixed(2)} TL\n`;
        message += `💵 <b>Yeni Fiyat:</b> ${change.newValue.toFixed(2)} TL\n`;
        message += `📈 <b>Değişim:</b> ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%\n`;
        break;
        
      case 'stock':
        message += `🎨 <b>Varyant:</b> ${change.newValue.variant}\n`;
        message += `📦 <b>Durum:</b> ${change.oldValue.inStock ? 'Stokta' : 'Stok Yok'} → ${change.newValue.inStock ? 'Stokta' : 'Stok Yok'}\n`;
        break;
        
      case 'new_variant':
        message += `🎨 <b>Yeni Varyant:</b> ${change.newValue.color} - ${change.newValue.size}\n`;
        break;
    }
    
    message += `\n🔗 <b>URL:</b> ${change.url}`;
    
    await telegramIntegration.sendNotification(message);
  }
  
  /**
   * Toplu değişiklik bildirimi gönder
   */
  private async sendBulkChangeNotification(changes: ProductChange[]) {
    if (changes.length === 0) return;
    
    let message = `📊 <b>TOPLU ÜRÜN DEĞİŞİKLİKLERİ</b>\n\n`;
    message += `🕐 <b>Kontrol Zamanı:</b> ${new Date().toLocaleString('tr-TR')}\n`;
    message += `📈 <b>Toplam Değişiklik:</b> ${changes.length} adet\n\n`;
    
    const groupedChanges = changes.reduce((groups, change) => {
      const key = `${change.title} (${change.brand})`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(change);
      return groups;
    }, {} as Record<string, ProductChange[]>);
    
    for (const [productKey, productChanges] of Object.entries(groupedChanges)) {
      message += `📦 <b>${productKey}</b>\n`;
      
      for (const change of productChanges) {
        switch (change.changeType) {
          case 'price':
            const priceChange = ((change.newValue - change.oldValue) / change.oldValue) * 100;
            message += `  💰 Fiyat: ${change.oldValue.toFixed(2)} → ${change.newValue.toFixed(2)} TL (${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%)\n`;
            break;
          case 'stock':
            message += `  📦 ${change.newValue.variant}: ${change.oldValue.inStock ? 'Stokta' : 'Stok Yok'} → ${change.newValue.inStock ? 'Stokta' : 'Stok Yok'}\n`;
            break;
          case 'new_variant':
            message += `  🆕 Yeni varyant: ${change.newValue.color} - ${change.newValue.size}\n`;
            break;
        }
      }
      message += '\n';
    }
    
    await telegramIntegration.sendNotification(message);
  }
  
  /**
   * Manuel kontrol tetikle
   */
  async triggerManualCheck() {
    console.log('🔄 Manuel hafıza kontrolü tetikleniyor...');
    await this.checkAllProducts();
  }
  
  /**
   * Sistemin durumunu getir
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMinutes: 30,
      lastCheck: new Date().toISOString()
    };
  }
}

export const memoryTrackingSystem = new MemoryTrackingSystem();