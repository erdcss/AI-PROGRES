/**
 * Debug Feature Extractor - Comprehensive analysis of Trendyol HTML structure
 */

import * as cheerio from 'cheerio';
import axios from 'axios';

export async function debugTrendyolFeatures(url: string) {
  console.log('🔍 Debug: Analyzing Trendyol HTML structure...');
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    console.log(`📄 HTML size: ${html.length} bytes`);

    // Debug 1: Look for any element containing "özellik" or related terms
    console.log('\n🔍 Searching for elements containing "özellik", "materyal", "kumaş":');
    $('*').each((i, element) => {
      const text = $(element).text().toLowerCase();
      if (text.includes('özellik') || text.includes('materyal') || text.includes('kumaş') || text.includes('renk')) {
        const tagName = element.tagName;
        const className = $(element).attr('class') || '';
        const id = $(element).attr('id') || '';
        const content = text.substring(0, 100);
        console.log(`✅ Found: <${tagName}> class="${className}" id="${id}" text="${content}..."`);
      }
    });

    // Debug 2: Analyze all script tags
    console.log('\n🔍 Analyzing script tags for product data:');
    $('script').each((i, script) => {
      const scriptContent = $(script).html();
      if (scriptContent && scriptContent.includes('product')) {
        if (scriptContent.includes('attributes') || scriptContent.includes('properties') || scriptContent.includes('features')) {
          console.log(`✅ Script ${i}: Contains product attributes/properties/features`);
          // Extract a sample of the content
          const sample = scriptContent.substring(0, 500);
          console.log(`   Sample: ${sample}...`);
        }
      }
    });

    // Debug 3: Look for JSON-LD structured data
    console.log('\n🔍 Checking JSON-LD structured data:');
    $('script[type="application/ld+json"]').each((i, script) => {
      try {
        const jsonText = $(script).html();
        if (jsonText) {
          const data = JSON.parse(jsonText);
          console.log(`✅ JSON-LD ${i}: Type: ${data['@type'] || 'unknown'}`);
          if (data.additionalProperty) {
            console.log(`   Additional properties: ${data.additionalProperty.length} items`);
            data.additionalProperty.slice(0, 3).forEach((prop: any, idx: number) => {
              console.log(`   ${idx + 1}. ${prop.name}: ${prop.value}`);
            });
          }
        }
      } catch (e) {
        console.log(`❌ JSON-LD ${i}: Parse error`);
      }
    });

    // Debug 4: Look for specific Trendyol data structures
    console.log('\n🔍 Searching for Trendyol-specific data patterns:');
    const dataPatterns = [
      'productDetail',
      'productAttributes',
      'productFeatures',
      'productSpecs',
      'itemAttributes',
      'variantInfo'
    ];

    dataPatterns.forEach(pattern => {
      if (html.includes(pattern)) {
        console.log(`✅ Found pattern: ${pattern}`);
        const regex = new RegExp(`"${pattern}"[^}]*`, 'g');
        const matches = html.match(regex);
        if (matches) {
          console.log(`   Matches: ${matches.length}`);
          matches.slice(0, 2).forEach((match, idx) => {
            console.log(`   ${idx + 1}. ${match.substring(0, 150)}...`);
          });
        }
      }
    });

    // Debug 5: Check for tables and structured content
    console.log('\n🔍 Checking for tables and structured content:');
    $('table, .table, .specs, .specifications, .attributes, .details').each((i, element) => {
      const tagName = element.tagName;
      const className = $(element).attr('class') || '';
      const rowCount = $(element).find('tr, .row, .item').length;
      console.log(`✅ Found: <${tagName}> class="${className}" rows/items: ${rowCount}`);
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

// Test function
export async function testDebugExtraction() {
  await debugTrendyolFeatures('https://www.trendyol.com/saade/fusya-kruvaze-crop-blazer-ceket-p-902122792');
}