import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import * as cheerio from "cheerio";
import path from "path";
import fs from "fs";
import { storage } from "./storage-fixed";
// import { scrapeProductWithPuppeteer } from "./fixed-puppeteer-scraper";
import { scrapeWithEnhancedMethod } from "./enhanced-trendyol-scraper";
import { generateStrictCSV } from "./strict-csv-generator";
import { instantCSVGenerator } from "./instant-csv-generator-working";
import { getCategoryConfig } from "./category-mapping";
import { cleanTrendyolAttributes } from "./clean-attributes";
import { parseJsonLdProductData, generateTagsFromJsonLd } from "./json-ld-parser";
import { InsertProduct, products as productsTable } from "@shared/schema";
// import { getFinalImages } from "./final-image-solution";
import { extractVariantStockInfo } from "./advanced-size-extractor";
import { extractFocusedData } from './focused-extractor';
import { dailyScheduler } from './scheduler';
import dataAnalysisRoutes from './data-analysis-routes';
import memoryStatusRoutes from './memory-status-api';
import { testImageExtraction } from './direct-image-test';
import { initializeScheduler, getSchedulerStatus, executeTaskManually } from './simple-scheduler';
import { db } from './db';
import { manualFeatureExtraction } from './manual-feature-test';
import { preciseFeatureExtraction } from './precise-feature-extractor';
import { generateBoutiqueCSV } from './boutique-csv-generator';
import { extractAllColorImages, generateMultiColorCSV } from './multi-color-image-extractor';
import { extractMayoColorVariants, generateMayoColorCSV } from './mayo-color-extractor';
import { detectMayoRealColors, assignColorsToImages } from './mayo-real-color-detector';
import { extractAllProductImages, generateImageCSV } from './complete-image-extractor';
import { extractComprehensiveImages, generateComprehensiveImageCSV, generateImageGroupSummary } from './comprehensive-image-system';
import { processCompleteMultiVariant, generateMultiVariantCSV, generateMultiVariantSummary } from './complete-multi-variant-system';
import { scrapeAdvancedVariants, generateAdvancedVariantCSV } from './advanced-variant-scraper';
import { runTrendyolVariantsSpider, generateScrapyOutput, generateScrapyCSV } from './scrapy-like-trendyol-scraper';
import { fixedAuthenticScrape } from './fixed-authentic-scraper';
import { scenarioBasedScrape } from './scenario-based-scraper';


