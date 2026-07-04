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
    duration: 5 * 60 * 1000,  // 🚀 OPTIMIZED: 5 minutes (2.5x longer cache = faster for repeated URLs)
    forceRefresh: false
  },
  timeouts: {
    fast: {
      axios: 4000,          // 🚀 OPTIMIZED: 4s (more reliable, prevents false timeouts)
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
    minDelay: 300,          // Original: Keep safe anti-blocking delays
    maxDelay: 500,
    useAdaptive: true       // ✅ Keep adaptive for anti-blocking
  },
  parallel: {
    maxConcurrent: 5,       // Original: Keep safe concurrency (no parallel changes)
    poolSize: 5
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

import { isCloudRuntime } from "@shared/deploy-runtime";

// Helper to get appropriate timeout based on attempt
export function getTimeout(type: 'axios' | 'puppeteerGoto' | 'puppeteerSelector', attempt: number = 1): number {
  const isLocalWin = process.platform === "win32" && !isCloudRuntime();
  if (isLocalWin) {
    if (type === "puppeteerGoto") {
      return Number(process.env.PUPPETEER_GOTO_TIMEOUT_MS) || (attempt === 1 ? 60_000 : 90_000);
    }
    if (type === "puppeteerSelector") {
      return Number(process.env.PUPPETEER_SELECTOR_TIMEOUT_MS) || (attempt === 1 ? 8_000 : 15_000);
    }
    return Number(process.env.AXIOS_SCRAPE_TIMEOUT_MS) || (attempt === 1 ? 8_000 : 15_000);
  }

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
