import { Router } from 'express';
import * as path from 'path';

const router = Router();

console.log('📊 Import routes initialized');

// Process CSV data sent from external script
router.post('/api/import/process-csv', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'CSV processing endpoint ready'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Processing failed: ${error.message}`
    });
  }
});

// Import all Shopify products from CSV
router.post('/api/import/shopify', async (req, res) => {
  try {
    console.log('📊 Full Shopify import request received');
    
    // Start import process asynchronously
    const { importAllShopifyProducts } = await import('./full-shopify-import');
    
    // Don't await - let it run in background
    importAllShopifyProducts().then(result => {
      console.log('Import completed:', result);
    }).catch(error => {
      console.error('Import failed:', error);
    });
    
    res.json({
      success: true,
      message: 'Full Shopify import started, progress will be sent via Telegram'
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
    const { db } = await import('./db');
    const { products, productVariants } = await import('../shared/schema');
    
    const totalProducts = await db.select().from(products);
    const totalVariants = await db.select().from(productVariants);
    
    res.json({
      success: true,
      totalProducts: totalProducts.length,
      totalVariants: totalVariants.length
    });
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get stats: ${error.message}`
    });
  }
});

// Test monitoring endpoint
router.post('/api/test-monitor', async (req, res) => {
  try {
    console.log('🔍 Test monitoring request received');
    
    // Import and run simple test monitoring
    const { runTestMonitoring } = await import('./simple-test-monitor');
    const result = await runTestMonitoring();
    
    res.json({
      success: true,
      message: 'Test monitoring tamamlandı, Telegram raporunu kontrol edin',
      ...result
    });
    
  } catch (error) {
    console.error('❌ Test monitoring error:', error);
    res.status(500).json({
      success: false,
      message: `Test başarısız: ${error.message}`
    });
  }
});

export default router;