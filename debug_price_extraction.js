// Debug script to extract all price-related data from mayo product
const axios = require('axios');
const cheerio = require('cheerio');

async function debugPriceExtraction() {
  try {
    const url = 'https://www.trendyol.com/sayina/kadin-sari-tek-omuz-kemer-detayli-balenli-ozel-tasarim-astarli-sik-butik-mayo-p-682682444?boutiqueId=61&merchantId=381608';
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    console.log('=== ALL PRICE PATTERNS IN PAGE ===');
    
    // Search for all 4-digit numbers
    const fourDigitMatches = html.match(/\b\d{4}\b/g);
    console.log('4-digit numbers:', fourDigitMatches ? fourDigitMatches.slice(0, 10) : 'None');
    
    // Search for TL patterns
    const tlMatches = html.match(/\d+[.,]?\d*\s*TL/g);
    console.log('TL patterns:', tlMatches ? tlMatches.slice(0, 10) : 'None');
    
    // Search for price in JSON-LD
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((i, script) => {
      const content = $(script).html();
      if (content && content.includes('price')) {
        console.log('JSON-LD with price:', content.substring(0, 200));
      }
    });
    
    // Search all scripts for price-related content
    const scripts = $('script').toArray();
    for (let i = 0; i < scripts.length; i++) {
      const scriptContent = $(scripts[i]).html() || '';
      
      if (scriptContent.includes('1458') || scriptContent.includes('price')) {
        console.log(`Script ${i} contains price data:`, scriptContent.substring(0, 500));
      }
    }
    
    // Look for specific high-value patterns
    const highValuePatterns = [
      /1\.?458[.,]?\d*/g,
      /1458[.,]?\d*/g,
      /"price":\s*\d{4,}/gi,
      /"sellPrice":\s*\d{4,}/gi
    ];
    
    highValuePatterns.forEach((pattern, index) => {
      const matches = html.match(pattern);
      if (matches) {
        console.log(`Pattern ${index} matches:`, matches.slice(0, 5));
      }
    });
    
  } catch (error) {
    console.error('Debug error:', error.message);
  }
}

debugPriceExtraction();