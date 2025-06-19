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
    
    // Enhanced description with product attributes
    const enhancedDescription = this.createEnhancedDescription(product);
    
    const brand = product.brand || 'Marka';
    const mainImage = product.images?.[0] || '';
    const comparePrice = basePrice;
    
    // Generate category-based tags
    const categoryTags = this.generateCategoryTags(product);
    
    return [
      handle,                           // Handle
      title,                           // Title
      enhancedDescription,             // Body (HTML) - Enhanced with attributes
      brand,                          // Vendor
      this.detectProductCategory(product), // Product Category - Auto-detected
      categoryTags,                   // Tags - Category-based
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
      this.getAllProductImages(product), // Image Src - All images
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
      this.getAllProductImages(product), // Variant Image - All images
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
   * Create enhanced description with Trendyol product attributes
   */
  private createEnhancedDescription(product: Product): string {
    let description = product.description || '';
    
    // Add original description
    let enhancedDesc = `<div class="product-description">
      <h3>Ürün Açıklaması</h3>
      <p>${description}</p>
    </div>`;
    
    // Add product attributes if available
    if (product.attributes && Object.keys(product.attributes).length > 0) {
      enhancedDesc += `\n<div class="product-attributes">
        <h3>Ürün Özellikleri</h3>
        <table>`;
      
      Object.entries(product.attributes).forEach(([key, value]) => {
        enhancedDesc += `\n<tr><td><strong>${key}:</strong></td><td>${value}</td></tr>`;
      });
      
      enhancedDesc += `\n</table></div>`;
    }
    
    // Add general quality statements
    enhancedDesc += `\n<div class="quality-info">
      <ul>
        <li>Kaliteli malzeme ile üretilmiştir</li>
        <li>Günlük kullanım için ideal</li>
        <li>Rahat kesim ve şık tasarım</li>
        <li>Uzun ömürlü kullanım için tasarlanmıştır</li>
      </ul>
    </div>`;
    
    return enhancedDesc;
  }

  /**
   * Generate category-based tags
   */
  private generateCategoryTags(product: Product): string {
    const tags = new Set<string>();
    
    // Add brand tag
    if (product.brand) {
      tags.add(product.brand.toLowerCase());
    }
    
    // Add category-based tags based on title analysis
    const title = product.title?.toLowerCase() || '';
    
    // Clothing categories
    if (title.includes('tişört') || title.includes('t-shirt')) {
      tags.add('tişört');
      tags.add('üst giyim');
      tags.add('günlük');
    }
    
    if (title.includes('pantolon') || title.includes('jean')) {
      tags.add('pantolon');
      tags.add('alt giyim');
      tags.add('günlük');
    }
    
    if (title.includes('elbise') || title.includes('dress')) {
      tags.add('elbise');
      tags.add('özel günler');
      tags.add('şık');
    }
    
    if (title.includes('ayakkabı') || title.includes('bot') || title.includes('sandalet')) {
      tags.add('ayakkabı');
      tags.add('footwear');
    }
    
    if (title.includes('çanta') || title.includes('bag')) {
      tags.add('çanta');
      tags.add('aksesuar');
    }
    
    // Gender-based tags
    if (title.includes('kadın') || title.includes('woman')) {
      tags.add('kadın');
    }
    
    if (title.includes('erkek') || title.includes('man')) {
      tags.add('erkek');
    }
    
    if (title.includes('unisex')) {
      tags.add('unisex');
    }
    
    // Style tags
    if (title.includes('spor') || title.includes('sport')) {
      tags.add('spor');
      tags.add('aktif yaşam');
    }
    
    if (title.includes('klasik') || title.includes('classic')) {
      tags.add('klasik');
      tags.add('zamansız');
    }
    
    // Material tags
    if (title.includes('pamuk') || title.includes('cotton')) {
      tags.add('pamuk');
      tags.add('doğal kumaş');
    }
    
    if (title.includes('deri') || title.includes('leather')) {
      tags.add('deri');
      tags.add('premium');
    }
    
    // Add generic fashion tags
    tags.add('moda');
    tags.add('trend');
    tags.add('kaliteli');
    tags.add('türkiye');
    
    return Array.from(tags).join(',');
  }

  /**
   * Detect product category from title and attributes
   */
  private detectProductCategory(product: Product): string {
    const title = product.title?.toLowerCase() || '';
    
    // Clothing categories
    if (title.includes('tişört') || title.includes('t-shirt') || title.includes('gömlek')) {
      return 'Üst Giyim';
    }
    
    if (title.includes('pantolon') || title.includes('jean') || title.includes('şort')) {
      return 'Alt Giyim';
    }
    
    if (title.includes('elbise') || title.includes('dress')) {
      return 'Elbise';
    }
    
    if (title.includes('ayakkabı') || title.includes('bot') || title.includes('sandalet') || title.includes('loafer')) {
      return 'Ayakkabı';
    }
    
    if (title.includes('çanta') || title.includes('bag') || title.includes('cüzdan')) {
      return 'Çanta & Aksesuar';
    }
    
    if (title.includes('saat') || title.includes('watch')) {
      return 'Saat';
    }
    
    if (title.includes('takı') || title.includes('jewelry')) {
      return 'Takı';
    }
    
    // Default category
    return 'Giyim';
  }

  /**
   * Get all product images as comma-separated string
   */
  private getAllProductImages(product: Product): string {
    if (!product.images || product.images.length === 0) {
      return '';
    }
    
    // Return all images separated by pipes for Shopify multiple images
    return product.images.slice(0, 10).join(' | '); // Limit to 10 images
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