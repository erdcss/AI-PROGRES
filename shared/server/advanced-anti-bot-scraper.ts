/**
 * Advanced Anti-Bot Scraper - Enhanced bypass system
 */

import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';

interface AdvancedScrapingResult {
  success: boolean;
  html?: string;
  error?: string;
}

// Rotating User Agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0'
];

// Get random user agent
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Advanced headers for different strategies
function getAdvancedHeaders(strategy: number): Record<string, string> {
  const baseHeaders = {
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };

  switch (strategy) {
    case 1: // Standard browser
      return {
        ...baseHeaders,
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      };

    case 2: // Mobile browser
      return {
        ...baseHeaders,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"iOS"'
      };

    case 3: // Search engine referrer
      return {
        ...baseHeaders,
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.google.com/search?q=trendyol+araba+güneşlik',
        'sec-ch-ua': '"Google Chrome";v="122", "Chromium";v="122", "Not(A:Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      };

    case 4: // Social media referrer
      return {
        ...baseHeaders,
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.facebook.com/',
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      };

    default:
      return {
        ...baseHeaders,
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      };
  }
}

// Random delay function
function randomDelay(min: number = 1000, max: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Clean URL function
function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove tracking parameters
    const trackingParams = ['boutiqueId', 'merchantId', 'sav', 'utm_source', 'utm_medium', 'utm_campaign'];
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    return urlObj.toString();
  } catch {
    return url;
  }
}

export async function advancedAntiBot(url: string): Promise<AdvancedScrapingResult> {
  console.log(`🛡️ Advanced anti-bot scraping: ${url}`);
  
  // Clean the URL first
  const cleanedUrl = cleanUrl(url);
  if (cleanedUrl !== url) {
    console.log(`🧹 URL cleaned: ${cleanedUrl}`);
  }

  const strategies = [1, 2, 3, 4];
  
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    console.log(`🎯 Trying strategy ${strategy}/4...`);
    
    try {
      // Random delay before each attempt
      await randomDelay(1500, 4000);
      
      const config: AxiosRequestConfig = {
        headers: getAdvancedHeaders(strategy),
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
        // Additional axios configurations
        decompress: true,
        responseType: 'text'
      };

      const response = await axios.get(cleanedUrl, config);
      
      if (response.data && response.data.length > 10000) {
        console.log(`✅ Strategy ${strategy} successful: ${response.data.length} chars`);
        return {
          success: true,
          html: response.data
        };
      } else {
        console.log(`⚠️ Strategy ${strategy} returned minimal content: ${response.data?.length || 0} chars`);
      }
      
    } catch (error: any) {
      console.log(`❌ Strategy ${strategy} failed: ${error.message}`);
      
      // If this is not a 403 error, it might be worth trying other strategies
      if (error.response?.status !== 403) {
        console.log(`🔄 Non-403 error, continuing with other strategies...`);
      }
    }
  }

  // All strategies failed
  return {
    success: false,
    error: 'All anti-bot strategies failed'
  };
}

// Extract basic product info from HTML
export function extractBasicInfo(html: string) {
  const $ = cheerio.load(html);
  
  const title = $('h1').first().text().trim() || 
                $('.pr-new-br span').first().text().trim() ||
                $('[data-testid="product-title"]').text().trim();
  
  // Try to find price
  const priceSelectors = [
    '.prc-dsc',
    '.prc-org',
    '.pr-bx-nm .prc',
    '[data-testid="price"]',
    '.product-price',
    '.price-current'
  ];
  
  let price = '';
  for (const selector of priceSelectors) {
    const priceText = $(selector).first().text().trim();
    if (priceText && priceText.includes('TL')) {
      price = priceText;
      break;
    }
  }
  
  return {
    title: title || 'Ürün başlığı bulunamadı',
    price: price || 'Fiyat bulunamadı',
    hasContent: html.length > 50000
  };
}