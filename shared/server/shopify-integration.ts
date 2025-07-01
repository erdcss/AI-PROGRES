import axios from 'axios';
import { db } from './db';
import { eq } from 'drizzle-orm';
import {
  products,
  productVariants,
  shopifySyncLogs,
  type Product,
  type ProductVariant,
  type InsertShopifySyncLog
} from '@shared/schema';

export class ShopifyIntegration {
  private shopifyDomain: string;
  private accessToken: string;
  private apiVersion: string = '2024-01';

  constructor(shopifyDomain?: string, accessToken?: string) {
    this.shopifyDomain = shopifyDomain || process.env.SHOPIFY_STORE_DOMAIN || 'turmarkt.com';
    this.accessToken = accessToken || process.env.SHOPIFY_ACCESS_TOKEN || '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';
  }

  private get baseUrl(): string {
    const domain = this.shopifyDomain.includes('.myshopify.com') 
      ? this.shopifyDomain 
      : `${this.shopifyDomain}.myshopify.com`;
    return `https://${domain}/admin/api/${this.apiVersion}`;
  }

  private get headers() {
    return {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
    };
  }

  // Ürünü Shopify'a oluşturma
  async createProduct(product: Product, variants: ProductVariant[]): Promise<string | null> {
    try {
      const shopifyProduct = this.formatProductForShopify(product, variants);
      
      const response = await axios.post(
        `${this.baseUrl}/products.json`,
        { product: shopifyProduct },
        { headers: this.headers }
      );

      const createdProduct = response.data.product;
      const shopifyProductId = createdProduct.id.toString();

      // Shopify Product ID'yi veritabanında güncelle
      await db.update(products)
        .set({ 
          shopifyProductId,
          syncStatus: 'synced',
          lastSyncAt: new Date()
        })
        .where(eq(products.id, product.id));

      // Varyant ID'lerini güncelle
      if (createdProduct.variants && createdProduct.variants.length > 0) {
        for (let i = 0; i < createdProduct.variants.length && i < variants.length; i++) {
          const shopifyVariant = createdProduct.variants[i];
          const localVariant = variants[i];
          
          await db.update(productVariants)
            .set({ shopifyVariantId: shopifyVariant.id.toString() })
            .where(eq(productVariants.id, localVariant.id));
        }
      }

      // Sync log kaydet
      await this.logSync('create', product.id, null, 'success', shopifyProduct, response.data);

      console.log(`✅ Shopify'da ürün oluşturuldu: ${product.title} (ID: ${shopifyProductId})`);
      return shopifyProductId;

    } catch (error: any) {
      console.error(`❌ Shopify ürün oluşturma hatası:`, error.response?.data || error.message);
      
      await this.logSync('create', product.id, null, 'failed', null, null, error.message);
      await db.update(products)
        .set({ syncStatus: 'error' })
        .where(eq(products.id, product.id));

      return null;
    }
  }

  // Ürün fiyatını güncelleme
  async updateProductPrice(product: Product, variant: ProductVariant): Promise<boolean> {
    try {
      // Önce ürünün gerçek Shopify ID'sini bul
      const productsResponse = await axios.get(
        `${this.baseUrl}/products.json?title=${encodeURIComponent(product.title)}`,
        { headers: this.headers }
      );

      if (!productsResponse.data.products || productsResponse.data.products.length === 0) {
        console.log(`❌ Shopify'da ürün bulunamadı: ${product.title}`);
        return false;
      }

      const shopifyProduct = productsResponse.data.products[0];
      const shopifyVariant = shopifyProduct.variants[0]; // İlk varyantı al

      console.log(`🔍 Shopify Product ID: ${shopifyProduct.id}, Variant ID: ${shopifyVariant.id}`);

      const updateData = {
        variant: {
          id: shopifyVariant.id,
          price: variant.shopifyPrice
        }
      };

      const response = await axios.put(
        `${this.baseUrl}/variants/${shopifyVariant.id}.json`,
        updateData,
        { headers: this.headers }
      );

      console.log(`💰 Shopify fiyat güncellendi: ${product.title} → ${variant.shopifyPrice} TL`);
      return true;

    } catch (error: any) {
      console.error(`❌ Shopify fiyat güncelleme hatası:`, error.response?.data || error.message);
      return false;
    }
  }

