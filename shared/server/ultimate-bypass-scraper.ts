/**
 * Ultimate Bypass Scraper - Maximum evasion system for protected sites
 */

import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';

interface UltimateBypassResult {
  success: boolean;
  html?: string;
  error?: string;
  method?: string;
}

// Comprehensive User Agent pool with real browser fingerprints
const REALISTIC_USER_AGENTS = [
  // Chrome Windows 11
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Firefox Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  
  // Edge Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  
  // Chrome macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  
  // Safari macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  
  // Mobile Chrome
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

// Real referrer sources that look legitimate
const LEGITIMATE_REFERRERS = [
  'https://www.google.com.tr/search?q=trendyol',
  'https://www.google.com/search?q=araba+g%C3%BCne%C5%9Flik',
  'https://www.yandex.com.tr/search/?text=trendyol+araba',
  'https://search.yahoo.com/search?p=trendyol',
  'https://www.bing.com/search?q=trendyol+araba+güneşlik',
  'https://duckduckgo.com/?q=trendyol+araba',
  'https://www.facebook.com/',
  'https://www.instagram.com/',
  'https://twitter.com/',
  '',  // Direct access
];

// Turkish IP ranges simulation
const TURKISH_IP_SIMULATION = [
  '85.105.',  // Türk Telekom
  '31.223.',  // Türk Telekom
  '78.186.',  // Vodafone TR
  '88.249.',  // Turkcell
  '95.70.',   // TTNet
];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRealisticHeaders(strategy: string): Record<string, string> {
  const userAgent = getRandomElement(REALISTIC_USER_AGENTS);
  const referrer = getRandomElement(LEGITIMATE_REFERRERS);
  
  const baseHeaders = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referrer ? 'cross-site' : 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'DNT': '1',
    'Connection': 'keep-alive',
  };

  // Add referrer if available
  if (referrer) {
    baseHeaders['Referer'] = referrer;
  }

  // Add browser-specific headers
  if (userAgent.includes('Chrome')) {
    baseHeaders['sec-ch-ua'] = '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"';
    baseHeaders['sec-ch-ua-mobile'] = userAgent.includes('Mobile') ? '?1' : '?0';
    baseHeaders['sec-ch-ua-platform'] = userAgent.includes('Windows') ? '"Windows"' : 
                                       userAgent.includes('Mac') ? '"macOS"' : 
                                       userAgent.includes('Android') ? '"Android"' : '"Linux"';
  }

  // Strategy-specific modifications
  switch (strategy) {
    case 'mobile':
      baseHeaders['sec-ch-ua-mobile'] = '?1';
      baseHeaders['Viewport-Width'] = '375';
      break;
    case 'slow-connection':
      baseHeaders['Save-Data'] = 'on';
      baseHeaders['Connection'] = 'keep-alive';
      break;
    case 'high-priority':
      baseHeaders['Priority'] = 'u=0, i';
      break;
  }

  return baseHeaders;
}

async function randomDelay(min: number = 2000, max: number = 6000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`⏱️ Waiting ${delay}ms to appear human...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Clean and optimize URL
function optimizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Remove all tracking parameters
    const trackingParams = [
      'boutiqueId', 'merchantId', 'sav', 'utm_source', 'utm_medium', 
      'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid',
      '_ga', '_gid', 'mc_eid', 'mc_cid'
    ];
    
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    return urlObj.toString();
  } catch {
    return url;
  }
}

export async function ultimateBypass(url: string): Promise<UltimateBypassResult> {
  console.log(`🚀 Ultimate bypass starting for: ${url}`);
  
  const cleanedUrl = optimizeUrl(url);
  console.log(`🧹 Optimized URL: ${cleanedUrl}`);

  const strategies = [
    { name: 'desktop-chrome', timeout: 25000 },
    { name: 'mobile', timeout: 30000 },
    { name: 'slow-connection', timeout: 35000 },
    { name: 'high-priority', timeout: 20000 },
    { name: 'firefox-desktop', timeout: 25000 }
  ];

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    console.log(`🎯 Trying strategy ${i + 1}/${strategies.length}: ${strategy.name}`);
    
    try {
      // Human-like delay between attempts
      if (i > 0) {
        await randomDelay(3000, 8000);
      }
      
      const headers = generateRealisticHeaders(strategy.name);
      
      const config: AxiosRequestConfig = {
        headers,
        timeout: strategy.timeout,
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 400,
        decompress: true,
        responseType: 'text',
        // Simulate real browser behavior
        maxContentLength: 50 * 1024 * 1024, // 50MB limit
        maxBodyLength: 50 * 1024 * 1024,
      };

      console.log(`📡 Making request with ${strategy.name} strategy...`);
      const response = await axios.get(cleanedUrl, config);
      
      if (response.data && response.data.length > 15000) {
        console.log(`✅ SUCCESS with ${strategy.name}: ${response.data.length} characters`);
        
        // Verify we got actual product page content
        const $ = cheerio.load(response.data);
        const hasProductContent = 
          $('h1').length > 0 || 
          $('.product').length > 0 || 
          $('[data-testid="product"]').length > 0 ||
          response.data.includes('product') ||
          response.data.includes('price') ||
          response.data.includes('TL');
        
        if (hasProductContent) {
          return {
            success: true,
            html: response.data,
            method: strategy.name
          };
        } else {
          console.log(`⚠️ ${strategy.name} returned non-product content`);
        }
      } else {
        console.log(`⚠️ ${strategy.name} returned minimal content: ${response.data?.length || 0} chars`);
      }
      
    } catch (error: any) {
      console.log(`❌ ${strategy.name} failed: ${error.response?.status || error.code} - ${error.message}`);
      
      // Log specific error details for debugging
      if (error.response?.status === 403) {
        console.log(`🔒 403 Forbidden - Anti-bot protection detected`);
      } else if (error.response?.status === 503) {
        console.log(`🚫 503 Service Unavailable - Rate limited`);
      } else if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
        console.log(`🔌 Connection issue - Server rejected connection`);
      }
    }
  }

  // All strategies failed
  console.log(`💥 All ${strategies.length} strategies failed`);
  return {
    success: false,
    error: 'All ultimate bypass strategies failed - site has maximum protection'
  };
}

// Quick validation function
export function validateProductContent(html: string): boolean {
  if (!html || html.length < 10000) return false;
  
  const $ = cheerio.load(html);
  
  // Check for essential product page elements
  const indicators = [
    $('h1').length > 0,
    $('.product').length > 0,
    $('[data-testid*="product"]').length > 0,
    html.includes('TL'),
    html.includes('price'),
    html.includes('add-to-cart') || html.includes('sepet'),
    html.includes('trendyol')
  ];
  
  const validIndicators = indicators.filter(Boolean).length;
  return validIndicators >= 3; // Require at least 3 indicators
}