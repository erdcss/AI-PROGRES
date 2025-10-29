/**
 * Variant Tracking Service
 * 
 * Sorumluluklar:
 * 1. Trendyol'dan varyant bilgilerini çek (renk, beden, stok durumu)
 * 2. Database'deki mevcut varyantlarla karşılaştır
 * 3. Değişiklikleri tespit et (yeni varyant, silinen varyant, stok değişikliği)
 * 4. Stokta olmayan varyantları Shopify sync'ten filtrele
 * 5. Shopify inventory'yi akıllıca güncelle
 * 6. Değişiklikleri variantChanges tablosuna kaydet
 * 7. Telegram bildirimleri gönder
 */

import { db } from './db';
import { productVariants, variantChanges, products } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { TelegramIntegration } from './telegram-integration.js';

export interface VariantInfo {
  color: string;
  size: string;
  sku?: string;
  trendyolPrice: number;
  shopifyPrice: number;
  stockCount: number;
  inStock: boolean;
}

export interface VariantComparisonResult {
  addedVariants: VariantInfo[];
  removedVariants: Array<{ id: number; color: string; size: string }>;
  stockChanges: Array<{
    id: number;
    color: string;
    size: string;
    oldStock: number;
    newStock: number;
    oldInStock: boolean;
    newInStock: boolean;
  }>;
  unchanged: number;
}

export class VariantTrackingService {
  private telegramIntegration?: TelegramIntegration;

  constructor(telegramIntegration?: TelegramIntegration) {
    this.telegramIntegration = telegramIntegration;
  }

  /**
   * Varyantları karşılaştır ve değişiklikleri tespit et
   */
  async compareVariants(
    productId: number,
    newVariants: VariantInfo[]
  ): Promise<VariantComparisonResult> {
    console.log(`🔍 VARIANT TRACKING: Comparing variants for product ${productId}`);
    console.log(`📊 New variants from Trendyol: ${newVariants.length}`);

    // Mevcut varyantları database'den çek
    const existingVariants = await db.query.productVariants.findMany({
      where: eq(productVariants.productId, productId)
    });

    console.log(`📊 Existing variants in database: ${existingVariants.length}`);

    const result: VariantComparisonResult = {
      addedVariants: [],
      removedVariants: [],
      stockChanges: [],
      unchanged: 0
    };

    // Yeni varyantları tespit et
    for (const newVar of newVariants) {
      const existing = existingVariants.find(
        ev => ev.color === newVar.color && ev.size === newVar.size
      );

      if (!existing) {
        // Yeni varyant eklendi
        result.addedVariants.push(newVar);
        console.log(`➕ NEW VARIANT: ${newVar.color} - ${newVar.size} (${newVar.inStock ? 'In Stock' : 'OOS'})`);
      } else {
        // Mevcut varyant - stok değişikliğini kontrol et
        const oldStock = existing.stockCount;
        const newStock = newVar.stockCount;
        const oldInStock = existing.inStock;
        const newInStock = newVar.inStock;

        if (oldStock !== newStock || oldInStock !== newInStock) {
          result.stockChanges.push({
            id: existing.id,
            color: existing.color,
            size: existing.size,
            oldStock,
            newStock,
            oldInStock,
            newInStock
          });
          console.log(`🔄 STOCK CHANGE: ${existing.color} - ${existing.size}: ${oldStock} → ${newStock}, InStock: ${oldInStock} → ${newInStock}`);
        } else {
          result.unchanged++;
        }
      }
    }

    // Silinen varyantları tespit et (Trendyol'da artık yok)
    for (const existing of existingVariants) {
      const stillExists = newVariants.find(
        nv => nv.color === existing.color && nv.size === existing.size
      );

      if (!stillExists) {
        result.removedVariants.push({
          id: existing.id,
          color: existing.color,
          size: existing.size
        });
        console.log(`➖ REMOVED VARIANT: ${existing.color} - ${existing.size}`);
      }
    }

    console.log(`✅ Comparison complete: +${result.addedVariants.length} added, -${result.removedVariants.length} removed, ${result.stockChanges.length} stock changes, ${result.unchanged} unchanged`);

    return result;
  }

