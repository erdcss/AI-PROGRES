/**
 * Alternative Data Sources for Product Information
 * When primary scraping fails, use alternative methods
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// Trendyol mobile API endpoints (less monitored)
const TRENDYOL_MOBILE_API = {
  productDetails: (productId: string) => `https://public-mdc.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  search: (query: string) => `https://public-mdc.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll?q=${encodeURIComponent(query)}`,
  productReviews: (productId: string) => `https://public-mdc.trendyol.com/discovery-web-socialgw-service/v1/review/product/${productId}?page=0&size=20`
};

// Extract product ID from Trendyol URL
function extractProductId(url: string): string | null {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : null;
}

// Try alternative mobile API approach
export async function tryMobileAPI(url: string): Promise<any> {
  const productId = extractProductId(url);
  if (!productId) {
    return null;
  }

  try {
    console.log(`📱 Trying mobile API for product ID: ${productId}`);
    
    const response = await axios.get(TRENDYOL_MOBILE_API.productDetails(productId), {
      timeout: 10000,
      headers: {
        'User-Agent': 'TrendyolMobiOS/3.8.1 (iPhone; iOS 15.0; tr_TR)',
        'Accept': 'application/json',
        'Accept-Language': 'tr-TR',
        'Cache-Control': 'no-cache'
      }
    });

    const data = response.data;
    if (data && data.result) {
      console.log('✅ Mobile API successful!');
      return {
        success: true,
        title: data.result.name || 'Bilinmiyor',
        brand: data.result.brand?.name || 'Bilinmiyor',
        price: {
          original: data.result.price?.originalPrice || data.result.price?.discountedPrice || 0,
          currency: 'TL'
        },
        images: data.result.images?.map((img: any) => img.url) || [],
        description: data.result.description || '',
        category: data.result.category?.name || '',
        variants: data.result.variants || []
      };
    }
  } catch (error) {
    console.log(`❌ Mobile API failed: ${error.message}`);
  }

  return null;
}

// Try Google Cache approach
export async function tryGoogleCache(url: string): Promise<any> {
  try {
    console.log('🔍 Trying Google Cache approach...');
    
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
    
    const response = await axios.get(cacheUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (response.data && response.data.length > 5000) {
      console.log('✅ Google Cache successful!');
      return {
        success: true,
        html: response.data,
        source: 'google-cache'
      };
    }
  } catch (error) {
    console.log(`❌ Google Cache failed: ${error.message}`);
  }

  return null;
}

// Try Wayback Machine approach
export async function tryWaybackMachine(url: string): Promise<any> {
  try {
    console.log('⏰ Trying Wayback Machine approach...');
    
    // Get latest snapshot
    const snapshotResponse = await axios.get(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      timeout: 10000
    });

    if (snapshotResponse.data?.archived_snapshots?.closest?.url) {
      const archiveUrl = snapshotResponse.data.archived_snapshots.closest.url;
      console.log(`📰 Found archive: ${archiveUrl}`);
      
      const contentResponse = await axios.get(archiveUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (contentResponse.data && contentResponse.data.length > 5000) {
        console.log('✅ Wayback Machine successful!');
        return {
          success: true,
          html: contentResponse.data,
          source: 'wayback-machine'
        };
      }
    }
  } catch (error) {
    console.log(`❌ Wayback Machine failed: ${error.message}`);
  }

  return null;
}

// Try proxy services approach (using public proxies)
export async function tryProxyServices(url: string): Promise<any> {
  const publicProxies = [
    'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&format=textplain',
    // Add more proxy sources as needed
  ];

  try {
    console.log('🌐 Trying proxy services approach...');
    
    // For now, let's use a different approach - change referer
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site'
      }
    });

    if (response.data && response.data.length > 5000) {
      console.log('✅ Proxy/Referer approach successful!');
      return {
        success: true,
        html: response.data,
        source: 'proxy-referer'
      };
    }
  } catch (error) {
    console.log(`❌ Proxy services failed: ${error.message}`);
  }

  return null;
}

// Main fallback orchestrator
export async function tryAlternativeSources(url: string): Promise<any> {
  console.log('🔄 Starting alternative data source attempts...');
  
  // Try mobile API first (fastest and most reliable)
  const mobileResult = await tryMobileAPI(url);
  if (mobileResult) {
    return mobileResult;
  }

  // Try referer-based approach
  const proxyResult = await tryProxyServices(url);
  if (proxyResult) {
    return proxyResult;
  }

  // Try Google Cache
  const cacheResult = await tryGoogleCache(url);
  if (cacheResult) {
    return cacheResult;
  }

  // Try Wayback Machine as last resort
  const waybackResult = await tryWaybackMachine(url);
  if (waybackResult) {
    return waybackResult;
  }

  console.log('❌ All alternative sources failed');
  return null;
}