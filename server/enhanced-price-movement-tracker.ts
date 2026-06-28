/**
 * Enhanced Price Movement Tracker with Detailed Telegram Notifications
 * Provides comprehensive price history analysis and trend reporting
 */

import { db } from './db';
import { urlTracking, urlPriceHistory } from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import TelegramBot from 'node-telegram-bot-api';

interface PriceMovementData {
  url: string;
  productTitle: string;
  currentPrice: number;
  previousPrice: number;
  originalPrice: number;
  currency: string;
  changeAmount: number;
  changePercentage: number;
  priceHistory: Array<{
    price: number;
    timestamp: Date;
    changeFromPrevious?: number;
    changePercentageFromPrevious?: number;
  }>;
  trends: {
    trend7Days: 'up' | 'down' | 'stable';
    trend30Days: 'up' | 'down' | 'stable';
    highestPrice: { price: number; date: Date };
    lowestPrice: { price: number; date: Date };
    volatility: 'low' | 'medium' | 'high';
  };
  recommendations: string[];
}

export class EnhancedPriceMovementTracker {
  private bot: TelegramBot | null = null;
  private chatId: string | null = null;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (token && chatId) {
      this.bot = new TelegramBot(token);
      this.chatId = chatId;
      console.log('📊 Enhanced Price Movement Tracker initialized');
    } else {
      console.log('ℹ️ price tracking telegram disabled / not used');
    }
  }

  /**
   * Track price change and send detailed movement analysis
   */
  async trackPriceChange(url: string, newPrice: number): Promise<void> {
    try {
      // Get current tracking data
      const [trackingData] = await db
        .select()
        .from(urlTracking)
        .where(eq(urlTracking.url, url))
        .limit(1);

      if (!trackingData) {
        console.log('⚠️ URL tracking data not found:', url);
        return;
      }

      const previousPrice = parseFloat(trackingData.currentPrice || '0');
      const originalPrice = parseFloat(trackingData.originalPrice || '0');

      // Only process if price actually changed
      if (Math.abs(newPrice - previousPrice) < 0.01) {
        return; // No significant price change
      }

      // Update current price in tracking
      await db
        .update(urlTracking)
        .set({
          currentPrice: newPrice.toString(),
          lastPriceChange: new Date(),
          priceChangePercent: ((newPrice - previousPrice) / previousPrice * 100).toFixed(2),
          updatedAt: new Date()
        })
        .where(eq(urlTracking.url, url));

      // Store in price history
      await this.storePriceHistory(url, newPrice, previousPrice);

      // Get comprehensive movement data
      const movementData = await this.getComprehensivePriceMovement(url, newPrice, previousPrice, originalPrice, trackingData);

      // Send detailed Telegram notification
      await this.sendDetailedPriceNotification(movementData);

      console.log(`📊 Price movement tracked: ${trackingData.productTitle} - ${previousPrice} TL → ${newPrice} TL`);

    } catch (error) {
      console.error('❌ Error tracking price change:', error);
    }
  }

  /**
   * Store price change in history table
   */
  private async storePriceHistory(url: string, newPrice: number, previousPrice: number): Promise<void> {
    try {
      // Get product title for the record
      const [trackingData] = await db
        .select({ productTitle: urlTracking.productTitle })
        .from(urlTracking)
        .where(eq(urlTracking.url, url))
        .limit(1);

      // Store in URL price history table
      await db
        .insert(urlPriceHistory)
        .values({
          url,
          price: newPrice.toString(),
          previousPrice: previousPrice.toString(),
          changeAmount: (newPrice - previousPrice).toString(),
          changePercentage: (((newPrice - previousPrice) / previousPrice) * 100).toFixed(2),
          productTitle: trackingData?.productTitle || null,
          currency: 'TL'
        });

      console.log(`💾 Price history stored: ${previousPrice} TL → ${newPrice} TL`);
    } catch (error) {
      console.error('❌ Error storing price history:', error);
    }
  }

  /**
   * Get comprehensive price movement analysis
   */
  private async getComprehensivePriceMovement(
    url: string, 
    currentPrice: number, 
    previousPrice: number, 
    originalPrice: number,
    trackingData: any
  ): Promise<PriceMovementData> {
    
    // Get price history for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const priceHistoryData = await this.getPriceHistoryForUrl(url, 30);

    // Calculate trends and statistics
    const trends = this.calculatePriceTrends(priceHistoryData, currentPrice);
    const recommendations = this.generateRecommendations(currentPrice, previousPrice, originalPrice, trends);

    return {
      url,
      productTitle: trackingData.productTitle || 'Bilinmeyen Ürün',
      currentPrice,
      previousPrice,
      originalPrice,
      currency: trackingData.currency || 'TL',
      changeAmount: currentPrice - previousPrice,
      changePercentage: ((currentPrice - previousPrice) / previousPrice) * 100,
      priceHistory: priceHistoryData,
      trends,
      recommendations
    };
  }

  /**
   * Get price history for a specific URL
   */
  private async getPriceHistoryForUrl(url: string, days: number = 30): Promise<Array<{
    price: number;
    timestamp: Date;
    changeFromPrevious?: number;
    changePercentageFromPrevious?: number;
  }>> {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      // Get price history from dedicated history table
      const historyData = await db
        .select({
          price: urlPriceHistory.price,
          timestamp: urlPriceHistory.recordedAt,
          previousPrice: urlPriceHistory.previousPrice
        })
        .from(urlPriceHistory)
        .where(and(
          eq(urlPriceHistory.url, url),
          gte(urlPriceHistory.recordedAt, daysAgo)
        ))
        .orderBy(desc(urlPriceHistory.recordedAt))
        .limit(50);

      return historyData.map((item, index) => {
        const price = parseFloat(item.price || '0');
        const previousPrice = parseFloat(item.previousPrice || '0');
        
        return {
          price,
          timestamp: item.timestamp,
          changeFromPrevious: index < historyData.length - 1 ? price - previousPrice : undefined,
          changePercentageFromPrevious: index < historyData.length - 1 && previousPrice > 0 
            ? ((price - previousPrice) / previousPrice) * 100 
            : undefined
        };
      });
    } catch (error) {
      console.error('❌ Error getting price history:', error);
      return [];
    }
  }

  /**
   * Calculate price trends and statistics
   */
  private calculatePriceTrends(priceHistory: any[], currentPrice: number): PriceMovementData['trends'] {
    if (priceHistory.length === 0) {
      return {
        trend7Days: 'stable',
        trend30Days: 'stable',
        highestPrice: { price: currentPrice, date: new Date() },
        lowestPrice: { price: currentPrice, date: new Date() },
        volatility: 'low'
      };
    }

    const prices = priceHistory.map(h => h.price);
    const recent7Days = priceHistory.slice(0, Math.min(7, priceHistory.length));
    const allPrices = [...prices, currentPrice];

    // Calculate trends
    const trend7Days = this.calculateTrend(recent7Days.map(h => h.price), currentPrice);
    const trend30Days = this.calculateTrend(prices, currentPrice);

    // Find highest and lowest prices
    const highest = Math.max(...allPrices);
    const lowest = Math.min(...allPrices);
    
    const highestEntry = priceHistory.find(h => h.price === highest) || { price: highest, timestamp: new Date() };
    const lowestEntry = priceHistory.find(h => h.price === lowest) || { price: lowest, timestamp: new Date() };

    // Calculate volatility
    const volatility = this.calculateVolatility(prices);

    return {
      trend7Days,
      trend30Days,
      highestPrice: { price: highest, date: highestEntry.timestamp },
      lowestPrice: { price: lowest, date: lowestEntry.timestamp },
      volatility
    };
  }

  /**
   * Calculate price trend direction
   */
  private calculateTrend(prices: number[], currentPrice: number): 'up' | 'down' | 'stable' {
    if (prices.length === 0) return 'stable';
    
    const firstPrice = prices[prices.length - 1]; // Oldest price
    const changePercentage = ((currentPrice - firstPrice) / firstPrice) * 100;
    
    if (changePercentage > 2) return 'up';
    if (changePercentage < -2) return 'down';
    return 'stable';
  }

  /**
   * Calculate price volatility
   */
  private calculateVolatility(prices: number[]): 'low' | 'medium' | 'high' {
    if (prices.length < 2) return 'low';
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i-1]) / prices[i-1]) * 100;
      changes.push(change);
    }
    
    const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    
    if (avgChange < 2) return 'low';
    if (avgChange < 5) return 'medium';
    return 'high';
  }

  /**
   * Generate purchase recommendations
   */
  private generateRecommendations(
    currentPrice: number, 
    previousPrice: number, 
    originalPrice: number,
    trends: PriceMovementData['trends']
  ): string[] {
    const recommendations: string[] = [];
    const changePercentage = ((currentPrice - previousPrice) / previousPrice) * 100;
    const totalChangeFromOriginal = ((currentPrice - originalPrice) / originalPrice) * 100;

    // Price direction recommendations
    if (changePercentage < -5) {
      recommendations.push('📉 Önemli fiyat düşüşü - Satın alma fırsatı olabilir');
    } else if (changePercentage > 5) {
      recommendations.push('📈 Fiyat artışında - Beklemek daha uygun olabilir');
    }

    // Trend-based recommendations
    if (trends.trend7Days === 'down' && trends.trend30Days === 'down') {
      recommendations.push('📊 Genel düşüş trendi - Daha fazla düşüş beklenebilir');
    } else if (trends.trend7Days === 'up' && trends.trend30Days === 'up') {
      recommendations.push('📊 Genel yükseliş trendi - Fiyat daha da artabilir');
    }

    // Volatility recommendations
    if (trends.volatility === 'high') {
      recommendations.push('⚡ Yüksek volatilite - Bekleyip daha stabil dönem tercih edin');
    } else if (trends.volatility === 'low') {
      recommendations.push('🎯 Düşük volatilite - Stabil fiyat hareketi');
    }

    // Historical comparison
    const currentVsLowest = ((currentPrice - trends.lowestPrice.price) / trends.lowestPrice.price) * 100;
    const currentVsHighest = ((currentPrice - trends.highestPrice.price) / trends.highestPrice.price) * 100;

    if (currentVsLowest < 10) {
      recommendations.push('🎯 En düşük seviyeye yakın - İyi fırsat');
    } else if (currentVsHighest > -10) {
      recommendations.push('⚠️ En yüksek seviyeye yakın - Dikkatli olun');
    }

    if (recommendations.length === 0) {
      recommendations.push('📊 Normal fiyat hareketi - Satın alma kararı size kalmış');
    }

    return recommendations;
  }

  /**
   * Send detailed price notification via Telegram
   */
  private async sendDetailedPriceNotification(data: PriceMovementData): Promise<void> {
    if (!this.bot || !this.chatId) {
      console.log('📢 Telegram not configured for detailed notifications');
      return;
    }

    try {
      const message = this.formatDetailedPriceMessage(data);
      
      // Boş mesaj kontrolü - küçük değişimlerde bildirim gönderme
      if (!message || message.trim() === '') {
        console.log('📊 Mesaj boş - fiyat değişimi çok küçük, bildirim gönderilmiyor');
        return;
      }
      
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });

      console.log('📊 Detailed price notification sent via Telegram');
    } catch (error) {
      console.error('❌ Failed to send detailed Telegram notification:', error);
    }
  }

  /**
   * Format simple price notification message
   */
  private formatDetailedPriceMessage(data: PriceMovementData): string {
    // Sadece >%20 değişikliklerde yüksek öncelik bildirimi gönder
    const absChangePercentage = Math.abs(data.changePercentage);
    const isHighPriority = absChangePercentage >= 20;
    const isMediumPriority = absChangePercentage >= 10;

    // Küçük değişimleri görmezden gel
    if (absChangePercentage < 5) {
      console.log(`📊 Küçük fiyat değişimi (%${absChangePercentage.toFixed(1)}) - bildirim gönderilmiyor`);
      return '';
    }

    const direction = data.changeAmount > 0 ? '📈' : '📉';
    const changeText = data.changeAmount > 0 ? 'FİYAT ARTIŞI' : 'FİYAT DÜŞÜŞÜ';
    const priority = isHighPriority ? 'YÜKSEK ÖNCELİK' : isMediumPriority ? 'ORTA ÖNCELİK' : 'NORMAL';

    let message = `${direction} <b>${changeText} - ${priority}</b>\n\n`;
    
    // Ürün bilgisi (sadece isim)
    message += `📦 <b>Ürün:</b> ${data.productTitle.substring(0, 60)}${data.productTitle.length > 60 ? '...' : ''}\n\n`;
    
    // Fiyat değişimi (basit format)
    message += `💰 ${data.previousPrice.toFixed(2)} TL → ${data.currentPrice.toFixed(2)} TL\n`;
    message += `📊 Değişim: ${data.changeAmount > 0 ? '+' : ''}${data.changeAmount.toFixed(2)} TL (${data.changeAmount > 0 ? '+' : ''}${data.changePercentage.toFixed(1)}%)\n\n`;
    
    // Sadece yüksek öncelikli değişimlerde trend bilgisi ekle
    if (isHighPriority) {
      const trend7 = this.getTrendText(data.trends.trend7Days);
      message += `📈 7 günlük trend: ${trend7}\n\n`;
    }
    
    // Basit öneri (sadece 1 tane)
    if (data.changePercentage < -10) {
      message += `💡 Önemli fiyat düşüşü - satın alma fırsatı\n\n`;
    } else if (data.changePercentage > 15) {
      message += `⚠️ Fiyat hızla yükseliyor - beklemek daha uygun\n\n`;
    }
    
    message += `⏰ ${new Date().toLocaleTimeString('tr-TR')}`;
    
    return message;
  }

  /**
   * Helper methods for formatting
   */
  private getTrendText(trend: 'up' | 'down' | 'stable'): string {
    switch (trend) {
      case 'up': return 'Yükseliş';
      case 'down': return 'Düşüş';
      case 'stable': return 'Stabil';
    }
  }

  private getVolatilityText(volatility: 'low' | 'medium' | 'high'): string {
    switch (volatility) {
      case 'low': return 'Düşük';
      case 'medium': return 'Orta';
      case 'high': return 'Yüksek';
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('tr-TR');
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString('tr-TR');
  }
}

// Export singleton instance
export const enhancedPriceMovementTracker = new EnhancedPriceMovementTracker();