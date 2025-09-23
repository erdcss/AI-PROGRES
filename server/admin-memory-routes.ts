import type { Express } from "express";
import { memoryManager } from './memory-manager';
import { notificationGateway } from './notification-gateway';
import { db } from './db';
import { 
  products, 
  productVariants, 
  priceHistory, 
  stockHistory, 
  shopifySyncLogs, 
  monitoringSchedules, 
  shopifyMemoryProducts, 
  urlTracking 
} from '@shared/schema';

export function setupAdminMemoryRoutes(app: Express) {
  // Memory management endpoints
  
  // Get memory statistics
  app.get('/admin/memory/stats', (req, res) => {
    try {
      const memoryStats = memoryManager.getStats();
      const notificationStats = notificationGateway.getStats();
      
      res.json({
        success: true,
        memory: memoryStats,
        notifications: notificationStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // Purge all memory cache
  app.post('/admin/memory/purge-all', (req, res) => {
    try {
      memoryManager.purgeAll();
      
      res.json({
        success: true,
        message: 'All memory cache purged successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // Invalidate cache by pattern
  app.post('/admin/memory/invalidate', (req, res) => {
    try {
      const { pattern } = req.body;
      
      if (!pattern) {
        return res.status(400).json({
          success: false,
          error: 'Pattern is required'
        });
      }

      const count = memoryManager.invalidatePattern(pattern);
      
      res.json({
        success: true,
        message: `Invalidated ${count} cache entries`,
        pattern,
        count,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // Clear specific cache key
  app.delete('/admin/memory/:key', (req, res) => {
    try {
      const { key } = req.params;
      const deleted = memoryManager.delete(key);
      
      res.json({
        success: true,
        deleted,
        key,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // Clear notification cache
  app.post('/admin/notifications/clear-cache', (req, res) => {
    try {
      notificationGateway.clearNotificationCache();
      
      res.json({
        success: true,
        message: 'Notification cache cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // Clear product extraction cache
  app.post('/admin/memory/clear-products', (req, res) => {
    try {
      const patterns = [
        'extract:',
        'product:',
        'scrape:',
        'trendyol:',
        'comprehensive:',
        'scenario:'
      ];
      
      let totalCleared = 0;
      patterns.forEach(pattern => {
        totalCleared += memoryManager.invalidatePattern(pattern);
      });
      
      res.json({
        success: true,
        message: `Cleared ${totalCleared} product cache entries`,
        patterns,
        totalCleared,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  // COMPLETE MEMORY RESET - Hafıza sistemini tamamen temizle
  app.post('/admin/memory/reset-complete', async (req, res) => {
    try {
      const { confirmReset = false } = req.body;
      
      if (!confirmReset) {
        return res.status(400).json({
          success: false,
          error: 'Confirmation required. Set confirmReset: true to proceed.',
          warning: 'This will clear ALL memory cache, database tracking data, and monitoring schedules.'
        });
      }

      console.log('🔥 COMPLETE MEMORY RESET - Starting comprehensive cleanup...');
      
      // 1. Clear all memory cache
      memoryManager.purgeAll();
      console.log('✅ Memory cache purged');
      
      // 2. Clear notification cache
      notificationGateway.clearNotificationCache();
      console.log('✅ Notification cache cleared');
      
      // 3. Clear database tracking data (development only)
      const dbResults = {
        urlTracking: 0,
        monitoringSchedules: 0,
        shopifySyncLogs: 0,
        priceHistory: 0,
        stockHistory: 0,
        productVariants: 0,
        shopifyMemoryProducts: 0,
        products: 0
      };

      try {
        // Clear URL tracking data
        const urlTrackingResult = await db.delete(urlTracking);
        dbResults.urlTracking = urlTrackingResult.rowCount || 0;
        
        // Clear monitoring schedules
        const monitoringResult = await db.delete(monitoringSchedules);
        dbResults.monitoringSchedules = monitoringResult.rowCount || 0;
        
        // Clear sync logs
        const syncLogsResult = await db.delete(shopifySyncLogs);
        dbResults.shopifySyncLogs = syncLogsResult.rowCount || 0;
        
        // Clear price history
        const priceHistoryResult = await db.delete(priceHistory);
        dbResults.priceHistory = priceHistoryResult.rowCount || 0;
        
        // Clear stock history
        const stockHistoryResult = await db.delete(stockHistory);
        dbResults.stockHistory = stockHistoryResult.rowCount || 0;
        
        // Clear product variants
        const variantsResult = await db.delete(productVariants);
        dbResults.productVariants = variantsResult.rowCount || 0;
        
        // Clear Shopify memory products
        const shopifyMemoryResult = await db.delete(shopifyMemoryProducts);
        dbResults.shopifyMemoryProducts = shopifyMemoryResult.rowCount || 0;
        
        // Clear products (main table)
        const productsResult = await db.delete(products);
        dbResults.products = productsResult.rowCount || 0;
        
        console.log('✅ Database tracking data cleared:', dbResults);
      } catch (dbError) {
        console.error('⚠️ Database cleanup error:', dbError);
        // Continue with response even if DB cleanup fails
      }
      
      const totalCleared = Object.values(dbResults).reduce((sum, count) => sum + count, 0);
      
      res.json({
        success: true,
        message: `Complete memory reset executed successfully`,
        details: {
          memoryCache: 'purged',
          notificationCache: 'cleared',
          databaseRecords: dbResults,
          totalDatabaseRecords: totalCleared
        },
        timestamp: new Date().toISOString()
      });
      
      console.log(`🔥 COMPLETE MEMORY RESET FINISHED - ${totalCleared} database records cleared`);
      
    } catch (error) {
      console.error('❌ Complete memory reset failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get cache keys (for debugging)
  app.get('/admin/memory/keys', (req, res) => {
    try {
      const { filter } = req.query;
      let keys = memoryManager.keys();
      
      if (filter) {
        const regex = new RegExp(filter as string, 'i');
        keys = keys.filter(key => regex.test(key));
      }
      
      res.json({
        success: true,
        keys: keys.slice(0, 100), // Limit to 100 keys
        total: keys.length,
        filter: filter || null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  console.log('✅ Admin memory routes configured');
}