// Automatic Error Detection and Recovery System
import { filteredNotifier } from './filtered-telegram-notifier';

export class ErrorDetectionSystem {
  private static instance: ErrorDetectionSystem;
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, Date> = new Map();
  private isMonitoring: boolean = false;

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
      filteredNotifier.sendSystemError('Critical Unhandled Rejection', String(reason));
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

    // Try automatic recovery
    const recovered = await this.attemptRecovery(context, error);

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