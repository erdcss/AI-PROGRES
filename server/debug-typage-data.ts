import * as cheerio from 'cheerio';

export function debugTYPageData(html: string): void {
  console.log('🔍 TYPageData debugging başlatıldı...');
  
  // Check for various patterns
  const patterns = [
    /window\.TYPageData\s*=\s*({.*?});/s,
    /TYPageData\s*=\s*({.*?});/s,
    /"product"\s*:\s*{[\s\S]*?"variants"\s*:\s*\[[\s\S]*?\]/,
    /"variants"\s*:\s*\[[\s\S]*?\]/,
    /window\.__INITIAL_STATE__\s*=\s*({.*?});/s
  ];
  
  patterns.forEach((pattern, index) => {
    const match = html.match(pattern);
    if (match) {
      console.log(`✅ Pattern ${index + 1} eşleşti: ${match[0].substring(0, 200)}...`);
    } else {
      console.log(`❌ Pattern ${index + 1} eşleşmedi`);
    }
  });
  
  // Check for script tags containing variant data
  const $ = cheerio.load(html);
  const scripts = $('script').toArray();
  
  console.log(`📄 Toplam ${scripts.length} script tag bulundu`);
  
  scripts.forEach((script, index) => {
    const content = $(script).html() || '';
    if (content.includes('variant') || content.includes('TYPageData') || content.includes('product')) {
      console.log(`🎯 Script ${index + 1} içinde varyant verisi var: ${content.substring(0, 100)}...`);
    }
  });
  
  // Look for JSON-LD structured data
  const jsonLdScripts = $('script[type="application/ld+json"]');
  if (jsonLdScripts.length > 0) {
    console.log(`📋 ${jsonLdScripts.length} JSON-LD script bulundu`);
  }
}

export function extractVariantDataFromHTML(html: string): any[] {
  const variants: any[] = [];
  
  // Try to find variant buttons or selection elements
  const $ = cheerio.load(html);
  
  // Color variants
  const colorElements = $('[data-testid*="color"], .color-variant, [class*="color"]');
  console.log(`🎨 ${colorElements.length} renk elementi bulundu`);
  
  // Size variants
  const sizeElements = $('[data-testid*="size"], .size-variant, [class*="size"]');
  console.log(`📏 ${sizeElements.length} beden elementi bulundu`);
  
  return variants;
}