  // Varyant stokunu sıfıra çek (ürün stoktan çıktığında)
  async setVariantStockToZero(product: Product, variant: ProductVariant): Promise<boolean> {
    try {
      // Önce ürünün gerçek Shopify ID'sini bul
      const productsResponse = await axios.get(
        `${this.baseUrl}/products.json?title=${encodeURIComponent(product.title)}`,
        { headers: this.headers }
      );

      if (!productsResponse.data.products || productsResponse.data.products.length === 0) {
        console.log(`❌ Shopify'da ürün bulunamadı: ${product.title}`);
        return false;
      }

      const shopifyProduct = productsResponse.data.products[0];
      const shopifyVariant = shopifyProduct.variants.find(v => 
        v.option1?.toLowerCase().includes(variant.color?.toLowerCase() || '') ||
        v.option2?.toLowerCase().includes(variant.size?.toLowerCase() || '')
      ) || shopifyProduct.variants[0];

      // Inventory item ID'yi al
      const inventoryItemId = shopifyVariant.inventory_item_id;
      
      // Inventory level'ları al
      const inventoryResponse = await axios.get(
        `${this.baseUrl}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
        { headers: this.headers }
      );

      if (inventoryResponse.data.inventory_levels.length > 0) {
        const inventoryLevel = inventoryResponse.data.inventory_levels[0];
        const locationId = inventoryLevel.location_id;

        // Stoku sıfırla
        const updateData = {
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available: 0
        };

        await axios.post(
          `${this.baseUrl}/inventory_levels/set.json`,
          updateData,
          { headers: this.headers }
        );

        console.log(`📦 Shopify stok sıfırlandı: ${variant.color} ${variant.size}`);
        return true;
      }

      return false;
    } catch (error: any) {
      console.error(`❌ Shopify stok sıfırlama hatası:`, error.response?.data || error.message);
      return false;
    }
  }

  // Varyant stokunu restore et (ürün tekrar stoka girdiğinde)
  async restoreVariantStock(product: Product, variant: ProductVariant): Promise<boolean> {
    try {
      // Önce ürünün gerçek Shopify ID'sini bul
      const productsResponse = await axios.get(
        `${this.baseUrl}/products.json?title=${encodeURIComponent(product.title)}`,
        { headers: this.headers }
      );

      if (!productsResponse.data.products || productsResponse.data.products.length === 0) {
        return false;
      }

      const shopifyProduct = productsResponse.data.products[0];
      const shopifyVariant = shopifyProduct.variants.find(v => 
        v.option1?.toLowerCase().includes(variant.color?.toLowerCase() || '') ||
        v.option2?.toLowerCase().includes(variant.size?.toLowerCase() || '')
      ) || shopifyProduct.variants[0];

      // Inventory item ID'yi al
      const inventoryItemId = shopifyVariant.inventory_item_id;
      
      // Inventory level'ları al
      const inventoryResponse = await axios.get(
        `${this.baseUrl}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
        { headers: this.headers }
      );

      if (inventoryResponse.data.inventory_levels.length > 0) {
        const inventoryLevel = inventoryResponse.data.inventory_levels[0];
        const locationId = inventoryLevel.location_id;

        // Stoku restore et (varsayılan 25 adet)
        const restoreAmount = variant.stockCount || 25;
        const updateData = {
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available: restoreAmount
        };

        await axios.post(
          `${this.baseUrl}/inventory_levels/set.json`,
          updateData,
          { headers: this.headers }
        );

        console.log(`📦 Shopify stok restore edildi: ${variant.color} ${variant.size} → ${restoreAmount}`);
        return true;
      }

      return false;
    } catch (error: any) {
      console.error(`❌ Shopify stok restore hatası:`, error.response?.data || error.message);
      return false;
    }
  }

