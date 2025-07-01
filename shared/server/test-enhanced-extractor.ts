/**
 * Test Enhanced Product Extractor
 * Debug tool to test feature extraction
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractTrendyolSpecificData } from './trendyol-specific-extractor';

export async function testEnhancedExtractor() {
  const url = 'https://www.trendyol.com/saade/tas-kruvaze-crop-blazer-ceket-p-811203772';
  
  try {
    console.log('🔍 Testing enhanced extractor...');
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    console.log(`📄 HTML Size: ${html.length} bytes`);
    
    // Test specific selectors
    console.log('\n🔍 Testing specific selectors:');
    
    // Test tables
    $('table tr').each((i, el) => {
      const cells = $(el).find('td, th');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        if (key && value) {
          console.log(`📋 Table: ${key} = ${value}`);
        }
      }
    });
    
    // Test product details section
    $('.product-detail-module, .detail-content, .pr-in-dt').each((i, el) => {
      const text = $(el).text();
      console.log(`📝 Product detail text length: ${text.length}`);
      
      // Look for specific patterns
      const kalipMatch = text.match(/Kalıp[:\s]*([A-Za-z]+)/i);
      if (kalipMatch) console.log(`✅ Found Kalıp: ${kalipMatch[1]}`);
      
      const materyalMatch = text.match(/Materyal[:\s]*([A-Za-zğüşöçıİĞÜŞÖÇ\s%]+)/i);
      if (materyalMatch) console.log(`✅ Found Materyal: ${materyalMatch[1]}`);
    });
    
    // Search for product features in all text
    const allText = $('body').text();
    console.log(`\n📄 Full body text length: ${allText.length}`);
    
    // Look for the specific features mentioned by user
    const features = [
      'Kalıp', 'Materyal', 'Cep', 'Astar Durumu', 'Kol Tipi', 'Desen',
      'Yaka Tipi', 'Kumaş Tipi', 'Renk', 'Kapama Şekli', 'Ürün Detayı',
      'Kol Boyu', 'Koleksiyon', 'Kalınlık', 'Boy', 'Siluet', 'Ortam',
      'Ek Özellik', 'Dokuma Tipi', 'Sürdürülebilirlik Detayı'
    ];
    
    console.log('\n🔍 Searching for specific features:');
    features.forEach(feature => {
      const regex = new RegExp(`${feature}[^\\n]*`, 'gi');
      const matches = allText.match(regex);
      if (matches) {
        matches.forEach(match => {
          if (match.length < 100) {
            console.log(`✅ ${feature}: ${match.trim()}`);
          }
        });
      }
    });
    
    // Test the actual extractor
    console.log('\n🎯 Testing Trendyol-specific extractor:');
    const result = extractTrendyolSpecificData(html);
    
    console.log(`📊 Extractor results:`);
    console.log(`  Features: ${result.features.length}`);
    console.log(`  Variants: ${result.variants.length}`);
    console.log(`  Has Real Variants: ${result.hasRealVariants}`);
    
    result.features.forEach((feature, i) => {
      console.log(`  ${i + 1}. ${feature.key}: ${feature.value}`);
    });
    
    result.variants.forEach((variant, i) => {
      console.log(`  Variant ${i + 1}: Size ${variant.size}, In Stock: ${variant.inStock}`);
    });
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test if called directly
if (require.main === module) {
  testEnhancedExtractor();
}