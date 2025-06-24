import { Router } from 'express';
import { memorySystem } from './memory-system';
import { shopifyIntegration } from './shopify-integration';
import { monitoringService } from './monitoring-service';
import { storage } from './storage';

const router = Router();

// Hafıza sistemi API endpoints
router.get('/api/memory/stats', async (req, res) => {
  try {
    const stats = await storage.getMemoryStats();
    const monitoringStats = await monitoringService.getMonitoringStats();
    
    res.json({
      success: true,
      memory: stats,
      monitoring: monitoringStats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tüm ürünleri getir
router.get('/api/memory/products', async (req, res) => {
  try {
    const products = await memorySystem.getActiveProducts();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ürün detaylarını getir
router.get('/api/memory/product/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await memorySystem.getProduct(productId);
    const variants = await memorySystem.getProductVariants(productId);
    
    res.json({ 
      success: true, 
      product,
      variants
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ürün varyant geçmişi
router.get('/api/memory/variant/:id/history', async (req, res) => {
  try {
    const variantId = parseInt(req.params.id);
    const priceHistory = await memorySystem.getPriceHistory(variantId);
    const stockHistory = await memorySystem.getStockHistory(variantId);
    
    res.json({ 
      success: true, 
      priceHistory,
      stockHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Monitoring endpoints
router.post('/api/monitoring/start', async (req, res) => {
  try {
    monitoringService.start();
    res.json({ success: true, message: 'Monitoring başlatıldı' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/monitoring/stop', async (req, res) => {
  try {
    monitoringService.stop();
    res.json({ success: true, message: 'Monitoring durduruldu' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/monitoring/add', async (req, res) => {
  try {
    const { url } = req.body;
    const added = await monitoringService.addProductToMonitoring(url);
    
    if (added) {
      res.json({ success: true, message: 'Ürün izlemeye eklendi' });
    } else {
      res.status(400).json({ success: false, error: 'Ürün eklenemedi' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/monitoring/remove/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const removed = await monitoringService.removeProductFromMonitoring(productId);
    
    if (removed) {
      res.json({ success: true, message: 'Ürün izlemeden çıkarıldı' });
    } else {
      res.status(400).json({ success: false, error: 'Ürün çıkarılamadı' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shopify integration endpoints
router.get('/api/shopify/test', async (req, res) => {
  try {
    const connected = await shopifyIntegration.testConnection();
    res.json({ success: connected, connected });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/shopify/sync/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const product = await memorySystem.getProduct(productId);
    const variants = await memorySystem.getProductVariants(productId);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }

    let shopifyId;
    if (product.shopifyProductId) {
      // Güncelle
      for (const variant of variants) {
        await shopifyIntegration.updateProductPrice(product, variant);
        await shopifyIntegration.updateProductStock(product, variant);
      }
      shopifyId = product.shopifyProductId;
    } else {
      // Yeni oluştur
      shopifyId = await shopifyIntegration.createProduct(product, variants);
    }

    res.json({ 
      success: !!shopifyId, 
      shopifyProductId: shopifyId,
      message: shopifyId ? 'Shopify senkronizasyonu başarılı' : 'Senkronizasyon başarısız'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk sync all products
router.post('/api/shopify/sync-all', async (req, res) => {
  try {
    const products = await memorySystem.getActiveProducts();
    let syncedCount = 0;
    let errors = 0;

    for (const product of products) {
      try {
        const variants = await memorySystem.getProductVariants(product.id);
        
        if (product.shopifyProductId) {
          // Güncelle
          for (const variant of variants) {
            await shopifyIntegration.updateProductPrice(product, variant);
            await shopifyIntegration.updateProductStock(product, variant);
          }
        } else {
          // Yeni oluştur
          await shopifyIntegration.createProduct(product, variants);
        }
        
        syncedCount++;
      } catch (error) {
        console.error(`Sync hatası - ${product.title}:`, error);
        errors++;
      }
    }

    res.json({ 
      success: true, 
      syncedCount,
      errors,
      message: `${syncedCount} ürün senkronize edildi, ${errors} hata`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;