function generateSingleProductShopifyCSV(product: any): string {
  // HEADERS - Şablonunuza tam uygun
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
    'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 
    'SEO Title', 'SEO Description', 'Variant Image', 'Variant Weight Unit', 'Status',
    'Product Features'
  ];

  const rows: string[][] = [];
  rows.push(headers);

  // Handle oluştur (Türkçe karakter temizleme)
  const productHandle = product.title.toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // SADECE STOKTA OLAN BEDENLER İÇİN SATIRLAR - Gerçek stok verisini kullan
  const inStockSizes = product.sizeOptions || [];
  
  console.log(`Stok filtreleme: ${inStockSizes.length} stokta olan beden`);
  console.log(`Stokta olan bedenler: ${inStockSizes.join(', ')}`);
  
  // Özellikler metni (CSV için)
  const featuresText = product.features ? 
    product.features.map((f: any) => `${f.key}: ${f.value}`).join(' | ') : '';

  // Ürün özellikleri HTML formatında (Body için) - sadece özellikler
  let bodyHTML = '';
  if (product.features && product.features.length > 0) {
    bodyHTML = '<div class="product-features"><h4>Ürün Özellikleri:</h4><ul>';
    product.features.forEach((feature: any) => {
      bodyHTML += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    bodyHTML += '</ul></div>';
  } else {
    bodyHTML = `<p>${product.brand} kaliteli ürün.</p>`;
  }

  inStockSizes.forEach((size: string, index: number) => {
    const relatedVariant = product.variants?.find?.((v: any) => v.size === size);
    const variantInStock = relatedVariant ? relatedVariant.inStock : true;
    const variantStock = relatedVariant ? relatedVariant.stockCount : 20;
    
    rows.push([
      productHandle,                                  // 1. Handle - AYNI HANDLE
      product.title,                                  // 2. Title - AYNI BAŞLIK
      bodyHTML,                                       // 3. Body (HTML) - Özelliklerle
      product.brand || 'Mavi',                       // 4. Vendor
      `jean, erkek, ${product.brand?.toLowerCase() || 'mavi'}, denim, pantolon`, // 5. Tags
      'TRUE',                                         // 6. Published
      'Renk',                                         // 7. Option1 Name
      'Indigo',                                       // 8. Option1 Value
      'Beden',                                        // 9. Option2 Name
      size,                                           // 10. Option2 Value - BEDEN
      `${product.brand?.toLowerCase() || 'mavi'}-${size.replace(/[^\w]/g, '-')}`, // 11. Variant SKU
      variantStock.toString(),                        // 12. Variant Inventory Qty
      product.price.withProfit.toString(),           // 13. Variant Price (kar marjılı fiyat)
      product.price.original.toString(),             // 14. Variant Compare At Price (orijinal fiyat)
      product.images[index] || product.images[0] || '', // 15. Image Src
      (index + 1).toString(),                        // 16. Image Position
      product.title,                                  // 17. Image Alt Text
      'FALSE',                                        // 18. Gift Card
      `${product.brand || 'Mavi'} ${product.title.split(' ').slice(0, 3).join(' ')}`, // 19. SEO Title
      `${product.brand || 'Mavi'} ${product.title.split(' ').slice(0, 5).join(' ')}, modern kesim ve rahat kalıp.`, // 20. SEO Description
      product.images[index] || product.images[0] || '', // 21. Variant Image
      'kg',                                           // 22. Variant Weight Unit
      'active',                                       // 23. Status
      featuresText                                    // 24. Product Features
    ]);
  });

  // ADDITIONAL PRODUCT IMAGES - Shopify format
  console.log(`📊 Shopify variant structure: "${productHandle}" - ${inStockSizes.length} variants created`);
  
  // Add remaining product images as media-only rows
  const usedImageCount = Math.min(product.sizeOptions.length, product.images.length);
  const additionalImages = product.images.slice(usedImageCount);
  
  console.log(`📸 Adding ${additionalImages.length} additional product images...`);
  
  additionalImages.forEach((imageUrl: string, index: number) => {
    const imagePosition = usedImageCount + index + 2;
    rows.push([
      productHandle,                                  // 1. Handle - CONSISTENT
      '',                                             // 2. Title
      '',                                             // 3. Body (HTML)
      '',                                             // 4. Vendor
      '',                                             // 5. Product Category
      '',                                             // 6. Type
      '',                                             // 7. Tags
      '',                                             // 8. Published
      '',                                             // 9. Option1 Name
      '',                                             // 10. Option1 Value
      '',                                             // 11. Option2 Name
      '',                                             // 12. Option2 Value
      '',                                             // 13. Variant SKU
      '',                                             // 14. Variant Grams
      '',                                             // 15. Variant Inventory Tracker
      '',                                             // 16. Variant Inventory Qty
      '',                                             // 17. Variant Inventory Policy
      '',                                             // 18. Variant Fulfillment Service
      '',                                             // 19. Variant Price
      '',                                             // 20. Variant Compare At Price
      '',                                             // 21. Variant Requires Shipping
      '',                                             // 22. Variant Taxable
      '',                                             // 23. Variant Barcode
      imageUrl,                                      // 24. Image Src - PRODUCT IMAGE
      imagePosition.toString(),                      // 25. Image Position
      `${product.title} - Additional Image ${index + 1}`, // 26. Image Alt Text
      '',                                             // 27. Gift Card
      '',                                             // 28. SEO Title
      '',                                             // 29. SEO Description
      '',                                             // 30. Variant Image - EMPTY for product images
      '',                                             // 31. Variant Weight Unit
      '',                                             // 32. Cost per item
      '',                                             // 33. Included / Turkey  
      ''                                              // 34. Product Features (boş - ek görseller için)
    ]);
  });
  
  // Eğer 10'dan fazla görsel varsa da tamamını ekle
  if (product.images.length > 10) {
    console.log(`⭐ ${product.images.length} görsel tespit edildi, tamamı CSV'ye ekleniyor!`);
  }

  return rows.map(row => 
    row.map(cell => {
      // CSV için güvenli format - tırnak ve virgül escape
      const cleanCell = String(cell || '').replace(/"/g, '""');
      return cleanCell.includes(',') || cleanCell.includes('"') || cleanCell.includes('\n') 
        ? `"${cleanCell}"` 
        : cleanCell;
    }).join(',')
  ).join('\n');
}

// CSV preview generator function
async function generateCSVPreview(csvPath?: string) {
  if (!csvPath || !fs.existsSync(csvPath)) {
    return null;
  }
  
  try {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return null;
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const rows = lines.slice(1, 6).map(line => { // Show first 5 rows
      return line.split(',').map(cell => cell.replace(/"/g, '').trim());
    });
    
    return {
      headers: headers,
      rows: rows,
      totalRows: lines.length - 1, // Exclude header
      filename: 'shopify-urunler.csv',
      shopifyReady: true
    };
  } catch (error) {
    console.error('CSV preview generation error:', error);
    return null;
  }
}

const urlSchema = z.object({
  url: z.string().min(1, "URL boş olamaz")
});

function normalizeUrl(url: string): string {
  // https:// yoksa ekle
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // www. yoksa ekle
  if (!url.includes('www.') && url.includes('trendyol.com')) {
    url = url.replace('trendyol.com', 'www.trendyol.com');
  }
  
  return url;
}

function debug(message: string, ...args: any[]) {
  console.log(`[DEBUG] ${message}`, ...args);
}

function normalizeImageUrl(url: string): string {
  if (!url) return url;
  
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  
  if (url.startsWith('/')) {
    return 'https://cdn.dsmcdn.com' + url;
  }
  
  return url;
}

export function registerRoutes(app: Express): Server {
  // Create HTTP server - will be configured by main server
  const httpServer = createServer(app);

  // CSV preview endpoint removed - handled in server/index.ts

  // Manual feature testing endpoint
  app.get("/api/test-manual-features", async (req, res) => {
    try {
      const { url } = req.query;
      console.log("🧪 Manual feature test başlatılıyor...");
      
      // Use provided URL or default to a test URL
      const testUrl = (typeof url === 'string' ? url : "https://www.trendyol.com/stanley/classic-seri-termos-1-0lt-matte-black-p-365983942");
      
      console.log(`📍 Test URL: ${testUrl}`);
      
      const result = await manualFeatureExtraction(testUrl);
      
      console.log(`✅ Manuel test tamamlandı: ${result.features.length} özellik, ${result.processingTime}ms`);
      
      res.json(result);
    } catch (error) {
      console.error("❌ Manuel test hatası:", error);
      res.status(500).json({
        error: "Manuel test sırasında hata oluştu",
        details: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Precise feature testing endpoint
  app.post("/api/test-precise-features", async (req, res) => {
    try {
      const { url } = req.body;
      console.log("🎯 Precise feature test başlatılıyor...");
      
      // Use provided URL or default to a test URL
      const testUrl = url || "https://www.trendyol.com/stanley/classic-seri-termos-1-0lt-matte-black-p-365983942";
      
      console.log(`📍 Test URL: ${testUrl}`);
      
      const result = await preciseFeatureExtraction(testUrl);
      
      console.log(`✅ Precise test tamamlandı: ${result.features.length} özellik, ${result.processingTime}ms`);
      
      res.json(result);
    } catch (error) {
      console.error("❌ Precise test hatası:", error);
      res.status(500).json({
        error: "Precise test sırasında hata oluştu",
        details: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Ürün çekme endpoint'i - test modu tamamen kaldırıldı
  app.post('/api/scrape', async (req, res) => {
    console.log("Scrape isteği alındı");
    
    try {
      const validation = urlSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Geçersiz URL",
          details: validation.error.errors 
        });
      }

      const { url: rawUrl } = validation.data;
      
      // URL'i normalize et
      const url = normalizeUrl(rawUrl);
      console.log(`URL normalize edildi: ${rawUrl} -> ${url}`);
      
      // Normalize edilmiş URL'in geçerli olup olmadığını kontrol et
      try {
        new URL(url);
      } catch (urlError) {
        return res.status(400).json({
          message: "URL formatı hatalı",
          details: `Girilen: ${rawUrl}, Normalize: ${url}`
        });
      }
      
      // Ürün ID'sini URL'den çıkart
      const productIdMatch = url.match(/p-(\d+)/);
      const productId = productIdMatch ? productIdMatch[1] : null;

      // Enhanced product data extraction for Trendyol products using scenario-based system
      if (url.includes('trendyol.com')) {
        console.log("🎯 Using Scenario-Based Scraper for intelligent extraction");
        
        // Try Scenario-Based Scraper first for best accuracy and intelligence
        const scenarioResult = await scenarioBasedScrape(url);
        
        if (scenarioResult.success) {
          console.log(`🎯 Scenario-Based Scraper SUCCESS - Scenario: ${scenarioResult.scenario}, Confidence: ${scenarioResult.confidence}%`);
          
          return res.json({
            success: true,
            extractionMethod: 'scenario-based-scraper',
            scenario: scenarioResult.scenario,
            confidence: scenarioResult.confidence,
            brand: scenarioResult.brand,
            title: scenarioResult.title,
            price: scenarioResult.price,
            images: scenarioResult.images,
            features: scenarioResult.features,
            variants: scenarioResult.variants,
            extractionDetails: scenarioResult.extractionDetails
          });
        }
        
        console.log("🔄 Scenario-based failed, using Fixed Authentic Scraper fallback");
        
        // Fallback to Fixed Authentic Scraper if scenario-based fails
        const fixedResult = await fixedAuthenticScrape(url);
        
        if (fixedResult.success) {
          console.log("🔧 Fixed Scraper FALLBACK SUCCESS - Price:", fixedResult.price);
          
          return res.json({
            success: true,
            extractionMethod: 'fixed-authentic-scraper-fallback',
            brand: fixedResult.brand,
            title: fixedResult.title,
            price: fixedResult.price,
            images: fixedResult.images,
            features: fixedResult.features,
            variants: fixedResult.variants
          });
        }
        
        console.log("📊 Fixed failed, using fallback extraction for:", url);
        console.log("🔍 Raw URL check:", rawUrl);
        console.log("🔍 boutiqueId check:", rawUrl.includes('boutiqueId='));
        console.log("🔍 merchantId check:", rawUrl.includes('merchantId='));
        
        // Check if it's a boutique product with variants (use rawUrl to preserve parameters)
        if (rawUrl.includes('boutiqueId=') || rawUrl.includes('merchantId=')) {
          console.log("🏪 Boutique product detected - using specialized variant scraper");
          
          try {
            const { extractBoutiqueVariants } = await import('./boutique-variant-scraper');
            const boutiqueData = await extractBoutiqueVariants(url);
            
            // Convert to expected format with profit margin
            const basePrice = boutiqueData.variants[0]?.finalPrice || 0;
            const priceWithProfit = Math.round(basePrice * 1.15 * 100) / 100;
            
            return res.json({
              success: true,
              extractionMethod: 'boutique-variant-scraper',
              brand: boutiqueData.brand,
              title: boutiqueData.title,
              price: priceWithProfit,
              images: boutiqueData.images,
              features: boutiqueData.features,
              variants: boutiqueData.variants.map(v => ({
                color: v.color,
                size: v.sizes.join(', '),
                inStock: v.inStock,
                originalPrice: v.originalPrice,
                discountPrice: v.discountPrice,
                finalPrice: v.finalPrice,
                availableSizes: v.sizes
              }))
            });
          } catch (boutiqueError) {
            console.log("❌ Boutique scraper failed, falling back to regular scraper");
          }
        }
        
        try {
          // Use multi-scraper system for data extraction
          const { hyperFastScrape } = await import('./hyper-fast-scraper');
          const { lightningFastScrape } = await import('./lightning-scraper');
          const { scrapeWithEnhancedMethod } = await import('./enhanced-trendyol-scraper');
          
          console.log("🚀 Using Hyper-Fast Scraper...");
          const hyperResult = await hyperFastScrape(url);
          
          if (hyperResult) {
            console.log("🚀 Hyper result: SUCCESS");
            
            // Apply 15% profit margin
            const priceWithProfit = Math.round(hyperResult.price * 1.15 * 100) / 100;
            
            return res.json({
              success: true,
              extractionMethod: 'hyper-fast-scraper',
              brand: hyperResult.brand,
              title: hyperResult.title,
              price: priceWithProfit,
              images: hyperResult.images,
              features: [],
              variants: hyperResult.variants
            });
          }
          
          console.log("⚡ Hyper failed, trying Lightning Scraper...");
          const lightningResult = await lightningFastScrape(url);
          
          if (lightningResult) {
            console.log("⚡ Lightning result: SUCCESS");
            
            const priceWithProfit = Math.round(lightningResult.price * 1.15 * 100) / 100;
            
            return res.json({
              success: true,
              extractionMethod: 'lightning-scraper',
              brand: lightningResult.brand,
              title: lightningResult.title,
              price: priceWithProfit,
              images: lightningResult.images,
              features: [],
              variants: lightningResult.variants
            });
          }
          
          console.log("🔍 Both fast scrapers failed, using Enhanced Scraper...");
          const enhancedResult = await scrapeWithEnhancedMethod(url);
          
          if (enhancedResult) {
            console.log("🔍 Enhanced result: Found");
            console.log("✅ Enhanced Scraper successful:", enhancedResult.title);
            
            const priceWithProfit = Math.round(enhancedResult.price * 1.15 * 100) / 100;
            
            console.log(`🎯 Returning enhanced data: ${enhancedResult.price} TL, ${enhancedResult.images.length} images`);
            
            return res.json({
              success: true,
              extractionMethod: 'enhanced-scraper-fixed',
              brand: enhancedResult.brand,
              title: enhancedResult.title,
              price: priceWithProfit,
              images: enhancedResult.images,
              features: [],
              variants: enhancedResult.variants
            });
          }
          
          return res.status(404).json({
            success: false,
            message: 'All extraction methods failed'
          });
          
        } catch (error) {
          console.error('Extraction error:', error);
          return res.status(500).json({
            success: false,
            message: 'Product extraction failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Return error if no valid URL or unsupported platform
      return res.status(400).json({
        success: false,
        message: 'Unsupported URL format or platform'
      });
    } catch (error) {
      console.error('Extract endpoint error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Dedicated scenario-based scraping endpoint
  app.post('/api/scenario-scrape', async (req, res) => {
    console.log("🎯 Scenario-based scrape isteği alındı");
    
    try {
      const validation = urlSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({ 
          message: "Geçersiz URL",
          details: validation.error.errors 
        });
      }

      const { url: rawUrl } = validation.data;
      
      // URL'i normalize et
      const url = normalizeUrl(rawUrl);
      console.log(`🎯 URL normalize edildi: ${rawUrl} -> ${url}`);
      
      // Normalize edilmiş URL'in geçerli olup olmadığını kontrol et
      try {
        new URL(url);
      } catch (urlError) {
        return res.status(400).json({
          message: "URL formatı hatalı",
          details: `Girilen: ${rawUrl}, Normalize: ${url}`
        });
      }
      
      // Scenario-based extraction for Trendyol products
      if (url.includes('trendyol.com')) {
        console.log("🎯 SCENARIO-BASED EXTRACTION başlıyor...");
        
        const result = await scenarioBasedScrape(url);
        
        if (result.success) {
          console.log(`🎯 Scenario: ${result.scenario}, Confidence: ${result.confidence}%`);
          console.log(`🎯 Variants: ${result.variants.length} adet`);
          
          return res.json({
            success: true,
            extractionMethod: 'scenario-based-scraper',
            scenario: result.scenario,
            confidence: result.confidence,
            brand: result.brand,
            title: result.title,
            price: result.price,
            images: result.images,
            features: result.features,
            variants: result.variants,
            extractionDetails: result.extractionDetails
          });
        } else {
          console.log("❌ Scenario-based extraction failed");
          return res.status(500).json({
            success: false,
            message: 'Scenario-based extraction failed',
            details: result.extractionDetails
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Only Trendyol URLs are supported for scenario-based extraction'
        });
      }
      
    } catch (error: any) {
      console.error('❌ Scenario-based scrape error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        details: error.message
      });
    }
  });

  // Main product extraction endpoint
  app.post('/api/extract', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL is required'
        });
      }
      
      console.log('📊 Main extraction for:', url);
      
      // Enhanced product data extraction for Trendyol products
      if (url.includes('trendyol.com')) {
        try {
          // Use fixed authentic Trendyol scraper for accurate data extraction
          console.log("🎯 Using Fixed Authentic Trendyol Scraper for accurate data...");
          const cleanResult = await fixedAuthenticScrape(url);
          
          if (cleanResult.success) {
            console.log("🧹 Clean Scraper SUCCESS - authentic data extracted");
            
            return res.json({
              success: true,
              extractionMethod: 'fixed-authentic-scraper',
              brand: cleanResult.brand,
              title: cleanResult.title,
              price: cleanResult.price,
              images: cleanResult.images,
              features: cleanResult.features,
              variants: cleanResult.variants
            });
          }
          
          // Fallback to fast scrapers if clean-scraper fails
          const { hyperFastScrape } = await import('./hyper-fast-scraper');
          const { lightningFastScrape } = await import('./lightning-scraper');
          const { scrapeWithEnhancedMethod } = await import('./enhanced-trendyol-scraper');
          
          console.log("🚀 Clean failed, trying Hyper-Fast Scraper...");
          const hyperResult = await hyperFastScrape(url);
          
          if (hyperResult && hyperResult.title) {
            console.log("🚀 Hyper result: SUCCESS");
            
            // Apply 15% profit margin
            const priceWithProfit = Math.round(hyperResult.price * 1.15 * 100) / 100;
            
            return res.json({
              success: true,
              extractionMethod: 'hyper-fast-scraper',
              brand: hyperResult.brand,
              title: hyperResult.title,
              price: priceWithProfit,
              images: hyperResult.images,
              features: [],
              variants: hyperResult.variants
            });
          }
          
          console.log("⚡ Hyper failed, trying Lightning Scraper...");
          const lightningResult = await lightningFastScrape(url);
          
          if (lightningResult && lightningResult.title) {
            console.log("⚡ Lightning result: SUCCESS");
            
            const priceWithProfit = Math.round(lightningResult.price * 1.15 * 100) / 100;
            
            return res.json({
              success: true,
              extractionMethod: 'lightning-scraper',
              brand: lightningResult.brand,
              title: lightningResult.title,
              price: priceWithProfit,
              images: lightningResult.images,
              features: [],
              variants: lightningResult.variants
            });
          }
          
          console.log("🔍 Both fast scrapers failed, using Enhanced Scraper...");
          const enhancedResult = await scrapeWithEnhancedMethod(url);
          
          if (enhancedResult && enhancedResult.title) {
            console.log("🔍 Enhanced result: Found");
            console.log("✅ Enhanced Scraper successful:", enhancedResult.title);
            
            const priceWithProfit = Math.round(enhancedResult.price * 1.15 * 100) / 100;
            
            console.log(`🎯 Returning enhanced data: ${enhancedResult.price} TL, ${enhancedResult.images.length} images`);
            
            return res.json({
              success: true,
              extractionMethod: 'enhanced-scraper-fixed',
              brand: enhancedResult.brand,
              title: enhancedResult.title,
              price: priceWithProfit,
              images: enhancedResult.images,
              features: [],
              variants: enhancedResult.variants
            });
          }
          
          return res.status(404).json({
            success: false,
            message: 'All extraction methods failed'
          });
          
        } catch (error) {
          console.error('Extraction error:', error);
          return res.status(500).json({
            success: false,
            message: 'Product extraction failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      return res.status(400).json({
        success: false,
        message: 'Unsupported URL format or platform'
      });
      
    } catch (error) {
      console.error('Extract endpoint error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Manual extraction endpoint for testing products with real data
  app.post('/api/extract-manual', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL is required'
        });
      }
      
      console.log('🧪 MANUAL EXTRACTION TEST for:', url);
      
      // Enhanced product data extraction for Trendyol products
      if (url.includes('trendyol.com')) {
        try {
          // Use multi-scraper system for data extraction
          const { hyperFastScrape } = await import('./hyper-fast-scraper');
          const { lightningFastScrape } = await import('./lightning-scraper');
          const { scrapeWithEnhancedMethod } = await import('./enhanced-trendyol-scraper');
          
          console.log("🚀 Using Hyper-Fast Scraper...");
          const hyperResult = await hyperFastScrape(url);
          
          if (hyperResult && hyperResult.title) {
            console.log("🚀 Hyper result: SUCCESS");
            
            // Apply 15% profit margin
            const priceWithProfit = Math.round(hyperResult.price * 1.15 * 100) / 100;
            
            return res.json({
              success: true,
              extractionMethod: 'hyper-fast-scraper',
              brand: hyperResult.brand,
              title: hyperResult.title,
              price: priceWithProfit,
              images: hyperResult.images,
              features: [],
              variants: hyperResult.variants
            });
          }
          
          console.log("⚡ Hyper failed, trying Lightning Scraper...");
          const lightningResult = await lightningFastScrape(url);
          
          if (lightningResult && lightningResult.title) {
            console.log("⚡ Lightning result: SUCCESS");
            
            const priceWithProfit = Math.round(lightningResult.price * 1.15 * 100) / 100;
            
            return res.json({
              success: true,
              extractionMethod: 'lightning-scraper',
              brand: lightningResult.brand,
              title: lightningResult.title,
              price: priceWithProfit,
              images: lightningResult.images,
              features: [],
              variants: lightningResult.variants
            });
          }
          
          console.log("🔍 Both fast scrapers failed, using Enhanced Scraper...");
          const enhancedResult = await scrapeWithEnhancedMethod(url);
          
          if (enhancedResult && enhancedResult.title) {
            console.log("🔍 Enhanced result: Found");
            console.log("✅ Enhanced Scraper successful:", enhancedResult.title);
            
            const priceWithProfit = Math.round(enhancedResult.price * 1.15 * 100) / 100;
            
            console.log(`🎯 Returning enhanced data: ${enhancedResult.price} TL, ${enhancedResult.images.length} images`);
            
            return res.json({
              success: true,
              extractionMethod: 'enhanced-scraper-fixed',
              brand: enhancedResult.brand,
              title: enhancedResult.title,
              price: priceWithProfit,
              images: enhancedResult.images,
              features: [],
              variants: enhancedResult.variants
            });
          }
          
          return res.status(404).json({
            success: false,
            message: 'All extraction methods failed'
          });
          
        } catch (error) {
          console.error('Extraction error:', error);
          return res.status(500).json({
            success: false,
            message: 'Product extraction failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      return res.status(400).json({
        success: false,
        message: 'Unsupported URL format or platform'
      });
      
    } catch (error) {
      console.error('Manual extract endpoint error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Test endpoint for working data extraction  
  app.get('/api/test-scraper', async (req, res) => {
    try {
      const testUrl = "https://www.trendyol.com/saade/beyaz-kruvaze-crop-blazer-ceket-p-810581655";
      
      // Use multi-scraper system for data extraction
      const { hyperFastScrape } = await import('./hyper-fast-scraper');
      const result = await hyperFastScrape(testUrl);
      
      if (result) {
        return res.json({
          success: true,
          data: result,
          extractionTime: new Date().toISOString()
        });
      }
      
      return res.status(404).json({
        success: false,
        message: 'Test extraction failed'
      });
      
    } catch (error) {
      console.error('Test scraper error:', error);
      return res.status(500).json({
        success: false,
        message: 'Test endpoint error'
      });
    }
  });

  // Add basic health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'trendyol-scraper'
    });
  });

  // Boutique CSV endpoint
  app.post('/api/boutique-csv', async (req, res) => {
    try {
      const { productData } = req.body;
      
      if (!productData) {
        return res.status(400).json({ message: "Ürün verisi gerekli" });
      }

      console.log('🏪 Boutique CSV oluşturuluyor...');
      const csvContent = generateBoutiqueCSV(
        productData.title,
        productData.brand,
        productData.images,
        productData.features
      );
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="boutique-mayo-shopify.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Boutique CSV oluşturma hatası:', error);
      res.status(500).json({ 
        message: "Boutique CSV oluşturulamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Multi-color CSV endpoint - Her renk için ayrı görseller
  app.post('/api/multi-color-csv', async (req, res) => {
    try {
      const { url, productData } = req.body;
      
      if (!url || !productData) {
        return res.status(400).json({ message: "URL ve ürün verisi gerekli" });
      }

      console.log('🎨 Multi-color CSV oluşturuluyor...');
      
      // Her renk için ayrı görselleri çıkar
      const colorImages = await extractAllColorImages(url);
      
      if (Object.keys(colorImages).length === 0) {
        console.log('⚠️ Renk görselleri bulunamadı, standart CSV oluşturuluyor...');
        const csvContent = generateBoutiqueCSV(
          productData.title,
          productData.brand,
          productData.images,
          productData.features
        );
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="multi-color-mayo-shopify.csv"');
        res.send(csvContent);
        return;
      }
      
      // Multi-color CSV oluştur
      const csvContent = await generateMultiColorCSV(
        productData.title,
        productData.brand,
        colorImages,
        productData.features
      );
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="multi-color-mayo-shopify.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Multi-color CSV oluşturma hatası:', error);
      res.status(500).json({ 
        message: "Multi-color CSV oluşturulamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Mayo Color CSV endpoint - Özel mayo renk sistemi
  app.post('/api/mayo-color-csv', async (req, res) => {
    try {
      const { url, productData } = req.body;
      
      if (!url || !productData) {
        return res.status(400).json({ message: "URL ve ürün verisi gerekli" });
      }

      console.log('🏊‍♀️ Mayo color CSV oluşturuluyor...');
      
      // Mayo renk varyantlarını çıkar
      const colorVariants = await extractMayoColorVariants(url);
      
      if (colorVariants.length === 0) {
        console.log('⚠️ Mayo renk varyantları bulunamadı');
        return res.status(400).json({ message: "Renk varyantları bulunamadı" });
      }
      
      // Mayo color CSV oluştur
      const csvContent = generateMayoColorCSV(
        colorVariants,
        productData.title,
        productData.brand
      );
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="mayo-color-variants.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Mayo color CSV oluşturma hatası:', error);
      res.status(500).json({ 
        message: "Mayo color CSV oluşturulamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Real Mayo Color CSV endpoint - Gerçek renk tespiti
  app.post('/api/mayo-real-color-csv', async (req, res) => {
    try {
      const { url, productData } = req.body;
      
      if (!url || !productData) {
        return res.status(400).json({ message: "URL ve ürün verisi gerekli" });
      }

      console.log('🎨 GERÇEK mayo color CSV oluşturuluyor...');
      
      // Gerçek renk varyantlarını tespit et
      const realColors = await detectMayoRealColors(url);
      
      if (realColors.length === 0) {
        console.log('⚠️ Gerçek mayo renk varyantları bulunamadı');
        return res.status(400).json({ message: "Gerçek renk varyantları bulunamadı" });
      }
      
      // Renklere özel görselleri ata
      const colorsWithImages = await assignColorsToImages(realColors, url);
      
      // Mayo color CSV oluştur - gerçek renklerle
      const csvContent = generateMayoColorCSV(
        colorsWithImages.map(c => ({
          color: c.color,
          colorCode: c.colorCode,
          images: c.images,
          price: c.price,
          originalPrice: c.originalPrice,
          sizes: c.sizes
        })),
        productData.title,
        productData.brand
      );
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="mayo-real-colors.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Real mayo color CSV oluşturma hatası:', error);
      res.status(500).json({ 
        message: "Real mayo color CSV oluşturulamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Tüm Ürün Görsellerini Çıkarma endpoint
  app.post('/api/extract-all-images', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL gerekli" });
      }

      console.log('🖼️ TÜM ürün görselleri çıkarılıyor...');
      
      // Tüm görselleri çıkar
      const allImages = await extractAllProductImages(url);
      
      if (allImages.length === 0) {
        console.log('⚠️ Hiç görsel bulunamadı');
        return res.status(400).json({ message: "Görsel bulunamadı" });
      }
      
      console.log(`✅ ${allImages.length} görsel başarıyla çıkarıldı`);
      
      res.json({
        success: true,
        imageCount: allImages.length,
        images: allImages,
        summary: {
          highQuality: allImages.filter(img => img.quality === 'high').length,
          mediumQuality: allImages.filter(img => img.quality === 'medium').length,
          lowQuality: allImages.filter(img => img.quality === 'low').length,
          mainImages: allImages.filter(img => img.type === 'main').length,
          colorVariants: allImages.filter(img => img.type === 'color').length,
          detailImages: allImages.filter(img => img.type === 'detail').length
        }
      });
    } catch (error) {
      console.error('Görsel çıkarma hatası:', error);
      res.status(500).json({ 
        message: "Görsel çıkarılamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Tüm Görselleri CSV olarak indirme endpoint
  app.post('/api/images-csv', async (req, res) => {
    try {
      const { url, productTitle } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL gerekli" });
      }

      console.log('📄 Tüm görseller için CSV oluşturuluyor...');
      
      // Tüm görselleri çıkar
      const allImages = await extractAllProductImages(url);
      
      if (allImages.length === 0) {
        return res.status(400).json({ message: "Görsel bulunamadı" });
      }
      
      // CSV içerik oluştur
      const csvContent = generateImageCSV(allImages, productTitle || 'Ürün');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="product-all-images.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Görsel CSV oluşturma hatası:', error);
      res.status(500).json({ 
        message: "CSV oluşturulamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Comprehensive Image System endpoint - TÜM görselleri sistematik çıkarma
  app.post('/api/comprehensive-images', async (req, res) => {
    try {
      const { url, productTitle } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL gerekli" });
      }

      console.log('🎯 Comprehensive görsel sistem çalışıyor...');
      
      // Comprehensive görsel çıkarma
      const result = await extractComprehensiveImages(url);
      
      if (result.allImages.length === 0) {
        return res.status(400).json({ message: "Görsel bulunamadı" });
      }
      
      console.log(`✅ ${result.allImages.length} görsel sistematik olarak çıkarıldı`);
      
      res.json({
        success: true,
        totalImages: result.allImages.length,
        totalGroups: result.imageGroups.length,
        images: result.allImages,
        imageGroups: result.imageGroups,
        statistics: result.statistics,
        summary: generateImageGroupSummary(result.imageGroups)
      });
    } catch (error) {
      console.error('Comprehensive görsel çıkarma hatası:', error);
      res.status(500).json({ 
        message: "Comprehensive görsel çıkarılamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Comprehensive Images CSV endpoint
  app.post('/api/comprehensive-images-csv', async (req, res) => {
    try {
      const { url, productTitle } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL gerekli" });
      }

      console.log('📄 Comprehensive images CSV oluşturuluyor...');
      
      const result = await extractComprehensiveImages(url);
      
      if (result.allImages.length === 0) {
        return res.status(400).json({ message: "Görsel bulunamadı" });
      }
      
      const csvContent = generateComprehensiveImageCSV(
        result.allImages,
        result.imageGroups,
        productTitle || 'Ürün'
      );
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="comprehensive-product-images.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Comprehensive CSV oluşturma hatası:', error);
      res.status(500).json({ 
        message: "CSV oluşturulamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Multi-Variant URL Discovery and Comprehensive Processing
  app.post('/api/multi-variant-discovery', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const { url } = req.body;
      console.log('🔍 Multi-variant discovery başlıyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const result = await processCompleteMultiVariant(url);
      
      console.log(`✅ Multi-variant discovery tamamlandı: ${result.summary.totalVariants} varyant`);
      
      res.json({
        success: true,
        result,
        summary: {
          totalVariants: result.summary.totalVariants,
          successfulExtractions: result.summary.successfulExtractions,
          failedExtractions: result.summary.failedExtractions,
          totalImages: result.summary.totalImages,
          totalGroups: result.summary.totalGroups,
          colorsFound: result.summary.colorsFound,
          processingTime: result.summary.totalProcessingTime
        }
      });
      
    } catch (error) {
      console.error('Multi-variant discovery error:', error);
      res.status(500).json({ message: 'Multi-variant discovery hatası', error: (error as Error).message });
    }
  });

  // Multi-Variant CSV Export
  app.post('/api/multi-variant-csv', async (req, res) => {
    try {
      const { url, productTitle } = req.body;
      console.log('📄 Multi-variant CSV oluşturuluyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const result = await processCompleteMultiVariant(url);
      const csvContent = generateMultiVariantCSV(result);
      
      console.log(`✅ Multi-variant CSV oluşturuldu: ${result.summary.totalVariants} varyant`);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="multi-variant-complete-analysis.csv"');
      res.send(csvContent);
      
    } catch (error) {
      console.error('Multi-variant CSV generation error:', error);
      res.status(500).json({ message: 'Multi-variant CSV oluşturma hatası', error: (error as Error).message });
    }
  });

  // Multi-Variant Summary Report
  app.post('/api/multi-variant-summary', async (req, res) => {
    try {
      const { url } = req.body;
      console.log('📊 Multi-variant summary oluşturuluyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const result = await processCompleteMultiVariant(url);
      const summaryReport = generateMultiVariantSummary(result);
      
      console.log(`✅ Multi-variant summary oluşturuldu`);
      
      res.json({
        success: true,
        summary: summaryReport,
        statistics: result.summary
      });
      
    } catch (error) {
      console.error('Multi-variant summary error:', error);
      res.status(500).json({ message: 'Multi-variant summary hatası', error: (error as Error).message });
    }
  });

  // Advanced Variant Scraper - Scrapy-like approach
  app.post('/api/advanced-variant-scraper', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const { url } = req.body;
      console.log('🔧 Advanced Variant Scraper başlıyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const result = await scrapeAdvancedVariants(url);
      
      console.log(`✅ Advanced variant scraping tamamlandı: ${result.totalVariants} varyant`);
      
      res.json({
        success: true,
        result,
        summary: {
          totalVariants: result.totalVariants,
          processedVariants: result.processedVariants,
          totalImages: result.totalImages,
          processingTime: result.processingTime,
          variants: result.variants.map(v => ({
            color: v.color,
            productId: v.productId,
            isProcessed: v.isProcessed,
            imageCount: v.detailImages.length
          }))
        }
      });
      
    } catch (error) {
      console.error('Advanced variant scraper error:', error);
      res.status(500).json({ message: 'Advanced variant scraper hatası', error: (error as Error).message });
    }
  });

  // Advanced Variant CSV Export  
  app.post('/api/advanced-variant-csv', async (req, res) => {
    try {
      const { url, productTitle } = req.body;
      console.log('📄 Advanced variant CSV oluşturuluyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const result = await scrapeAdvancedVariants(url);
      const csvContent = generateAdvancedVariantCSV(result);
      
      console.log(`✅ Advanced variant CSV oluşturuldu: ${result.totalVariants} varyant`);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="advanced-variant-analysis.csv"');
      res.send(csvContent);
      
    } catch (error) {
      console.error('Advanced variant CSV generation error:', error);
      res.status(500).json({ message: 'Advanced variant CSV oluşturma hatası', error: (error as Error).message });
    }
  });

  // Scrapy-like Trendyol Variants Spider endpoint
  app.post('/api/scrapy-variants', async (req, res) => {
    try {
      const { url } = req.body;
      console.log('🕷️ Scrapy-like spider başlatılıyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const variants = await runTrendyolVariantsSpider(url);
      
      console.log(`✅ Scrapy spider tamamlandı: ${variants.length} varyant işlendi`);
      
      res.json({
        success: true,
        totalVariants: variants.length,
        variants: variants,
        summary: {
          uniqueProducts: new Set(variants.map(v => v.productId)).size,
          totalImages: variants.reduce((sum, v) => sum + v.images.length, 0),
          withStock: variants.filter(v => v.stock_info.length > 0).length,
          withAttributes: variants.filter(v => Object.keys(v.attributes).length > 0).length
        }
      });
      
    } catch (error) {
      console.error('Scrapy spider error:', error);
      res.status(500).json({ message: 'Scrapy spider hatası', error: (error as Error).message });
    }
  });

  // Scrapy-like JSON Export  
  app.post('/api/scrapy-json', async (req, res) => {
    try {
      const { url } = req.body;
      console.log('📄 Scrapy JSON çıktısı oluşturuluyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const variants = await runTrendyolVariantsSpider(url);
      const jsonOutput = generateScrapyOutput(variants);
      
      console.log(`✅ Scrapy JSON oluşturuldu: ${variants.length} varyant`);
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="scrapy-variants.json"');
      res.send(jsonOutput);
      
    } catch (error) {
      console.error('Scrapy JSON generation error:', error);
      res.status(500).json({ message: 'Scrapy JSON oluşturma hatası', error: (error as Error).message });
    }
  });

  // Scrapy-like CSV Export  
  app.post('/api/scrapy-csv', async (req, res) => {
    try {
      const { url } = req.body;
      console.log('📄 Scrapy CSV çıktısı oluşturuluyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }
      
      const variants = await runTrendyolVariantsSpider(url);
      const csvContent = generateScrapyCSV(variants);
      
      console.log(`✅ Scrapy CSV oluşturuldu: ${variants.length} varyant`);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="scrapy-variants.csv"');
      res.send(csvContent);
      
    } catch (error) {
      console.error('Scrapy CSV generation error:', error);
      res.status(500).json({ message: 'Scrapy CSV oluşturma hatası', error: (error as Error).message });
    }
  });

  // Shopify Test Connection Endpoint
  app.post('/api/shopify/test-connection', async (req, res) => {
    try {
      console.log('🔍 Testing Shopify connection...');
      
      const { testShopifyConnection } = await import('./connection-strengthener');
      const connectionTest = new (await import('./connection-strengthener')).ConnectionStrengthener();
      
      const result = await connectionTest.testShopifyConnection();
      
      if (result.success) {
        console.log('✅ Shopify connection test successful');
        res.json({
          success: true,
          message: result.message,
          data: result.data
        });
      } else {
        console.log('❌ Shopify connection test failed');
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error: any) {
      console.error('❌ Shopify test error:', error.message);
      res.status(500).json({
        success: false,
        message: `Shopify test hatası: ${error.message}`
      });
    }
  });

  // Shopify Add Product Endpoint (already exists but ensuring consistency)
  app.post('/api/shopify/add-product', async (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      
      const productData = req.body.productData || req.body;
      
      if (!productData || !productData.success) {
        return res.status(400).json({ 
          success: false, 
          error: 'Geçerli product data gerekli' 
        });
      }

      console.log('🛒 Shopify API product creation initiated:', productData.title);
      
      const shopifyProduct = {
        title: productData.title || 'Test Ürün',
        body_html: `<p>${productData.brand} ${productData.title}</p>`,
        vendor: productData.brand || 'Genel',
        product_type: "Genel Ürün",
        status: "active",
        published: true,
        tags: "trendyol, import, scenario-based",
        variants: [{
          title: "Varsayılan Başlık",
          price: (productData.price?.withProfit || 100).toString(),
          inventory_quantity: 10,
          weight: 0,
          weight_unit: "kg",
          requires_shipping: true
        }],
        images: (productData.images || []).slice(0, 3).map((url: string) => ({ src: url }))
      };

      console.log('Creating Shopify product:', shopifyProduct.title);
      
      const response = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/products.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product: shopifyProduct })
      });

      console.log('Shopify API response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        const productId = result?.product?.id;
        
        if (!productId) {
          console.error('❌ No product ID in Shopify response');
          return res.status(500).json({
            success: false,
            error: 'Shopify API yanıtında product ID bulunamadı'
          });
        }
        
        console.log('✅ Shopify product created successfully:', productId);
        
        res.json({
          success: true,
          message: 'Ürün başarıyla Shopify\'a yüklendi',
          productId: productId,
          productUrl: `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/products/${productId}`
        });
      } else {
        const errorData = await response.text();
        console.error('❌ Shopify API error:', response.status, errorData);
        res.status(response.status).json({
          success: false,
          error: `Shopify API hatası: ${response.status}`
        });
      }
    } catch (error: any) {
      console.error('❌ Shopify product creation error:', error.message);
      res.status(500).json({
        success: false,
        error: `Ürün oluşturma hatası: ${error.message}`
      });
    }
  });

  // Image proxy endpoint for CORS issues
  app.get('/api/image-proxy', async (req, res) => {
    try {
      const { url } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL parametresi gerekli' });
      }

      // Only allow Trendyol CDN images
      if (!url.includes('cdn.dsmcdn.com')) {
        return res.status(403).json({ error: 'Sadece Trendyol CDN görselleri desteklenir' });
      }

      console.log('🖼️ Proxy image request:', url);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://www.trendyol.com/',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site'
        }
      });

      if (!response.ok) {
        console.error('❌ Image proxy error:', response.status, response.statusText);
        return res.status(response.status).json({ error: 'Görsel yüklenemedi' });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      console.log('✅ Image proxy success:', url);
      res.send(Buffer.from(buffer));
      
    } catch (error) {
      console.error('❌ Image proxy error:', error);
      res.status(500).json({ error: 'Görsel proxy hatası' });
    }
  });

  return httpServer;
}
