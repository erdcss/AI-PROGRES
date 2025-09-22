import type { Express } from "express";
import { memoryManager } from './memory-manager';
import { notificationGateway } from './notification-gateway';

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