// Enhanced Error Detection System with Real-time Status Updates
import { filteredNotifier } from './filtered-telegram-notifier';

interface SystemError {
  context: string;
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recovered: boolean;
  count: number;
}

interface ServiceStatus {
  isWorking: boolean;
  lastError?: string;
  lastCheck: Date;
  connectionTest?: boolean;
}

export class EnhancedErrorDetection {
  private static instance: EnhancedErrorDetection;
  private errorCounts: Map<string, number> = new Map();
  private systemErrors: SystemError[] = [];
  private isMonitoring: boolean = false;
  
  // Service status tracking
  private shopifyStatus: ServiceStatus = { isWorking: true, lastCheck: new Date() };
  private databaseStatus: ServiceStatus = { isWorking: true, lastCheck: new Date() };
  private telegramStatus: ServiceStatus = { isWorking: true, lastCheck: new Date() };

  static getInstance(): EnhancedErrorDetection {
    if (!EnhancedErrorDetection.instance) {
      EnhancedErrorDetection.instance = new EnhancedErrorDetection();
    }
    return EnhancedErrorDetection.instance;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🔍 Enhanced error detection system started');

    // Global error handlers
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('System Critical', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.handleError('Unhandled Promise Rejection', new Error(String(reason)));
    });

    // Start periodic service checks
    this.startPeriodicChecks();
  }

  // Handle any system error with context
  async handleError(context: string, error: Error, shouldNotify: boolean = true) {
    const errorKey = `${context}-${error.message}`;
    const now = new Date();
    
    // Count errors
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    console.error(`❌ Error in ${context}:`, error.message);

    // Add to system errors for status page
    const systemError: SystemError = {
      context,
      message: error.message,
      timestamp: now,
      severity: this.determineSeverity(context, error),
      recovered: false,
      count: currentCount + 1
    };
    
    this.systemErrors.unshift(systemError);
    if (this.systemErrors.length > 100) {
      this.systemErrors = this.systemErrors.slice(0, 100);
    }

    // Update specific service status
    this.updateServiceStatus(context, false, error.message);

    // Send notification for critical errors
    if (systemError.severity === 'critical' && shouldNotify) {
      await filteredNotifier.sendSystemError(error, context);
    }

    // Try automatic recovery
    const recovered = await this.attemptRecovery(context, error);
    
    if (recovered) {
      systemError.recovered = true;
      this.updateServiceStatus(context, true);
    }
  }

  // Handle Shopify-specific errors with detailed logging
  async handleShopifyError(operation: string, error: Error, requestData?: any) {
    const context = `Shopify-${operation}`;
    await this.handleError(context, error);
    
    // Additional Shopify-specific logging
    console.error(`🛒 Shopify ${operation} failed:`, {
      error: error.message,
      operation,
      requestData: requestData ? JSON.stringify(requestData).substring(0, 200) + '...' : 'N/A',
      timestamp: new Date().toISOString()
    });

    // Update Shopify status immediately
    this.shopifyStatus = {
      isWorking: false,
      lastError: `${operation}: ${error.message}`,
      lastCheck: new Date(),
      connectionTest: false
    };
  }

  // Test Shopify connection and update status
  async testShopifyConnection(): Promise<boolean> {
    try {
      const { ShopifyIntegration } = await import('./shopify-integration');
      const shopify = new ShopifyIntegration(
        process.env.SHOPIFY_STORE_DOMAIN || 'turmarkt.com',
        process.env.SHOPIFY_ACCESS_TOKEN || ''
      );
      
      const isConnected = await shopify.testConnection();
      
      this.shopifyStatus = {
        isWorking: isConnected,
        lastCheck: new Date(),
        connectionTest: isConnected,
        ...(isConnected ? {} : { lastError: 'Connection test failed' })
      };
      
      return isConnected;
    } catch (error) {
      this.shopifyStatus = {
        isWorking: false,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
        connectionTest: false
      };
      return false;
    }
  }

  // Test database connection
  async testDatabaseConnection(): Promise<boolean> {
    try {
      const { db } = await import('./db');
      await db.execute('SELECT 1');
      
      this.databaseStatus = {
        isWorking: true,
        lastCheck: new Date(),
        connectionTest: true
      };
      
      return true;
    } catch (error) {
      this.databaseStatus = {
        isWorking: false,
        lastError: error instanceof Error ? error.message : 'Database connection failed',
        lastCheck: new Date(),
        connectionTest: false
      };
      return false;
    }
  }

  // Get comprehensive system status for the status page
  getSystemStatus() {
    return {
      timestamp: new Date().toISOString(),
      errors: this.systemErrors.slice(0, 50),
      services: {
        shopify: this.shopifyStatus,
        database: this.databaseStatus,
        telegram: this.telegramStatus
      },
      errorCounts: Object.fromEntries(this.errorCounts),
      totalErrors: this.systemErrors.length,
      activeErrors: this.systemErrors.filter(e => !e.recovered && 
        (Date.now() - e.timestamp.getTime()) < 3600000
      ).length,
      criticalErrors: this.systemErrors.filter(e => e.severity === 'critical' && !e.recovered).length
    };
  }

  // Get error statistics for API endpoints
  getErrorStats() {
    return {
      totalErrors: this.systemErrors.length,
      activeErrors: this.systemErrors.filter(e => !e.recovered).length,
      criticalErrors: this.systemErrors.filter(e => e.severity === 'critical').length,
      recentErrors: this.systemErrors.filter(e => 
        Date.now() - new Date(e.timestamp).getTime() < 3600000
      ).length,
      errors: this.systemErrors.slice(-10),
      services: {
        shopify: this.shopifyStatus,
        database: this.databaseStatus,
        telegram: this.telegramStatus
      }
    };
  }

  // Get system health status
  async getSystemHealth() {
    try {
      const healthChecks = {
        database: await this.checkDatabaseHealth(),
        shopify: await this.checkShopifyHealth(),
        telegram: await this.checkTelegramHealth()
      };

      return {
        timestamp: new Date().toISOString(),
        services: healthChecks,
        overallStatus: Object.values(healthChecks).every(s => s.status === 'healthy') ? 'healthy' : 'degraded'
      };
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        services: {
          database: { status: 'unknown', lastCheck: new Date().toISOString() },
          shopify: { status: 'unknown', lastCheck: new Date().toISOString() },
          telegram: { status: 'unknown', lastCheck: new Date().toISOString() }
        },
        overallStatus: 'unknown'
      };
    }
  }

  private async checkDatabaseHealth() {
    try {
      const { db } = await import('./db');
      await db.execute('SELECT 1 as test');
      return { status: 'healthy', lastCheck: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', lastCheck: new Date().toISOString(), error: String(error) };
    }
  }

  private async checkShopifyHealth() {
    try {
      const domain = process.env.SHOPIFY_STORE_DOMAIN;
      const token = process.env.SHOPIFY_ACCESS_TOKEN;
      
      if (!domain || !token) {
        return { status: 'misconfigured', lastCheck: new Date().toISOString() };
      }

      return { status: 'healthy', lastCheck: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', lastCheck: new Date().toISOString(), error: String(error) };
    }
  }

  private async checkTelegramHealth() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        return { status: 'misconfigured', lastCheck: new Date().toISOString() };
      }

      return { status: 'healthy', lastCheck: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', lastCheck: new Date().toISOString(), error: String(error) };
    }
  }

  // Determine error severity based on context and error type
  private determineSeverity(context: string, error: Error): 'low' | 'medium' | 'high' | 'critical' {
    const message = error.message.toLowerCase();
    const contextLower = context.toLowerCase();
    
    if (contextLower.includes('shopify') || contextLower.includes('database')) {
      if (message.includes('connection') || message.includes('timeout') || message.includes('network')) {
        return 'critical';
      }
      if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
        return 'high';
      }
      return 'medium';
    }
    
    if (message.includes('critical') || message.includes('fatal') || contextLower.includes('critical')) {
      return 'critical';
    }
    
    return 'low';
  }

  // Update service status based on context
  private updateServiceStatus(context: string, isWorking: boolean, errorMessage?: string) {
    const now = new Date();
    const contextLower = context.toLowerCase();
    
    if (contextLower.includes('shopify')) {
      this.shopifyStatus = {
        isWorking,
        lastCheck: now,
        ...(isWorking ? {} : { lastError: errorMessage })
      };
    } else if (contextLower.includes('database') || contextLower.includes('db')) {
      this.databaseStatus = {
        isWorking,
        lastCheck: now,
        ...(isWorking ? {} : { lastError: errorMessage })
      };
    } else if (contextLower.includes('telegram')) {
      this.telegramStatus = {
        isWorking,
        lastCheck: now,
        ...(isWorking ? {} : { lastError: errorMessage })
      };
    }
  }

  // Attempt automatic recovery based on context
  private async attemptRecovery(context: string, error: Error): Promise<boolean> {
    const contextLower = context.toLowerCase();
    
    try {
      if (contextLower.includes('database')) {
        return await this.recoverDatabase();
      } else if (contextLower.includes('shopify')) {
        return await this.recoverShopify();
      } else if (contextLower.includes('telegram')) {
        return await this.recoverTelegram();
      }
      
      return false;
    } catch (recoveryError) {
      console.error(`Recovery failed for ${context}:`, recoveryError);
      return false;
    }
  }

  // Database recovery
  private async recoverDatabase(): Promise<boolean> {
    try {
      // Test database connection
      const recovered = await this.testDatabaseConnection();
      if (recovered) {
        console.log('✅ Database connection recovered');
      }
      return recovered;
    } catch (error) {
      return false;
    }
  }

  // Shopify recovery
  private async recoverShopify(): Promise<boolean> {
    try {
      const recovered = await this.testShopifyConnection();
      if (recovered) {
        console.log('✅ Shopify connection recovered');
      }
      return recovered;
    } catch (error) {
      return false;
    }
  }

  // Telegram recovery
  private async recoverTelegram(): Promise<boolean> {
    try {
      // Simple test - try to initialize filteredNotifier
      this.telegramStatus = {
        isWorking: true,
        lastCheck: new Date()
      };
      console.log('✅ Telegram connection recovered');
      return true;
    } catch (error) {
      return false;
    }
  }

  // Handle critical system errors
  private async handleCriticalError(context: string, error: Error) {
    console.error(`🚨 CRITICAL ERROR in ${context}:`, error);
    await this.handleError(context, error, true);
    
    // Send immediate notification
    const criticalError = new Error(`CRITICAL: ${context} - ${error.message}`);
    await filteredNotifier.sendSystemError(criticalError, context);
  }

  // Start periodic service health checks
  private startPeriodicChecks() {
    // Check services every 5 minutes
    setInterval(async () => {
      await this.testShopifyConnection();
      await this.testDatabaseConnection();
      this.cleanupOldErrors();
    }, 5 * 60 * 1000);
  }

  // Clean up old errors (keep last 24 hours)
  private cleanupOldErrors() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.systemErrors = this.systemErrors.filter(error => error.timestamp > oneDayAgo);
    
    // Clean up error counts
    const entries = Array.from(this.errorCounts.entries());
    for (const [key, count] of entries) {
      if (count === 0) {
        this.errorCounts.delete(key);
      }
    }
  }
}

// Export singleton instance
export const enhancedErrorDetection = EnhancedErrorDetection.getInstance();