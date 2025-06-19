import path from "path";
import fs from "fs";

export interface InstantProduct {
  title: string;
  brand: string;
  price: string;
  description: string;
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
  };
  attributes?: Record<string, string>;
  categories?: string[];
  stockMap?: Record<string, boolean>;
}

class InstantCSVGenerator {
  async generateInstantCSV(productData: InstantProduct): Promise<{ success: boolean; message: string; csvPath?: string }> {
    try {
      console.log(`📝 Instant CSV generation starting for: ${productData.title}`);
      
      const product = {
        title: productData.title,
        brand: productData.brand,
        price: productData.price,
        description: productData.description,
        images: productData.images,
        category: productData.categories?.join(' > ') || 'Giyim',
        categories: productData.categories || ['Giyim']
      };

      const variants = {
        sizes: productData.variants.sizes || [],
        colors: productData.variants.colors || [],
        stockMap: productData.stockMap || {}
      };

      const outputPath = path.join('/home/runner/workspace', 'shopify-urunler.csv');
      
      // Fix Turkish price format (2.549.57 -> 2549.57)
      let cleanPrice = product.price;
      if (typeof cleanPrice === 'string') {
        if (cleanPrice.includes('.')) {
          const parts = cleanPrice.split('.');
          if (parts.length === 3 && parts[2].length === 2) {
            cleanPrice = `${parts[0]}${parts[1]}.${parts[2]}`;
            console.log(`🔧 Fixed Turkish format: "${product.price}" -> "${cleanPrice}"`);
          }
        }
      }
      
      const basePrice = parseFloat(cleanPrice);
      const priceWithMargin = (basePrice * 1.10).toFixed(2);
      console.log(`💰 Price with 10% margin: ${basePrice} -> ${priceWithMargin}`);
      
      // Generate CSV content
      const csvRows = [];
      const headers = [
        'handle', 'title', 'body_html', 'vendor', 'product_category', 'type', 'tags',
        'published', 'option1_name', 'option1_value', 'option2_name', 'option2_value',
        'option3_name', 'option3_value', 'variant_sku', 'variant_grams', 'variant_inventory_tracker',
        'variant_inventory_qty', 'variant_inventory_policy', 'variant_fulfillment_service',
        'variant_price', 'variant_compare_at_price', 'variant_requires_shipping', 'variant_taxable',
        'variant_barcode', 'image_src', 'image_position', 'image_alt_text', 'gift_card',
        'seo_title', 'seo_description', 'google_shopping_google_product_category',
        'google_shopping_gender', 'google_shopping_age_group', 'google_shopping_mpn',
        'google_shopping_condition', 'google_shopping_custom_product', 'variant_image',
        'variant_weight_unit', 'variant_tax_code'
      ];
      
      csvRows.push(headers.join(','));
      
      const handle = `${product.brand ? product.brand.toLowerCase() + '-' : ''}${product.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
      const colors = variants.colors.length > 0 ? variants.colors : ['Default'];
      const sizes = variants.sizes.length > 0 ? variants.sizes : ['OS'];
      
      let variantCount = 0;
      for (const color of colors) {
        for (const size of sizes) {
          variantCount++;
          const isMainVariant = variantCount === 1;
          
          const row = [
            handle,
            isMainVariant ? `${product.brand ? product.brand.toUpperCase() + ' ' : ''}${product.title}` : '',
            isMainVariant ? `${product.description || product.title}` : '',
            product.brand || 'TurMarkt',
            'Apparel & Accessories > Clothing',
            'Giyim',
            `${product.brand ? product.brand.toLowerCase() + ',' : ''}fashion,clothing`,
            'TRUE',
            colors.length > 1 || sizes.length > 1 ? (colors.length > 1 ? 'Color' : 'Size') : 'Title',
            colors.length > 1 || sizes.length > 1 ? (colors.length > 1 ? color : size) : 'Default Title',
            colors.length > 1 && sizes.length > 1 ? 'Size' : '',
            colors.length > 1 && sizes.length > 1 ? size : '',
            '', '',
            `${handle}-${color.toLowerCase()}-${size}`,
            '145',
            'shopify',
            '10',
            'deny',
            'manual',
            priceWithMargin,
            '',
            'TRUE',
            'TRUE',
            '',
            isMainVariant && product.images.length > 0 ? product.images[0] : '',
            isMainVariant ? '1' : '',
            isMainVariant ? `${product.title} - Ana Görsel` : '',
            'FALSE',
            `${product.brand ? product.brand + ' ' : ''}${product.title}`,
            `${product.brand ? product.brand + ' markası ' : ''}${product.description || product.title}`,
            '212',
            'unisex',
            'adult',
            product.brand || '',
            'new',
            'TRUE',
            isMainVariant && product.images.length > 0 ? product.images[0] : '',
            'g',
            ''
          ];
          
          csvRows.push(row.map(cell => {
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          }).join(','));
        }
      }
      
      const csvContent = csvRows.join('\n');
      fs.writeFileSync(outputPath, csvContent, 'utf-8');
      
      console.log(`✅ CSV created: ${outputPath} (${csvRows.length} rows)`);
      
      return {
        success: true,
        message: `CSV oluşturuldu: ${csvRows.length - 1} satır`,
        csvPath: outputPath
      };
      
    } catch (error) {
      console.error('❌ Instant CSV generation error:', error);
      return {
        success: false,
        message: `CSV oluşturma hatası: ${error.message}`
      };
    }
  }
}

export const instantCSVGenerator = new InstantCSVGenerator();