  /**
   * Varyant değişikliklerini database'e kaydet
   */
  async recordVariantChanges(
    productId: number,
    comparison: VariantComparisonResult
  ): Promise<void> {
    console.log(`💾 VARIANT TRACKING: Recording changes for product ${productId}`);

    // Yeni eklenen varyantlar
    for (const variant of comparison.addedVariants) {
      await db.insert(variantChanges).values({
        productId,
        changeType: 'variant_added',
        color: variant.color ?? null,
        size: variant.size ?? null,
        newStockCount: variant.stockCount ?? null,
        newInStock: variant.inStock ?? null,
        shopifySynced: false,
        telegramNotified: false,
        metadata: { price: variant.trendyolPrice }
      } as any);
    }

    // Silinen varyantlar
    for (const variant of comparison.removedVariants) {
      await db.insert(variantChanges).values({
        productId,
        variantId: variant.id ?? null,
        changeType: 'variant_removed',
        color: variant.color ?? null,
        size: variant.size ?? null,
        shopifySynced: false,
        telegramNotified: false
      } as any);
    }

    // Stok değişiklikleri
    for (const change of comparison.stockChanges) {
      let changeType: string;

      if (!change.oldInStock && change.newInStock) {
        changeType = 'variant_back_in_stock';
      } else if (change.oldInStock && !change.newInStock) {
        changeType = 'variant_oos';
      } else {
        changeType = 'variant_stock_changed';
      }

      await db.insert(variantChanges).values({
        productId,
        variantId: change.id ?? null,
        changeType,
        color: change.color ?? null,
        size: change.size ?? null,
        oldStockCount: change.oldStock ?? null,
        newStockCount: change.newStock ?? null,
        oldInStock: change.oldInStock ?? null,
        newInStock: change.newInStock ?? null,
        shopifySynced: false,
        telegramNotified: false
      } as any);
    }

    console.log(`✅ Recorded ${comparison.addedVariants.length + comparison.removedVariants.length + comparison.stockChanges.length} variant changes`);
  }

  /**
   * Database'deki varyantları güncelle
   */
  async updateVariantsInDatabase(
    productId: number,
    newVariants: VariantInfo[],
    comparison: VariantComparisonResult
  ): Promise<void> {
    console.log(`💾 VARIANT TRACKING: Updating database for product ${productId}`);

    // Yeni varyantları ekle
    for (const variant of comparison.addedVariants) {
      await db.insert(productVariants).values({
        productId,
        color: variant.color || 'Varsayılan',
        size: variant.size || 'Tek Beden',
        sku: variant.sku ?? null,
        trendyolPrice: variant.trendyolPrice.toString(),
        shopifyPrice: variant.shopifyPrice.toString(),
        stockCount: variant.stockCount ?? 0,
        inStock: variant.inStock
      } as any);
      console.log(`✅ Added variant to DB: ${variant.color} - ${variant.size}`);
    }

    // Stok değişikliklerini güncelle
    for (const change of comparison.stockChanges) {
      await db.update(productVariants)
        .set({
          stockCount: change.newStock,
          inStock: change.newInStock,
          updatedAt: new Date()
        } as any)
        .where(eq(productVariants.id, change.id));
      console.log(`✅ Updated variant stock: ${change.color} - ${change.size}`);
    }

    // Silinen varyantları kaldır (soft delete - sadece inStock = false yap)
    for (const removed of comparison.removedVariants) {
      await db.update(productVariants)
        .set({
          inStock: false,
          stockCount: 0,
          updatedAt: new Date()
        } as any)
        .where(eq(productVariants.id, removed.id));
      console.log(`✅ Marked variant as removed: ${removed.color} - ${removed.size}`);
    }

    console.log(`✅ Database update complete`);
  }

