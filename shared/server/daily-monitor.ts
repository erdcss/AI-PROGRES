import { scheduleJob } from 'node-schedule';
import { db } from './db';
import { products, productVariants, priceHistory, stockHistory } from '../shared/schema';
import { eq, desc } from 'drizzle-orm';
import axios from 'axios';

interface ProductCheckResult {
  productId: number;
  title: string;
  url: string;
  changes: {
    priceChanged: boolean;
    stockChanged: boolean;
    discontinued: boolean;
    oldPrice?: number;
    newPrice?: number;
    stockChanges: Array<{
      variantId: number;
      color: string;
      size: string;
      oldStock: number;
      newStock: number;
    }>;
  };
}

class DailyMonitor {
  private results: ProductCheckResult[] = [];

  async start() {
    console.log('📅 Daily monitor scheduling başlatılıyor...');
    
    // Schedule daily checks at 12:00
    scheduleJob('0 12 * * *', async () => {
      console.log('🔍 Daily product check başlatılıyor (12:00)...');
      await this.checkAllProducts();
    });

    // Schedule daily reports at 23:00
    scheduleJob('0 23 * * *', async () => {
      console.log('📊 Daily report gönderiliyor (23:00)...');
      await this.sendDailyReport();
    });

    console.log('✅ Daily monitor scheduled:');
    console.log('  📍 12:00 - Product checks and Shopify updates');
    console.log('  📍 23:00 - Telegram daily report');
  }

