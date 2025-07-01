import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from './db';
import {
  products,
  productVariants,
  priceHistory,
  stockHistory,
  monitoringSchedules,
  type Product,
  type ProductVariant,
  type InsertProduct,
  type InsertProductVariant,
  type InsertPriceHistory,
  type InsertStockHistory,
  type InsertMonitoringSchedule
} from '@shared/schema';

export class MemorySystem {
  
  // Ürün kaydetme/güncelleme
  async saveProduct(productData: any): Promise<Product> {
    const trendyolProductId = this.extractProductId(productData.url || '');
    
    // Mevcut ürünü kontrol et
    const existingProduct = await db.select()
      .from(products)
      .where(eq(products.trendyolUrl, productData.url))
      .limit(1);

    let product: Product;
    
    if (existingProduct.length > 0) {
      // Güncelle
      const [updatedProduct] = await db.update(products)
        .set({
          title: productData.title,
          brand: productData.brand,
          description: productData.description,
          images: productData.images || [],
          features: productData.features || {},
          colorOptions: productData.colorOptions || [],
          sizeOptions: productData.sizeOptions || [],
          updatedAt: new Date()
        })
        .where(eq(products.id, existingProduct[0].id))
        .returning();
      
      product = updatedProduct;
      console.log(`📦 Ürün güncellendi: ${product.title}`);
    } else {
      // Yeni kayıt
      const insertData: InsertProduct = {
        trendyolUrl: productData.url,
        trendyolProductId,
        title: productData.title,
        brand: productData.brand,
        description: productData.description,
        category: productData.category || 'Genel',
        images: productData.images || [],
        features: productData.features || {},
        colorOptions: productData.colorOptions || [],
        sizeOptions: productData.sizeOptions || []
      };

      const [newProduct] = await db.insert(products)
        .values(insertData)
        .returning();
      
      product = newProduct;
      console.log(`✨ Yeni ürün kaydedildi: ${product.title}`);
    }

    // Varyantları kaydet
    if (productData.variants && Array.isArray(productData.variants)) {
      await this.saveVariants(product.id, productData.variants);
    }

    // İzleme programı oluştur
    await this.createMonitoringSchedule(product.id);

    return product;
  }

  // Varyant kaydetme/güncelleme
  async saveVariants(productId: number, variants: any[]): Promise<ProductVariant[]> {
    const savedVariants: ProductVariant[] = [];
    
    for (const variantData of variants) {
      const color = variantData.color || 'Varsayılan';
      const size = variantData.size || 'Tek Beden';
      const trendyolPrice = variantData.price || 0;
      const shopifyPrice = trendyolPrice * 1.15; // %15 kar marjı
      
      // Mevcut varyantı kontrol et
      const existingVariant = await db.select()
        .from(productVariants)
        .where(and(
          eq(productVariants.productId, productId),
          eq(productVariants.color, color),
          eq(productVariants.size, size)
        ))
        .limit(1);

      let variant: ProductVariant;
      
      if (existingVariant.length > 0) {
        // Fiyat ve stok değişikliklerini kontrol et
        const oldVariant = existingVariant[0];
        const priceChanged = parseFloat(oldVariant.trendyolPrice) !== trendyolPrice;
        const stockChanged = oldVariant.stockCount !== (variantData.stockCount || 0);
        
        // Güncelle
        const [updatedVariant] = await db.update(productVariants)
          .set({
            trendyolPrice: trendyolPrice.toFixed(2),
            shopifyPrice: shopifyPrice.toFixed(2),
            stockCount: variantData.stockCount || 0,
            inStock: variantData.inStock !== false,
            updatedAt: new Date()
          })
          .where(eq(productVariants.id, oldVariant.id))
          .returning();
        
        variant = updatedVariant;
        
        // Değişiklikleri kaydet
        if (priceChanged) {
          await this.recordPriceChange(variant.id, parseFloat(oldVariant.trendyolPrice), trendyolPrice);
        }
        if (stockChanged) {
          await this.recordStockChange(variant.id, oldVariant.stockCount, variantData.stockCount || 0);
        }
        
      } else {
        // Yeni varyant
        const insertData: InsertProductVariant = {
          productId,
          color,
          size,
          sku: `${productId}-${color}-${size}`.replace(/\s+/g, '-').toLowerCase(),
          trendyolPrice: trendyolPrice.toFixed(2),
          shopifyPrice: shopifyPrice.toFixed(2),
          stockCount: variantData.stockCount || 0,
          inStock: variantData.inStock !== false
        };

        const [newVariant] = await db.insert(productVariants)
          .values(insertData)
          .returning();
        
        variant = newVariant;
        
        // İlk kayıt için geçmiş oluştur
        await this.recordPriceChange(variant.id, null, trendyolPrice, 'initial');
        await this.recordStockChange(variant.id, null, variantData.stockCount || 0, 'initial');
      }
      
      savedVariants.push(variant);
    }
    
    console.log(`💾 ${savedVariants.length} varyant kaydedildi/güncellendi`);
    return savedVariants;
  }