  /**
   * Stokta olmayan varyantları filtrele (Shopify'a gönderilmemeli)
   */
  filterInStockVariants(variants: VariantInfo[]): {
    available: VariantInfo[];
    outOfStock: VariantInfo[];
  } {
    const available = variants.filter(v => v.inStock && v.stockCount > 0);
    const outOfStock = variants.filter(v => !v.inStock || v.stockCount === 0);

    console.log(`✅ FILTER: ${available.length} available variants, ${outOfStock.length} out-of-stock (excluded)`);

    return { available, outOfStock };
  }

  /**
   * Telegram bildirimi gönder
   */
  async sendVariantChangeNotification(
    productId: number,
    productTitle: string,
    comparison: VariantComparisonResult
  ): Promise<void> {
    if (!this.telegramIntegration) {
      console.log('⚠️ Telegram integration not available');
      return;
    }

    const totalChanges = comparison.addedVariants.length + 
                        comparison.removedVariants.length + 
                        comparison.stockChanges.length;

    if (totalChanges === 0) {
      return; // No changes, no notification
    }

    let message = `🧩 Varyant Değişikliği Tespit Edildi\n\n`;
    message += `📦 Ürün: ${productTitle}\n`;
    message += `🆔 Product ID: ${productId}\n\n`;

    if (comparison.addedVariants.length > 0) {
      message += `✅ Yeni Varyantlar (${comparison.addedVariants.length}):\n`;
      comparison.addedVariants.forEach(v => {
        message += `  • ${v.color} - ${v.size} ${v.inStock ? '✓' : '❌'}\n`;
      });
      message += `\n`;
    }

    if (comparison.removedVariants.length > 0) {
      message += `🚫 Kaldırılan Varyantlar (${comparison.removedVariants.length}):\n`;
      comparison.removedVariants.forEach(v => {
        message += `  • ${v.color} - ${v.size}\n`;
      });
      message += `\n`;
    }

    if (comparison.stockChanges.length > 0) {
      message += `🔄 Stok Değişiklikleri (${comparison.stockChanges.length}):\n`;
      comparison.stockChanges.slice(0, 5).forEach(c => { // İlk 5 değişiklik
        const statusChange = !c.oldInStock && c.newInStock ? ' (Tekrar Stokta!)' :
                            c.oldInStock && !c.newInStock ? ' (Tükendi!)' : '';
        message += `  • ${c.color} - ${c.size}: ${c.oldStock} → ${c.newStock}${statusChange}\n`;
      });
      if (comparison.stockChanges.length > 5) {
        message += `  ... ve ${comparison.stockChanges.length - 5} değişiklik daha\n`;
      }
    }

    message += `\n🕒 ${new Date().toLocaleString('tr-TR')}`;

    try {
      await this.telegramIntegration.sendNotification(message);
      console.log('✅ Telegram notification sent');
    } catch (error) {
      console.error('❌ Failed to send Telegram notification:', error);
    }
  }

  /**
   * Tam varyant tracking süreci - tek fonksiyon
   */
  async trackVariants(
    productId: number,
    productTitle: string,
    newVariants: VariantInfo[]
  ): Promise<VariantComparisonResult> {
    console.log(`🎯 VARIANT TRACKING: Starting full tracking process for product ${productId}`);

    // 1. Varyantları karşılaştır
    const comparison = await this.compareVariants(productId, newVariants);

    // 2. Değişiklikleri kaydet
    if (comparison.addedVariants.length > 0 || 
        comparison.removedVariants.length > 0 || 
        comparison.stockChanges.length > 0) {
      await this.recordVariantChanges(productId, comparison);
      await this.updateVariantsInDatabase(productId, newVariants, comparison);
      
      // 3. Telegram bildirimi gönder
      await this.sendVariantChangeNotification(productId, productTitle, comparison);
    }

    return comparison;
  }
}
