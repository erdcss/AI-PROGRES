/**
 * Shopify API Integration for Direct Product Upload
 * Handles product creation, variant management, and CSV export
 */

import axios, { AxiosRequestConfig } from 'axios';
import { ScenarioBasedResult } from './scenario-based-scraper';
import { getShopifyConfig } from './shopify-credentials';

export interface ShopifyProduct {
  id?: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  handle?: string;
  status: string;
  tags: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  options: ShopifyOption[];
}

export interface ShopifyVariant {
  title: string;
  price: string;
  sku?: string;
  inventory_quantity?: number;
  inventory_management?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  weight?: number;
  weight_unit?: string;
}

export interface ShopifyImage {
  src: string;
  alt?: string;
  position?: number;
}

export interface ShopifyOption {
  name: string;
  values: string[];
}

export class ShopifyIntegration {
  constructor() {}

  private async resolveConfig(): Promise<{ shopUrl: string; accessToken: string; baseUrl: string }> {
    const config = await getShopifyConfig();
    if (!config) throw new Error('Shopify kimlik bilgileri bulunamadı. Lütfen Shopify bağlantı ayarlarını yapın.');
    return {
      shopUrl: config.shopDomain,
      accessToken: config.accessToken,
      baseUrl: `https://${config.shopDomain}/admin/api/2024-01/`
    };
  }

  private async getHeaders(): Promise<AxiosRequestConfig['headers']> {
    const { accessToken } = await this.resolveConfig();
    return {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Convert ScenarioBasedResult to Shopify Product format
   */
  convertToShopifyProduct(productData: ScenarioBasedResult, uniqueTrackingId?: string): ShopifyProduct {
    // Generate clean product title
    const title = productData.title;
    
    // Generate handle (URL-friendly version)
    const handle = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/gi, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);

    // 🖼️ SHOPIFY IMAGE FIX: Ensure images are properly formatted and validated
    console.log(`📸 SHOPIFY INTEGRATION: Processing ${productData.images.length} images for product: ${title}`);
    
    const images: ShopifyImage[] = [];
    if (productData.images && Array.isArray(productData.images)) {
      productData.images.forEach((imageUrl, index) => {
        if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
          images.push({
            src: imageUrl,
            alt: `${title} - Görsel ${index + 1}`,
            position: index + 1
          });
          console.log(`📸 Added image ${index + 1}: ${imageUrl}`);
        } else if (imageUrl && typeof imageUrl === 'object' && (imageUrl as any).url) {
          // Handle {url: string} format
          const imageObj = imageUrl as any;
          images.push({
            src: imageObj.url,
            alt: `${title} - Görsel ${index + 1}`,
            position: index + 1
          });
          console.log(`📸 Added image object ${index + 1}: ${imageObj.url}`);
        } else {
          console.log(`❌ Invalid image format at index ${index}:`, imageUrl);
        }
      });
    }
    
    console.log(`✅ SHOPIFY IMAGES: ${images.length} valid images ready for upload`);

    // Create variants
    const variants: ShopifyVariant[] = [];
    const hasColors = productData.variants.length > 0 && productData.variants.some(v => v.color && v.color !== 'Varsayılan');
    const hasSizes = productData.variants.length > 0 && productData.variants.some(v => v.size && v.size !== 'Standart');

    if (productData.variants.length > 0) {
      productData.variants.forEach((variant, index) => {
        variants.push({
          title: hasColors && hasSizes 
            ? `${variant.color} / ${variant.size}`
            : hasColors 
              ? variant.color
              : hasSizes 
                ? variant.size
                : 'Default',
          price: productData.price.original.toString(),
          sku: (variant as any).sku || `${handle}-${index + 1}`,
          inventory_quantity: variant.inStock ? 10 : 0,
          inventory_management: 'shopify',
          option1: hasColors ? variant.color : hasSizes ? variant.size : undefined,
          option2: hasColors && hasSizes ? variant.size : undefined,
          weight: 100,
          weight_unit: 'g'
        });
      });
    } else {
      // Single variant product
      variants.push({
        title: 'Default Title',
        price: productData.price.original.toString(),
        sku: `${handle}-1`,
        inventory_quantity: 10,
        inventory_management: 'shopify',
        weight: 100,
        weight_unit: 'g'
      });
    }

    // Create options
    const options: ShopifyOption[] = [];
    if (hasColors) {
      const colorOptions = Array.from(new Set(productData.variants.map(v => v.color).filter(c => c && c !== 'Varsayılan')));
      if (colorOptions.length > 0) {
        options.push({
          name: 'Color',
          values: colorOptions
        });
      }
    }
    
    if (hasSizes) {
      const sizeOptions = Array.from(new Set(productData.variants.map(v => v.size).filter(s => s && s !== 'Standart')));
      if (sizeOptions.length > 0) {
        options.push({
          name: 'Size',
          values: sizeOptions
        });
      }
    }

    return {
      title,
      body_html: `<p>${productData.title}</p><p>Marka: ${productData.brand}</p>`,
      vendor: productData.brand,
      product_type: 'Kozmetik',
      handle,
      status: 'draft',
      tags: productData.tags?.join(', ') || 'imported',
      images,
      variants,
      options
    };
  }