  // Ürün stokunu güncelleme
  async updateProductStock(product: Product, variant: ProductVariant): Promise<boolean> {
    try {
      // Önce ürünün gerçek Shopify ID'sini bul
      const productsResponse = await axios.get(
        `${this.baseUrl}/products.json?title=${encodeURIComponent(product.title)}`,
        { headers: this.headers }
      );

      if (!productsResponse.data.products || productsResponse.data.products.length === 0) {
        return false;
      }

      const shopifyProduct = productsResponse.data.products[0];
      const shopifyVariant = shopifyProduct.variants.find(v => 
        v.option1?.toLowerCase().includes(variant.color?.toLowerCase() || '') ||
        v.option2?.toLowerCase().includes(variant.size?.toLowerCase() || '')
      ) || shopifyProduct.variants[0];

      // Inventory item ID'yi al
      const inventoryItemId = shopifyVariant.inventory_item_id;
      
      // Inventory level'ları al
      const inventoryResponse = await axios.get(
        `${this.baseUrl}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
        { headers: this.headers }
      );

      if (inventoryResponse.data.inventory_levels.length > 0) {
        const inventoryLevel = inventoryResponse.data.inventory_levels[0];
        const locationId = inventoryLevel.location_id;

        // Stok güncelle
        const updateData = {
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available: variant.stockCount
        };

        const response = await axios.post(
          `${this.baseUrl}/inventory_levels/set.json`,
          updateData,
          { headers: this.headers }
        );

        await this.logSync('update_stock', product.id, variant.id, 'success', updateData, response.data);
        
        console.log(`📦 Shopify stok güncellendi: ${variant.color} ${variant.size} → ${variant.stockCount} adet`);
        return true;
      }

    } catch (error: any) {
      console.error(`❌ Shopify stok güncelleme hatası:`, error.response?.data || error.message);
      await this.logSync('update_stock', product.id, variant.id, 'failed', null, null, error.message);
      return false;
    }

    return false;
  }

  // Varyant durumunu güncelleme (aktif/pasif)
  async updateVariantStatus(product: Product, variant: ProductVariant): Promise<boolean> {
    if (!product.shopifyProductId || !variant.shopifyVariantId) {
      return false;
    }

    try {
      const updateData = {
        variant: {
          id: parseInt(variant.shopifyVariantId),
          inventory_policy: variant.inStock && variant.stockCount > 0 ? 'deny' : 'continue'
        }
      };

      const response = await axios.put(
        `${this.baseUrl}/variants/${variant.shopifyVariantId}.json`,
        updateData,
        { headers: this.headers }
      );

      await this.logSync('update_variant', product.id, variant.id, 'success', updateData, response.data);
      
      console.log(`🔄 Shopify varyant durumu güncellendi: ${variant.color} ${variant.size} → ${variant.inStock ? 'Aktif' : 'Pasif'}`);
      return true;

    } catch (error: any) {
      console.error(`❌ Shopify varyant güncelleme hatası:`, error.response?.data || error.message);
      await this.logSync('update_variant', product.id, variant.id, 'failed', null, null, error.message);
      return false;
    }
  }

  // Ürünü Shopify formatına dönüştürme
  private formatProductForShopify(product: Product, variants: ProductVariant[]) {
    const shopifyVariants = variants.map(variant => ({
      option1: variant.color,
      option2: variant.size,
      price: variant.shopifyPrice,
      sku: variant.sku,
      inventory_quantity: variant.stockCount,
      inventory_management: 'shopify',
      inventory_policy: variant.inStock && variant.stockCount > 0 ? 'deny' : 'continue'
    }));

    return {
      title: product.title,
      body_html: this.generateProductDescription(product),
      vendor: product.brand,
      product_type: product.category,
      tags: this.generateProductTags(product),
      images: product.images.map(url => ({ src: url })),
      options: [
        { name: 'Renk', values: [...new Set(variants.map(v => v.color))] },
        { name: 'Beden', values: [...new Set(variants.map(v => v.size))] }
      ].filter(option => option.values.length > 1 || option.values[0] !== 'Varsayılan'),
      variants: shopifyVariants,
      status: 'active'
    };
  }

  // Ürün açıklaması oluşturma
  private generateProductDescription(product: Product): string {
    let description = `<h2>${product.title}</h2>`;
    description += `<p><strong>Marka:</strong> ${product.brand}</p>`;
    
    if (product.description) {
      description += `<p>${product.description}</p>`;
    }
    
    if (product.features && typeof product.features === 'object') {
      description += '<h3>Ürün Özellikleri:</h3><ul>';
      Object.entries(product.features).forEach(([key, value]) => {
        if (value && typeof value === 'string') {
          description += `<li><strong>${key}:</strong> ${value}</li>`;
        }
      });
      description += '</ul>';
    }
    
    description += '<p><em>Trendyol\'dan otomatik olarak aktarılmıştır.</em></p>';
    
    return description;
  }

  // Ürün etiketleri oluşturma
  private generateProductTags(product: Product): string {
    const tags = [product.brand, product.category || 'Genel'];
    
    if (product.colorOptions && product.colorOptions.length > 0) {
      tags.push(...product.colorOptions);
    }
    
    tags.push('Trendyol', 'Otomatik-Import');
    
    return tags.filter(Boolean).join(', ');
  }

  // Sync log kaydetme
  private async logSync(
    syncType: string,
    productId: number,
    variantId: number | null,
    status: string,
    requestData: any,
    responseData: any,
    errorMessage?: string
  ): Promise<void> {
    const logData: InsertShopifySyncLog = {
      productId,
      variantId,
      syncType,
      status,
      requestData,
      responseData,
      errorMessage
    };

    await db.insert(shopifySyncLogs).values(logData);
  }

  // API bağlantısını test etme
  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/shop.json`,
        { headers: this.headers }
      );
      
      console.log(`✅ Shopify bağlantısı başarılı: ${response.data.shop.name}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Shopify bağlantı hatası:`, error.response?.data || error.message);
      return false;
    }
  }

  // Shopify'dan ürün silme
  async deleteProduct(shopifyProductId: string): Promise<boolean> {
    try {
      await axios.delete(
        `${this.baseUrl}/products/${shopifyProductId}.json`,
        { headers: this.headers }
      );
      
      console.log(`🗑️ Shopify'dan ürün silindi: ${shopifyProductId}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Shopify ürün silme hatası:`, error.response?.data || error.message);
      return false;
    }
  }
}

export const shopifyIntegration = new ShopifyIntegration();