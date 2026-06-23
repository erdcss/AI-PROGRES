/**
 * Alternative Data Sources for Product Information
 * When primary scraping fails, use alternative methods
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

// Updated Trendyol mobile API endpoints (latest working endpoints)
const TRENDYOL_MOBILE_API = {
  productDetails: (productId: string) => `https://public.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  searchV2: (productId: string) => `https://public.trendyol.com/discovery-web-searchgw-service/v2/api/filter/products?pi=${productId}`,
  productInfo: (productId: string) => `https://cdn.dsmcdn.com/products/${productId}/product.json`,
  priceInfo: (productId: string) => `https://public.trendyol.com/discovery-web-productgw-service/api/price/${productId}`
};

// Extract product ID from Trendyol URL
function extractProductId(url: string): string | null {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : null;
}

// Try alternative mobile API approach with multiple endpoints
export async function tryMobileAPI(url: string): Promise<any> {
  const { fetchTrendyolProductByUrl } = await import('./trendyol-product-api');
  const apiProduct = await fetchTrendyolProductByUrl(url);
  if (apiProduct) {
    return {
      success: true,
      title: apiProduct.title,
      brand: apiProduct.brand,
      price: {
        original: apiProduct.price.original,
        withProfit: apiProduct.price.withProfit,
        currency: apiProduct.price.currency,
      },
      images: apiProduct.images,
      description: apiProduct.description,
      category: apiProduct.category,
      variants: [],
    };
  }

  const productId = extractProductId(url);
  if (!productId) return null;

  const endpoints = [
    TRENDYOL_MOBILE_API.productDetails(productId),
    TRENDYOL_MOBILE_API.searchV2(productId),
    TRENDYOL_MOBILE_API.productInfo(productId),
    TRENDYOL_MOBILE_API.priceInfo(productId)
  ];

  // ⚡ Run all mobile API requests concurrently with fast 3s timeout
  console.log(`📱 Trying ${endpoints.length} mobile API endpoints in parallel for product ID: ${productId}`);
  const results = await Promise.allSettled(
    endpoints.map(endpoint =>
      axios.get(endpoint, {
        timeout: 3000,
        headers: {
          'User-Agent': 'TrendyolMobiOS/4.2.1 (iPhone; iOS 17.0; tr_TR)',
          'Accept': 'application/json',
          'Accept-Language': 'tr-TR',
          'Cache-Control': 'no-cache',
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
    )
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const data = r.value.data;
      if (data && (data.result || data.product || data.products)) {
        console.log(`✅ Mobile API endpoint ${i+1} successful!`);
        const productData = data.result || data.product || data.products?.[0] || data;
        return {
          success: true,
          title: productData.name || productData.title || 'Bilinmiyor',
          brand: productData.brand?.name || productData.brandName || 'Bilinmiyor',
          price: {
            original: productData.price?.originalPrice || productData.price?.discountedPrice || productData.originalPrice || productData.price || 0,
            currency: 'TL'
          },
          images: productData.images?.map((img: any) => img.url || img) || [],
          description: productData.description || '',
          category: productData.category?.name || '',
          variants: productData.variants || []
        };
      }
    } else {
      console.log(`❌ Mobile API endpoint ${i+1} failed: ${r.reason?.message}`);
    }
  }

  console.log('❌ All mobile API endpoints failed');
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

  // ⚡ FAST LANE: Try proxy/referer AND mobile APIs concurrently — take whichever wins
  console.log('⚡ Running proxy + mobile API in parallel...');
  const fastResult = await Promise.any([
    tryProxyServices(url),
    tryMobileAPI(url)
  ]).catch(() => null);

  if (fastResult) {
    console.log('✅ Fast-lane succeeded');
    return fastResult;
  }

  // Fallback: Google Cache
  const cacheResult = await tryGoogleCache(url);
  if (cacheResult) {
    return cacheResult;
  }

  // Last resort: Wayback Machine
  const waybackResult = await tryWaybackMachine(url);
  if (waybackResult) {
    return waybackResult;
  }

  console.log('❌ All alternative sources failed');
  return null;
}