  /**
   * Create product in Shopify
   */
  async createProduct(productData: ScenarioBasedResult): Promise<{ success: boolean; productId?: number; error?: string }> {
    try {
      // Generate unique tracking ID
      const uniqueTrackingId = (productData as any).uniqueTrackingId || 
        `trendyol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const shopifyProduct = this.convertToShopifyProduct(productData, uniqueTrackingId);
      
      // Add metafields to the product
      const productWithMetafields = {
        ...shopifyProduct,
        metafields: [
          {
            namespace: 'custom',
            key: 'repli_t_id',
            value: uniqueTrackingId,
            type: 'single_line_text_field'
          }
        ]
      };
      
      console.log(`🛍️ Creating Shopify product: ${shopifyProduct.title}`);
      console.log(`📦 Variants: ${shopifyProduct.variants.length}, Images: ${shopifyProduct.images.length}`);
      console.log(`🔑 Unique Tracking ID: ${uniqueTrackingId}`);

      const { baseUrl } = await this.resolveConfig();
      const response = await axios.post(
        `${baseUrl}products.json`,
        { product: productWithMetafields },
        { headers: await this.getHeaders() }
      );

      if (response.status === 201) {
        const createdProduct = response.data.product;
        console.log(`✅ Product created successfully: ID ${createdProduct.id}`);
        return {
          success: true,
          productId: createdProduct.id
        };
      } else {
        console.error(`❌ Shopify API error: ${response.status}`, response.data);
        return {
          success: false,
          error: `API returned status ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('❌ Error creating Shopify product:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        return {
          success: false,
          error: error.response.data.errors || error.message
        };
      }
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate CSV content for Shopify import
   */
  generateShopifyCSV(productData: ScenarioBasedResult): string {
    const shopifyProduct = this.convertToShopifyProduct(productData);
    
    const csvHeaders = [
      'Handle',
      'Title',
      'Body (HTML)',
      'Vendor',
      'Product Type',
      'Tags',
      'Published',
      'Option1 Name',
      'Option1 Value',
      'Option2 Name', 
      'Option2 Value',
      'Variant SKU',
      'Variant Grams',
      'Variant Inventory Tracker',
      'Variant Inventory Qty',
      'Variant Inventory Policy',
      'Variant Price',
      'Image Src',
      'Image Alt Text'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    shopifyProduct.variants.forEach((variant, index) => {
      const isFirstVariant = index === 0;
      const imageUrl = shopifyProduct.images[0]?.src || '';
      
      const row = [
        shopifyProduct.handle,
        isFirstVariant ? `"${shopifyProduct.title}"` : '',
        isFirstVariant ? `"${shopifyProduct.body_html?.replace(/"/g, '""') || ''}"` : '',
        isFirstVariant ? shopifyProduct.vendor : '',
        isFirstVariant ? shopifyProduct.product_type : '',
        isFirstVariant ? shopifyProduct.tags : '',
        isFirstVariant ? 'FALSE' : '',
        isFirstVariant && shopifyProduct.options[0] ? shopifyProduct.options[0].name : '',
        variant.option1 || '',
        isFirstVariant && shopifyProduct.options[1] ? shopifyProduct.options[1].name : '',
        variant.option2 || '',
        variant.sku,
        variant.weight?.toString() || '100',
        variant.inventory_management || 'shopify',
        variant.inventory_quantity?.toString() || '0',
        'deny',
        variant.price,
        isFirstVariant ? imageUrl : '',
        isFirstVariant ? shopifyProduct.images[0]?.alt : ''
      ];

      csvContent += row.join(',') + '\n';
    });

    return csvContent;
  }

  /**
   * Test Shopify connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const { baseUrl } = await this.resolveConfig();
      const response = await axios.get(`${baseUrl}shop.json`, {
        headers: await this.getHeaders()
      });

      if (response.status === 200) {
        console.log(`✅ Shopify connection successful: ${response.data.shop.name}`);
        return { success: true };
      }

      return { success: false, error: `Unexpected status: ${response.status}` };
    } catch (error: any) {
      console.error('❌ Shopify connection failed:', error.message);
      return { 
        success: false, 
        error: error.response?.data?.errors || error.message 
      };
    }
  }
}

export const shopifyIntegration = new ShopifyIntegration();