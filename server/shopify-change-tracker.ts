import { db } from './db';
import { shopifyMemoryProducts } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { webSocketService } from './websocket-service';
import { filteredNotifier } from './filtered-telegram-notifier';

interface ProductChange {
  productId: string;
  title: string;
  changeType: 'price' | 'stock' | 'status' | 'content';
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

class ShopifyChangeTracker {
  private productCache: Map<string, any> = new Map();

  async trackProduct(shopifyProductId: string, currentData: any) {
    const cached = this.productCache.get(shopifyProductId);
    const changes: ProductChange[] = [];

    if (!cached) {
      // İlk kez eklenen ürün
      this.productCache.set(shopifyProductId, currentData);
      console.log(`📦 New product tracked: ${currentData.title}`);
      
      // WebSocket bildirimi
      webSocketService.broadcast('shopify:new-product', {
        type: 'new_product',
        product: {
          id: shopifyProductId,
          title: currentData.title,
          price: currentData.price,
          status: currentData.status
        }
      });

      return changes;
    }

    // Fiyat değişimi kontrolü
    if (cached.price !== currentData.price) {
      const change: ProductChange = {
        productId: shopifyProductId,
        title: currentData.title,
        changeType: 'price',
        oldValue: cached.price,
        newValue: currentData.price,
        timestamp: new Date()
      };
      changes.push(change);

      const priceChange = parseFloat(currentData.price) - parseFloat(cached.price);
      const priceChangePercent = parseFloat(((priceChange / parseFloat(cached.price)) * 100).toFixed(2));

      console.log(`💰 Price change detected: ${currentData.title}`);
      console.log(`   Old: ${cached.price} TL → New: ${currentData.price} TL (${priceChangePercent > 0 ? '+' : ''}${priceChangePercent}%)`);

      // WebSocket bildirimi
      webSocketService.broadcast('shopify:price-change', {
        type: 'price_change',
        productId: shopifyProductId,
        title: currentData.title,
        oldPrice: cached.price,
        newPrice: currentData.price,
        change: priceChange,
        changePercent: priceChangePercent
      });

      // Telegram bildirimi - SADECE gerçek fiyat değişimi için
      await this.sendTelegramNotification('price', {
        title: currentData.title,
        oldPrice: cached.price,
        newPrice: currentData.price,
        change: priceChange,
        changePercent: priceChangePercent,
        shopifyUrl: `https://${(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '')}/admin/products/${shopifyProductId}`
      });
    }

    // Stok değişimi kontrolü
    if (cached.inventoryQuantity !== currentData.inventoryQuantity) {
      const change: ProductChange = {
        productId: shopifyProductId,
        title: currentData.title,
        changeType: 'stock',
        oldValue: cached.inventoryQuantity,
        newValue: currentData.inventoryQuantity,
        timestamp: new Date()
      };
      changes.push(change);

      const stockChange = currentData.inventoryQuantity - cached.inventoryQuantity;

      console.log(`📦 Stock change detected: ${currentData.title}`);
      console.log(`   Old: ${cached.inventoryQuantity} → New: ${currentData.inventoryQuantity} (${stockChange > 0 ? '+' : ''}${stockChange})`);

      // WebSocket bildirimi
      webSocketService.broadcast('shopify:stock-change', {
        type: 'stock_change',
        productId: shopifyProductId,
        title: currentData.title,
        oldStock: cached.inventoryQuantity,
        newStock: currentData.inventoryQuantity,
        change: stockChange
      });

      // Telegram bildirimi - SADECE önemli stok değişimleri için
      if (Math.abs(stockChange) >= 5 || currentData.inventoryQuantity === 0 || cached.inventoryQuantity === 0) {
        await this.sendTelegramNotification('stock', {
          title: currentData.title,
          oldStock: cached.inventoryQuantity,
          newStock: currentData.inventoryQuantity,
          change: stockChange,
          shopifyUrl: `https://${(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '')}/admin/products/${shopifyProductId}`
        });
      }
    }

    // Durum değişimi kontrolü
    if (cached.status !== currentData.status) {
      const change: ProductChange = {
        productId: shopifyProductId,
        title: currentData.title,
        changeType: 'status',
        oldValue: cached.status,
        newValue: currentData.status,
        timestamp: new Date()
      };
      changes.push(change);

      console.log(`🔄 Status change detected: ${currentData.title}`);
      console.log(`   Old: ${cached.status} → New: ${currentData.status}`);

      // WebSocket bildirimi
      webSocketService.broadcast('shopify:status-change', {
        productId: shopifyProductId,
        title: currentData.title,
        oldStatus: cached.status,
        newStatus: currentData.status
      });

      // Telegram bildirimi
      await this.sendTelegramNotification('status', {
        title: currentData.title,
        oldStatus: cached.status,
        newStatus: currentData.status,
        shopifyUrl: `https://${(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '')}/admin/products/${shopifyProductId}`
      });
    }

    // Cache'i güncelle
    if (changes.length > 0) {
      this.productCache.set(shopifyProductId, currentData);
    }

    return changes;
  }

