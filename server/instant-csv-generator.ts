import * as fs from 'fs';
import * as path from 'path';
import { Product } from '@shared/schema';

/**
 * Instant CSV Generator - No memory storage, creates CSV per request
 */
export class InstantCSVGenerator {
  private readonly csvPath: string;

  constructor() {
    this.csvPath = path.join('/home/runner/workspace', 'shopify-urunler.csv');
  }

  /**
   * Create CSV for single product instantly
   */
  async generateInstantCSV(product: Product): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('🔄 Anlık CSV oluşturuluyor:', product.title);
      
      // Generate CSV rows for the product
      const csvRows = this.generateProductRows(product);
      
      // Create CSV content with proper headers
      const csvContent = this.createCSVContent(csvRows);
      
      // Write to file with UTF-8 BOM
      const bom = '\uFEFF';
      fs.writeFileSync(this.csvPath, bom + csvContent, 'utf8');
      
      console.log('✅ Anlık CSV oluşturuldu: 1 ürün,', csvRows.length, 'varyant');
      
      return {
        success: true,
        message: `CSV başarıyla oluşturuldu: ${csvRows.length} varyant`
      };
      
    } catch (error) {
      console.error('❌ Anlık CSV oluşturma hatası:', error);
      return {
        success: false,
        message: "CSV oluşturma hatası"
      };
    }
  }

  /**
   * Generate CSV rows for a product
   */
  private generateProductRows(product: Product): any[] {
    const handle = `${product.brand?.toLowerCase() || 'product'}-${product.id}`.replace(/[^a-z0-9-]/g, '');
    const colors = product.variants?.colors || ['tek renk'];
    const sizes = product.variants?.sizes || ['tek beden'];
    
    const csvRows: any[] = [];
    
    // Fix Turkish price formatting
    const priceStr = product.price.toString();
    let cleanPrice;
    
    if (priceStr.match(/^\d+\.\d{1,2}$/)) {
      cleanPrice = priceStr;
    } else if (priceStr.includes('.') && priceStr.split('.').length > 2) {
      const parts = priceStr.split('.');
      const integerPart = parts.slice(0, -1).join('');
      const decimalPart = parts[parts.length - 1];
      cleanPrice = `${integerPart}.${decimalPart}`;
    } else {
      cleanPrice = priceStr.replace(/,/g, '.');
    }
    
    const basePrice = parseFloat(cleanPrice) || 0;
    const markedPrice = (basePrice * 1.1).toFixed(2);
    
    console.log(`💰 Fiyat: "${product.price}" → "${cleanPrice}" → ${basePrice} → ${markedPrice}`);
    
    // Generate variants
    colors.forEach(color => {
      sizes.forEach(size => {
        const variant = this.createVariantRow(product, handle, color, size, markedPrice, basePrice.toFixed(2));
        csvRows.push(variant);
      });
    });
    
    return csvRows;
  }

  /**
   * Create a variant row for CSV
   */
  private createVariantRow(product: Product, handle: string, color: string, size: string, markedPrice: string, basePrice: string): any[] {
    const variantHandle = `${handle}-${color.replace(/\s+/g, '').toLowerCase()}-${size.replace(/\s+/g, '').toLowerCase()}`;
    const title = product.title || 'Ürün';
    const description = product.description || 'Kaliteli malzeme ile üretilmiştir. Günlük kullanım için ideal. Rahat kesim ve şık tasarım. Uzun ömürlü kullanım için tasarlanmıştır';
    const brand = product.brand || 'Marka';
    const mainImage = product.images?.[0] || '';
    const comparePrice = basePrice;
    
    return [
      handle,                           // Handle
      title,                           // Title
      description,                     // Body (HTML)
      brand,                          // Vendor
      'Giyim',                        // Product Category
      'giyim,moda,trend',             // Tags
      'TRUE',                         // Published
      'Renk',                         // Option1 Name
      color,                          // Option1 Value
      'Beden',                        // Option2 Name
      size,                           // Option2 Value
      '',                             // Option3 Name
      '',                             // Option3 Value
      variantHandle,                  // Variant SKU
      '300',                          // Variant Grams
      'shopify',                      // Variant Inventory Tracker
      '50',                           // Variant Inventory Qty
      'deny',                         // Variant Inventory Policy
      'manual',                       // Variant Fulfillment Service
      markedPrice,                    // Variant Price
      comparePrice,                   // Variant Compare At Price
      'TRUE',                         // Variant Requires Shipping
      'TRUE',                         // Variant Taxable
      '',                             // Variant Barcode
      mainImage,                      // Image Src
      '1',                            // Image Position
      `${title} - ${color}`,          // Image Alt Text
      'FALSE',                        // Gift Card
      title,                          // SEO Title
      `${title} - Yüksek kaliteli ürün`, // SEO Description
      'Apparel & Accessories > Clothing', // Google Shopping / Google Product Category
      'unisex',                       // Google Shopping / Gender
      'adult',                        // Google Shopping / Age Group
      '',                             // Google Shopping / MPN
      '',                             // Google Shopping / AdWords Grouping
      '',                             // Google Shopping / AdWords Labels
      'new',                          // Google Shopping / Condition
      'FALSE',                        // Google Shopping / Custom Product
      '',                             // Google Shopping / Custom Label 0
      '',                             // Google Shopping / Custom Label 1
      '',                             // Google Shopping / Custom Label 2
      '',                             // Google Shopping / Custom Label 3
      '',                             // Google Shopping / Custom Label 4
      mainImage,                      // Variant Image
      'kg',                           // Variant Weight Unit
      '',                             // Variant Tax Code
      (parseFloat(markedPrice) * 0.64).toFixed(2), // Cost per item
      '',                             // Included / Turkey
      '',                             // Price / International
      '',                             // Compare At Price / International
      '',                             // Status
      '',                             // Body Summary
      '',                             // Theme Template
      '',                             // Collection
      '',                             // Product Category
      '',                             // Global Shipping
      '',                             // Variant SKU
      '',                             // Variant Position
      '',                             // Variant Option1
      '',                             // Variant Option2
      '',                             // Variant Option3
      ''                              // Variant Available
    ];
  }

  /**
   * Create CSV content with headers
   */
  private createCSVContent(rows: any[]): string {
    const headers = [
      'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Tags', 'Published',
      'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
      'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
      'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
      'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
      'Variant Barcode', 'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card',
      'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
      'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
      'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
      'Google Shopping / Condition', 'Google Shopping / Custom Product',
      'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
      'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3',
      'Google Shopping / Custom Label 4', 'Variant Image', 'Variant Weight Unit',
      'Variant Tax Code', 'Cost per item', 'Included / Turkey', 'Price / International',
      'Compare At Price / International', 'Status', 'Body Summary', 'Theme Template',
      'Collection', 'Product Category', 'Global Shipping', 'Variant SKU',
      'Variant Position', 'Variant Option1', 'Variant Option2', 'Variant Option3', 'Variant Available'
    ];

    // Create CSV content
    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
    
    rows.forEach(row => {
      const csvRow = row.map((cell: any) => {
        const cellStr = String(cell || '');
        return `"${cellStr.replace(/"/g, '""')}"`;
      }).join(',');
      csvContent += csvRow + '\n';
    });

    return csvContent;
  }

  /**
   * Clear CSV file
   */
  async clearCSV(): Promise<{ success: boolean; message: string }> {
    try {
      if (fs.existsSync(this.csvPath)) {
        fs.unlinkSync(this.csvPath);
      }
      
      console.log('🗑️ CSV dosyası temizlendi');
      return {
        success: true,
        message: "CSV dosyası temizlendi"
      };
    } catch (error) {
      console.error('❌ CSV temizleme hatası:', error);
      return {
        success: false,
        message: "Temizleme hatası"
      };
    }
  }
}

export const instantCSVGenerator = new InstantCSVGenerator();