  // Fiyat değişikliği kaydetme
  async recordPriceChange(variantId: number, oldPrice: number | null, newPrice: number, changeType?: string): Promise<void> {
    let type = changeType || 'initial';
    let changeAmount = 0;
    let changePercentage = 0;
    
    if (oldPrice !== null && oldPrice !== newPrice) {
      changeAmount = newPrice - oldPrice;
      changePercentage = oldPrice > 0 ? (changeAmount / oldPrice) * 100 : 0;
      type = changeAmount > 0 ? 'increase' : 'decrease';
    }
    
    const historyData: InsertPriceHistory = {
      variantId,
      oldPrice: oldPrice?.toFixed(2) || null,
      newPrice: newPrice.toFixed(2),
      changeType: type,
      changeAmount: changeAmount.toFixed(2),
      changePercentage: changePercentage.toFixed(2)
    };
    
    await db.insert(priceHistory).values(historyData);
    
    if (type !== 'initial') {
      console.log(`💰 Fiyat değişikliği: ${oldPrice} → ${newPrice} TL (${changeAmount > 0 ? '+' : ''}${changeAmount.toFixed(2)} TL)`);
    }
  }

  // Stok değişikliği kaydetme
  async recordStockChange(variantId: number, oldStock: number | null, newStock: number, changeType?: string): Promise<void> {
    let type = changeType || 'initial';
    let changeAmount = 0;
    
    if (oldStock !== null && oldStock !== newStock) {
      changeAmount = newStock - oldStock;
      
      if (oldStock > 0 && newStock === 0) {
        type = 'out_of_stock';
      } else if (oldStock === 0 && newStock > 0) {
        type = 'back_in_stock';
      } else {
        type = changeAmount > 0 ? 'increase' : 'decrease';
      }
    }
    
    const historyData: InsertStockHistory = {
      variantId,
      oldStock,
      newStock,
      changeType: type,
      changeAmount
    };
    
    await db.insert(stockHistory).values(historyData);
    
    if (type !== 'initial') {
      console.log(`📦 Stok değişikliği: ${oldStock} → ${newStock} (${type})`);
    }
  }

  // İzleme programı oluşturma
  async createMonitoringSchedule(productId: number): Promise<void> {
    const existing = await db.select()
      .from(monitoringSchedules)
      .where(eq(monitoringSchedules.productId, productId))
      .limit(1);
    
    if (existing.length === 0) {
      const scheduleData: InsertMonitoringSchedule = {
        productId,
        checkInterval: 300, // 5 dakika
        nextCheckAt: new Date(Date.now() + 300000) // 5 dakika sonra
      };
      
      await db.insert(monitoringSchedules).values(scheduleData);
      console.log(`⏰ İzleme programı oluşturuldu (Product ID: ${productId})`);
    }
  }

  // Ürün bilgilerini getirme
  async getProduct(productId: number): Promise<Product | null> {
    const result = await db.select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    
    return result[0] || null;
  }

  // Ürün varyantlarını getirme
  async getProductVariants(productId: number): Promise<ProductVariant[]> {
    return await db.select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));
  }

  // Tüm aktif ürünleri getirme
  async getActiveProducts(): Promise<Product[]> {
    return await db.select()
      .from(products)
      .where(eq(products.isActive, true));
  }

  // İzlenmesi gereken ürünleri getirme
  async getProductsToMonitor(): Promise<Product[]> {
    const now = new Date();
    
    const result = await db.select({
      id: products.id,
      trendyolUrl: products.trendyolUrl,
      trendyolProductId: products.trendyolProductId,
      shopifyProductId: products.shopifyProductId,
      title: products.title,
      brand: products.brand,
      description: products.description,
      category: products.category,
      images: products.images,
      features: products.features,
      colorOptions: products.colorOptions,
      sizeOptions: products.sizeOptions,
      isActive: products.isActive,
      profitMargin: products.profitMargin,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      lastSyncAt: products.lastSyncAt,
      syncStatus: products.syncStatus
    })
    .from(products)
    .leftJoin(monitoringSchedules, eq(products.id, monitoringSchedules.productId))
    .where(and(
      eq(products.isActive, true),
      eq(monitoringSchedules.isActive, true),
      sql`${monitoringSchedules.nextCheckAt} <= ${now}`
    ));
    
    return result;
  }

  // Fiyat geçmişini getirme
  async getPriceHistory(variantId: number, limit: number = 10): Promise<any[]> {
    return await db.select()
      .from(priceHistory)
      .where(eq(priceHistory.variantId, variantId))
      .orderBy(desc(priceHistory.createdAt))
      .limit(limit);
  }

  // Stok geçmişini getirme
  async getStockHistory(variantId: number, limit: number = 10): Promise<any[]> {
    return await db.select()
      .from(stockHistory)
      .where(eq(stockHistory.variantId, variantId))
      .orderBy(desc(stockHistory.createdAt))
      .limit(limit);
  }

  // URL'den product ID çıkarma
  private extractProductId(url: string): string {
    const matches = url.match(/p-(\d+)/);
    return matches ? matches[1] : '';
  }

  // İzleme programını güncelleme
  async updateMonitoringSchedule(productId: number, nextCheckInterval: number = 300): Promise<void> {
    const nextCheckAt = new Date(Date.now() + nextCheckInterval * 1000);
    
    await db.update(monitoringSchedules)
      .set({
        lastCheckAt: new Date(),
        nextCheckAt,
        consecutiveFailures: 0,
        updatedAt: new Date()
      })
      .where(eq(monitoringSchedules.productId, productId));
  }

  // Başarısız kontrol sayısını artırma
  async incrementFailureCount(productId: number): Promise<void> {
    await db.update(monitoringSchedules)
      .set({
        consecutiveFailures: sql`${monitoringSchedules.consecutiveFailures} + 1`,
        lastCheckAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(monitoringSchedules.productId, productId));
  }
}

export const memorySystem = new MemorySystem();