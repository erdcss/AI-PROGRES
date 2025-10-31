/**
 * Bulk CSV Generator - Generate Shopify CSV from multiple products with all color variants
 * 
 * Features:
 * - Combines multiple products into single CSV
 * - Each color variant gets its own row
 * - Proper image mapping for each variant
 * - Shopify-compatible format
 */

import { MultiColorResult } from './multi-color-scraper';
import { BulkScrapeResult } from './bulk-url-scraper';

export interface BulkCSVOptions {
  profitMargin?: number; // Percentage (e.g., 15 for 15%)
  defaultVendor?: string;
  defaultProductType?: string;
}

export class BulkCSVGenerator {
  /**
   * Generate Shopify CSV from bulk scraping results
   */
  generateShopifyCSV(
    bulkResult: BulkScrapeResult,
    options: BulkCSVOptions = {}
  ): string {
    const {
      profitMargin = 15,
      defaultVendor = 'Trendyol',
      defaultProductType = 'Apparel'
    } = options;

    console.log('📝 Generating Shopify CSV from bulk results...');
    console.log(`📦 Total products: ${bulkResult.successfulUrls}`);
    console.log(`🎨 Total variants: ${bulkResult.combinedVariants.length}`);

    const csvRows: string[][] = [];
    
    // CSV Header
    csvRows.push([
      'Handle',
      'Title',
      'Body (HTML)',
      'Vendor',
      'Product Category',
      'Type',
      'Tags',
      'Published',
      'Option1 Name',
      'Option1 Value',
      'Option2 Name',
      'Option2 Value',
      'Variant SKU',
      'Variant Grams',
      'Variant Inventory Tracker',
      'Variant Inventory Policy',
      'Variant Fulfillment Service',
      'Variant Price',
      'Variant Compare At Price',
      'Variant Requires Shipping',
      'Variant Taxable',
      'Variant Barcode',
      'Image Src',
      'Image Position',
      'Image Alt Text',
      'Gift Card',
      'SEO Title',
      'SEO Description',
      'Google Shopping / Google Product Category',
      'Google Shopping / Gender',
      'Google Shopping / Age Group',
      'Google Shopping / MPN',
      'Google Shopping / AdWords Grouping',
      'Google Shopping / AdWords Labels',
      'Google Shopping / Condition',
      'Google Shopping / Custom Product',
      'Google Shopping / Custom Label 0',
      'Google Shopping / Custom Label 1',
      'Google Shopping / Custom Label 2',
      'Google Shopping / Custom Label 3',
      'Google Shopping / Custom Label 4',
      'Variant Image',
      'Variant Weight Unit',
      'Variant Tax Code',
      'Cost per item',
      'Status'
    ]);

    // Process each product
    for (const product of bulkResult.results) {
      if (!product.success || !product.data) {
        continue;
      }

      // Get variants for this product
      const productVariants = bulkResult.combinedVariants.filter(
        v => v.productUrl === product.url
      );

      if (productVariants.length === 0) {
        console.log(`⚠️ No variants found for ${product.url}`);
        continue;
      }

      const handle = this.createHandle(productVariants[0].productTitle);
      const title = productVariants[0].productTitle;
      const brand = productVariants[0].brand || defaultVendor;
      const category = productVariants[0].category || defaultProductType;
      const features = productVariants[0].features || [];
      
      // Create body HTML from features
      const bodyHtml = this.createBodyHTML(features, product.url);
      
      // Group variants by color for image mapping
      const colorGroups = this.groupVariantsByColor(productVariants);

      let isFirstVariant = true;
      let imagePosition = 1;

      // Generate rows for each color variant
      for (const [colorName, colorVariants] of Object.entries(colorGroups)) {
        const colorImages = colorVariants[0]?.images || [];

        // Generate rows for each size within this color
        for (let i = 0; i < colorVariants.length; i++) {
          const variant = colorVariants[i];
          const variantPrice = this.calculatePriceWithProfit(variant.price, profitMargin);
          const originalPrice = variant.price;

          // Variant image - first image for this color
          const variantImage = colorImages[0] || '';

          const row: string[] = [
            isFirstVariant ? handle : '', // Handle (only first row)
            isFirstVariant ? title : '', // Title (only first row)
            isFirstVariant ? bodyHtml : '', // Body (only first row)
            isFirstVariant ? brand : '', // Vendor (only first row)
            isFirstVariant ? category : '', // Product Category (only first row)
            isFirstVariant ? category : '', // Type (only first row)
            isFirstVariant ? this.generateTags(title, brand, category) : '', // Tags (only first row)
            isFirstVariant ? 'TRUE' : '', // Published (only first row)
            isFirstVariant ? 'Renk' : '', // Option1 Name (only first row)
            variant.color, // Option1 Value
            isFirstVariant ? 'Beden' : '', // Option2 Name (only first row)
            variant.size, // Option2 Value
            `${handle}-${variant.colorCode}-${variant.size}`, // Variant SKU
            '0', // Variant Grams
            'shopify', // Variant Inventory Tracker
            variant.inStock ? 'deny' : 'deny', // Variant Inventory Policy
            'manual', // Variant Fulfillment Service
            variantPrice.toFixed(2), // Variant Price
            originalPrice.toFixed(2), // Variant Compare At Price
            'TRUE', // Variant Requires Shipping
            'TRUE', // Variant Taxable
            '', // Variant Barcode
            isFirstVariant && i === 0 ? variantImage : '', // Image Src (product level - only first)
            isFirstVariant && i === 0 ? imagePosition.toString() : '', // Image Position
            isFirstVariant && i === 0 ? `${title} - ${variant.color}` : '', // Image Alt Text
            'FALSE', // Gift Card
            isFirstVariant ? title : '', // SEO Title
            isFirstVariant ? this.createSEODescription(title, brand, features) : '', // SEO Description
            '', '', '', '', '', '', '', '', '', '', '', '', '', // Google Shopping fields
            variantImage, // Variant Image (variant level)
            'kg', // Variant Weight Unit
            '', // Variant Tax Code
            originalPrice.toFixed(2), // Cost per item
            'active' // Status
          ];

          csvRows.push(row);
          
          if (isFirstVariant && i === 0) {
            imagePosition++;
          }
          
          isFirstVariant = false;
        }

        // Add additional images for this color (if any)
        if (colorImages.length > 1) {
          for (let imgIdx = 1; imgIdx < colorImages.length; imgIdx++) {
            const imageRow: string[] = new Array(csvRows[0].length).fill('');
            imageRow[0] = handle; // Handle
            imageRow[22] = colorImages[imgIdx]; // Image Src
            imageRow[23] = imagePosition.toString(); // Image Position
            imageRow[24] = `${title} - ${colorName} - ${imgIdx + 1}`; // Image Alt Text
            
            csvRows.push(imageRow);
            imagePosition++;
          }
        }
      }
    }

    // Convert to CSV string
    const csvContent = csvRows
      .map(row => row.map(cell => this.escapeCSVCell(cell)).join(','))
      .join('\n');

    console.log(`✅ CSV generated: ${csvRows.length - 1} rows`);
    return csvContent;
  }

