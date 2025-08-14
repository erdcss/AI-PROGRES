/**
 * Advanced Proxy Rotation and Anti-Blocking System
 * Implements residential proxy-style techniques to bypass Trendyol blocking
 */

import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';

// Advanced user agent pool with real device fingerprints
const ADVANCED_USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  
  // Chrome on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  
  // Safari on Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70',
  
  // Chrome on Android (mobile)
  'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
];

// Advanced headers pool for realistic browser behavior
const REALISTIC_HEADERS = [
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Cache-Control': 'max-age=0',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr,en-US;q=0.7,en;q=0.3',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1'
  }
];

// Circuit breaker for tracking blocking patterns
class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  private readonly failureThreshold = 10; // Increased threshold
  private readonly recoveryTimeout = 60000; // 1 minute (faster recovery)
  private readonly halfOpenTimeout = 30000; // 30 seconds

  isBlocked(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        console.log('🔄 Circuit breaker moved to HALF_OPEN state');
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
    console.log('✅ Circuit breaker reset to CLOSED state');
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(`🚨 Circuit breaker OPENED - too many failures (${this.failures})`);
    }
  }
}

// Global circuit breaker instance
const circuitBreaker = new CircuitBreaker();

// Request timing to avoid rapid-fire requests
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000; // 3 seconds between requests (faster)

export class AdvancedProxyRotator {
  private currentUserAgentIndex = 0;
  private currentHeadersIndex = 0;
  private sessionData = new Map<string, any>();

  // Reset circuit breaker manually
  resetCircuitBreaker(): void {
    circuitBreaker.recordSuccess();
    console.log('🔄 Circuit breaker manually reset');
  }

  private getRandomUserAgent(): string {
    // Rotate through user agents in sequence to avoid repetition
    const userAgent = ADVANCED_USER_AGENTS[this.currentUserAgentIndex];
    this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % ADVANCED_USER_AGENTS.length;
    return userAgent;
  }

  private getRandomHeaders(): any {
    // Rotate through header sets
    const headers = { ...REALISTIC_HEADERS[this.currentHeadersIndex] };
    this.currentHeadersIndex = (this.currentHeadersIndex + 1) % REALISTIC_HEADERS.length;
    return headers;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${Math.round(waitTime/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();
  }

  async fetchWithRotation(url: string): Promise<{ html: string; success: boolean }> {
    // Check circuit breaker
    if (circuitBreaker.isBlocked()) {
      console.log('🚫 Circuit breaker is OPEN - skipping request');
      return { html: '', success: false };
    }

    // Enforce rate limiting
    await this.enforceRateLimit();

    const userAgent = this.getRandomUserAgent();
    const headers = this.getRandomHeaders();

    // Create axios instance with current rotation settings
    const axiosInstance: AxiosInstance = axios.create({
      timeout: 15000,
      maxRedirects: 3,
      validateStatus: (status) => status < 500,
      headers: {
        ...headers,
        'User-Agent': userAgent,
        'Connection': 'keep-alive',
        'DNT': '1'
      }
    });

    console.log(`🔄 Fetching with User-Agent: ${userAgent.substring(0, 50)}...`);

    try {
      const response = await axiosInstance.get(url);
      const html = response.data;

      // Check for blocking indicators
      const blockingIndicators = [
        'Sorry, you have been blocked',
        'Access Denied',
        'Erişim Engellendi',
        'Rate limited',
        'Too Many Requests',
        'Çok fazla istek',
        'robot',
        'captcha',
        'verification'
      ];

      const isBlocked = blockingIndicators.some(indicator => 
        html.toLowerCase().includes(indicator.toLowerCase())
      ) || html.length < 2000;

      if (isBlocked) {
        console.log('🚫 Detected blocking response');
        circuitBreaker.recordFailure();
        return { html: '', success: false };
      }

      // Success - reset circuit breaker
      circuitBreaker.recordSuccess();
      console.log('✅ Successfully fetched content');
      return { html, success: true };

    } catch (error: any) {
      console.log(`❌ Request failed: ${error.message}`);
      circuitBreaker.recordFailure();
      return { html: '', success: false };
    }
  }

  // Multi-attempt extraction with different strategies
  async extractWithRetries(url: string, maxAttempts: number = 3): Promise<{ html: string; success: boolean }> {
    console.log(`🎯 Starting extraction for: ${url}`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`📡 Attempt ${attempt}/${maxAttempts}`);
      
      const result = await this.fetchWithRotation(url);
      
      if (result.success) {
        console.log(`✅ Success on attempt ${attempt}`);
        return result;
      }
      
      if (attempt < maxAttempts) {
        // Exponential backoff between attempts
        const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
        console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    console.log(`❌ All ${maxAttempts} attempts failed`);
    return { html: '', success: false };
  }
}

// Singleton instance
export const proxyRotator = new AdvancedProxyRotator();