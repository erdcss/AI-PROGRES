/**
 * Test Ultimate Price Extractor
 * Quick test for the new price extraction system
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { ultimatePriceExtract } from './ultimate-price-extractor';

export async function testUltimatePriceExtraction(url: string) {
  console.log(`🧪 TESTING ULTIMATE PRICE EXTRACTOR ON: ${url}`);
  
  try {
    // Fetch the page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });
    
    const htmlContent = response.data;
    const $ = cheerio.load(htmlContent);
    
    console.log(`📄 HTML loaded: ${htmlContent.length} characters`);
    
    // Test the ultimate price extractor
    const result = ultimatePriceExtract($, htmlContent);
    
    console.log('🎯 ULTIMATE PRICE EXTRACTOR TEST RESULT:');
    console.log('==========================================');
    console.log(`Original Price: ${result.original} TL`);
    console.log(`With Profit: ${result.withProfit} TL`);
    console.log(`Method Used: ${result.method}`);
    console.log(`Raw Data: ${result.raw}`);
    console.log(`Formatted: ${result.formatted}`);
    console.log('==========================================');
    
    return result;
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    return null;
  }
}

// For ES module compatibility - remove require.main check