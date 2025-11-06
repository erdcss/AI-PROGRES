import { healthCheckManager } from './health-check-manager';
import { failoverExtractionService } from './failover-extraction-service';
import { db } from './db';
import { urlTracking } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { broadcastToClients } from './websocket-server';

/**
 * Failover Manager
 * Ana izleme sistemi ile yedek sistemi koordine eder
 */
export class FailoverManager {
  private static instance: FailoverManager;
  
  private constructor() {}
  
  public static getInstance(): FailoverManager {
    if (!FailoverManager.instance) {
      FailoverManager.instance = new FailoverManager();
    }
    return FailoverManager.instance;
  }

  /**
   * Extraction işlemi yap - health check ile beraber
   */
  async executeWithFailover(
    url: string,
    primaryExtractor: () => Promise<any>
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    strategy: string;
    failoverActivated: boolean;
  }> {
    try {
      // URL tracking kaydını al
      const [tracking] = await db
        .select()
        .from(urlTracking)
        .where(eq(urlTracking.url, url))
        .limit(1);
      
      if (!tracking) {
        return {
          success: false,
          error: 'URL not found in tracking system',
          strategy: 'unknown',
          failoverActivated: false
        };
      }
      
      const currentStrategy = tracking.extractionStrategy || 'puppeteer';
      const isFailoverMode = tracking.failoverMode === 'failover';
      
      // Eğer failover modundaysa, alternatif strateji kullan
      if (isFailoverMode && currentStrategy !== 'puppeteer') {
        console.log(`🔄 FAILOVER MODE: Using ${currentStrategy} strategy for ${url}`);
        return await this.executeFailoverExtraction(url, currentStrategy);
      }
      
      // Normal mod: Primary extractor'ı dene
      try {
        console.log(`🎯 Primary extraction attempt: ${url}`);
        const result = await primaryExtractor();
        
        // Başarılı olursa health kaydını güncelle
        await healthCheckManager.recordSuccess(url, 'puppeteer');
        
        return {
          success: true,
          data: result,
          strategy: 'puppeteer',
          failoverActivated: false
        };
        
      } catch (primaryError) {
        console.error(`❌ Primary extraction failed: ${primaryError}`);
        
        // Başarısız olursa health kaydını güncelle ve failover kararını al
        const failoverDecision = await healthCheckManager.recordFailure(url, primaryError);
        
        if (failoverDecision.shouldFailover) {
          console.log(`🚨 FAILOVER TRIGGERED: Switching to ${failoverDecision.nextStrategy}`);
          
          // WebSocket bildirimi gönder
          broadcastToClients('shopify:failover-activated', {
            url,
            oldStrategy: 'puppeteer',
            newStrategy: failoverDecision.nextStrategy,
            reason: failoverDecision.reason,
            timestamp: new Date().toISOString()
          });
          
          // Failover extraction yap
          return await this.executeFailoverExtraction(url, failoverDecision.nextStrategy);
        }
        
        // Failover tetiklenmedi ama hata var
        return {
          success: false,
          error: primaryError instanceof Error ? primaryError.message : 'Unknown error',
          strategy: 'puppeteer',
          failoverActivated: false
        };
      }
      
    } catch (error) {
      console.error('❌ Failover manager error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        strategy: 'unknown',
        failoverActivated: false
      };
    }
  }

  /**
   * Failover extraction işlemi
   */
  private async executeFailoverExtraction(
    url: string,
    strategy: string
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    strategy: string;
    failoverActivated: boolean;
  }> {
    try {
      console.log(`🔄 Executing failover extraction with ${strategy}`);
      
      const result = await failoverExtractionService.extractWithStrategy(url, strategy);
      
      if (result.success) {
        // Başarılı olursa health kaydını güncelle
        await healthCheckManager.recordSuccess(url, strategy);
        
        return {
          success: true,
          data: result.data,
          strategy,
          failoverActivated: true
        };
      } else {
        // Başarısız olursa bir sonraki stratejiye geç
        const failoverDecision = await healthCheckManager.recordFailure(url, result.error);
        
        if (failoverDecision.shouldFailover && failoverDecision.nextStrategy !== strategy) {
          console.log(`⚠️ ${strategy} failed, trying ${failoverDecision.nextStrategy}`);
          
          // Recursive call ile bir sonraki stratejiyi dene
          return await this.executeFailoverExtraction(url, failoverDecision.nextStrategy);
        }
        
        return {
          success: false,
          error: result.error || 'Extraction failed',
          strategy,
          failoverActivated: true
        };
      }
      
    } catch (error) {
      console.error(`❌ Failover extraction failed for ${strategy}:`, error);
      
      await healthCheckManager.recordFailure(url, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        strategy,
        failoverActivated: true
      };
    }
  }

  /**
   * Manuel failover tetikleme
   */
  async triggerManualFailover(url: string, reason: string): Promise<void> {
    await healthCheckManager.triggerManualFailover(url, reason);
    
    // WebSocket bildirimi
    const [tracking] = await db
      .select()
      .from(urlTracking)
      .where(eq(urlTracking.url, url))
      .limit(1);
    
    if (tracking) {
      broadcastToClients('shopify:failover-activated', {
        url,
        oldStrategy: 'puppeteer',
        newStrategy: tracking.extractionStrategy || 'mobile-api',
        reason: `Manuel failover: ${reason}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Manuel recovery tetikleme
   */
  async triggerManualRecovery(url: string): Promise<void> {
    await healthCheckManager.triggerManualRecovery(url);
    
    // WebSocket bildirimi
    broadcastToClients('shopify:failover-recovered', {
      url,
      strategy: 'puppeteer',
      message: 'Manuel recovery: Primary moda döndü',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Tüm URL'ler için health durumunu kontrol et
   */
  async checkAllHealth(): Promise<{
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    failover: number;
  }> {
    const allHealth = await healthCheckManager.getAllHealthStatuses();
    
    return {
      total: allHealth.length,
      healthy: allHealth.filter(h => h.healthStatus === 'healthy').length,
      degraded: allHealth.filter(h => h.healthStatus === 'degraded').length,
      unhealthy: allHealth.filter(h => h.healthStatus === 'unhealthy').length,
      failover: allHealth.filter(h => h.healthStatus === 'failover').length
    };
  }
}

export const failoverManager = FailoverManager.getInstance();
