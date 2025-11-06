import { db } from './db';
import { urlTracking, monitoringHealth } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Health Check Manager
 * İzleme sisteminin sağlık durumunu kontrol eder ve failover kararlarını verir
 */
export class HealthCheckManager {
  private static instance: HealthCheckManager;
  
  // Failover eşik değerleri
  private readonly FAILURE_THRESHOLD = 3; // 3 ardışık hata sonrası failover
  private readonly DEGRADED_THRESHOLD = 2; // 2 ardışık hata sonrası degraded durumu
  private readonly RECOVERY_THRESHOLD = 5; // 5 ardışık başarı sonrası recovery
  private readonly SUCCESS_RATE_THRESHOLD = 80; // %80 başarı oranının altında degraded

  private constructor() {}

  public static getInstance(): HealthCheckManager {
    if (!HealthCheckManager.instance) {
      HealthCheckManager.instance = new HealthCheckManager();
    }
    return HealthCheckManager.instance;
  }

  /**
   * Başarılı check kaydı - Health durumunu güncelle
   */
  async recordSuccess(url: string, strategy: string): Promise<void> {
    try {
      // Health kaydını al veya oluştur
      const health = await this.getOrCreateHealth(url);
      
      const consecutiveSuccesses = health.consecutiveSuccesses + 1;
      const totalChecks = health.totalChecks + 1;
      const totalSuccesses = health.totalSuccesses + 1;
      const successRate = ((totalSuccesses / totalChecks) * 100).toFixed(2);
      
      // Health durumunu belirle
      let healthStatus = 'healthy';
      let isFailoverActive = health.isFailoverActive;
      
      // Auto-recovery kontrolü: 5 ardışık başarı sonrası primary moda dön
      if (health.isFailoverActive && consecutiveSuccesses >= this.RECOVERY_THRESHOLD) {
        healthStatus = 'healthy';
        isFailoverActive = false;
        console.log(`✅ AUTO-RECOVERY: ${url} - ${consecutiveSuccesses} ardışık başarı, primary moda dönülüyor`);
        
        // urlTracking'i de güncelle
        await db.update(urlTracking)
          .set({
            failoverMode: 'primary',
            consecutiveFailures: 0,
            extractionStrategy: 'puppeteer',
            updatedAt: new Date()
          })
          .where(eq(urlTracking.url, url));
      } else if (parseFloat(successRate) < this.SUCCESS_RATE_THRESHOLD) {
        healthStatus = 'degraded';
      }
      
      // Health kaydını güncelle
      await db.update(monitoringHealth)
        .set({
          healthStatus,
          lastSuccessfulCheck: new Date(),
          consecutiveSuccesses,
          consecutiveFailures: 0, // Reset
          totalChecks,
          totalSuccesses,
          successRate,
          currentStrategy: strategy,
          isFailoverActive,
          recoveryAttempts: isFailoverActive !== health.isFailoverActive ? 0 : health.recoveryAttempts,
          updatedAt: new Date()
        })
        .where(eq(monitoringHealth.url, url));
      
      console.log(`✅ Health success recorded: ${url} - ${consecutiveSuccesses} consecutive, ${successRate}% success rate`);
      
    } catch (error) {
      console.error('❌ Failed to record success:', error);
    }
  }

