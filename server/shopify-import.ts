import { db } from './db';
import { products, productVariants } from '../shared/schema';
import * as fs from 'fs';
import * as path from 'path';

interface ShopifyProduct {
  handle: string;
  title: string;
  vendor: string;
  shopifyProductId?: string;
  price: number;
  compareAtPrice?: number;
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  imageSrc?: string;
  tags?: string;
  sku?: string;
}

export class ShopifyImporter {
  async importFromCSV(filePath: string): Promise<{ success: boolean; imported: number; message: string }> {
    try {
      console.log('📊 Starting Shopify CSV import...');
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV file appears to be empty or invalid');
      }

      const headers = this.parseCSVLine(lines[0]);
      console.log(`📋 Found ${headers.length} columns in CSV`);
      
      // Find required column indexes
      const handleIndex = headers.indexOf('Handle');
      const titleIndex = headers.indexOf('Title');
      const vendorIndex = headers.indexOf('Vendor');
      const priceIndex = headers.indexOf('Variant Price');
      const compareAtPriceIndex = headers.indexOf('Variant Compare At Price');
      const option1NameIndex = headers.indexOf('Option1 Name');
      const option1ValueIndex = headers.indexOf('Option1 Value');
      const option2NameIndex = headers.indexOf('Option2 Name');
      const option2ValueIndex = headers.indexOf('Option2 Value');
      const imageSrcIndex = headers.indexOf('Image Src');
      const tagsIndex = headers.indexOf('Tags');
      const skuIndex = headers.indexOf('Variant SKU');

      if (handleIndex === -1 || titleIndex === -1 || priceIndex === -1) {
        throw new Error('Required columns (Handle, Title, Variant Price) not found in CSV');
      }

      let imported = 0;
      let currentProductHandle = '';
      let currentProductId: number | null = null;
      const processedProducts = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        try {
          const row = this.parseCSVLine(lines[i]);
          
          if (row.length < headers.length - 10) { // Allow some flexibility
            continue; // Skip malformed rows
          }

          const handle = row[handleIndex]?.trim();
          const title = row[titleIndex]?.trim();
          const vendor = row[vendorIndex]?.trim() || 'Unknown';
          const price = parseFloat(row[priceIndex]?.replace(/[^\d.-]/g, '') || '0');
          const compareAtPrice = parseFloat(row[compareAtPriceIndex]?.replace(/[^\d.-]/g, '') || '0');
          const option1Name = row[option1NameIndex]?.trim();
          const option1Value = row[option1ValueIndex]?.trim();
          const option2Name = row[option2NameIndex]?.trim();
          const option2Value = row[option2ValueIndex]?.trim();
          const imageSrc = row[imageSrcIndex]?.trim();
          const tags = row[tagsIndex]?.trim();
          const sku = row[skuIndex]?.trim();

          if (!handle || !title || price <= 0) {
            continue; // Skip rows without essential data
          }

          // Check if this is a new product or a variant of existing product
          if (handle !== currentProductHandle) {
            // New product
            if (!processedProducts.has(handle)) {
              console.log(`📦 Processing product: ${title}`);
              
              // Try to extract Trendyol URL from tags or generate placeholder
              const trendyolUrl = this.extractTrendyolUrl(tags) || `https://www.trendyol.com/placeholder/${handle}`;
              
              // Calculate original Trendyol price (reverse 15% markup)
              const originalPrice = Math.round((price / 1.15) * 100) / 100;
              
              const [newProduct] = await db.insert(products).values({
                title,
                brand: vendor,
                trendyolUrl,
                trendyolProductId: handle,
                shopifyProductId: handle, // Using handle as Shopify ID for now
                description: `${vendor} ${title}`,
                category: 'Imported',
                images: imageSrc ? [imageSrc] : [],
                features: { tags: tags || '', imported: true },
                colorOptions: option1Name === 'Renk' && option1Value ? [option1Value] : [],
                sizeOptions: (option1Name === 'Beden' || option2Name === 'Beden') && 
                            (option1Value || option2Value) ? [option1Value || option2Value] : [],
                profitMargin: '15.00'
              }).returning();

              currentProductId = newProduct.id;
              currentProductHandle = handle;
              processedProducts.add(handle);
              imported++;
            }
          }

          // Add variant if we have a valid product
          if (currentProductId) {
            const color = option1Name === 'Renk' ? option1Value || 'Varsayılan' : 
                         option2Name === 'Renk' ? option2Value || 'Varsayılan' : 'Varsayılan';
            const size = option1Name === 'Beden' ? option1Value || 'Tek Beden' :
                        option2Name === 'Beden' ? option2Value || 'Tek Beden' : 'Tek Beden';

            // Calculate original Trendyol price for variant
            const originalVariantPrice = Math.round((price / 1.15) * 100) / 100;

            await db.insert(productVariants).values({
              productId: currentProductId,
              color,
              size,
              sku: sku || `${handle}-${color}-${size}`,
              trendyolPrice: originalVariantPrice.toString(),
              shopifyPrice: price.toString(),
              stockCount: 10, // Default stock
              inStock: true
            });
          }

        } catch (rowError) {
          console.error(`❌ Error processing row ${i}:`, rowError);
          continue; // Skip problematic rows
        }
      }

      console.log(`✅ Successfully imported ${imported} products from Shopify CSV`);
      
      return {
        success: true,
        imported,
        message: `Successfully imported ${imported} products with variants into memory system`
      };

    } catch (error) {
      console.error('❌ Shopify import failed:', error);
      return {
        success: false,
        imported: 0,
        message: `Import failed: ${error.message}`
      };
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }

    // Add the last field
    result.push(current.trim());
    return result;
  }

  private extractTrendyolUrl(tags: string): string | null {
    if (!tags) return null;
    
    // Look for trendyol URL in tags
    const urlMatch = tags.match(/https?:\/\/(?:www\.)?trendyol\.com\/[^\s,]+/);
    return urlMatch ? urlMatch[0] : null;
  }

  async getImportStats(): Promise<{ totalProducts: number; totalVariants: number }> {
    const totalProducts = await db.select().from(products);
    const totalVariants = await db.select().from(productVariants);
    
    return {
      totalProducts: totalProducts.length,
      totalVariants: totalVariants.length
    };
  }
}

export const shopifyImporter = new ShopifyImporter();