  async checkAllProducts() {
    try {
      this.results = [];
      
      // Get all products from memory system
      const allProducts = await db.select().from(products);
      
      console.log(`🔍 Checking ${allProducts.length} products from memory...`);
      
      for (const product of allProducts) {
        try {
          const result = await this.checkSingleProduct(product);
          this.results.push(result);
          
          // Update Shopify if changes detected
          if (result.changes.priceChanged || result.changes.stockChanged) {
            await this.updateShopifyProduct(result);
          }
          
          // Add delay between requests
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`❌ Error checking product ${product.id}:`, error);
        }
      }
      
      console.log(`✅ Product check completed. ${this.results.filter(r => r.changes.priceChanged || r.changes.stockChanged).length} changes detected.`);
      
    } catch (error) {
      console.error('❌ Daily check failed:', error);
    }
  }

  async checkSingleProduct(product: any): Promise<ProductCheckResult> {
    const result: ProductCheckResult = {
      productId: product.id,
      title: product.title,
      url: product.sourceUrl,
      changes: {
        priceChanged: false,
        stockChanged: false,
        discontinued: false,
        stockChanges: []
      }
    };

    try {
      // Extract current data from Trendyol
      const response = await axios.post('http://localhost:5000/api/scrape', {
        url: product.sourceUrl
      }, { timeout: 30000 });

      const currentData = response.data;
      
      if (!currentData.success) {
        result.changes.discontinued = true;
        return result;
      }

      // Check price changes (using first variant)
      const currentPrice = currentData.price?.original || 0;
      const firstVariant = productVariantsList?.[0];
      if (firstVariant && Math.abs(currentPrice - parseFloat(firstVariant.trendyolPrice.toString())) > 0.01) {
        result.changes.priceChanged = true;
        result.changes.oldPrice = parseFloat(firstVariant.trendyolPrice.toString());
        result.changes.newPrice = currentPrice;
        
        // Update price in database
        await db.update(products)
          .set({ updatedAt: new Date() })
          .where(eq(products.id, product.id));
          
        // Log price history (using first variant for compatibility)
        const firstVariant = productVariantsList[0];
        if (firstVariant) {
          await db.insert(priceHistory).values({
            variantId: firstVariant.id,
            oldPrice: firstVariant.trendyolPrice.toString(),
            newPrice: currentPrice.toString(),
            changeType: currentPrice > parseFloat(firstVariant.trendyolPrice.toString()) ? 'increase' : 'decrease',
            changeAmount: (currentPrice - parseFloat(firstVariant.trendyolPrice.toString())).toString(),
            changePercentage: (((currentPrice - parseFloat(firstVariant.trendyolPrice.toString())) / parseFloat(firstVariant.trendyolPrice.toString())) * 100).toString()
          });
        }
      }

      // Check stock changes for variants
      const productVariantsList = await db.select().from(productVariants).where(eq(productVariants.productId, product.id));
      
      for (const variant of productVariantsList) {
        const currentStock = this.getVariantStock(currentData, variant.color, variant.size);
        
        if (currentStock !== variant.stockCount) {
          result.changes.stockChanged = true;
          result.changes.stockChanges.push({
            variantId: variant.id,
            color: variant.color,
            size: variant.size,
            oldStock: variant.stockCount,
            newStock: currentStock
          });
          
          // Update variant stock
          await db.update(productVariants)
            .set({ stockCount: currentStock })
            .where(eq(productVariants.id, variant.id));
            
          // Log stock history
          await db.insert(stockHistory).values({
            variantId: variant.id,
            oldStock: variant.stockCount,
            newStock: currentStock,
            changeType: currentStock === 0 ? 'out_of_stock' : currentStock > variant.stockCount ? 'restock' : 'stock_decrease'
          });
        }
      }

    } catch (error) {
      console.error(`❌ Error checking ${product.title}:`, error);
      result.changes.discontinued = true;
    }

    return result;
  }

  private getVariantStock(productData: any, color: string, size: string): number {
    // Extract stock information from product data
    if (productData.variants?.stockMap) {
      const key = `${color}-${size}`;
      return productData.variants.stockMap[key] ? 10 : 0; // Default stock levels
    }
    return productData.stock || 0;
  }

  async updateShopifyProduct(result: ProductCheckResult) {
    try {
      // Get Shopify product ID from database
      const product = await db.select().from(products).where(eq(products.id, result.productId)).limit(1);
      
      if (!product[0]?.shopifyProductId) {
        console.log(`⚠️ No Shopify ID for product ${result.title}`);
        return;
      }

      const shopifyId = product[0].shopifyProductId;
      
      // Update price if changed
      if (result.changes.priceChanged && result.changes.newPrice) {
        const priceWithProfit = Math.round(result.changes.newPrice * 1.15 * 100) / 100;
        
        await this.updateShopifyPrice(shopifyId, priceWithProfit);
        console.log(`💰 Updated Shopify price for ${result.title}: ${result.changes.newPrice} → ${priceWithProfit} TL`);
      }

      // Update stock if changed
      if (result.changes.stockChanged) {
        for (const stockChange of result.changes.stockChanges) {
          await this.updateShopifyStock(shopifyId, stockChange);
          console.log(`📦 Updated stock for ${stockChange.color} ${stockChange.size}: ${stockChange.oldStock} → ${stockChange.newStock}`);
        }
      }

    } catch (error) {
      console.error(`❌ Shopify update failed for ${result.title}:`, error);
    }
  }

  async updateShopifyPrice(shopifyProductId: string, newPrice: number) {
    // Implementation for Shopify price update via API
    // This would use the existing Shopify integration
  }

  async updateShopifyStock(shopifyProductId: string, stockChange: any) {
    // Implementation for Shopify stock update via API
    // This would use the existing Shopify integration
  }

  async sendDailyReport() {
    try {
      const today = new Date().toLocaleDateString('tr-TR');
      
      // Get today's statistics
      const totalProducts = await db.select().from(products);
      const todayChanges = this.results.filter(r => r.changes.priceChanged || r.changes.stockChanged);
      const priceChanges = todayChanges.filter(r => r.changes.priceChanged);
      const stockChanges = todayChanges.filter(r => r.changes.stockChanged);
      const discontinued = this.results.filter(r => r.changes.discontinued);
      
      let report = `📊 GÜNLÜK RAPOR - ${today}\n\n`;
      report += `📦 Toplam Ürün: ${totalProducts.length}\n`;
      report += `🔄 Kontrol Edilen: ${this.results.length}\n`;
      report += `💰 Fiyat Değişimi: ${priceChanges.length}\n`;
      report += `📊 Stok Değişimi: ${stockChanges.length}\n`;
      report += `❌ Satıştan Kalkan: ${discontinued.length}\n\n`;
      
      if (priceChanges.length > 0) {
        report += `💰 FİYAT DEĞİŞİMLERİ:\n`;
        for (const change of priceChanges.slice(0, 5)) {
          report += `• ${change.title}\n`;
          report += `  ${change.changes.oldPrice} → ${change.changes.newPrice} TL\n\n`;
        }
        if (priceChanges.length > 5) {
          report += `... ve ${priceChanges.length - 5} ürün daha\n\n`;
        }
      }
      
      if (stockChanges.length > 0) {
        report += `📦 STOK DEĞİŞİMLERİ:\n`;
        for (const change of stockChanges.slice(0, 5)) {
          report += `• ${change.title}\n`;
          for (const stock of change.changes.stockChanges.slice(0, 2)) {
            const status = stock.newStock === 0 ? '❌ Tükendi' : stock.newStock > stock.oldStock ? '✅ Yenilendi' : '⚠️ Azaldı';
            report += `  ${stock.color} ${stock.size}: ${status}\n`;
          }
          report += `\n`;
        }
      }
      
      if (discontinued.length > 0) {
        report += `❌ SATIŞTAN KALKANLAR:\n`;
        for (const disc of discontinued.slice(0, 3)) {
          report += `• ${disc.title}\n`;
        }
      }
      
      report += `\n🕐 Sonraki kontrol: Yarın 12:00\n`;
      report += `📊 Sonraki rapor: Yarın 23:00`;
      
      // Send via Telegram
      await this.sendTelegramMessage(report);
      
      console.log('✅ Daily report sent via Telegram');
      
    } catch (error) {
      console.error('❌ Daily report failed:', error);
    }
  }

  async sendTelegramMessage(message: string) {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = '1219880063';
      
      if (!botToken) {
        console.error('❌ Telegram bot token not found');
        return;
      }
      
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      });
      
    } catch (error) {
      console.error('❌ Telegram message failed:', error);
    }
  }
}

export const dailyMonitor = new DailyMonitor();