  /**
   * Başarısız check kaydı - Failover kararını ver
   */
  async recordFailure(url: string, error: any): Promise<{
    shouldFailover: boolean;
    nextStrategy: string;
    reason: string;
  }> {
    try {
      const health = await this.getOrCreateHealth(url);
      
      const consecutiveFailures = health.consecutiveFailures + 1;
      const totalChecks = health.totalChecks + 1;
      const totalFailures = health.totalFailures + 1;
      const successRate = (((totalChecks - totalFailures) / totalChecks) * 100).toFixed(2);
      
      let healthStatus = 'healthy';
      let shouldFailover = false;
      let nextStrategy = health.currentStrategy;
      let failoverReason = '';
      let isFailoverActive = health.isFailoverActive;
      
      // Health durumunu belirle
      if (consecutiveFailures >= this.FAILURE_THRESHOLD) {
        healthStatus = 'failover';
        shouldFailover = true;
        isFailoverActive = true;
        failoverReason = `${consecutiveFailures} ardışık hata - Failover sistemi devrede`;
        
        // Strateji değiştir
        nextStrategy = this.getNextStrategy(health.currentStrategy, health.availableStrategies);
        
        console.log(`🚨 FAILOVER ACTIVATED: ${url} - ${consecutiveFailures} ardışık hata`);
        console.log(`   Strateji değişimi: ${health.currentStrategy} → ${nextStrategy}`);
        
      } else if (consecutiveFailures >= this.DEGRADED_THRESHOLD) {
        healthStatus = 'degraded';
        failoverReason = `${consecutiveFailures} ardışık hata - Sistem yavaş`;
      }
      
      // Hata detaylarını hazırla
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      };
      
      // Health kaydını güncelle
      await db.update(monitoringHealth)
        .set({
          healthStatus,
          lastFailedCheck: new Date(),
          consecutiveFailures,
          consecutiveSuccesses: 0, // Reset
          totalChecks,
          totalFailures,
          successRate,
          lastError: errorDetails.message,
          lastErrorDetails: errorDetails,
          isFailoverActive,
          failoverReason: failoverReason || health.failoverReason,
          currentStrategy: shouldFailover ? nextStrategy : health.currentStrategy,
          updatedAt: new Date()
        })
        .where(eq(monitoringHealth.url, url));
      
      // urlTracking'i güncelle
      await db.update(urlTracking)
        .set({
          consecutiveFailures,
          lastFailureAt: new Date(),
          failoverMode: shouldFailover ? 'failover' : health.isFailoverActive ? 'failover' : 'primary',
          failoverActivatedAt: shouldFailover ? new Date() : undefined,
          failoverCount: shouldFailover ? sql`${urlTracking.failoverCount} + 1` : undefined,
          extractionStrategy: shouldFailover ? nextStrategy : undefined,
          updatedAt: new Date()
        })
        .where(eq(urlTracking.url, url));
      
      console.log(`❌ Health failure recorded: ${url} - ${consecutiveFailures} consecutive, ${successRate}% success rate`);
      
      return {
        shouldFailover,
        nextStrategy,
        reason: failoverReason
      };
      
    } catch (error) {
      console.error('❌ Failed to record failure:', error);
      return {
        shouldFailover: false,
        nextStrategy: 'puppeteer',
        reason: 'Error recording failure'
      };
    }
  }

  /**
   * Sonraki extraction stratejisini belirle
   */
  private getNextStrategy(currentStrategy: string, availableStrategies: string[]): string {
    const strategies = availableStrategies.length > 0 ? availableStrategies : ['puppeteer', 'mobile-api', 'cheerio'];
    const currentIndex = strategies.indexOf(currentStrategy);
    
    // Sıradaki stratejiyi seç (döngüsel)
    const nextIndex = (currentIndex + 1) % strategies.length;
    return strategies[nextIndex];
  }

  /**
   * Health kaydını al veya oluştur
   */
  private async getOrCreateHealth(url: string): Promise<typeof monitoringHealth.$inferSelect> {
    const [existing] = await db
      .select()
      .from(monitoringHealth)
      .where(eq(monitoringHealth.url, url))
      .limit(1);
    
    if (existing) {
      return existing;
    }
    
    // Yeni kayıt oluştur
    const [newHealth] = await db
      .insert(monitoringHealth)
      .values({
        url,
        healthStatus: 'healthy',
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        totalChecks: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        successRate: '100.00',
        currentStrategy: 'puppeteer',
        availableStrategies: ['puppeteer', 'mobile-api', 'cheerio'],
        isFailoverActive: false,
        autoRecoveryEnabled: true,
        recoveryAttempts: 0
      })
      .returning();
    
    return newHealth;
  }

  /**
   * Belirli bir URL için health durumunu al
   */
  async getHealthStatus(url: string): Promise<typeof monitoringHealth.$inferSelect | null> {
    const [health] = await db
      .select()
      .from(monitoringHealth)
      .where(eq(monitoringHealth.url, url))
      .limit(1);
    
    return health || null;
  }

  /**
   * Tüm health durumlarını al
   */
  async getAllHealthStatuses(): Promise<typeof monitoringHealth.$inferSelect[]> {
    return db.select().from(monitoringHealth);
  }

  /**
   * Manual failover tetikleme
   */
  async triggerManualFailover(url: string, reason: string): Promise<void> {
    const health = await this.getOrCreateHealth(url);
    const nextStrategy = this.getNextStrategy(health.currentStrategy, health.availableStrategies);
    
    await db.update(monitoringHealth)
      .set({
        healthStatus: 'failover',
        isFailoverActive: true,
        failoverReason: `Manuel failover: ${reason}`,
        currentStrategy: nextStrategy,
        updatedAt: new Date()
      })
      .where(eq(monitoringHealth.url, url));
    
    await db.update(urlTracking)
      .set({
        failoverMode: 'failover',
        failoverActivatedAt: new Date(),
        failoverCount: sql`${urlTracking.failoverCount} + 1`,
        extractionStrategy: nextStrategy,
        updatedAt: new Date()
      })
      .where(eq(urlTracking.url, url));
    
    console.log(`🔧 Manual failover triggered: ${url} → ${nextStrategy}`);
  }

  /**
   * Manual recovery tetikleme (primary moda dön)
   */
  async triggerManualRecovery(url: string): Promise<void> {
    await db.update(monitoringHealth)
      .set({
        healthStatus: 'healthy',
        isFailoverActive: false,
        consecutiveFailures: 0,
        currentStrategy: 'puppeteer',
        recoveryAttempts: sql`${monitoringHealth.recoveryAttempts} + 1`,
        lastRecoveryAttempt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(monitoringHealth.url, url));
    
    await db.update(urlTracking)
      .set({
        failoverMode: 'primary',
        consecutiveFailures: 0,
        extractionStrategy: 'puppeteer',
        updatedAt: new Date()
      })
      .where(eq(urlTracking.url, url));
    
    console.log(`🔄 Manual recovery triggered: ${url} → primary mode`);
  }
}

export const healthCheckManager = HealthCheckManager.getInstance();
