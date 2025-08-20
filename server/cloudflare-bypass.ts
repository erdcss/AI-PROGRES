/**
 * Cloudflare Bypass System - Advanced Anti-Detection
 */

import axios from 'axios';

export interface BypassResult {
  success: boolean;
  html?: string;
  error?: string;
}

// Enhanced headers for bypassing Cloudflare
const CLOUDFLARE_BYPASS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Sec-Ch-Ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Cache-Control': 'max-age=0'
};

export async function bypassCloudflare(url: string): Promise<BypassResult> {
  console.log('🛡️ CLOUDFLARE BYPASS: Starting advanced bypass...');
  
  const strategies = [
    { name: 'curl-impersonation', method: tryCurlImpersonation },
    { name: 'session-reuse', method: trySessionReuse },
    { name: 'delayed-request', method: tryDelayedRequest },
    { name: 'header-rotation', method: tryHeaderRotation }
  ];

  for (const strategy of strategies) {
    try {
      console.log(`🔧 Trying ${strategy.name}...`);
      const result = await strategy.method(url);
      if (result.success) {
        console.log(`✅ BYPASS SUCCESS via ${strategy.name}`);
        return result;
      }
      await delay(2000); // Longer delays between attempts
    } catch (error) {
      console.log(`❌ ${strategy.name} failed:`, error.message);
    }
  }
  
  return { success: false, error: 'All bypass methods failed' };
}

async function tryCurlImpersonation(url: string): Promise<BypassResult> {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        ...CLOUDFLARE_BYPASS_HEADERS,
        'User-Agent': 'curl/7.68.0' // Impersonate curl
      },
      maxRedirects: 0, // Don't follow redirects
      validateStatus: (status) => status < 500
    });
    
    return { success: true, html: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function trySessionReuse(url: string): Promise<BypassResult> {
  try {
    // First make a request to establish session
    await axios.get('https://www.trendyol.com', {
      timeout: 15000,
      headers: CLOUDFLARE_BYPASS_HEADERS,
      withCredentials: true
    });
    
    await delay(3000); // Wait for session to establish
    
    // Then make the actual request
    const response = await axios.get(url, {
      timeout: 20000,
      headers: CLOUDFLARE_BYPASS_HEADERS,
      withCredentials: true
    });
    
    return { success: true, html: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function tryDelayedRequest(url: string): Promise<BypassResult> {
  try {
    // Multiple slow requests to appear human-like
    for (let i = 0; i < 3; i++) {
      try {
        const response = await axios.get(url, {
          timeout: 25000,
          headers: {
            ...CLOUDFLARE_BYPASS_HEADERS,
            'User-Agent': getRandomUserAgent()
          },
          maxRedirects: 3
        });
        
        // Check if we got blocked
        if (!response.data.includes('sorry, you have been blocked')) {
          return { success: true, html: response.data };
        }
      } catch (error) {
        console.log(`Attempt ${i + 1} failed, retrying...`);
      }
      
      await delay(5000 + Math.random() * 3000); // Random delay 5-8 seconds
    }
    
    return { success: false, error: 'All delayed attempts failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function tryHeaderRotation(url: string): Promise<BypassResult> {
  const headerVariations = [
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    },
    {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    }
  ];
  
  for (const headers of headerVariations) {
    try {
      const response = await axios.get(url, {
        timeout: 20000,
        headers: {
          ...CLOUDFLARE_BYPASS_HEADERS,
          ...headers
        },
        maxRedirects: 2
      });
      
      if (!response.data.includes('sorry, you have been blocked')) {
        return { success: true, html: response.data };
      }
      
      await delay(4000);
    } catch (error) {
      continue;
    }
  }
  
  return { success: false, error: 'Header rotation failed' };
}

function getRandomUserAgent(): string {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}