  /**
   * Group variants by color for image mapping
   */
  private groupVariantsByColor(variants: BulkScrapeResult['combinedVariants']): Record<string, BulkScrapeResult['combinedVariants']> {
    const groups: Record<string, BulkScrapeResult['combinedVariants']> = {};
    
    for (const variant of variants) {
      const colorKey = variant.color || 'Default';
      if (!groups[colorKey]) {
        groups[colorKey] = [];
      }
      groups[colorKey].push(variant);
    }
    
    return groups;
  }

  /**
   * Create Shopify handle from title
   */
  private createHandle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Remove duplicate hyphens
      .substring(0, 255); // Shopify limit
  }

  /**
   * Create body HTML from features
   */
  private createBodyHTML(features: Array<{key: string, value: string}>, sourceUrl: string): string {
    if (features.length === 0) {
      return `<p>Ürün detayları için <a href="${sourceUrl}" target="_blank">buraya tıklayın</a>.</p>`;
    }

    let html = '<ul>\n';
    for (const feature of features) {
      html += `  <li><strong>${feature.key}:</strong> ${feature.value}</li>\n`;
    }
    html += '</ul>';
    
    return html;
  }

  /**
   * Create SEO description
   */
  private createSEODescription(title: string, brand: string, features: Array<{key: string, value: string}>): string {
    const featureText = features.slice(0, 3)
      .map(f => f.value)
      .join(', ');
    
    return `${brand} ${title}${featureText ? '. ' + featureText : ''}`.substring(0, 320);
  }

  /**
   * Generate tags
   */
  private generateTags(title: string, brand: string, category: string): string {
    const tags = [brand, category];
    
    // Extract keywords from title
    const keywords = title.split(/\s+/).filter(word => word.length > 3);
    tags.push(...keywords.slice(0, 5));
    
    return tags.join(', ');
  }

  /**
   * Calculate price with profit margin
   */
  private calculatePriceWithProfit(originalPrice: number, profitMargin: number): number {
    return originalPrice * (1 + profitMargin / 100);
  }

  /**
   * Escape CSV cell content
   */
  private escapeCSVCell(cell: string): string {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  }
}

// Export singleton instance
export const bulkCSVGenerator = new BulkCSVGenerator();
