/**
 * Price Movement API Routes
 * Provides endpoints for testing and managing enhanced price movement tracking
 */

import { Router } from 'express';
import { enhancedPriceMovementTracker } from './enhanced-price-movement-tracker';
import { db } from './db';
import { urlTracking, urlPriceHistory } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

/**
 * Test enhanced price movement notification
 * POST /api/price-movement/test
 */
router.post('/test', async (req, res) => {
  try {
    const { url, newPrice } = req.body;

    if (!url || !newPrice) {
      return res.status(400).json({
        success: false,
        error: 'URL ve newPrice parametreleri gerekli'
      });
    }

    // Check if URL exists in tracking
    const [trackingData] = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.url, url))
      .limit(1);

    if (!trackingData) {
      return res.status(404).json({
        success: false,
        error: 'URL tracking sisteminde bulunamadı'
      });
    }

    // Test the enhanced price movement tracker
    await enhancedPriceMovementTracker.trackPriceChange(url, parseFloat(newPrice));

    res.json({
      success: true,
      message: 'Enhanced price movement notification test completed',
      data: {
        url,
        currentPrice: trackingData.currentPrice,
        newPrice: parseFloat(newPrice),
        productTitle: trackingData.productTitle
      }
    });

  } catch (error) {
    console.error('❌ Price movement test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get price history for a URL
 * GET /api/price-movement/history/:url
 */
router.get('/history/:url', async (req, res) => {
  try {
    const { url } = req.params;
    const limit = parseInt(req.query.limit as string) || 30;

    // Decode URL
    const decodedUrl = decodeURIComponent(url);

    // Get price history
    const history = await db
      .select()
      .from(urlPriceHistory)
      .where(eq(urlPriceHistory.url, decodedUrl))
      .orderBy(desc(urlPriceHistory.recordedAt))
      .limit(limit);

    // Get current tracking data
    const [trackingData] = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.url, decodedUrl))
      .limit(1);

    res.json({
      success: true,
      data: {
        url: decodedUrl,
        productTitle: trackingData?.productTitle || 'Bilinmiyen Ürün',
        currentPrice: trackingData?.currentPrice || null,
        currency: trackingData?.currency || 'TL',
        history: history.map(item => ({
          price: parseFloat(item.price || '0'),
          previousPrice: parseFloat(item.previousPrice || '0'),
          changeAmount: parseFloat(item.changeAmount || '0'),
          changePercentage: parseFloat(item.changePercentage || '0'),
          recordedAt: item.recordedAt
        })),
        totalRecords: history.length
      }
    });

  } catch (error) {
    console.error('❌ Price history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get price movement statistics
 * GET /api/price-movement/stats/:url
 */
router.get('/stats/:url', async (req, res) => {
  try {
    const { url } = req.params;
    const decodedUrl = decodeURIComponent(url);

    // Get price history
    const history = await db
      .select()
      .from(urlPriceHistory)
      .where(eq(urlPriceHistory.url, decodedUrl))
      .orderBy(desc(urlPriceHistory.recordedAt))
      .limit(100);

    if (history.length === 0) {
      return res.json({
        success: true,
        data: {
          url: decodedUrl,
          message: 'No price history found',
          stats: null
        }
      });
    }

    // Calculate statistics
    const prices = history.map(h => parseFloat(h.price || '0'));
    const currentPrice = prices[0];
    const oldestPrice = prices[prices.length - 1];
    const highestPrice = Math.max(...prices);
    const lowestPrice = Math.min(...prices);
    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // Calculate trends
    const recent7Days = history.slice(0, Math.min(7, history.length));
    const recent30Days = history.slice(0, Math.min(30, history.length));

    const trend7Days = recent7Days.length > 1 ? 
      (prices[0] > parseFloat(recent7Days[recent7Days.length - 1].price || '0') ? 'up' : 'down') : 'stable';
    
    const trend30Days = recent30Days.length > 1 ? 
      (prices[0] > parseFloat(recent30Days[recent30Days.length - 1].price || '0') ? 'up' : 'down') : 'stable';

    // Volatility calculation
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i-1] - prices[i]) / prices[i]) * 100;
      changes.push(change);
    }
    const avgVolatility = changes.length > 0 ? changes.reduce((sum, c) => sum + c, 0) / changes.length : 0;
    const volatility = avgVolatility < 2 ? 'low' : avgVolatility < 5 ? 'medium' : 'high';

    res.json({
      success: true,
      data: {
        url: decodedUrl,
        stats: {
          currentPrice,
          oldestPrice,
          highestPrice,
          lowestPrice,
          averagePrice: Math.round(averagePrice * 100) / 100,
          totalChange: ((currentPrice - oldestPrice) / oldestPrice * 100).toFixed(2),
          trend7Days,
          trend30Days,
          volatility,
          avgVolatility: avgVolatility.toFixed(2),
          totalRecords: history.length,
          trackingPeriod: {
            from: history[history.length - 1].recordedAt,
            to: history[0].recordedAt
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Price stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Simulate price change for testing
 * POST /api/price-movement/simulate
 */
router.post('/simulate', async (req, res) => {
  try {
    const { url, priceChanges } = req.body;

    if (!url || !Array.isArray(priceChanges)) {
      return res.status(400).json({
        success: false,
        error: 'URL ve priceChanges array parametreleri gerekli'
      });
    }

    // Check if URL exists
    const [trackingData] = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.url, url))
      .limit(1);

    if (!trackingData) {
      return res.status(404).json({
        success: false,
        error: 'URL tracking sisteminde bulunamadı'
      });
    }

    const results = [];

    // Simulate each price change
    for (const newPrice of priceChanges) {
      console.log(`🧪 Simulating price change: ${url} -> ${newPrice} TL`);
      
      await enhancedPriceMovementTracker.trackPriceChange(url, parseFloat(newPrice));
      
      // Update tracking data for next simulation
      await db
        .update(urlTracking)
        .set({
          previousPrice: trackingData.currentPrice,
          currentPrice: newPrice.toString(),
          lastPriceChange: new Date(),
          updatedAt: new Date()
        })
        .where(eq(urlTracking.url, url));

      results.push({
        newPrice: parseFloat(newPrice),
        timestamp: new Date().toISOString()
      });

      // Wait a bit between simulations
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.json({
      success: true,
      message: `${priceChanges.length} price change simulation completed`,
      data: {
        url,
        productTitle: trackingData.productTitle,
        simulations: results
      }
    });

  } catch (error) {
    console.error('❌ Price simulation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export { router as priceMovementApiRouter };