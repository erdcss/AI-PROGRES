/**
 * Proxy Rotation System - Advanced IP Masking
 * Rotates through multiple proxy sources to avoid detection
 */

import axios from 'axios';

export interface ProxyConfig {
  host: string;
  port: number;
  type: 'http' | 'https' | 'socks5';
  auth?: {
    username: string;
    password: string;
  };
}

export interface ProxyResult {
  success: boolean;
  html?: string;
  proxy?: string;
  error?: string;
}

// Turkish residential proxy endpoints (mock for demo - real proxies would be configured)
const TURKISH_PROXY_POOL: ProxyConfig[] = [
  { host: '176.88.0.1', port: 8080, type: 'http' }, // Turknet
  { host: '195.175.0.1', port: 8080, type: 'http' }, // TTNet
  { host: '212.58.0.1', port: 8080, type: 'http' }, // Superonline
  { host: '88.255.0.1', port: 8080, type: 'http' }, // Vodafone TR
];

// Free proxy APIs for additional sources
const FREE_PROXY_APIS = [
  'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=TR&format=json',
  'https://www.proxy-list.download/api/v1/get?type=http&anon=elite&country=TR',
  'https://api.openproxylist.xyz/http.txt'
];

export class ProxyRotationSystem {
  private currentProxyIndex = 0;
  private workingProxies: ProxyConfig[] = [];
  private failedProxies: Set<string> = new Set();

  constructor() {
    this.workingProxies = [...TURKISH_PROXY_POOL];
  }

  // Test if a proxy is working
  private async testProxy(proxy: ProxyConfig): Promise<boolean> {
    try {
      const proxyConfig = {
        host: proxy.host,
        port: proxy.port,
        auth: proxy.auth
      };

      const response = await axios.get('https://httpbin.org/ip', {
        proxy: proxyConfig,
        timeout: 5000
      });

      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  // Get next working proxy
  private getNextProxy(): ProxyConfig | null {
    const availableProxies = this.workingProxies.filter(proxy => 
      !this.failedProxies.has(`${proxy.host}:${proxy.port}`)
    );

    if (availableProxies.length === 0) {
      console.log('⚠️ No working proxies available');
      return null;
    }

    const proxy = availableProxies[this.currentProxyIndex % availableProxies.length];
    this.currentProxyIndex++;
    
    return proxy;
  }

  // Mark proxy as failed
  private markProxyFailed(proxy: ProxyConfig) {
    this.failedProxies.add(`${proxy.host}:${proxy.port}`);
    console.log(`❌ Marked proxy as failed: ${proxy.host}:${proxy.port}`);
  }

  // Fetch free proxies from APIs
  private async fetchFreeProxies(): Promise<ProxyConfig[]> {
    const proxies: ProxyConfig[] = [];

    for (const api of FREE_PROXY_APIS) {
      try {
        const response = await axios.get(api, { timeout: 10000 });
        
        if (typeof response.data === 'string') {
          // Parse text format
          const lines = response.data.split('\n');
          for (const line of lines) {
            const match = line.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
            if (match) {
              proxies.push({
                host: match[1],
                port: parseInt(match[2]),
                type: 'http'
              });
            }
          }
        } else if (Array.isArray(response.data)) {
          // Parse JSON format
          for (const item of response.data) {
            if (item.ip && item.port) {
              proxies.push({
                host: item.ip,
                port: parseInt(item.port),
                type: 'http'
              });
            }
          }
        }
      } catch (error) {
        console.log(`❌ Failed to fetch from ${api}: ${error.message}`);
      }
    }

    console.log(`🔄 Fetched ${proxies.length} free proxies`);
    return proxies.slice(0, 10); // Limit to 10 for testing
  }

  // Make request through proxy with rotation
  public async makeProxyRequest(url: string, maxAttempts: number = 5): Promise<ProxyResult> {
    console.log('🔄 PROXY ROTATION: Starting proxy request...');

    // Refresh proxy pool if needed
    if (this.workingProxies.length === 0 || this.failedProxies.size > this.workingProxies.length * 0.7) {
      console.log('🔄 Refreshing proxy pool...');
      const freeProxies = await this.fetchFreeProxies();
      this.workingProxies = [...TURKISH_PROXY_POOL, ...freeProxies];
      this.failedProxies.clear();
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const proxy = this.getNextProxy();
      if (!proxy) {
        console.log('❌ No proxies available');
        break;
      }

      try {
        console.log(`🌐 Attempt ${attempt}: Using proxy ${proxy.host}:${proxy.port}`);

        // Test proxy first
        const isWorking = await this.testProxy(proxy);
        if (!isWorking) {
          this.markProxyFailed(proxy);
          continue;
        }

        const response = await axios.get(url, {
          proxy: {
            host: proxy.host,
            port: proxy.port,
            auth: proxy.auth
          },
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          maxRedirects: 3
        });

        if (response.status === 200 && response.data) {
          // Check if response contains blocking message
          if (response.data.toLowerCase().includes('sorry, you have been blocked')) {
            console.log(`🚫 Proxy ${proxy.host} got blocked`);
            this.markProxyFailed(proxy);
            continue;
          }

          console.log(`✅ PROXY SUCCESS: ${proxy.host}:${proxy.port}`);
          return {
            success: true,
            html: response.data,
            proxy: `${proxy.host}:${proxy.port}`
          };
        }

      } catch (error) {
        console.log(`❌ Proxy ${proxy.host}:${proxy.port} failed: ${error.message}`);
        this.markProxyFailed(proxy);
        
        // Add delay between attempts
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { success: false, error: 'All proxy attempts failed' };
  }

  // Direct request without proxy as fallback
  public async makeDirectRequest(url: string): Promise<ProxyResult> {
    try {
      console.log('📡 Making direct request (no proxy)...');
      
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://www.trendyol.com/',
        },
        maxRedirects: 3
      });

      return {
        success: true,
        html: response.data,
        proxy: 'direct'
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get proxy statistics
  public getStats() {
    return {
      totalProxies: this.workingProxies.length,
      failedProxies: this.failedProxies.size,
      workingProxies: this.workingProxies.length - this.failedProxies.size,
      currentIndex: this.currentProxyIndex
    };
  }
}

export const proxyRotationSystem = new ProxyRotationSystem();