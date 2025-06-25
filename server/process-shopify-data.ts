import { db } from './db';
import { products, productVariants } from '../shared/schema';
import * as fs from 'fs';

export async function processShopifyCSVData() {
  try {
    console.log('📊 Processing Shopify CSV data...');
    
    const csvPath = '/home/runner/workspace/attached_assets/products_export_1_1750859850919.csv';
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    const processedProducts = new Set<string>();
    let imported = 0;
    
    // Process first 50 products for initial import
    for (let i = 1; i < Math.min(lines.length, 50); i++) {
      try {
        const line = lines[i];
        const parts = line.split(',');
        
        if (parts.length < 25) continue;
        
        const handle = parts[0]?.replace(/"/g, '').trim();
        const title = parts[1]?.replace(/"/g, '').trim();
        const vendor = parts[4]?.replace(/"/g, '').trim() || 'Unknown';
        const priceStr = parts[23]?.replace(/"/g, '').replace(/[^\d.-]/g, '');
        const price = parseFloat(priceStr) || 0;
        
        if (!handle || !title || price <= 0 || processedProducts.has(handle)) {
          continue;
        }
        
        console.log(`Adding product: ${title} - ${price} TL`);
        
        // Calculate original Trendyol price (reverse 15% markup)
        const originalPrice = Math.round((price / 1.15) * 100) / 100;
        
        // Insert product into database
        const [newProduct] = await db.insert(products).values({
          title: title.substring(0, 200),
          brand: vendor,
          trendyolUrl: `https://www.trendyol.com/imported/${handle}`,
          trendyolProductId: handle,
          shopifyProductId: handle,
          description: `${vendor} ${title}`,
          category: 'Imported from Shopify',
          images: [],
          features: { imported: true, vendor, originalShopifyPrice: price },
          colorOptions: [],
          sizeOptions: [],
          profitMargin: '15.00'
        }).returning();
        
        // Add default variant
        await db.insert(productVariants).values({
          productId: newProduct.id,
          color: 'Varsayılan',
          size: 'Tek Beden',
          sku: `${handle}-default`,
          trendyolPrice: originalPrice.toString(),
          shopifyPrice: price.toString(),
          stockCount: 10,
          inStock: true
        });
        
        processedProducts.add(handle);
        imported++;
        
      } catch (rowError) {
        console.error(`Error processing row ${i}:`, rowError);
        continue;
      }
    }
    
    console.log(`✅ Successfully imported ${imported} products from Shopify CSV`);
    
    return {
      success: true,
      imported,
      totalLines: lines.length,
      message: `Successfully imported ${imported} Shopify products to memory system`
    };
    
  } catch (error) {
    console.error('❌ CSV processing error:', error);
    return {
      success: false,
      imported: 0,
      message: `Processing failed: ${error.message}`
    };
  }
}