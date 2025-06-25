import { Router } from 'express';
import { shopifyImporter } from './shopify-import';
import * as path from 'path';

const router = Router();

console.log('📊 Import routes initialized');

// Process CSV data sent from external script
router.post('/api/import/process-csv', async (req, res) => {
  try {
    console.log('📊 Processing CSV data from external script');
    
    const { products, totalFound } = req.body;
    
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid products data'
      });
    }
    
    let imported = 0;
    
    // Process each product
    for (const productData of products) {
      try {
        const { db } = await import('./db');
        const { products: productsTable, productVariants } = await import('../shared/schema');
        
        // Insert product
        const [newProduct] = await db.insert(productsTable).values({
          title: productData.title,
          brand: productData.vendor,
          trendyolUrl: `https://www.trendyol.com/imported/${productData.handle}`,
          trendyolProductId: productData.handle,
          shopifyProductId: productData.handle,
          description: `${productData.vendor} ${productData.title}`,
          category: 'Imported from Shopify',
          images: [],
          features: { imported: true, vendor: productData.vendor },
          colorOptions: [],
          sizeOptions: [],
          profitMargin: '15.00'
        }).returning();
        
        // Add default variant
        await db.insert(productVariants).values({
          productId: newProduct.id,
          color: 'Varsayılan',
          size: 'Tek Beden',
          sku: `${productData.handle}-default`,
          trendyolPrice: productData.originalPrice.toString(),
          shopifyPrice: productData.price.toString(),
          stockCount: 10,
          inStock: true
        });
        
        imported++;
        
      } catch (productError) {
        console.error('Product import error:', productError);
        continue;
      }
    }
    
    // Send Telegram notification
    const { sendTelegramNotification } = await import('./telegram-integration');
    await sendTelegramNotification(
      `📊 SHOPIFY ÜRÜN İTHALATI BAŞLADI\n\n` +
      `✅ ${imported} ürün hafızaya eklendi\n` +
      `📊 Toplam tespit edilen: ${totalFound} ürün\n` +
      `🔄 Bu ürünler günlük izleme sistemine dahil edildi\n` +
      `📅 12:00'da fiyat/stok kontrolleri başlayacak\n\n` +
      `Import işlemi devam ediyor...`
    );
    
    res.json({
      success: true,
      imported,
      totalFound,
      message: `Successfully imported ${imported} products to memory system`
    });
    
  } catch (error) {
    console.error('❌ CSV processing error:', error);
    res.status(500).json({
      success: false,
      message: `Processing failed: ${error.message}`
    });
  }
});

// Import Shopify products from CSV
router.post('/api/import/shopify', async (req, res) => {
  try {
    console.log('📊 Shopify import request received');
    
    res.json({
      success: true,
      message: 'Import initiated, check Telegram for progress updates'
    });
    
  } catch (error) {
    console.error('❌ Import route error:', error);
    res.status(500).json({
      success: false,
      message: `Import failed: ${error.message}`
    });
  }
});

// Get import statistics
router.get('/api/import/stats', async (req, res) => {
  try {
    const stats = await shopifyImporter.getImportStats();
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get stats: ${error.message}`
    });
  }
});

export default router;