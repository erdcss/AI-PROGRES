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
      const shopifyVariant = shopifyProduct.variants.find((v: any) => 
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
      const shopifyVariant = shopifyProduct.variants.find((v: any) => 
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
      const shopifyVariant = shopifyProduct.variants.find((v: any) => 
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
        { name: 'Renk', values: Array.from(new Set(variants.map(v => v.color))) },
        { name: 'Beden', values: Array.from(new Set(variants.map(v => v.size))) }
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

  // Shopify'dan ürünleri çek (pagination desteğiyle)
  async fetchProductsFromShopify(limit: number = 250): Promise<any[]> {
    try {
      console.log('🔍 Shopify ürünleri çekiliyor (pagination ile)...');
      
      let allProducts: any[] = [];
      let nextPageUrl: string | null = `${this.baseUrl}/products.json?limit=${limit}&fields=id,title,vendor,handle,product_type,tags,variants,images,created_at,updated_at`;
      let pageCount = 0;
      
      while (nextPageUrl && pageCount < 50) { // Maksimum 50 sayfa (güvenlik için)
        pageCount++;
        console.log(`📄 Sayfa ${pageCount} çekiliyor...`);
        
        const response = await axios.get(nextPageUrl, { headers: this.headers });
        const pageProducts = response.data.products || [];
        
        if (pageProducts.length === 0) {
          console.log('🏁 Ürün kalmadı, pagination sona erdi');
          break;
        }
        
        allProducts = allProducts.concat(pageProducts);
        console.log(`📦 Sayfa ${pageCount}: ${pageProducts.length} ürün (Toplam: ${allProducts.length})`);
        
        // Shopify Link header'ından next page URL'sini al
        const linkHeader = response.headers.link;
        nextPageUrl = null;
        
        if (linkHeader) {
          const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) {
            nextPageUrl = nextMatch[1];
          }
        }
        
        // Rate limiting - sayfa arası 1 saniye bekle
        if (nextPageUrl) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`✅ ${allProducts.length} Shopify ürünü toplamda bulundu`);
      
      return allProducts.map((product: any) => ({
        shopifyProductId: product.id.toString(),
        title: product.title,
        brand: product.vendor || 'Bilinmeyen Marka',
        productType: product.product_type,
        tags: product.tags ? product.tags.split(',').map((tag: string) => tag.trim()) : [],
        handle: product.handle,
        shopifyUrl: `https://${this.shopifyDomain.replace('.myshopify.com', '')}.myshopify.com/products/${product.handle}`,
        images: product.images?.map((img: any) => img.src) || [],
        variants: product.variants?.map((variant: any) => ({
          shopifyVariantId: variant.id.toString(),
          title: variant.title,
          price: variant.price,
          sku: variant.sku,
          inventory_quantity: variant.inventory_quantity
        })) || [],
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        currentPrice: product.variants?.[0]?.price || '0.00',
        originalPrice: product.variants?.[0]?.compare_at_price || product.variants?.[0]?.price || '0.00',
        stockStatus: product.variants?.some((v: any) => v.inventory_quantity > 0) ? 'in_stock' : 'out_of_stock',
        sourcePlatform: 'shopify'
      }));
      
    } catch (error) {
      console.error('❌ Shopify ürün çekme hatası:', error);
      throw new Error(`Shopify API hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  // Mağaza bilgilerini çek
  async getStoreInfo(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/shop.json`,
        { headers: this.headers }
      );
      
      return response.data.shop;
    } catch (error) {
      console.error('❌ Shopify mağaza bilgisi hatası:', error);
      throw error;
    }
  }

  // Ürün sayısını çek
  async getProductCount(): Promise<number> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/products/count.json`,
        { headers: this.headers }
      );
      
      return response.data.count || 0;
    } catch (error) {
      console.error('❌ Shopify ürün sayısı hatası:', error);
      return 0;
    }
  }

  // Shopify ürünlerini veritabanına kaydet
  async saveProductsToDatabase(shopifyProducts: any[]): Promise<{savedProducts: number, savedVariants: number}> {
    let savedProducts = 0;
    let savedVariants = 0;

    try {
      for (const shopifyProduct of shopifyProducts) {
        // Önce aynı Shopify ID'li ürün var mı kontrol et
        const existingProduct = await db.query.products.findFirst({
          where: eq(products.shopifyProductId, shopifyProduct.shopifyProductId)
        });

        let productId;
        
        if (!existingProduct) {
          // Yeni ürün kaydet
          const productData = {
            trendyolUrl: shopifyProduct.shopifyUrl, // Shopify URL'sini trendyol URL yerine koy
            trendyolProductId: shopifyProduct.shopifyProductId,
            shopifyProductId: shopifyProduct.shopifyProductId,
            title: shopifyProduct.title,
            brand: shopifyProduct.brand,
            description: shopifyProduct.productType || '',
            category: shopifyProduct.productType || 'Genel',
            images: shopifyProduct.images,
            features: { tags: shopifyProduct.tags },
            colorOptions: [],
            sizeOptions: [],
            originalPrice: shopifyProduct.originalPrice,
            currentPrice: shopifyProduct.currentPrice,
            stockStatus: shopifyProduct.stockStatus,
            lastChecked: new Date(),
            sourceUrl: shopifyProduct.shopifyUrl,
            sourcePlatform: 'shopify',
            shopifyUrl: shopifyProduct.shopifyUrl,
            shopifyStoreUrl: shopifyProduct.shopifyUrl,
            isActive: true,
            profitMargin: '15.00',
            lastSyncAt: new Date(),
            syncStatus: 'synced'
          };

          const [insertedProduct] = await db.insert(products).values(productData).returning();
          productId = insertedProduct.id;
          savedProducts++;
          
          console.log(`✅ Ürün kaydedildi: ${shopifyProduct.title}`);
        } else {
          productId = existingProduct.id;
          
          // Mevcut ürünü güncelle
          await db.update(products)
            .set({ 
              lastChecked: new Date(),
              lastSyncAt: new Date(),
              currentPrice: shopifyProduct.currentPrice,
              stockStatus: shopifyProduct.stockStatus,
              updatedAt: new Date()
            })
            .where(eq(products.id, productId));
          
          console.log(`🔄 Ürün güncellendi: ${shopifyProduct.title}`);
        }

        // Varyantları kaydet
        for (const variant of shopifyProduct.variants || []) {
          // Aynı Shopify variant ID'li varyant var mı kontrol et
          const existingVariant = await db.query.productVariants.findFirst({
            where: eq(productVariants.shopifyVariantId, variant.shopifyVariantId)
          });

          if (!existingVariant) {
            const variantData = {
              productId: productId,
              shopifyVariantId: variant.shopifyVariantId,
              color: variant.title?.includes('/')? variant.title.split('/')[0].trim() : 'Varsayılan',
              size: variant.title?.includes('/')? variant.title.split('/')[1]?.trim() || 'Tek Beden' : 'Tek Beden',
              sku: variant.sku || '',
              trendyolPrice: variant.price,
              shopifyPrice: variant.price,
              stockCount: variant.inventory_quantity || 0,
              inStock: (variant.inventory_quantity || 0) > 0
            };

            await db.insert(productVariants).values(variantData);
            savedVariants++;
          } else {
            // Mevcut varyantı güncelle
            await db.update(productVariants)
              .set({
                shopifyPrice: variant.price,
                stockCount: variant.inventory_quantity || 0,
                inStock: (variant.inventory_quantity || 0) > 0,
                updatedAt: new Date()
              })
              .where(eq(productVariants.shopifyVariantId, variant.shopifyVariantId));
          }
        }
      }
      
      console.log(`✅ Shopify hafızaya kaydetme tamamlandı: ${savedProducts} ürün, ${savedVariants} varyant`);
      return { savedProducts, savedVariants };
      
    } catch (error) {
      console.error('❌ Shopify hafızaya kaydetme hatası:', error);
      throw error;
    }
  }
}

export const shopifyIntegration = new ShopifyIntegration();