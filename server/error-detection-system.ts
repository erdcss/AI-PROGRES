// Automatic Error Detection and Recovery System
import { filteredNotifier } from './filtered-telegram-notifier';

interface SystemError {
  context: string;
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recovered: boolean;
  count: number;
}

export class ErrorDetectionSystem {
  private static instance: ErrorDetectionSystem;
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, Date> = new Map();
  private systemErrors: SystemError[] = [];
  private isMonitoring: boolean = false;
  private shopifyStatus: { isWorking: boolean; lastError?: string; lastCheck: Date } = {
    isWorking: true,
    lastCheck: new Date()
  };

  static getInstance(): ErrorDetectionSystem {
    if (!ErrorDetectionSystem.instance) {
      ErrorDetectionSystem.instance = new ErrorDetectionSystem();
    }
    return ErrorDetectionSystem.instance;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🔍 Error detection system started');

    // Global error handlers
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('Uncaught Exception', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.log('🚨 Critical Unhandled Rejection:', reason);
      this.handleError('Critical Unhandled Rejection', new Error(String(reason)));
    });

    // Database connection monitoring
    this.monitorDatabaseHealth();
  }

  async handleError(context: string, error: Error, shouldNotify: boolean = true) {
    const errorKey = `${context}-${error.message}`;
    const now = new Date();
    
    // Count errors
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);
    this.lastErrors.set(errorKey, now);

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
    if (context.toLowerCase().includes('shopify')) {
      this.shopifyStatus = {
        isWorking: false,
        lastError: error.message,
        lastCheck: now
      };
    }

    // Try automatic recovery
    const recovered = await this.attemptRecovery(context, error);
    
    if (recovered) {
      systemError.recovered = true;
      if (context.toLowerCase().includes('shopify')) {
        this.shopifyStatus.isWorking = true;
        delete this.shopifyStatus.lastError;
      }
    }
  }

  // Determine error severity based on context and error type
  private determineSeverity(context: string, error: Error): 'low' | 'medium' | 'high' | 'critical' {
    const message = error.message.toLowerCase();
    const contextLower = context.toLowerCase();
    
    if (contextLower.includes('shopify') || contextLower.includes('database')) {
      if (message.includes('connection') || message.includes('timeout')) {
        return 'critical';
      }
      if (message.includes('auth') || message.includes('unauthorized')) {
        return 'high';
      }
      return 'medium';
    }
    
    if (message.includes('critical') || message.includes('fatal')) {
      return 'critical';
    }
    
    return 'low';
  }

  // Handle Shopify-specific errors
  async handleShopifyError(operation: string, error: Error, requestData?: any) {
    await this.handleError(`Shopify-${operation}`, error);
    
    // Additional Shopify-specific logging
    console.error(`🛒 Shopify ${operation} failed:`, {
      error: error.message,
      requestData: requestData ? JSON.stringify(requestData).substring(0, 200) : 'N/A',
      timestamp: new Date().toISOString()
    });
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
        ...(isConnected ? {} : { lastError: 'Connection test failed' })
      };
      
      return isConnected;
    } catch (error) {
      this.shopifyStatus = {
        isWorking: false,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date()
      };
      return false;
    }
  }

  // Get system status for the status page
  getSystemStatus() {
    return {
      errors: this.systemErrors.slice(0, 50), // Last 50 errors
      shopifyStatus: this.shopifyStatus,
      errorCounts: Object.fromEntries(this.errorCounts),
      totalErrors: this.systemErrors.length,
      activeErrors: this.systemErrors.filter(e => !e.recovered && 
        (Date.now() - e.timestamp.getTime()) < 3600000 // Last hour
      ).length
    };
  }

  // Clear old errors (keep last 24 hours)
  cleanupOldErrors() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.systemErrors = this.systemErrors.filter(error => error.timestamp > oneDayAgo);
  }

    if (shouldNotify && this.shouldNotifyError(errorKey, currentCount)) {
      await filteredNotifier.sendSystemError(error, context);
    }

    return recovered;
  }

  private async handleCriticalError(type: string, error: Error) {
    console.error(`🚨 Critical ${type}:`, error);
    
    await filteredNotifier.sendSystemError(error, `Critical System Error: ${type}`);
    
    // Attempt graceful recovery
    setTimeout(() => {
      this.attemptSystemRecovery();
    }, 5000);
  }

  private async attemptRecovery(context: string, error: Error): Promise<boolean> {
    try {
      switch (context) {
        case 'database':
          return await this.recoverDatabase();
        case 'telegram':
          return await this.recoverTelegram();
        case 'api':
          return await this.recoverAPI();
        case 'scheduler':
          return await this.recoverScheduler();
        default:
          return false;
      }
    } catch (recoveryError) {
      console.error(`Recovery failed for ${context}:`, recoveryError);
      return false;
    }
  }

  private async recoverDatabase(): Promise<boolean> {
    try {
      // Test database connection
      const { db } = await import('./db');
      await db.execute('SELECT 1');
      console.log('✅ Database recovery successful');
      return true;
    } catch (error) {
      console.error('❌ Database recovery failed:', error);
      return false;
    }
  }

  private async recoverTelegram(): Promise<boolean> {
    try {
      // Reinitialize filtered notifier
      await filteredNotifier.sendSystemAnalysis({ status: 'Recovery test' });
      console.log('✅ Telegram recovery successful');
      return true;
    } catch (error) {
      console.error('❌ Telegram recovery failed:', error);
      return false;
    }
  }

  private async recoverAPI(): Promise<boolean> {
    try {
      // Check if server is responding
      const response = await fetch('http://localhost:5000/api/system/status');
      if (response.ok) {
        console.log('✅ API recovery successful');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ API recovery failed:', error);
      return false;
    }
  }

  private async recoverScheduler(): Promise<boolean> {
    try {
      // Restart scheduler
      const { scheduler } = await import('./simple-scheduler');
      scheduler.restartAllTasks();
      console.log('✅ Scheduler recovery successful');
      return true;
    } catch (error) {
      console.error('❌ Scheduler recovery failed:', error);
      return false;
    }
  }

  private async attemptSystemRecovery() {
    console.log('🔧 Attempting system recovery...');
    
    const recoveryResults = {
      database: await this.recoverDatabase(),
      telegram: await this.recoverTelegram(),
      api: await this.recoverAPI(),
      scheduler: await this.recoverScheduler()
    };

    const successCount = Object.values(recoveryResults).filter(Boolean).length;
    const totalCount = Object.keys(recoveryResults).length;

    await filteredNotifier.sendSystemAnalysis({
      recoveryAttempt: true,
      successfulRecoveries: successCount,
      totalRecoveries: totalCount,
      results: recoveryResults
    });
  }

  private monitorDatabaseHealth() {
    setInterval(async () => {
      try {
        const { db } = await import('./db');
        await db.execute('SELECT 1');
      } catch (error) {
        await this.handleError('database', error as Error, false);
      }
    }, 60000); // Check every minute
  }

  private shouldNotifyError(errorKey: string, count: number): boolean {
    // Notify on first occurrence and every 5th occurrence
    return count === 1 || count % 5 === 0;
  }

  // Wrapper for safe function execution
  async safeExecute<T>(
    context: string, 
    fn: () => Promise<T>, 
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      await this.handleError(context, error as Error);
      return fallback;
    }
  }

  getErrorStats() {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      uniqueErrors: this.errorCounts.size,
      recentErrors: Array.from(this.lastErrors.entries())
        .filter(([_, date]) => Date.now() - date.getTime() < 3600000) // Last hour
        .length
    };
  }
}

export const errorDetector = ErrorDetectionSystem.getInstance();