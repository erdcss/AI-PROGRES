/**
 * Test Enhanced Product Extractor
 * Direct test for the enhanced extraction system
 */

import express from 'express';
import axios from 'axios';
import { extractEnhancedProductData } from './enhanced-product-extractor';

export const testRoutes = express.Router();

testRoutes.post('/test-enhanced', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`🧪 Testing enhanced extractor for: ${url}`);
    
    // Fetch HTML
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    const html = response.data;
    console.log(`📄 HTML fetched: ${html.length} bytes`);
    
    // Test enhanced extractor
    const enhancedData = extractEnhancedProductData(html);
    
    console.log(`✅ Enhanced extraction complete:
    📋 Features: ${enhancedData.features.length}
    👕 Variants: ${enhancedData.variants.length}
    🔍 Has Real Variants: ${enhancedData.hasRealVariants}
    🏷️ Brand: ${enhancedData.specifications.brand || 'Not detected'}`);
    
    // Sample features for debugging
    if (enhancedData.features.length > 0) {
      console.log(`🔍 Sample features:`);
      enhancedData.features.slice(0, 5).forEach((feature, index) => {
        console.log(`  ${index + 1}. ${feature.key}: ${feature.value} (${feature.category})`);
      });
    }
    
    // Sample variants for debugging
    if (enhancedData.variants.length > 0) {
      console.log(`🔍 Sample variants:`);
      enhancedData.variants.slice(0, 3).forEach((variant, index) => {
        console.log(`  ${index + 1}. ${variant.color} - ${variant.size} (${variant.inStock ? 'In Stock' : 'Out of Stock'})`);
      });
    }
    
    res.json({
      success: true,
      data: enhancedData,
      summary: {
        featuresCount: enhancedData.features.length,
        variantsCount: enhancedData.variants.length,
        hasRealVariants: enhancedData.hasRealVariants,
        detectedBrand: enhancedData.specifications.brand
      }
    });
    
  } catch (error: any) {
    console.error('Enhanced extractor test error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});