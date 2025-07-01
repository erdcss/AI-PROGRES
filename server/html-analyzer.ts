/**
 * HTML Analyzer - Debug tool to find structured product attributes
 */

import * as cheerio from 'cheerio';
import fs from 'fs';

export function analyzeProductHTML(html: string, productUrl: string) {
  const $ = cheerio.load(html);
  const analysis = {
    url: productUrl,
    htmlSize: html.length,
    scriptTags: 0,
    potentialDataSources: [] as string[],
    jsonStructures: [] as any[],
    attributeContainers: [] as string[],
    suspiciousElements: [] as string[]
  };

  console.log(`🔍 HTML Analysis for: ${productUrl}`);
  console.log(`📄 HTML size: ${html.length} bytes`);

  // Analyze script tags for data
  $('script').each((i, script) => {
    analysis.scriptTags++;
    const content = $(script).html();
    if (!content) return;

    // Look for common data patterns
    const dataPatterns = [
      'window.__INITIAL_STATE__',
      'window.__PRODUCT_DETAIL_APP_INITIAL_STATE__',
      'window.__PRODUCT_DATA__',
      'productDetailPageData',
      'productInfo',
      'productData',
      'attributes',
      'specifications',
      'features'
    ];

    dataPatterns.forEach(pattern => {
      if (content.includes(pattern)) {
        analysis.potentialDataSources.push(`Script ${i}: ${pattern}`);
        console.log(`✅ Found data pattern: ${pattern} in script ${i}`);
      }
    });

    // Try to extract JSON structures
    try {
      // Look for JSON object assignments
      const jsonMatches = content.match(/=\s*({[\s\S]*?});/g);
      if (jsonMatches) {
        jsonMatches.forEach((match, idx) => {
          try {
            const jsonStr = match.replace(/^=\s*/, '').replace(/;$/, '');
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object') {
              analysis.jsonStructures.push({
                scriptIndex: i,
                matchIndex: idx,
                keys: Object.keys(parsed),
                hasAttributes: !!parsed.attributes,
                hasProduct: !!parsed.product,
                hasProductInfo: !!parsed.productInfo
              });
              console.log(`📊 JSON structure found in script ${i}, match ${idx}: ${Object.keys(parsed).slice(0, 5).join(', ')}`);
            }
          } catch (e) {
            // Not valid JSON
          }
        });
      }
    } catch (e) {
      // Continue analysis
    }
  });

  // Analyze DOM for attribute containers
  const attributeSelectors = [
    '[data-testid*="product"]',
    '[data-testid*="attribute"]',
    '[class*="product-detail"]',
    '[class*="product-info"]',
    '[class*="specification"]',
    '[class*="feature"]',
    '[class*="attribute"]',
    '[id*="product"]',
    '[id*="detail"]'
  ];

  attributeSelectors.forEach(selector => {
    const elements = $(selector);
    if (elements.length > 0) {
      analysis.attributeContainers.push(`${selector}: ${elements.length} elements`);
      console.log(`🎯 Found ${elements.length} elements matching: ${selector}`);
      
      // Analyze text content of these elements
      elements.each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 10 && text.length < 500 && text.includes(':')) {
          analysis.suspiciousElements.push(`${selector}[${i}]: ${text.substring(0, 100)}...`);
          console.log(`🔍 Suspicious element content: ${text.substring(0, 100)}...`);
        }
      });
    }
  });

  // Look for specific Turkish product attribute patterns
  const turkishPatterns = [
    /materyal|kumaş/gi,
    /renk|color/gi,
    /beden|size/gi,
    /marka|brand/gi,
    /model|tip/gi,
    /özellik|feature/gi,
    /detay|detail/gi,
    /kalıp|fit/gi,
    /yıkama|wash/gi,
    /bakım|care/gi
  ];

  turkishPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      console.log(`🇹🇷 Turkish attribute pattern "${pattern.source}": ${matches.length} matches`);
    }
  });

  // Save analysis to file for inspection
  const analysisFile = `html_analysis_${Date.now()}.json`;
  fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2));
  console.log(`💾 Analysis saved to: ${analysisFile}`);

  return analysis;
}