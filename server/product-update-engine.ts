import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { products, productVariants } from '@shared/schema';
import { detectPlatform } from './platform-detector';

interface ProductUpdateResult {
  success: boolean;
  productId: number;
  productTitle: string;
  updatedFields: string[];
  archivedVariants: string[];
  errors: string[];
  action: 'price_increased' | 'variants_updated' | 'archived' | 'no_change' | 'error';
}

interface TrendyolProductData {
  title: string;
  brand: string;
  currentPrice: number;
  originalPrice: number;
  stockStatus: 'in_stock' | 'out_of_stock' | 'low_stock';
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
    stockCount: number;
    trendyolPrice: number;
    shopifyPrice: number;
  }>;
  isAvailable: boolean;
}

export class ProductUpdateEngine {
  
  /**
   * Sizin tanımladığınız güncelleme mantığı:
   * 1. Fiyat sadece artırılır, asla düşürülmez
   * 2. Kaldırılan ürünler arşive gider
   * 3. Mevcut olmayan varyantlar kaldırılır
   * 4. Ürün aktif kalır (en az 1 varyant varsa)
   */
  async updateProduct(productId: number, newData: TrendyolProductData): Promise<ProductUpdateResult> {
    const result: ProductUpdateResult = {
      success: false,
      productId,
      productTitle: newData.title,
      updatedFields: [],
      archivedVariants: [],
      errors: [],
      action: 'no_change'
    };

    try {
      // Mevcut ürün bilgilerini al
      const [existingProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));

      if (!existingProduct) {
        result.errors.push('Ürün bulunamadı');
        result.action = 'error';
        return result;
      }

      // 1. ÜRÜN DURUMU KONTROLÜ
      if (!newData.isAvailable) {
        // Ürün kaldırılmış - arşive gönder
        await db
          .update(products)
          .set({
            isActive: false,
            stockStatus: 'out_of_stock',
            lastChecked: new Date(),
            syncStatus: 'archived'
          })
          .where(eq(products.id, productId));

        result.updatedFields.push('Ürün arşive gönderildi');
        result.action = 'archived';
        result.success = true;
        return result;
      }

      // 2. FİYAT GÜNCELLEMESİ (SADECE ARTIŞ)
      const currentPrice = existingProduct.currentPrice || 0;
      const newPrice = newData.currentPrice;

      if (newPrice > currentPrice) {
        // Fiyat artışı - güncelle
        await db
          .update(products)
          .set({
            currentPrice: newPrice,
            originalPrice: newData.originalPrice,
            lastChecked: new Date()
          })
          .where(eq(products.id, productId));

        result.updatedFields.push(`Fiyat güncellendi: ${currentPrice}TL → ${newPrice}TL`);
        result.action = 'price_increased';
      } else if (newPrice < currentPrice) {
        // Fiyat düşüş - GÜNCELLEME! Sizin tanımladığınız mantığa göre
        console.log(`⚠️ Fiyat düşüşü tespit edildi ancak güncellenmedi: ${currentPrice}TL → ${newPrice}TL`);
        result.updatedFields.push(`Fiyat düşüşü görmezden gelindi: ${currentPrice}TL korundu`);
      }

      // 3. VARYANT YÖNETİMİ
      const existingVariants = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId));

      let activeVariantCount = 0;

      for (const existingVariant of existingVariants) {
        const matchingNewVariant = newData.variants.find(v => 
          v.color === existingVariant.color && v.size === existingVariant.size
        );

        if (!matchingNewVariant || !matchingNewVariant.inStock) {
          // Varyant artık mevcut değil - kaldır
          await db
            .update(productVariants)
            .set({
              inStock: false,
              stockCount: 0,
              isActive: false,
              updatedAt: new Date()
            })
            .where(eq(productVariants.id, existingVariant.id));

          result.archivedVariants.push(`${existingVariant.color} - ${existingVariant.size}`);
        } else {
          // Varyant mevcut - stok bilgilerini güncelle
          await db
            .update(productVariants)
            .set({
              inStock: matchingNewVariant.inStock,
              stockCount: matchingNewVariant.stockCount,
              trendyolPrice: matchingNewVariant.trendyolPrice,
              shopifyPrice: matchingNewVariant.shopifyPrice,
              updatedAt: new Date()
            })
            .where(eq(productVariants.id, existingVariant.id));

          if (matchingNewVariant.inStock) {
            activeVariantCount++;
          }
        }
      }

      // 4. ÜRÜN AKTİFLİK DURUMU
      if (activeVariantCount === 0) {
        // Hiç aktif varyant kalmadı - ürünü arşive gönder
        await db
          .update(products)
          .set({
            isActive: false,
            stockStatus: 'out_of_stock',
            lastChecked: new Date(),
            syncStatus: 'archived'
          })
          .where(eq(products.id, productId));

        result.updatedFields.push('Tüm varyantlar tükendi - ürün arşive gönderildi');
        result.action = 'archived';
      } else {
        // En az 1 aktif varyant var - ürün aktif kalır
        await db
          .update(products)
          .set({
            stockStatus: newData.stockStatus,
            lastChecked: new Date(),
            syncStatus: 'updated'
          })
          .where(eq(products.id, productId));

        if (result.action === 'no_change') {
          result.action = 'variants_updated';
        }
      }

      result.success = true;
      return result;

    } catch (error) {
      result.errors.push(`Güncelleme hatası: ${error}`);
      result.action = 'error';
      return result;
    }
  }

  /**
   * Tek bir ürün için Trendyol'dan güncel bilgileri al ve güncelle
   */
  async processProductUpdate(productId: number): Promise<ProductUpdateResult> {
    try {
      // Mevcut ürün bilgilerini al
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));

      if (!product || !product.trendyolUrl) {
        return {
          success: false,
          productId,
          productTitle: 'Bilinmeyen ürün',
          updatedFields: [],
          archivedVariants: [],
          errors: ['Ürün bulunamadı veya Trendyol URL eksik'],
          action: 'error'
        };
      }

      // Platform tespiti
      const platform = detectPlatform(product.trendyolUrl);
      if (platform !== 'trendyol') {
        return {
          success: false,
          productId,
          productTitle: product.title,
          updatedFields: [],
          archivedVariants: [],
          errors: ['Sadece Trendyol ürünleri desteklenir'],
          action: 'error'
        };
      }

      // TODO: Burada Trendyol scraper çağrılacak
      // Şimdilik demo veri ile test ediyoruz
      const trendyolData: TrendyolProductData = {
        title: product.title,
        brand: product.brand || 'Bilinmeyen',
        currentPrice: (product.currentPrice || 0) * 1.1, // %10 artış simülasyonu
        originalPrice: (product.originalPrice || 0) * 1.1,
        stockStatus: 'in_stock',
        variants: [
          {
            color: 'Siyah',
            size: '38',
            inStock: true,
            stockCount: 5,
            trendyolPrice: (product.currentPrice || 0) * 1.1,
            shopifyPrice: (product.currentPrice || 0) * 1.1 * 1.15
          }
        ],
        isAvailable: true
      };

      return await this.updateProduct(productId, trendyolData);

    } catch (error) {
      return {
        success: false,
        productId,
        productTitle: 'Hata',
        updatedFields: [],
        archivedVariants: [],
        errors: [`İşlem hatası: ${error}`],
        action: 'error'
      };
    }
  }

  /**
   * Toplu ürün güncelleme işlemi
   */
  async processBulkUpdates(productIds: number[]): Promise<ProductUpdateResult[]> {
    const results: ProductUpdateResult[] = [];

    for (const productId of productIds) {
      const result = await this.processProductUpdate(productId);
      results.push(result);
      
      // Rate limiting - 2 saniye bekle
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
  }

  /**
   * Günlük güncelleme raporu oluştur
   */
  generateUpdateReport(results: ProductUpdateResult[]): string {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const priceIncreased = results.filter(r => r.action === 'price_increased');
    const archived = results.filter(r => r.action === 'archived');
    const variantsUpdated = results.filter(r => r.action === 'variants_updated');

    let report = `🔄 GÜNLÜK ÜRÜN GÜNCELLEMESİ RAPORU\n\n`;
    report += `📊 Özet:\n`;
    report += `✅ Başarılı: ${successful.length}\n`;
    report += `❌ Başarısız: ${failed.length}\n`;
    report += `💰 Fiyat artışı: ${priceIncreased.length}\n`;
    report += `📦 Arşivlenen: ${archived.length}\n`;
    report += `🔄 Varyant güncellemesi: ${variantsUpdated.length}\n\n`;

    if (priceIncreased.length > 0) {
      report += `💰 FİYAT ARTIŞLARI:\n`;
      priceIncreased.forEach(r => {
        report += `• ${r.productTitle}: ${r.updatedFields.join(', ')}\n`;
      });
      report += `\n`;
    }

    if (archived.length > 0) {
      report += `📦 ARŞİVLENEN ÜRÜNLER:\n`;
      archived.forEach(r => {
        report += `• ${r.productTitle}\n`;
      });
      report += `\n`;
    }

    if (failed.length > 0) {
      report += `❌ HATALAR:\n`;
      failed.forEach(r => {
        report += `• ${r.productTitle}: ${r.errors.join(', ')}\n`;
      });
    }

    return report;
  }
}

export const productUpdateEngine = new ProductUpdateEngine();