  private async sendTelegramNotification(type: 'price' | 'stock' | 'status', data: any) {
    try {
      let message = '';
      
      switch (type) {
        case 'price':
          const emoji = parseFloat(data.change) > 0 ? '📈' : '📉';
          message = `${emoji} *FİYAT DEĞİŞİMİ*\n\n` +
            `📦 *Ürün:* ${data.title}\n\n` +
            `💰 *Eski Fiyat:* ${data.oldPrice} TL\n` +
            `💰 *Yeni Fiyat:* ${data.newPrice} TL\n` +
            `📊 *Değişim:* ${data.change > 0 ? '+' : ''}${data.change.toFixed(2)} TL (${data.changePercent}%)\n\n` +
            `🔗 [Shopify'da Görüntüle](${data.shopifyUrl})`;
          break;

        case 'stock':
          const stockEmoji = data.newStock === 0 ? '🚫' : (data.change > 0 ? '📦' : '⚠️');
          message = `${stockEmoji} *STOK DEĞİŞİMİ*\n\n` +
            `📦 *Ürün:* ${data.title}\n\n` +
            `📊 *Eski Stok:* ${data.oldStock}\n` +
            `📊 *Yeni Stok:* ${data.newStock}\n` +
            `📈 *Değişim:* ${data.change > 0 ? '+' : ''}${data.change}\n\n` +
            `🔗 [Shopify'da Görüntüle](${data.shopifyUrl})`;
          break;

        case 'status':
          message = `🔄 *DURUM DEĞİŞİMİ*\n\n` +
            `📦 *Ürün:* ${data.title}\n\n` +
            `📊 *Eski Durum:* ${data.oldStatus}\n` +
            `📊 *Yeni Durum:* ${data.newStatus}\n\n` +
            `🔗 [Shopify'da Görüntüle](${data.shopifyUrl})`;
          break;
      }

      if (message) {
        await filteredNotifier.sendNotification(message);
        console.log(`📱 Telegram notification sent: ${type} change for ${data.title}`);
      }
    } catch (error) {
      console.error('❌ Telegram notification error:', error);
    }
  }

  async initializeCache() {
    try {
      const products = await db.select().from(shopifyMemoryProducts);
      
      for (const product of products) {
        this.productCache.set(product.shopifyProductId, {
          price: product.price,
          inventoryQuantity: product.inventoryQuantity,
          status: product.status,
          title: product.title
        });
      }

      console.log(`✅ Change tracker initialized with ${products.length} products`);
    } catch (error) {
      console.error('❌ Failed to initialize change tracker:', error);
    }
  }

  getCachedProduct(shopifyProductId: string) {
    return this.productCache.get(shopifyProductId);
  }

  clearCache() {
    this.productCache.clear();
    console.log('🗑️ Change tracker cache cleared');
  }
}

export const shopifyChangeTracker = new ShopifyChangeTracker();
