/**
 * Intelligent Rate Limiter - Advanced Request Management
 * Tamamen human-like behavior patterns
 */

interface RequestPattern {
  timestamp: number;
  url: string;
  success: boolean;
  responseTime: number;
}

interface RateLimitConfig {
  minDelay: number;
  maxDelay: number;
  burstLimit: number;
  cooldownPeriod: number;
  adaptiveMode: boolean;
}

export class IntelligentRateLimiter {
  private requestHistory: RequestPattern[] = [];
  private consecutiveFailures: number = 0;
  private lastSuccessTime: number = 0;
  private currentSession: string = '';
  
  private config: RateLimitConfig = {
    minDelay: 1000,      // 🚀 SIMPLE: Fixed 1 second (predictable & safe)
    maxDelay: 1000,      // 🚀 SIMPLE: Fixed 1 second (no variation)
    burstLimit: 10,      // Safe: Max 10 requests in burst
    cooldownPeriod: 10000, // Safe: 10 seconds cooldown
    adaptiveMode: false  // 🚀 SIMPLE: Disabled (fixed delays only)
  };

  constructor(customConfig?: Partial<RateLimitConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
    this.currentSession = this.generateSessionId();
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // Calculate intelligent delay based on patterns
  async calculateSmartDelay(url: string): Promise<number> {
    const now = Date.now();
    
    // Clean old history (keep last 30 minutes)
    this.requestHistory = this.requestHistory.filter(
      req => now - req.timestamp < 30 * 60 * 1000
    );

    // Base delay calculation
    let delay = this.config.minDelay;

    // Factor 1: Recent failure patterns - ENABLED FOR SAFETY
    if (this.consecutiveFailures > 0 && this.config.adaptiveMode) {
      const failureMultiplier = Math.min(this.consecutiveFailures * 1.5, 5);
      delay *= failureMultiplier;
      console.log(`⚠️ Failure penalty: ${failureMultiplier}x delay (${this.consecutiveFailures} failures)`);
    }

    // Factor 2: Time since last success - ENABLED FOR SAFETY
    const timeSinceSuccess = now - this.lastSuccessTime;
    if (timeSinceSuccess > 5 * 60 * 1000 && this.lastSuccessTime > 0 && this.config.adaptiveMode) {
      delay *= 1.8; // Increase delay if no recent success
      console.log('⚠️ No recent success penalty: 1.8x delay');
    }

    // Factor 3: Request frequency control
    const recentRequests = this.requestHistory.filter(
      req => now - req.timestamp < 60000 // Last 60 seconds
    );

    if (recentRequests.length >= this.config.burstLimit) {
      delay = this.config.cooldownPeriod;
      console.log(`🛑 Burst limit hit: ${this.config.cooldownPeriod}ms cooldown`);
    }

    // Factor 4: Human-like randomization
    const humanVariation = 0.5 + Math.random(); // 0.5x to 1.5x variation
    delay *= humanVariation;

    // Factor 5: Time-of-day patterns - ENABLED FOR NATURAL BEHAVIOR
    if (this.config.adaptiveMode) {
      const hour = new Date().getHours();
      if (hour >= 2 && hour <= 7) {
        delay *= 1.5; // Slower during night hours
      } else if (hour >= 9 && hour <= 17) {
        delay *= 0.9; // Faster during business hours
      }
    }

    // Ensure within bounds
    delay = Math.max(this.config.minDelay, Math.min(delay, this.config.maxDelay));

    console.log(`🕐 Smart delay calculated: ${Math.round(delay)}ms`);
    return delay;
  }

  // Execute delay with human-like patterns
  async executeSmartDelay(url: string): Promise<void> {
    const delay = await this.calculateSmartDelay(url);
    
    console.log(`⏳ Executing human-like delay: ${Math.round(delay)}ms`);
    
    // Split delay into smaller chunks for more human-like behavior
    const chunks = Math.ceil(delay / 2000); // 2-second chunks
    const chunkDelay = delay / chunks;
    
    for (let i = 0; i < chunks; i++) {
      await new Promise(resolve => setTimeout(resolve, chunkDelay));
      
      // Add small random variations between chunks
      if (i < chunks - 1) {
        const microDelay = Math.random() * 500; // 0-500ms micro-delay
        await new Promise(resolve => setTimeout(resolve, microDelay));
      }
    }
  }

  // Record request outcome
  recordRequest(url: string, success: boolean, responseTime: number): void {
    const pattern: RequestPattern = {
      timestamp: Date.now(),
      url,
      success,
      responseTime
    };

    this.requestHistory.push(pattern);

    if (success) {
      this.consecutiveFailures = 0;
      this.lastSuccessTime = pattern.timestamp;
      console.log(`✅ Success recorded: ${url.split('/').pop()}`);
    } else {
      this.consecutiveFailures++;
      console.log(`❌ Failure recorded: ${url.split('/').pop()} (${this.consecutiveFailures} consecutive)`);
    }

    // Adaptive config adjustment
    if (this.config.adaptiveMode) {
      this.adaptConfiguration();
    }
  }

  // Adapt configuration based on success patterns (bounded to safe limits)
  private adaptConfiguration(): void {
    const recentRequests = this.requestHistory.slice(-10); // Last 10 requests
    const successRate = recentRequests.filter(req => req.success).length / recentRequests.length;

    if (successRate < 0.3 && this.consecutiveFailures >= 3) {
      // Very low success rate - be more conservative (but stay within safe bounds)
      this.config.minDelay = Math.min(this.config.minDelay * 1.5, 4000);  // Max 4s
      this.config.maxDelay = Math.min(this.config.maxDelay * 1.5, 8000);  // Max 8s
      console.log(`🔧 Adaptive: Increased delays due to low success rate (${Math.round(successRate * 100)}%)`);
    } else if (successRate > 0.8 && this.consecutiveFailures === 0) {
      // High success rate - can be slightly faster (but stay within safe bounds)
      this.config.minDelay = Math.max(this.config.minDelay * 0.9, 600);   // Min 600ms
      this.config.maxDelay = Math.max(this.config.maxDelay * 0.9, 1500);  // Min 1.5s
      console.log(`🔧 Adaptive: Decreased delays due to high success rate (${Math.round(successRate * 100)}%)`);
    }
  }

  // Get current session health
  getSessionHealth(): any {
    const now = Date.now();
    const recentRequests = this.requestHistory.filter(
      req => now - req.timestamp < 10 * 60 * 1000 // Last 10 minutes
    );

    const successCount = recentRequests.filter(req => req.success).length;
    const totalCount = recentRequests.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 0;

    const avgResponseTime = recentRequests.length > 0 
      ? recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / recentRequests.length
      : 0;

    return {
      sessionId: this.currentSession,
      totalRequests: totalCount,
      successRate: Math.round(successRate * 100),
      consecutiveFailures: this.consecutiveFailures,
      avgResponseTime: Math.round(avgResponseTime),
      currentDelayRange: `${this.config.minDelay}-${this.config.maxDelay}ms`,
      status: this.getHealthStatus(successRate)
    };
  }

  private getHealthStatus(successRate: number): string {
    if (successRate >= 0.8) return 'EXCELLENT';
    if (successRate >= 0.6) return 'GOOD';
    if (successRate >= 0.4) return 'WARNING';
    return 'CRITICAL';
  }

  // Reset session (for testing or recovery)
  resetSession(): void {
    this.requestHistory = [];
    this.consecutiveFailures = 0;
    this.lastSuccessTime = 0;
    this.currentSession = this.generateSessionId();
    
    // Reset to SIMPLE safe defaults
    this.config = {
      minDelay: 1000,        // 🚀 SIMPLE: Fixed 1 second
      maxDelay: 1000,        // 🚀 SIMPLE: Fixed 1 second
      burstLimit: 10,        // Safe: 10 requests in burst
      cooldownPeriod: 10000, // Safe: 10 seconds cooldown
      adaptiveMode: false    // 🚀 SIMPLE: No adaptive complexity
    };

    console.log(`🔄 Session reset: ${this.currentSession}`);
  }
}

export const intelligentRateLimiter = new IntelligentRateLimiter({
  minDelay: 1000,        // 🚀 SIMPLE: Fixed 1 second (predictable & safe)
  maxDelay: 1000,        // 🚀 SIMPLE: Fixed 1 second (no variation)
  burstLimit: 10,        // Safe: 10 requests in burst
  cooldownPeriod: 10000, // Safe: 10 seconds cooldown
  adaptiveMode: false    // 🚀 SIMPLE: Fixed delays (no complexity)
});