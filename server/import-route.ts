import { Router } from 'express';
import { shopifyImporter } from './shopify-import';
import * as path from 'path';

const router = Router();

// Import Shopify products from CSV
router.post('/api/import/shopify', async (req, res) => {
  try {
    console.log('📊 Shopify import request received');
    
    // Look for the uploaded CSV file
    const csvPath = path.join(process.cwd(), 'attached_assets', 'products_export_1_1750859850919.csv');
    
    console.log(`📂 Looking for CSV file at: ${csvPath}`);
    
    const result = await shopifyImporter.importFromCSV(csvPath);
    
    if (result.success) {
      // Send Telegram notification
      const { sendTelegramNotification } = await import('./telegram-integration');
      await sendTelegramNotification(
        `📊 SHOPIFY ÜRÜN İTHALATI TAMAMLANDI\n\n` +
        `✅ ${result.imported} ürün başarıyla hafızaya eklendi\n` +
        `🔄 Bu ürünler artık günlük izleme sistemine dahil\n` +
        `📅 12:00'da fiyat/stok kontrolleri başlayacak\n\n` +
        `Sistem hazır!`
      );
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Import route error:', error);
    res.status(500).json({
      success: false,
      imported: 0,
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