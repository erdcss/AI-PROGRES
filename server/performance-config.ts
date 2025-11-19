/**
 * ⚡ PERFORMANCE CONFIGURATION
 * Dual-phase timeout system: Fast path for speed, slow fallback for reliability
 */

export interface PerformanceConfig {
  cache: {
    duration: number;  // Cache duration in milliseconds
    forceRefresh: boolean;  // Bypass cache when true
  };
  timeouts: {
    fast: {
      axios: number;
      puppeteerGoto: number;
      puppeteerSelector: number;
    };
    slow: {
      axios: number;
      puppeteerGoto: number;
      puppeteerSelector: number;
    };
  };
  rateLimiting: {
    minDelay: number;
    maxDelay: number;
    useAdaptive: boolean;  // Use intelligentRateLimiter
  };
  parallel: {
    maxConcurrent: number;
    poolSize: number;
  };
}

export const defaultPerformanceConfig: PerformanceConfig = {
  cache: {
    duration: 5 * 60 * 1000,  // 🚀 5 minutes for hot URLs (balanced)
    forceRefresh: false
  },
  timeouts: {
    fast: {
      axios: 4000,          // 🚀 Fast: 4s (balanced - prevents false failures)
      puppeteerGoto: 4000,
      puppeteerSelector: 1500
    },
    slow: {
      axios: 10000,         // Slow fallback: 10s for reliability
      puppeteerGoto: 10000,
      puppeteerSelector: 4000
    }
  },
  rateLimiting: {
    minDelay: 200,          // 🚀 Balanced: 200ms min delay (safer)
    maxDelay: 400,          // 🚀 400ms max delay
    useAdaptive: true      // ✅ Keep adaptive for anti-blocking
  },
  parallel: {
    maxConcurrent: 8,      // 🚀 Moderate increase (safer than 15)
    poolSize: 8
  }
};

// Runtime configuration (can be updated via API)
let currentConfig: PerformanceConfig = { ...defaultPerformanceConfig };

export function getPerformanceConfig(): PerformanceConfig {
  return currentConfig;
}

export function updatePerformanceConfig(updates: Partial<PerformanceConfig>): void {
  currentConfig = { ...currentConfig, ...updates };
  console.log('⚙️ Performance config updated:', updates);
}

export function resetPerformanceConfig(): void {
  currentConfig = { ...defaultPerformanceConfig };
  console.log('🔄 Performance config reset to defaults');
}

// Helper to get appropriate timeout based on attempt
export function getTimeout(type: 'axios' | 'puppeteerGoto' | 'puppeteerSelector', attempt: number = 1): number {
  if (attempt === 1) {
    return currentConfig.timeouts.fast[type];
  }
  return currentConfig.timeouts.slow[type];
}

// Helper to determine if we should retry with slow timeout
export function shouldRetryWithSlowTimeout(error: any): boolean {
  // Retry with slow timeout for timeouts and network errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
    return true;
  }
  if (error.message && error.message.includes('timeout')) {
    return true;
  }
  if (error.message && error.message.includes('Navigation timeout')) {
    return true;
  }
  return false;
}
