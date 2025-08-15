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
import { products as productsTable, products, productVariants, type InsertProduct, type InsertProductVariant } from "@shared/schema";
// import { getFinalImages } from "./final-image-solution";
import { extractVariantStockInfo } from "./advanced-size-extractor";
import { extractFocusedData } from './focused-extractor';
import { dailyScheduler } from './scheduler';
import dataAnalysisRoutes from './data-analysis-routes';
import { shopifyIntegration } from './shopify-integration';
import { db } from './db';
import memoryStatusRoutes from './memory-status-api';
import { testImageExtraction } from './direct-image-test';
import { initializeScheduler, getSchedulerStatus, executeTaskManually } from './simple-scheduler';
import { manualFeatureExtraction } from './manual-feature-test';
import { preciseFeatureExtraction } from './precise-feature-extractor';
import { testUltimatePriceExtraction } from './test-ultimate-price';
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
import { shopifyIntegration } from './shopify-integration';
import { ProductManagementSystem } from './product-management-system';
import { TelegramNotifications } from './comprehensive-telegram-notifier';
import { generateComprehensiveShopifyCSV, generateFeatureSummary, type ComprehensiveProductData } from './comprehensive-csv-generator';
import shopifyTrendyolMatcher from './shopify-trendyol-matcher';
import { scrapeMultipleUrls } from './multi-url-scraper';
import { generateMultiVariantShopifyCSV } from './multi-variant-csv-generator';
import { uploadProductToShopify, testShopifyConnection } from './shopify-api-uploader';
import { uploadMultiUrlProductToShopify } from './multi-url-shopify-uploader';
import { eq, desc, or, and, isNotNull, inArray } from 'drizzle-orm';
import axios from 'axios';
import { urlTrackingService } from './url-tracking-service';
import { urlTracking } from '@shared/schema';
import { savedUrlsManager } from './saved-urls-manager';
import { shopifyProductsManager } from './shopify-products-manager';
import { shopifyApiService } from './shopify-api-service';

// Telegram notification for product extraction
async function sendProductExtractionNotification(url: string, title: string, brand: string, price: any) {
  try {
    const message = `
🔄 <b>ÜRÜN ÇEKİLDİ</b>

📦 <b>Ürün:</b> ${title}
🏢 <b>Marka:</b> ${brand}
💰 <b>Orijinal Fiyat:</b> ${price.original} TL
💵 <b>Kar Marjlı Fiyat:</b> ${price.withProfit} TL
🔗 <b>URL:</b> ${url}

✅ <b>Shopify'a aktarıma hazır</b>
    `.trim();

    // Import filtered telegram notifier
    try {
      const { sendFilteredTelegramNotification } = await import('./filtered-telegram-notifier');
      await sendFilteredTelegramNotification(message);
    } catch (importError) {
      console.log('📱 Telegram notifier import failed, using alternative method');
      // Alternative notification method if needed
    }
    console.log('📱 Telegram ürün bildirim gönderildi');
  } catch (error) {
    console.error('❌ Telegram bildirim hatası:', error);
  }
}

// Enhanced description creator with features
function createEnhancedDescription(productData: any): string {
  let description = `<div class="product-description">`;
  
  // Brand and title section
  description += `<h2><strong>${productData.brand}</strong></h2>`;
  description += `<p>${productData.title}</p>`;
  
  // Price information
  if (productData.price) {
    description += `<div class="price-info">`;
    description += `<p><strong>💰 Fiyat:</strong> ${productData.price.profitFormatted || productData.price.withProfit + ' TL'}</p>`;
    if (productData.price.original && productData.price.original !== productData.price.withProfit) {
      description += `<p><em>Orijinal Fiyat: ${productData.price.original} TL</em></p>`;
    }
    description += `</div>`;
  }
  
  // Product features section
  if (productData.features && productData.features.length > 0) {
    description += `<div class="product-features">`;
    description += `<h3>🔧 Ürün Özellikleri:</h3>`;
    description += `<ul>`;
    
    productData.features.forEach((feature) => {
      if (feature.key && feature.value) {
        description += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
      }
    });
    
    description += `</ul>`;
    description += `</div>`;
  }
  
  // Variant information
  if (productData.variants) {
    description += `<div class="variant-info">`;
    description += `<h3>📦 Mevcut Seçenekler:</h3>`;
    
    if (productData.variants.colors && productData.variants.colors.length > 0) {
      description += `<p><strong>Renkler:</strong> ${productData.variants.colors.join(', ')}</p>`;
    }
    
    if (productData.variants.sizes && productData.variants.sizes.length > 0) {
      description += `<p><strong>Bedenler:</strong> ${productData.variants.sizes.join(', ')}</p>`;
    }
    
    description += `</div>`;
  }
  
  // Tags section
  if (productData.tags && productData.tags.length > 0) {
    description += `<div class="product-tags">`;
    description += `<p><strong>🏷️ Kategoriler:</strong> ${productData.tags.join(', ')}</p>`;
    description += `</div>`;
  }
  
  description += `</div>`;
  
  return description;
}

// Product verisini Shopify CSV formatına dönüştür
function convertProductToShopifyCSV(productData: any): string {
  const handle = productData.title?.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') || 'product';
  
  // CSV başlıkları
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Type', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
    'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
    'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
    'Variant Barcode', 'Image Src', 'Image Position', 'Image Alt Text',
    'Gift Card', 'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
    'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
    'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
    'Google Shopping / Condition', 'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2', 'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4', 'Variant Image', 'Variant Weight Unit',
    'Cost per item', 'Included / United States', 'Price / United States',
    'Compare At Price / United States', 'Status'
  ];
  
  let csvContent = headers.join(',') + '\n';
  
  const colors = productData.variants?.colors || ['Standart'];
  const sizes = productData.variants?.sizes || ['Tek Beden'];
  const images = productData.images || [];
  const price = productData.price?.withProfit || productData.price?.original || 100;
  const comparePrice = productData.price?.original || price;
  
  let variantIndex = 0;
  
  colors.forEach((color) => {
    sizes.forEach((size) => {
      const isFirstVariant = variantIndex === 0;
      const imageIndex = variantIndex % Math.max(images.length, 1);
      const imageUrl = images[imageIndex] || '';
      
      const row = [
        handle, // Handle
        isFirstVariant ? productData.title || 'Ürün' : '', // Title
        isFirstVariant ? createEnhancedDescription(productData) : '', // Body HTML
        isFirstVariant ? (productData.brand || 'Unknown') : '', // Vendor
        isFirstVariant ? 'Apparel & Accessories > Clothing' : '', // Product Type
        isFirstVariant ? 'trendyol, auto-generated' : '', // Tags
        isFirstVariant ? 'TRUE' : '', // Published
        isFirstVariant ? 'Renk' : '', // Option1 Name
        color, // Option1 Value
        isFirstVariant ? 'Beden' : '', // Option2 Name
        size, // Option2 Value
        `${handle}-${color}-${size}`.toLowerCase().replace(/[^a-z0-9-]/g, ''), // Variant SKU
        '0', // Variant Grams
        'shopify', // Variant Inventory Tracker
        '10', // Variant Inventory Qty
        'deny', // Variant Inventory Policy
        'manual', // Variant Fulfillment Service
        price.toString(), // Variant Price
        comparePrice.toString(), // Variant Compare At Price
        'TRUE', // Variant Requires Shipping
        'TRUE', // Variant Taxable
        '', // Variant Barcode
        imageUrl, // Image Src
        (imageIndex + 1).toString(), // Image Position
        `${productData.title} - ${color} ${size}`, // Image Alt Text
        'FALSE', // Gift Card
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', // SEO and Google Shopping fields
        '', // Variant Image
        'kg', // Variant Weight Unit
        '0', // Cost per item
        'TRUE', // Included / United States
        price.toString(), // Price / United States
        comparePrice.toString(), // Compare At Price / United States
        'active' // Status
      ];
      
      csvContent += row.map(field => `"${field}"`).join(',') + '\n';
      variantIndex++;
    });
  });
  
  return csvContent;
}

// Multi-URL product verisini CSV formatına dönüştür
function convertMultiUrlProductToCSV(productData: any): string {
  const colors = productData.variants?.colors || [];
  // ❌ SAHTE BEDEN VERİSİ ENGELLENDI - Sadece gerçek varyantlar
  const sizes: string[] = []; // No fake size data
  
  // Renk tespiti için fonksiyon
  function extractColor(colorText: string): string {
    const text = colorText.toLowerCase();
    if (text.includes('beyaz')) return 'Beyaz';
    if (text.includes('yesil') || text.includes('yeşil')) return 'Yeşil';
    if (text.includes('siyah')) return 'Siyah';
    if (text.includes('mavi')) return 'Mavi';
    if (text.includes('kirmizi') || text.includes('kırmızı')) return 'Kırmızı';
    return 'Çok Renkli';
  }
  
  // CSV başlıkları
  let csvContent = 'Handle,Title,Body (HTML),Vendor,Product Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / AdWords Grouping,Google Shopping / AdWords Labels,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Cost per item,Included / United States,Price / United States,Compare At Price / United States,Status\n';
  
  const extractedColors = colors.map(extractColor).filter((color, index, arr) => arr.indexOf(color) === index && color !== 'Çok Renkli');
  if (extractedColors.length === 0) extractedColors.push('Çok Renkli');
  
  console.log('🎨 CSV Extracted colors:', extractedColors);
  console.log('📏 CSV Sizes:', sizes);
  
  let variantIndex = 0;
  
  // ❌ SAHTE VARYANT DÖNGÜSÜ ENGELLENDİ - Tek ürün işlemi
  if (extractedColors.length === 0) extractedColors.push('Standart');
  
  extractedColors.slice(0, 1).forEach((color, colorIndex) => { // Sadece 1 renk
    const fakeSizes = ['Tek Beden']; // Sahte beden yerine tek beden
    fakeSizes.forEach((size, sizeIndex) => {
      const handle = productData.title?.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') || 'product';
      const isFirstVariant = variantIndex === 0;
      const imageIndex = variantIndex % (productData.images?.length || 1);
      const imageUrl = productData.images?.[imageIndex]?.url || '';
      
      // Her varyant için CSV satırı oluştur
      const row = [
        handle, // Handle
        isFirstVariant ? productData.title || 'Ürün' : '', // Title
        isFirstVariant ? `<p>${productData.title}</p>` : '', // Body HTML
        isFirstVariant ? (productData.brand || 'Unknown') : '', // Vendor
        isFirstVariant ? 'Apparel & Accessories > Clothing' : '', // Product Type
        isFirstVariant ? 'multi-url, auto-generated' : '', // Tags
        isFirstVariant ? 'TRUE' : '', // Published
        isFirstVariant ? 'Renk' : '', // Option1 Name
        color, // Option1 Value
        isFirstVariant ? 'Beden' : '', // Option2 Name
        size, // Option2 Value
        `${handle}-${color}-${size}`.toLowerCase(), // Variant SKU
        '0', // Variant Grams
        'shopify', // Variant Inventory Tracker
        '10', // Variant Inventory Qty
        'deny', // Variant Inventory Policy
        'manual', // Variant Fulfillment Service
        productData.price?.withProfit?.toString() || '100', // Variant Price
        productData.price?.original?.toString() || '90', // Variant Compare At Price
        'TRUE', // Variant Requires Shipping
        'TRUE', // Variant Taxable
        '', // Variant Barcode
        imageUrl, // Image Src
        imageIndex + 1, // Image Position
        `${productData.title} - ${color} ${size}`, // Image Alt Text
        'FALSE', // Gift Card
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', // SEO and Google Shopping fields
        '', // Variant Image
        'kg', // Variant Weight Unit
        '0', // Cost per item
        'TRUE', // Included / United States
        productData.price?.withProfit?.toString() || '100', // Price / United States
        productData.price?.original?.toString() || '90', // Compare At Price / United States
        'active' // Status
      ];
      
      csvContent += row.map(field => `"${field}"`).join(',') + '\n';
      variantIndex++;
    });
  });
  
  console.log(`📊 Generated CSV with ${variantIndex} variants`);
  return csvContent;
}


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
  
  // Özellikler metni (CSV için) - Tüm özellikler
  const featuresText = product.features && product.features.length > 0 ? 
    product.features.map((f: any) => `${f.key}: ${f.value}`).join(' | ') : 'Özellik bilgisi mevcut değil';

  // Ürün özellikleri HTML formatında (Body için) - Kapsamlı özellikler
  let bodyHTML = '';
  if (product.features && product.features.length > 0) {
    bodyHTML = '<div class="product-features"><h4>Ürün Özellikleri:</h4><ul>';
    product.features.forEach((feature: any) => {
      bodyHTML += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    bodyHTML += '</ul></div>';
    
    // Ek açıklama bilgisi
    if (product.description) {
      bodyHTML += `<div class="product-description"><h4>Ürün Açıklaması:</h4><p>${product.description}</p></div>`;
    }
  } else {
    bodyHTML = `<div class="product-info">
      <h4>Ürün Bilgileri:</h4>
      <p><strong>Marka:</strong> ${product.brand}</p>
      <p><strong>Ürün Adı:</strong> ${product.title}</p>
      <p><strong>Fiyat:</strong> ${product.price?.formatted || 'Fiyat bilgisi mevcut değil'}</p>
    </div>`;
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
      product.images[0] || '', // 15. Image Src - Main product image
      '1',                                            // 16. Image Position
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
  
  // Add ALL product images as additional image rows
  const startingImagePosition = inStockSizes.length + 1;
  console.log(`📸 Adding ALL ${product.images.length} product images to CSV...`);
  
  product.images.forEach((imageUrl: string, index: number) => {
    const imagePosition = startingImagePosition + index;
    rows.push([
      productHandle,                                  // Handle
      '',                                             // Title
      '',                                             // Body (HTML)
      '',                                             // Vendor
      '',                                             // Tags
      '',                                             // Published
      '',                                             // Option1 Name
      '',                                             // Option1 Value
      '',                                             // Option2 Name
      '',                                             // Option2 Value
      '',                                             // Variant SKU
      '',                                             // Variant Inventory Qty
      '',                                             // Variant Price
      '',                                             // Variant Compare At Price
      imageUrl,                                      // Image Src - PRODUCT IMAGE
      imagePosition.toString(),                      // Image Position
      `${product.title} - Görsel ${index + 1}`,     // Image Alt Text
      '',                                             // Gift Card
      '',                                             // SEO Title
      '',                                             // SEO Description
      '',                                             // Variant Image
      '',                                             // Variant Weight Unit
      '',                                             // Status
      ''                                              // Product Features
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

// Extract product features from HTML content
function extractProductFeaturesFromHTML(htmlContent: string): Array<{ key: string; value: string }> {
  const features: Array<{ key: string; value: string }> = [];
  
  try {
    // 1. Extract from product state
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productStateMatch) {
      const productState = JSON.parse(productStateMatch[1]);
      
      // Product specifications
      if (productState.product?.attributes) {
        Object.entries(productState.product.attributes).forEach(([key, value]: [string, any]) => {
          if (value && typeof value === 'string' && key !== 'id') {
            features.push({
              key: key.charAt(0).toUpperCase() + key.slice(1),
              value: value.toString()
            });
          }
        });
      }

      // Additional product details
      if (productState.product?.details) {
        Object.entries(productState.product.details).forEach(([key, value]: [string, any]) => {
          if (value && typeof value === 'string') {
            features.push({
              key: key.charAt(0).toUpperCase() + key.slice(1),
              value: value.toString()
            });
          }
        });
      }
    }

    // 2. Extract from description tables
    const tableMatches = htmlContent.match(/<table[^>]*>(.*?)<\/table>/gis);
    if (tableMatches) {
      tableMatches.forEach(table => {
        const rowMatches = table.match(/<tr[^>]*>(.*?)<\/tr>/gis);
        if (rowMatches) {
          rowMatches.forEach(row => {
            const cellMatches = row.match(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis);
            if (cellMatches && cellMatches.length >= 2) {
              const key = cellMatches[0].replace(/<[^>]*>/g, '').trim();
              const value = cellMatches[1].replace(/<[^>]*>/g, '').trim();
              if (key && value && key.length < 100 && value.length < 200) {
                features.push({ key, value });
              }
            }
          });
        }
      });
    }

    // 3. Extract from lists
    const listMatches = htmlContent.match(/<ul[^>]*class[^>]*(?:feature|spec|detail)[^>]*>(.*?)<\/ul>/gis);
    if (listMatches) {
      listMatches.forEach(list => {
        const itemMatches = list.match(/<li[^>]*>(.*?)<\/li>/gis);
        if (itemMatches) {
          itemMatches.forEach((item, index) => {
            const text = item.replace(/<[^>]*>/g, '').trim();
            if (text && text.length < 200) {
              features.push({
                key: `Özellik ${index + 1}`,
                value: text
              });
            }
          });
        }
      });
    }

  } catch (error) {
    console.error('Feature extraction error:', error);
  }

  // Remove duplicates and return
  const uniqueFeatures = features.filter((feature, index, self) => 
    index === self.findIndex(f => f.key === feature.key && f.value === feature.value)
  );

  return uniqueFeatures.slice(0, 20); // Limit to 20 features
}

// Simple image extraction function
function extractImagesFromHTML(htmlContent: string): string[] {
  const images = new Set<string>();
  
  // Extract from all CDN patterns
  const patterns = [
    /https:\/\/cdn\.dsmcdn\.com\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    /"(https:\/\/cdn\.dsmcdn\.com\/[^"]*\.(jpg|jpeg|png|webp))"/gi,
    /src="([^"]*cdn\.dsmcdn\.com[^"]*\.(jpg|jpeg|png|webp)[^"]*)"/gi,
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const url = match[1] || match[0];
      if (url && url.includes('cdn.dsmcdn.com')) {
        const cleanUrl = url.replace(/^["']|["']$/g, '').trim();
        if (cleanUrl.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i)) {
          images.add(cleanUrl);
        }
      }
    }
  });
  
  return Array.from(images);
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

// Varyant işleme fonksiyonu - özelliklerden gerçek varyant verisi oluşturur
function processVariantsFromFeatures(features: any[], originalVariants: any[] = []): any[] {
  console.log("🔧 Varyant işleme başlıyor...", features.length, "özellik");
  
  // Özelliklerden beden ve renk bilgilerini çıkar
  const sizeFeatures = features.filter(f => f.key?.toLowerCase().includes('beden') || f.key?.toLowerCase().includes('size'));
  const colorFeatures = features.filter(f => f.key?.toLowerCase().includes('renk') || f.key?.toLowerCase().includes('color'));
  
  console.log("📏 Beden özellikleri:", sizeFeatures);
  console.log("🎨 Renk özellikleri:", colorFeatures);
  
  // Beden seçeneklerini parse et - geliştirilmiş algoritma
  const sizeOptions: string[] = [];
  sizeFeatures.forEach(feature => {
    if (feature.value) {
      // Daha kapsamlı beden ayırma - virgül, noktalı virgül, pipe, ve boşluk desteği
      const sizes = feature.value.toString()
        .split(/[,;|\s]+/) // Virgül, noktalı virgül, pipe ve boşluk ile ayır
        .map((size: string) => size.trim())
        .filter((size: string) => size && size.length > 0 && size.length <= 10) // Çok uzun değerleri filtrele
        .map((size: string) => {
          // Gelişmiş beden normalizasyonu
          const normalized = size.toLowerCase();
          
          // Harf bedenler
          if (normalized === 'xs' || normalized === 'x-small') return 'XS';
          if (normalized === 's' || normalized === 'small') return 'S'; 
          if (normalized === 'm' || normalized === 'medium') return 'M';
          if (normalized === 'l' || normalized === 'large') return 'L';
          if (normalized === 'xl' || normalized === 'x-large') return 'XL';
          if (normalized === 'xxl' || normalized === '2xl' || normalized === 'xx-large') return 'XXL';
          if (normalized === 'xxxl' || normalized === '3xl') return 'XXXL';
          
          // Sayısal bedenler (ayakkabı, pantolon vs.)
          if (/^\d+(\.\d+)?$/.test(normalized)) return normalized.toUpperCase();
          
          // Karma bedenler (34/S, 36/M vs.)
          if (/^\d+\/[A-Z]+$/i.test(normalized)) return normalized.toUpperCase();
          
          // Tek beden kontrolü
          if (normalized.includes('tek') || normalized.includes('one') || normalized === 'universal') return 'Tek Beden';
          
          // Diğer durumlarda orijinal değeri büyük harfle döndür
          return size.toUpperCase();
        });
      sizeOptions.push(...sizes);
    }
  });
  
  // Renk seçeneklerini parse et - geliştirilmiş algoritma
  const colorOptions: string[] = [];
  colorFeatures.forEach(feature => {
    if (feature.value) {
      const colors = feature.value.toString()
        .split(/[,;|\n]+/) // Virgül, noktalı virgül, pipe ve satır sonu ile ayır
        .map((color: string) => color.trim())
        .filter((color: string) => color && color.length > 0 && color.length <= 30) // Çok uzun değerleri filtrele
        .map((color: string) => {
          // Renk normalizasyonu - büyük harfle başlat
          return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
        });
      colorOptions.push(...colors);
    }
  });
  
  // Benzersizleştir
  const uniqueSizes = [...new Set(sizeOptions)];
  const uniqueColors = [...new Set(colorOptions)];
  
  console.log("📏 Bulunan bedenler:", uniqueSizes);
  console.log("🎨 Bulunan renkler:", uniqueColors);
  
  // Varyant kombinasyonları oluştur - geliştirilmiş mantık
  const variants: any[] = [];
  
  console.log("🔧 Varyant oluşturma başlıyor - Bedenler:", uniqueSizes.length, "Renkler:", uniqueColors.length);
  
  if (uniqueSizes.length > 0 || uniqueColors.length > 0) {
    // Gerçek varyantlar var
    if (uniqueSizes.length > 0 && uniqueColors.length > 0) {
      // Hem beden hem renk var - kombinasyon oluştur
      console.log("🔧 Hem beden hem renk var, kombinasyon oluşturuluyor...");
      uniqueColors.forEach(color => {
        uniqueSizes.forEach(size => {
          variants.push({
            color: color,
            size: size,
            inStock: true,
            stock: 15, // Gerçekçi stok miktarı
            price: 0, // Ana fiyat daha sonra set edilecek
            sku: `${color.replace(/\s+/g, '-')}-${size.replace(/\s+/g, '-')}`.toLowerCase()
          });
        });
      });
    } else if (uniqueSizes.length > 0) {
      // Sadece beden var
      console.log("🔧 Sadece beden var, beden varyantları oluşturuluyor...");
      uniqueSizes.forEach(size => {
        variants.push({
          color: "Standart Renk",
          size: size,
          inStock: true,
          stock: 15,
          price: 0,
          sku: `standart-${size.replace(/\s+/g, '-')}`.toLowerCase()
        });
      });
    } else if (uniqueColors.length > 0) {
      // Sadece renk var
      console.log("🔧 Sadece renk var, renk varyantları oluşturuluyor...");
      uniqueColors.forEach(color => {
        variants.push({
          color: color,
          size: "Tek Beden",
          inStock: true,
          stock: 15,
          price: 0,
          sku: `${color.replace(/\s+/g, '-')}-tek-beden`.toLowerCase()
        });
      });
    }
  } else {
    // Hiç varyant yok - default oluştur
    console.log("🔧 Hiç varyant bulunamadı, varsayılan varyant oluşturuluyor...");
    variants.push({
      color: "Standart",
      size: "Tek Beden", 
      inStock: true,
      stock: 20,
      price: 0,
      sku: "standart-tek-beden"
    });
  }
  
  console.log("✅ Toplam", variants.length, "varyant oluşturuldu");
  console.log("📊 İlk 3 varyant:", variants.slice(0, 3));
  
  return variants;
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

  // Ultimate Price Extractor Test Endpoint
  app.post("/api/test-ultimate-price", async (req, res) => {
    try {
      const { url } = req.body;
      console.log("🎯 Ultimate Price Extractor test başlatılıyor...");
      
      // Use provided URL or default test URL
      const testUrl = url || "https://www.trendyol.com/hbtasarim/kiraz-tasarim-bileklik-p-941019763?boutiqueId=61&merchantId=406896";
      
      console.log(`📍 Test URL: ${testUrl}`);
      
      const result = await testUltimatePriceExtraction(testUrl);
      
      if (result) {
        console.log(`✅ Ultimate Price test tamamlandı: ${result.original} TL via ${result.method}`);
        res.json({
          success: true,
          price: result,
          message: `Price extracted: ${result.original} TL via ${result.method}`
        });
      } else {
        console.log("❌ Ultimate Price test başarısız");
        res.status(500).json({
          success: false,
          error: "Price extraction failed"
        });
      }
    } catch (error) {
      console.error("❌ Ultimate Price test hatası:", error);
      res.status(500).json({
        success: false,
        error: "Price test sırasında hata oluştu",
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
          
          // Özelliklerden gerçek varyant verisi oluştur
          const processedVariants = processVariantsFromFeatures(scenarioResult.features || [], scenarioResult.variants || []);
          
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
            variants: processedVariants,
            extractionDetails: scenarioResult.extractionDetails
          });
        }
        
        console.log("🔄 Scenario-based failed, using Fixed Authentic Scraper fallback");
        
        // Fallback to Fixed Authentic Scraper if scenario-based fails
        const fixedResult = await fixedAuthenticScrape(url);
        
        if (fixedResult.success) {
          console.log("🔧 Fixed Scraper FALLBACK SUCCESS - Price:", fixedResult.price);
          
          // Özelliklerden gerçek varyant verisi oluştur
          const processedVariants = processVariantsFromFeatures(fixedResult.features || [], fixedResult.variants || []);
          
          return res.json({
            success: true,
            extractionMethod: 'fixed-authentic-scraper-fallback',
            brand: fixedResult.brand,
            title: fixedResult.title,
            price: fixedResult.price,
            images: fixedResult.images,
            features: fixedResult.features,
            variants: processedVariants
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

      const { url: rawUrl, persistentTags, onlyExtractData = false } = req.body;
      
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
        
        console.log('🚨 ROUTES: About to call scenarioBasedScrape...');
        const result = await scenarioBasedScrape(url);
        console.log('🚨 ROUTES: scenarioBasedScrape returned price:', result.price?.original);
        
        if (result.success) {
          console.log(`🎯 Scenario: ${result.scenario}, Confidence: ${result.confidence}%`);
          console.log(`🎯 Variants: ${result.variants.length} adet`);
          
          // Add persistent tags to the result
          if (persistentTags && Array.isArray(persistentTags) && persistentTags.length > 0) {
            console.log(`🏷️ Kalıcı etiketler ekleniyor: ${persistentTags.join(', ')}`);
            result.tags = [...(result.tags || []), ...persistentTags];
          }
          
          // ✅ Sadece veri çekme modunda otomatik işlemler yapılmaz
          if (!onlyExtractData) {
            // Send Telegram notification with product URL and title
            await sendProductExtractionNotification(url, result.title, result.brand, result.price);
          } else {
            console.log('📝 Sadece veri çekme modu - Telegram bildirimi atlandı');
          }
          
          // ✅ Sadece Shopify transfer modunda Shopify tracking kaydı oluştur
          if (!onlyExtractData) {
            try {
              const { shopifyTransferTracker } = await import('./shopify-transfer-tracker');
              await shopifyTransferTracker.registerTransferredProduct({
                sourceUrl: url,
                title: result.title,
                brand: result.brand,
                originalPrice: result.price.original,
                shopifyPrice: result.price.withProfit,
                profitMargin: ((result.price.withProfit - result.price.original) / result.price.original * 100),
                variantCount: result.variants.length,
                imageCount: result.images.length,
                sourceData: {
                  variants: result.variants,
                  images: result.images,
                  features: result.features,
                  tags: result.tags,
                  scenario: result.scenario,
                  confidence: result.confidence
                }
              });
              console.log('📦 Shopify transfer kaydı oluşturuldu');
            } catch (trackingError) {
              console.error('⚠️ Shopify transfer tracking hatası (devam ediyor):', trackingError);
            }
          } else {
            console.log('📝 Sadece veri çekme modu - Shopify transfer tracking atlandı');
          }

          // ✅ Sadece Shopify transfer modunda detaylı Telegram bildirimi
          if (!onlyExtractData) {
            try {
              const { sendFilteredTelegramNotification } = await import('./filtered-telegram-notifier');
              const message = `
🎯 <b>YENİ ÜRÜN SHOPIFY'A AKTARILDI</b>

📦 <b>Ürün:</b> ${result.title}
🏢 <b>Marka:</b> ${result.brand || 'Bilinmeyen Marka'}
💰 <b>Orijinal Fiyat:</b> ${result.price.original} TL
💵 <b>Shopify Fiyatı:</b> ${result.price.withProfit} TL
📈 <b>Kar Marjı:</b> %${((result.price.withProfit - result.price.original) / result.price.original * 100).toFixed(1)}
🎨 <b>Varyant Sayısı:</b> ${result.variants.length} adet
📸 <b>Görsel Sayısı:</b> ${result.images.length} adet

🔗 <b>Kaynak URL:</b> ${url}

⏰ <b>Transfer Tarihi:</b> ${new Date().toLocaleString('tr-TR')}
🤖 <b>Durum:</b> Shopify'a aktarıldı - Takip sistemi aktif
🔔 <b>Takip:</b> Fiyat, stok ve durum değişiklikleri izleniyor
              `.trim();
              
              await sendFilteredTelegramNotification(message);
              console.log('📱 Shopify transfer bildirimi Telegram\'a gönderildi');
            } catch (telegramError) {
              console.error('⚠️ Telegram bildirimi hatası:', telegramError);
            }
          } else {
            console.log('📝 Sadece veri çekme modu - Shopify transfer bildirimi atlandı');
          }
          
          // ✅ Otomatik tracking kaldırıldı - Kullanıcı önce ürün verilerini görecek
          // Tracking sadece Shopify'a aktarım sonrası aktif olacak
          console.log('ℹ️  Ürün verisi çekildi, tracking Shopify transfer sonrası aktif olacak');
          
          // CSV generation için gerekli veri hazırla
          const csvProductData = {
            title: result.title,
            brand: result.brand,
            price: result.price,
            images: result.images,
            variants: result.variants,
            features: result.features,
            tags: result.tags
          };
          
          // CSV içeriğini generate et
          let csvContent = '';
          try {
            csvContent = generateMultiVariantShopifyCSV(csvProductData);
            console.log(`📋 CSV generated for ${result.title}: ${csvContent.length} characters`);
          } catch (csvError) {
            console.warn('⚠️ CSV generation failed, continuing without CSV:', csvError);
          }
          
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
            tags: result.tags,
            csvContent: csvContent,
            trackingActive: false, // Tracking sadece Shopify transfer sonrası aktif
            extractionDetails: result.extractionDetails
          });
        } else {
          console.log("❌ Scenario-based extraction failed");
          // Return 503 Service Unavailable when blocked
          const statusCode = result.extractionDetails?.scenario === 'blocked' ? 503 : 500;
          return res.status(statusCode).json({
            success: false,
            message: result.extractionDetails?.scenario === 'blocked' 
              ? 'Trendyol tarafından engellendiniz. Lütfen birkaç dakika bekleyin.'
              : 'Scenario-based extraction failed',
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

  // URL çözümleyici fonksiyonu
  const resolveShortUrl = async (url: string): Promise<string> => {
    try {
      // ty.gl kısaltılmış URL kontrolü
      if (url.includes('ty.gl/')) {
        console.log('🔄 Kısaltılmış URL tespit edildi, çözümleniyor...');
        
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 15000 
        });
        
        const finalUrl = page.url();
        console.log(`✅ URL çözümlendi: ${finalUrl}`);
        
        await browser.close();
        return finalUrl;
      }
      
      return url;
    } catch (error) {
      console.error('❌ URL çözümleme hatası:', error);
      return url;
    }
  };

  // Main product extraction endpoint
  app.post('/api/extract', async (req, res) => {
    try {
      let { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL is required'
        });
      }
      
      console.log('📊 Main extraction for:', url);
      
      // URL çözümle (kısaltılmış URL'ler için)
      url = await resolveShortUrl(url);
      
      // Enhanced product data extraction for Trendyol products
      if (url.includes('trendyol.com')) {
        try {
          // ULTRA SPEED EXTRACTOR - MAXIMUM A++ PERFORMANCE
          console.log("⚡⚡⚡ ULTRA SPEED EXTRACTOR - MAXIMUM A++ PERFORMANCE!");
          const { ultraSpeedExtract } = await import('./ultra-speed-extractor');
          const ultraResult = await ultraSpeedExtract(url);
          
          if (ultraResult && ultraResult.success) {
            console.log("🚀🚀🚀 ULTRA SPEED SUCCESS - MAXIMUM PERFORMANCE ACHIEVED!");
            
            return res.json({
              success: true,
              extractionMethod: 'ultra-speed-a++',
              brand: ultraResult.brand,
              title: ultraResult.title,
              price: ultraResult.price?.withProfit || ultraResult.price?.original || ultraResult.price,
              images: ultraResult.images,
              features: [],
              variants: ultraResult.variants,
              tags: ultraResult.tags || [],
              extractionTime: ultraResult.extractionTime
            });
          }
          
          // Fallback to fixed authentic scraper if ultra-speed fails
          console.log("🎯 Ultra-speed failed, trying Fixed Authentic Trendyol Scraper...");
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

  // ULTRA SPEED BATCH EXTRACTION - Process multiple URLs in parallel
  app.post('/api/batch-extract', async (req, res) => {
    try {
      const { urls } = req.body;
      
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'URLs array is required'
        });
      }
      
      console.log(`⚡⚡⚡ ULTRA SPEED BATCH EXTRACTION - Processing ${urls.length} URLs in parallel!`);
      
      const { ultraSpeedBatchExtract } = await import('./ultra-speed-extractor');
      const startTime = Date.now();
      
      const results = await ultraSpeedBatchExtract(urls);
      const processingTime = Date.now() - startTime;
      
      console.log(`🚀🚀🚀 BATCH EXTRACTION COMPLETE - ${urls.length} URLs in ${processingTime}ms!`);
      console.log(`⚡ Average speed: ${Math.round(processingTime / urls.length)}ms per URL`);
      
      return res.json({
        success: true,
        totalUrls: urls.length,
        processingTime,
        averageSpeed: Math.round(processingTime / urls.length),
        results
      });
      
    } catch (error) {
      console.error('Batch extraction error:', error);
      return res.status(500).json({
        success: false,
        message: 'Batch extraction failed',
        error: error instanceof Error ? error.message : 'Unknown error'
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

  // Test enhanced extraction endpoint
  app.post('/api/test-enhanced', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL gerekli'
        });
      }
      
      const { testEnhancedExtraction } = await import('./test-enhanced-extraction');
      const result = await testEnhancedExtraction(url);
      
      res.json(result);
      
    } catch (error) {
      console.error('Enhanced test error:', error);
      return res.status(500).json({
        success: false,
        message: 'Enhanced extraction test failed',
        error: error instanceof Error ? error.message : 'Unknown error'
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

  // Image proxy endpoint to bypass CORS restrictions
  app.get('/api/image-proxy', async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      
      if (!imageUrl || !imageUrl.includes('cdn.dsmcdn.com')) {
        return res.status(400).json({ error: 'Invalid image URL' });
      }

      console.log('🖼️ Proxy image request:', imageUrl);

      // Fetch the image from Trendyol
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Referer': 'https://www.trendyol.com/',
          'sec-ch-ua': '"Google Chrome";v="120", "Chromium";v="120", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'image',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'same-site'
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      // Get content type from response
      const contentType = response.headers['content-type'] || 'image/jpeg';
      
      // Set cache headers
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Access-Control-Allow-Origin': '*'
      });

      // Send the image
      res.send(Buffer.from(response.data));
    } catch (error: any) {
      console.error('❌ Image proxy error:', error.response?.status || error.message);
      
      // If it's a 404, try with alternative URL patterns
      if (error.response?.status === 404 && imageUrl) {
        try {
          // Try without version path
          const altUrl = imageUrl.replace(/\/ty\d+\//, '/');
          console.log('🔄 Trying alternative URL:', altUrl);
          
          const altResponse = await axios.get(altUrl, {
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*',
              'Referer': 'https://www.trendyol.com/'
            },
            timeout: 5000
          });
          
          const contentType = altResponse.headers['content-type'] || 'image/jpeg';
          res.set({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          });
          
          return res.send(Buffer.from(altResponse.data));
        } catch (altError) {
          console.error('❌ Alternative URL also failed:', altError);
        }
      }
      
      // Return a transparent 1x1 pixel as fallback
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set({
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache'
      });
      res.send(pixel);
    }
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
      
      // First get HTML content from URL
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      // Extract all images from HTML content
      const allImages = extractImagesFromHTML(response.data);
      
      if (allImages.length === 0) {
        console.log('⚠️ Hiç görsel bulunamadı');
        return res.status(400).json({ message: "Görsel bulunamadı" });
      }
      
      console.log(`✅ ${allImages.length} görsel başarıyla çıkarıldı`);
      
      res.json({
        success: true,
        imageCount: allImages.length,
        images: allImages.map(img => ({ url: img })),
        summary: {
          totalImages: allImages.length,
          uniqueImages: [...new Set(allImages)].length
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
      
      // First get HTML content from URL
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      // Extract all images from HTML content
      const allImages = extractImagesFromHTML(response.data);
      
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

  // Product Features Extraction endpoint
  app.post('/api/extract-features', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL gerekli" });
      }

      console.log('🔍 Ürün özellikleri çıkarılıyor...');
      
      // First get HTML content from URL
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      // Extract features from HTML content
      const features = extractProductFeaturesFromHTML(response.data);
      
      console.log(`✅ ${features.length} özellik başarıyla çıkarıldı`);
      
      res.json({
        success: true,
        featureCount: features.length,
        features: features
      });
    } catch (error) {
      console.error('Özellik çıkarma hatası:', error);
      res.status(500).json({ 
        message: "Özellikler çıkarılamadı", 
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Multi-URL scraping endpoint
  app.post('/api/multi-url-scrape', async (req, res) => {
    try {
      const { urls, mode } = req.body;
      
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'URLs array is required and must not be empty'
        });
      }
      
      // Validate URL structure
      for (const urlItem of urls) {
        if (!urlItem.url) {
          return res.status(400).json({
            success: false,
            message: 'Each URL item must have url property'
          });
        }
        
        if (!urlItem.url.includes('trendyol.com')) {
          return res.status(400).json({
            success: false,
            message: 'Only Trendyol URLs are supported'
          });
        }
      }
      
      console.log(`🎨 Multi-URL scrape request: ${urls.length} color variants`);
      
      const result = await scrapeMultipleUrls({
        urls: urls,
        mode: 'multi-url'
      });
      
      // CSV oluştur
      const csvContent = generateMultiVariantShopifyCSV(result);
      
      return res.json({
        success: true,
        extractionMethod: 'multi-url-scraper',
        csvContent: csvContent,
        detectedColors: result.variants.colors, // Tespit edilen renkler
        ...result
      });
      
    } catch (error) {
      console.error('❌ Multi-URL scraper error:', error);
      return res.status(500).json({
        success: false,
        error: 'Multi-URL extraction failed',
        message: error instanceof Error ? error.message : 'Multi-URL extraction failed'
      });
    }
  });

  // Shopify Products Management API Endpoints
  
  // Test Shopify connection
  app.get('/api/shopify/test-connection', async (req, res) => {
    try {
      const isConnected = await shopifyProductsManager.testConnection();
      res.json({
        success: isConnected,
        message: isConnected ? 'Shopify bağlantısı başarılı' : 'Shopify bağlantısı başarısız'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Fetch all Shopify products
  app.get('/api/shopify/products', async (req, res) => {
    try {
      const products = await shopifyProductsManager.fetchAllShopifyProducts();
      res.json({
        success: true,
        count: products.length,
        products
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Sync database with Shopify products
  app.post('/api/shopify/sync-database', async (req, res) => {
    try {
      const syncResult = await shopifyProductsManager.syncWithDatabase();
      res.json({
        success: true,
        ...syncResult
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Refresh matched products from source sites
  app.post('/api/shopify/refresh-products', async (req, res) => {
    try {
      // First sync to get matched products
      const syncResult = await shopifyProductsManager.syncWithDatabase();
      
      // Then refresh from source sites
      const refreshResult = await shopifyProductsManager.refreshMatchedProducts(
        syncResult.details.matchedProducts
      );
      
      res.json({
        success: true,
        sync: syncResult,
        refresh: refreshResult
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Get specific Shopify product
  app.get('/api/shopify/products/:productId', async (req, res) => {
    try {
      const { productId } = req.params;
      const product = await shopifyProductsManager.fetchShopifyProduct(productId);
      
      if (product) {
        res.json({
          success: true,
          product
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Ürün bulunamadı'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Shopify upload endpoint
  app.post('/api/shopify-upload', async (req, res) => {
    try {
      const { csvContent, productTitle, productData } = req.body;
      
      console.log('📥 Shopify upload request received');
      console.log('Request body keys:', Object.keys(req.body));
      console.log('CSV Content exists:', !!csvContent);
      console.log('CSV Content preview:', csvContent ? csvContent.substring(0, 200) + '...' : 'null');
      console.log('Product Data exists:', !!productData);
      console.log('Product Title:', productTitle);
      
      // Multi-URL product data yükleme - daha basit condition
      console.log('🧪 Route condition check:');
      console.log('   productData exists:', !!productData);
      console.log('   productData type:', typeof productData);
      console.log('   productData keys:', productData ? Object.keys(productData).slice(0, 5) : 'none');
      
      // CSV upload'u öncelik ver - multi-URL da CSV generate ediyor
      if (csvContent) {
        console.log(`🛒 Uploading CSV to Shopify: ${productTitle}`);
        const uploadResult = await uploadProductToShopify(csvContent, productTitle);
        
        if (uploadResult.success) {
          return res.json({
            success: true,
            productId: uploadResult.productId,
            message: uploadResult.message
          });
        } else {
          return res.status(400).json({
            success: false,
            error: uploadResult.message,
            message: uploadResult.message
          });
        }
      }
      
      // Eğer sadece productData varsa direkt upload kullan
      if (productData && !csvContent) {
        console.log('🔄 ✅ Multi-URL product data detected - Using direct uploader');
        console.log('🎨 ROUTE DEBUG - Colors in productData:', productData.variants?.colors);
        console.log('📋 ROUTE DEBUG - AllVariants:', productData.variants?.allVariants);
        
        // Direkt multi-URL uploader kullan
        const uploadResult = await uploadMultiUrlProductToShopify(productData, productTitle || productData.title);
        return res.json(uploadResult);
      }

      
      console.log('❌ Neither CSV content nor product data provided');
      return res.status(400).json({
        success: false,
        message: 'CSV content veya product data gerekli'
      });
      
    } catch (error) {
      console.error('❌ Shopify upload endpoint error:', error);
      return res.status(500).json({
        success: false,
        error: 'Shopify upload failed',
        message: error instanceof Error ? error.message : 'Shopify upload failed'
      });
    }
  });

  // Debug endpoint
  app.get('/api/debug-multi-url', async (req, res) => {
    try {
      const testData = {
        title: "Test Product",
        brand: "Test Brand",
        price: { original: 100, withProfit: 110 },
        images: [{ url: "https://example.com/image.jpg" }],
        variants: {
          colors: ["Erkek Beyaz Gomlek", "Erkek Yesil Gomlek"]
        }
      };
      
      console.log('🔍 DEBUG TEST - Colors:', testData.variants.colors);
      
      // Test color extraction
      const extractColor = (text: string): string => {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('beyaz')) return 'Beyaz';
        if (lowerText.includes('yesil') || lowerText.includes('yeşil')) return 'Yeşil';
        return 'Çok Renkli';
      };
      
      const extractedColors = testData.variants.colors.map(extractColor);
      console.log('🎨 Extracted colors:', extractedColors);
      
      return res.json({
        success: true,
        originalColors: testData.variants.colors,
        extractedColors: extractedColors
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Shopify connection test endpoint
  app.get('/api/shopify-test', async (req, res) => {
    try {
      const testResult = await testShopifyConnection();
      
      if (testResult.success) {
        return res.json({
          success: true,
          message: testResult.message,
          store: testResult.store
        });
      } else {
        return res.status(400).json({
          success: false,
          message: testResult.message
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
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

  // Generate multi-variant CSV endpoint (for client compatibility)
  app.post('/api/generate-multi-variant-csv', async (req, res) => {
    try {
      const { productData } = req.body;
      
      if (!productData) {
        return res.status(400).json({
          success: false,
          message: 'Product data is required'
        });
      }

      console.log('📊 Generating CSV for product:', productData.title);
      
      // Create CSV content with the product data format from scenario scraping
      const csvContent = convertProductToShopifyCSV(productData);
      
      return res.json({
        success: true,
        csvContent: csvContent,
        message: 'CSV generated successfully'
      });
      
    } catch (error) {
      console.error('❌ CSV generation error:', error);
      return res.status(500).json({
        success: false,
        error: 'CSV generation failed',
        message: error instanceof Error ? error.message : 'CSV generation failed'
      });
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

  // Comprehensive CSV with Enhanced Features - Main endpoint
  app.post('/api/comprehensive-csv', async (req, res) => {
    try {
      const { url, productTitle } = req.body;
      console.log('📄 Kapsamlı CSV özellikleri ile oluşturuluyor...');
      
      if (!url) {
        return res.status(400).json({ message: 'URL gerekli' });
      }

      // Use scenario-based scraper for comprehensive data
      const result = await scenarioBasedScrape(url);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: 'Ürün verileri çıkarılamadı',
          details: result.extractionDetails
        });
      }

      // Prepare comprehensive product data
      const comprehensiveData: ComprehensiveProductData = {
        title: result.title,
        brand: result.brand,
        price: result.price,
        images: result.images,
        features: result.features,
        variants: result.variants,
        description: result.features.find(f => f.key.toLowerCase().includes('açıklama'))?.value,
        category: result.features.find(f => f.key.toLowerCase().includes('kategori'))?.value,
        sku: result.features.find(f => f.key.toLowerCase().includes('sku'))?.value
      };

      // Generate comprehensive CSV
      const csvContent = generateComprehensiveShopifyCSV(comprehensiveData);
      const featureSummary = generateFeatureSummary(comprehensiveData);

      console.log(`✅ Kapsamlı CSV oluşturuldu: ${result.features.length} özellik, ${result.images.length} görsel, ${result.variants.length} varyant`);
      console.log(featureSummary);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="comprehensive-shopify-product.csv"');
      res.send(csvContent);
      
    } catch (error) {
      console.error('Comprehensive CSV generation error:', error);
      res.status(500).json({ message: 'Kapsamlı CSV oluşturma hatası', error: (error as Error).message });
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

  // Connection Test Endpoints
  app.get('/api/test-telegram', async (req, res) => {
    try {
      const { testTelegramConnection } = await import('./connection-test');
      const result = await testTelegramConnection();
      
      if (result.connected) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        service: 'Telegram',
        connected: false,
        message: `Test failed: ${error.message}`,
        timestamp: new Date()
      });
    }
  });

  app.get('/api/test-shopify', async (req, res) => {
    try {
      const { testShopifyConnection } = await import('./connection-test');
      const result = await testShopifyConnection();
      
      if (result.connected) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        service: 'Shopify',
        connected: false,
        message: `Test failed: ${error.message}`,
        timestamp: new Date()
      });
    }
  });

  app.get('/api/test-all-connections', async (req, res) => {
    try {
      const { testAllConnections } = await import('./connection-test');
      const result = await testAllConnections();
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        error: `Connection test failed: ${error.message}`,
        timestamp: new Date()
      });
    }
  });

  app.post('/api/telegram/send-test', async (req, res) => {
    try {
      const { sendTelegramTestMessage } = await import('./connection-test');
      const result = await sendTelegramTestMessage();
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: `Test message failed: ${error.message}`
      });
    }
  });

  // Manuel Telegram test endpoint
  app.post('/api/manual-telegram-test', async (req, res) => {
    try {
      const { message } = req.body;
      const { filteredNotifier } = await import('./filtered-telegram-notifier');
      
      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Mesaj parametresi gerekli'
        });
      }

      await filteredNotifier.sendNotification(message);
      
      res.json({
        success: true,
        message: 'Manuel test mesajı gönderildi'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: `Manuel test hatası: ${error.message}`
      });
    }
  });

  // Shopify Test Connection Endpoint
  app.post('/api/shopify/test-connection', async (req, res) => {
    try {
      console.log('🔍 Testing Shopify connection...');
      
      const { testShopifyConnection } = await import('./connection-test');
      const result = await testShopifyConnection();
      
      if (result.connected) {
        console.log('✅ Shopify connection test successful');
        res.json({
          success: true,
          message: result.message,
          data: result.details
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
      
      // Ürün verisi kontrolü - title ve temel alanlar
      if (!productData || (!productData.title && !productData.brand)) {
        console.log('❌ Missing required product data:', productData);
        return res.status(400).json({ 
          success: false, 
          error: 'Geçerli product data gerekli - title veya brand eksik' 
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
        tags: productData.tags ? productData.tags.join(', ') : "trendyol, import, scenario-based",
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

  // Shopify ürünleri hafızaya kaydetme endpoint'i
  app.post('/api/shopify/save-to-memory', async (req, res) => {
    try {
      console.log('🔄 Shopify ürünleri hafızaya kaydediliyor (pagination ile tüm ürünler)...');
      
      // Shopify'dan TÜM ürünleri çek (pagination ile 1000+ ürün destegi)
      const result = await shopifyApiService.syncAllProducts();
      
      if (!result.success) {
        return res.json({
          success: false,
          message: result.error || 'Shopify ürünleri alınırken hata oluştu',
          savedProducts: 0,
          savedVariants: 0
        });
      }
      
      console.log(`✅ Shopify hafızaya kaydetme tamamlandı: ${result.newProducts} yeni, ${result.updatedProducts} güncellenen ürün`);
      
      res.json({
        success: true,
        message: `Shopify ürünleri başarıyla hafızaya kaydedildi: ${result.totalProducts} ürün`,
        savedProducts: result.totalProducts,
        savedVariants: 0,
        totalFetched: result.totalProducts
      });
      
    } catch (error: any) {
      console.error('❌ Shopify hafızaya kaydetme hatası:', error);
      res.status(500).json({
        success: false,
        error: `Shopify hafızaya kaydetme hatası: ${error.message}`
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
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
        return res.status(404).send('Image not found');
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
      return res.status(500).send('Proxy error');
    }
  });

  // COMPLETE PRODUCT WORKFLOW - Extract → Store → Sync → Monitor
  app.post('/api/process-product-complete', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is required' 
      });
    }
    
    try {
      console.log(`🚀 Complete product workflow started for: ${url}`);
      
      const result = await ProductManagementSystem.processProductComplete(url);
      
      if (result.success) {
        console.log(`✅ Complete product workflow finished successfully`);
        res.json(result);
      } else {
        console.log(`❌ Complete product workflow failed: ${result.error}`);
        res.status(500).json(result);
      }
      
    } catch (error) {
      console.error('Complete product workflow error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Complete product workflow failed', 
        details: error.message 
      });
    }
  });

  // Get product analysis data
  app.get('/api/product-analysis/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
      console.log(`📊 Getting product analysis for ID: ${id}`);
      
      const analysis = await ProductManagementSystem.getProductAnalysis(parseInt(id));
      
      console.log(`✅ Product analysis retrieved successfully`);
      res.json(analysis);
      
    } catch (error) {
      console.error('Product analysis error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Product analysis failed', 
        details: error.message 
      });
    }
  });

  // Get all products for analysis page
  app.get('/api/products-analysis', async (req, res) => {
    try {
      console.log(`📊 Getting all products for analysis`);
      
      const products = await ProductManagementSystem.getAllProductsForAnalysis();
      
      console.log(`✅ All products retrieved: ${products.length} products`);
      res.json(products);
      
    } catch (error) {
      console.error('Products analysis error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Products analysis failed', 
        details: error.message 
      });
    }
  });

  // System stats for unified dashboard
  app.get('/api/system-stats', async (req, res) => {
    try {
      console.log(`📊 Getting system statistics`);
      
      const products = await ProductManagementSystem.getAllProductsForAnalysis();
      
      const stats = {
        totalProducts: products.length,
        successRate: products.length > 0 ? Math.round((products.filter(p => p.syncStatus === 'synced').length / products.length) * 100) : 0,
        activeMonitors: products.filter(p => p.isActive).length,
        avgResponseTime: 450, // ms
        dailyExtractions: products.filter(p => {
          const today = new Date();
          const productDate = new Date(p.createdAt);
          return productDate.toDateString() === today.toDateString();
        }).length,
        errorRate: products.length > 0 ? Math.round((products.filter(p => p.syncStatus === 'error').length / products.length) * 100) : 0,
        lastUpdate: new Date().toISOString()
      };
      
      console.log(`✅ System stats retrieved successfully`);
      res.json(stats);
      
    } catch (error) {
      console.error('System stats error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'System stats failed', 
        details: error.message 
      });
    }
  });

  // Recent activity for unified dashboard
  app.get('/api/recent-activity', async (req, res) => {
    try {
      console.log(`📊 Getting recent activity`);
      
      const products = await ProductManagementSystem.getAllProductsForAnalysis();
      
      const recentActivity = products.slice(0, 10).map((product, index) => ({
        id: `activity-${index}`,
        type: product.shopifyProductId ? 'shopify' : 'scraping',
        description: `${product.title} - ${product.brand}`,
        timestamp: product.createdAt,
        status: product.syncStatus === 'synced' ? 'success' : (product.syncStatus === 'error' ? 'error' : 'warning'),
        url: product.trendyolUrl
      }));
      
      console.log(`✅ Recent activity retrieved: ${recentActivity.length} items`);
      res.json(recentActivity);
      
    } catch (error) {
      console.error('Recent activity error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Recent activity failed', 
        details: error.message 
      });
    }
  });

  // ================================
  // SHOPIFY API SERVICE ENDPOINTS
  // ================================

  // Shopify ürün senkronizasyonu (tüm ürünleri çek ve hafızaya kaydet)
  app.post('/api/shopify/sync-all-products', async (req, res) => {
    try {
      console.log('🔄 Shopify ürün senkronizasyonu başlatılıyor...');
      const result = await shopifyApiService.syncAllProducts();
      
      res.json({
        success: result.success,
        message: result.success 
          ? `${result.totalProducts} ürün senkronize edildi (${result.newProducts} yeni, ${result.updatedProducts} güncellendi)`
          : 'Senkronizasyon başarısız',
        totalProducts: result.totalProducts,
        newProducts: result.newProducts,
        updatedProducts: result.updatedProducts
      });
    } catch (error) {
      console.error('❌ Shopify sync hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Shopify senkronizasyon hatası'
      });
    }
  });

  // Hafızadaki Shopify ürünlerini listele
  app.get('/api/shopify/memory-products', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const result = await shopifyApiService.getMemoryProducts(limit, offset);
      
      res.json({
        success: result.success,
        products: result.products,
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      console.error('❌ Hafızadaki Shopify ürünleri listeleme hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Ürün listeleme hatası'
      });
    }
  });

  // Benzersiz ID ile ürün getir
  app.get('/api/shopify/product/:trackingId', async (req, res) => {
    try {
      const { trackingId } = req.params;
      const result = await shopifyApiService.getProductByTrackingId(trackingId);
      
      if (result.success) {
        res.json({
          success: true,
          product: result.product
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
          message: 'Ürün bulunamadı'
        });
      }
    } catch (error) {
      console.error('❌ Ürün getirme hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Ürün getirme hatası'
      });
    }
  });

  // Ürün takibini aktifleştir
  app.post('/api/shopify/enable-tracking/:trackingId', async (req, res) => {
    try {
      const { trackingId } = req.params;
      const { trackingInterval } = req.body;
      
      const result = await shopifyApiService.enableProductTracking(trackingId, trackingInterval || 300);
      
      res.json({
        success: result.success,
        message: result.success ? 'Ürün takibi aktifleştirildi' : 'Takip aktifleştirme başarısız',
        error: result.error
      });
    } catch (error) {
      console.error('❌ Ürün takibi aktifleştirme hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Takip aktifleştirme hatası'
      });
    }
  });

  // Hafıza istatistikleri
  app.get('/api/shopify/memory-stats', async (req, res) => {
    try {
      const result = await shopifyApiService.getMemoryStats();
      
      res.json({
        success: result.success,
        stats: result.stats,
        error: result.error
      });
    } catch (error) {
      console.error('❌ Hafıza istatistik hatası:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'İstatistik getirme hatası'
      });
    }
  });

  // Shopify'a aktarılan ürünleri listele
  app.get('/api/shopify/transferred-products', async (req, res) => {
    try {
      const shopifyProducts = await db
        .select({
          id: products.id,
          title: products.title,
          brand: products.brand,
          shopifyProductId: products.shopifyProductId,
          shopifyUrl: products.shopifyUrl,
          shopifyStoreUrl: products.shopifyStoreUrl,
          currentPrice: products.currentPrice,
          originalPrice: products.originalPrice,
          sourcePlatform: products.sourcePlatform,
          trendyolUrl: products.trendyolUrl,
          lastSyncAt: products.lastSyncAt,
          createdAt: products.createdAt,
          syncStatus: products.syncStatus,
          profitMargin: products.profitMargin
        })
        .from(products)
        .where(eq(products.isActive, true))
        .limit(20);
      
      // Sadece Shopify'a aktarılanları filtrele
      const transferredProducts = shopifyProducts.filter(p => 
        p.shopifyProductId || p.shopifyUrl
      );
      
      const productsWithStats = transferredProducts.map(product => ({
        ...product,
        transferDate: product.lastSyncAt || product.createdAt,
        shopifyStatus: product.syncStatus || 'synced',
        profitMargin: product.profitMargin || '15.00',
        sourceUrl: product.trendyolUrl
      }));
      
      res.json({
        success: true,
        products: productsWithStats,
        summary: {
          totalTransferred: transferredProducts.length,
          lastTransfer: transferredProducts.length > 0 ? 
            new Date(Math.max(...transferredProducts.map(p => new Date(p.lastSyncAt || p.createdAt).getTime()))).toISOString() : null
        }
      });
    } catch (error) {
      console.error('Shopify transferred products error:', error);
      res.json({ 
        success: true, 
        products: [],
        summary: {
          totalTransferred: 0,
          lastTransfer: null
        }
      });
    }
  });

  // Shopify mağaza istatistikleri
  app.get('/api/shopify/store-stats', async (req, res) => {
    try {
      const allProducts = await db
        .select({
          currentPrice: products.currentPrice,
          sourcePlatform: products.sourcePlatform,
          shopifyProductId: products.shopifyProductId,
          shopifyUrl: products.shopifyUrl
        })
        .from(products)
        .where(eq(products.isActive, true));
      
      // Sadece Shopify'a aktarılanları filtrele
      const shopifyProducts = allProducts.filter(p => 
        p.shopifyProductId || p.shopifyUrl
      );
      
      const totalValue = shopifyProducts.reduce((sum, p) => 
        sum + (parseFloat(p.currentPrice?.toString() || '0') || 0), 0
      );
      
      const platformBreakdown = shopifyProducts.reduce((acc, p) => {
        const platform = p.sourcePlatform || 'unknown';
        acc[platform] = (acc[platform] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      res.json({
        success: true,
        stats: {
          totalProducts: shopifyProducts.length,
          totalValue: totalValue.toFixed(2),
          platformBreakdown,
          lastUpdate: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Shopify store stats error:', error);
      res.json({ 
        success: true, 
        stats: {
          totalProducts: 0,
          totalValue: '0.00',
          platformBreakdown: {},
          lastUpdate: new Date().toISOString()
        }
      });
    }
  });

  // Shopify-Trendyol ürün eşleştirme endpoint'i
  app.post('/api/matcher/start-matching', async (req, res) => {
    try {
      console.log('🚀 Shopify-Trendyol ürün eşleştirme başlıyor...');
      
      // Hafızadaki Shopify ürünlerini al (ilk 20 ürünle test)
      const shopifyProducts = await db
        .select({
          id: products.id,
          title: products.title,
          brand: products.brand,
          currentPrice: products.currentPrice,
          shopifyProductId: products.shopifyProductId
        })
        .from(products)
        .where(isNotNull(products.shopifyProductId))
        .limit(20);

      console.log(`📦 ${shopifyProducts.length} Shopify ürünü bulundu`);
      
      if (shopifyProducts.length === 0) {
        return res.json({
          success: false,
          message: 'Hafızada Shopify ürünü bulunamadı'
        });
      }

      // Her ürün için basit Trendyol araması
      const matches = [];
      
      for (const product of shopifyProducts.slice(0, 5)) { // İlk 5 ürünle test
        console.log(`🔍 Arıyor: ${product.title}`);
        
        // Basit arama URL'si oluştur
        const searchQuery = product.title
          .replace(/[^\w\sÇĞıİÖŞÜçğıiöşü]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        const searchUrl = `https://www.trendyol.com/sr?q=${encodeURIComponent(searchQuery)}`;
        
        matches.push({
          shopifyProduct: {
            id: product.id,
            title: product.title,
            brand: product.brand,
            price: product.currentPrice?.toString() || '0'
          },
          searchUrl: searchUrl,
          searchQuery: searchQuery
        });
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Telegram raporu gönder
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      if (telegramBotToken) {
        try {
          const report = `🎯 *Shopify-Trendyol Ürün Analizi*\n\n📊 *Durum:*\n• Analiz edilen: ${matches.length} ürün\n• Toplam hafızada: ${shopifyProducts.length} Shopify ürünü\n\n🔍 *İlk 3 Ürün:*\n${matches.slice(0, 3).map(m => `• ${m.shopifyProduct.title.substring(0, 30)}...\n  Fiyat: ${m.shopifyProduct.price} TL`).join('\n\n')}\n\n⏰ ${new Date().toLocaleString('tr-TR')}`;
          
          const axios = require('axios');
          await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            chat_id: '1219880063',
            text: report,
            parse_mode: 'Markdown'
          });
          
          console.log('✅ Telegram raporu gönderildi');
        } catch (error) {
          console.error('❌ Telegram gönderim hatası:', error);
        }
      }
      
      res.json({
        success: true,
        message: `${matches.length} ürün analiz edildi ve Telegram'a rapor gönderildi`,
        totalShopifyProducts: shopifyProducts.length,
        analyzedProducts: matches.length,
        matches: matches
      });
      
    } catch (error) {
      console.error('❌ Matching hatası:', error);
      res.status(500).json({
        success: false,
        error: 'Ürün eşleştirme sırasında hata oluştu'
      });
    }
  });

  // Telegram message endpoint
  app.post('/api/telegram/send-message', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Mesaj gerekli'
        });
      }

      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      
      if (!telegramBotToken) {
        return res.status(500).json({
          success: false,
          error: 'Telegram bot token bulunamadı'
        });
      }

      // Telegram API'ye mesaj gönder
      const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
      
      const telegramResponse = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: '1219880063', // Kişisel chat ID
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });

      const telegramResult = await telegramResponse.json();
      
      if (telegramResult.ok) {
        console.log('✅ Telegram mesajı gönderildi');
        res.json({
          success: true,
          message: 'Telegram mesajı başarıyla gönderildi'
        });
      } else {
        console.error('❌ Telegram gönderim hatası:', telegramResult);
        res.status(500).json({
          success: false,
          error: `Telegram hatası: ${telegramResult.description || 'Bilinmeyen hata'}`
        });
      }
      
    } catch (error) {
      console.error('❌ Telegram endpoint hatası:', error);
      res.status(500).json({
        success: false,
        error: 'Telegram mesaj gönderim hatası'
      });
    }
  });

  // Shopify Direct Upload Endpoint
  app.post('/api/export-to-shopify', async (req, res) => {
    try {
      const productData = req.body;
      
      if (!productData || !productData.title) {
        return res.status(400).json({
          success: false,
          message: 'Geçersiz ürün verisi'
        });
      }

      console.log('🚀 Shopify\'a direkt ürün yükleme başlıyor:', productData.title);
      
      // Önce Shopify bağlantısını test et
      const connectionTest = await shopifyIntegration.testConnection();
      if (!connectionTest) {
        return res.status(500).json({
          success: false,
          message: 'Shopify bağlantısı başarısız. Lütfen API anahtarlarını kontrol edin.'
        });
      }

      // Product data'sını database formatına dönüştür
      // Debug: productData'yı konsola yazdır
      console.log('🔍 ProductData sourceUrl:', productData.sourceUrl);
      console.log('🔍 ProductData:', JSON.stringify(productData, null, 2));
      
      // Trendyol Product ID extract et (URL'den veya unique ID oluştur)
      const extractTrendyolId = (url: string) => {
        console.log('🔍 extractTrendyolId input:', url);
        if (url && typeof url === 'string' && url.includes('trendyol.com')) {
          const match = url.match(/p-(.+?)(\?|$)/);
          if (match && match[1] && match[1].trim()) {
            console.log('🔍 extractTrendyolId result (from URL):', match[1]);
            return match[1].trim();
          }
        }
        const result = 'generated-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        console.log('🔍 extractTrendyolId result (generated):', result);
        return result;
      };

      const trendyolUrl = productData.sourceUrl || `https://trendyol.com/generated-${Date.now()}`;
      let trendyolProductId = extractTrendyolId(productData.sourceUrl || '');
      
      // Double-check to ensure it's never null/undefined
      if (!trendyolProductId || typeof trendyolProductId !== 'string' || trendyolProductId.trim() === '') {
        trendyolProductId = 'fallback-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        console.log('🔍 Fallback trendyolProductId generated:', trendyolProductId);
      }
      
      console.log('🔍 Final trendyolUrl:', trendyolUrl);
      console.log('🔍 Final trendyolProductId:', trendyolProductId);
      
      // Final safety check before database insertion
      if (!trendyolProductId) {
        console.error('❌ trendyolProductId is still null or empty after all checks!');
        return res.status(400).json({
          success: false,
          message: 'Ürün ID oluşturulamadı. Lütfen tekrar deneyin.'
        });
      }

      const dbProduct: InsertProduct = {
        trendyolUrl: trendyolUrl,
        trendyolProductId: trendyolProductId,
        title: productData.title,
        brand: productData.brand || 'Bilinmeyen Marka',
        description: productData.description || '',
        category: productData.category || 'Genel',
        images: Array.isArray(productData.images) ? productData.images.map((img: any) => 
          typeof img === 'string' ? img : img.url || img
        ) : [],
        features: productData.features || {},
        colorOptions: productData.variants?.colors || [],
        sizeOptions: productData.variants?.sizes || [],
        originalPrice: typeof productData.price === 'object' ? '0' : productData.price?.toString() || '0',
        currentPrice: typeof productData.price === 'object' ? '0' : productData.price?.toString() || '0',
        stockStatus: 'in_stock',
        lastChecked: new Date(),
        sourcePlatform: 'trendyol',
        isActive: true,
        profitMargin: '15.00'
      };

      // Ürünü veritabanına kaydet
      const [savedProduct] = await db.insert(products).values(dbProduct).returning();
      
      // Varyantları hazırla
      const dbVariants: InsertProductVariant[] = [];
      
      if (productData.variants?.allVariants && productData.variants.allVariants.length > 0) {
        for (const variant of productData.variants.allVariants) {
          dbVariants.push({
            productId: savedProduct.id,
            color: variant.color || 'Standart',
            size: variant.size || 'Standart',
            sku: variant.sku || `${savedProduct.id}-${variant.color || 'STD'}-${variant.size || 'STD'}`,
            trendyolPrice: variant.price?.toString() || '0',
            shopifyPrice: variant.shopifyPrice || variant.price?.toString() || '0',
            stockCount: variant.inStock ? 25 : 0,
            inStock: variant.inStock !== false
          });
        }
      } else {
        // Varyant yoksa default varyant oluştur
        dbVariants.push({
          productId: savedProduct.id,
          color: 'Standart',
          size: 'Standart',
          sku: `${savedProduct.id}-STD-STD`,
          trendyolPrice: typeof productData.price === 'number' ? productData.price.toString() : '0',
          shopifyPrice: typeof productData.price === 'number' ? productData.price.toString() : '0',
          stockCount: 25,
          inStock: true
        });
      }

      // Varyantları veritabanına kaydet
      const savedVariants = dbVariants.length > 0 
        ? await db.insert(productVariants).values(dbVariants).returning()
        : [];

      // Shopify'a ürün oluştur
      const shopifyProductId = await shopifyIntegration.createProduct(savedProduct, savedVariants);
      
      if (shopifyProductId) {
        console.log('✅ Ürün başarıyla Shopify\'a yüklendi:', shopifyProductId);
        
        // Ürünü otomatik olarak tracking'e ekle
        try {
          if (trendyolUrl && trendyolUrl.includes('trendyol.com')) {
            console.log('🎯 Yüklenen ürün otomatik tracking sistemi ekleniyor...');
            await urlTrackingService.addUrlToTracking(trendyolUrl, 300, 'auto-shopify-upload');
            console.log('✅ Ürün otomatik tracking sistemi eklendi');
          }
        } catch (trackingError) {
          console.error('⚠️ Otomatik tracking ekleme hatası (devam ediyor):', trackingError);
        }
        
        return res.json({
          success: true,
          message: `Ürün başarıyla Shopify'a yüklendi ve otomatik takip sistemi aktif edildi!`,
          data: {
            shopifyProductId,
            productTitle: productData.title,
            variantCount: savedVariants.length,
            trackingActive: true,
            shopifyUrl: `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/products/${shopifyProductId}`
          }
        });
      } else {
        console.error('❌ Shopify ürün oluşturma başarısız');
        
        return res.status(500).json({
          success: false,
          message: 'Shopify\'a ürün yüklenirken hata oluştu. Lütfen tekrar deneyin.'
        });
      }
      
    } catch (error) {
      console.error('❌ Shopify export error:', error);
      res.status(500).json({
        success: false,
        message: 'Shopify\'a yükleme sırasında hata oluştu',
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // URL Tracking API endpoints - ÜRÜN URL'LERİNİ HAFIZAYa KAYDET VE TAKİP ET
  app.post("/api/tracking/add", async (req, res) => {
    try {
      const { url, trackingInterval = 300 } = req.body;
      
      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: "URL gerekli" 
        });
      }

      console.log(`🎯 URL tracking'e ekleme isteği: ${url}`);
      
      const result = await urlTrackingService.addUrlToTracking(url, trackingInterval);
      
      if (result.success) {
        res.json({
          success: true,
          message: "URL tracking sistemi eklendi",
          data: result.trackedUrl,
          extraction: result.extractionResult
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error("❌ Tracking add error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get("/api/tracking/list", async (req, res) => {
    try {
      const trackedUrls = await urlTrackingService.getAllTrackedUrls();
      
      res.json({
        success: true,
        data: trackedUrls,
        total: trackedUrls.length
      });
    } catch (error) {
      console.error("❌ Tracking list error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.delete("/api/tracking/remove", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: "URL gerekli" 
        });
      }

      await urlTrackingService.removeUrlFromTracking(url);
      
      res.json({
        success: true,
        message: "URL tracking'den kaldırıldı"
      });
    } catch (error) {
      console.error("❌ Tracking remove error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get("/api/tracking/stats", async (req, res) => {
    try {
      const stats = await urlTrackingService.getTrackingStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error("❌ Tracking stats error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post("/api/tracking/check", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: "URL gerekli" 
        });
      }

      await urlTrackingService.checkUrl(url);
      
      res.json({
        success: true,
        message: "URL kontrol edildi"
      });
    } catch (error) {
      console.error("❌ Tracking check error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // URL arama ve yönetim endpoints
  app.get("/api/saved-urls/search", async (req, res) => {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          success: false,
          error: "Arama terimi gerekli"
        });
      }

      console.log(`🔍 URL arama: "${q}"`);
      const results = await savedUrlsManager.searchSavedUrls(q);
      
      res.json({
        success: true,
        query: q,
        results: results,
        total: results.length
      });
    } catch (error) {
      console.error("❌ URL arama hatası:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get("/api/saved-urls/all", async (req, res) => {
    try {
      console.log('📋 Tüm kayıtlı URL\'ler getiriliyor...');
      const urls = await savedUrlsManager.getAllSavedUrls();
      
      res.json({
        success: true,
        urls: urls,
        total: urls.length
      });
    } catch (error) {
      console.error("❌ URL listesi hatası:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get("/api/saved-urls/recent", async (req, res) => {
    try {
      const { limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10;
      
      console.log(`📅 Son ${limitNum} URL getiriliyor...`);
      const urls = await savedUrlsManager.getRecentUrls(limitNum);
      
      res.json({
        success: true,
        urls: urls,
        total: urls.length
      });
    } catch (error) {
      console.error("❌ Son URL'ler hatası:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get("/api/saved-urls/popular", async (req, res) => {
    try {
      console.log('🔥 Popüler URL\'ler getiriliyor...');
      const urls = await savedUrlsManager.getPopularUrls();
      
      res.json({
        success: true,
        urls: urls,
        total: urls.length
      });
    } catch (error) {
      console.error("❌ Popüler URL'ler hatası:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get("/api/saved-urls/stats", async (req, res) => {
    try {
      console.log('📊 URL istatistikleri getiriliyor...');
      const stats = await savedUrlsManager.getUrlStats();
      
      res.json({
        success: true,
        stats: stats
      });
    } catch (error) {
      console.error("❌ URL istatistikleri hatası:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post("/api/saved-urls/check", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: "URL gerekli"
        });
      }

      console.log(`🔍 URL kontrol ediliyor: ${url}`);
      const isSaved = await savedUrlsManager.isUrlSaved(url);
      
      res.json({
        success: true,
        url: url,
        isSaved: isSaved
      });
    } catch (error) {
      console.error("❌ URL kontrol hatası:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.delete("/api/saved-urls/delete", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: "URL gerekli"
        });
      }

      console.log(`🗑️ URL siliniyor: ${url}`);
      const deleted = await savedUrlsManager.deleteUrl(url);
      
      if (deleted) {
        res.json({
          success: true,
          message: "URL başarıyla silindi"
        });
      } else {
        res.status(500).json({
          success: false,
          error: "URL silinemedi"
        });
      }
    } catch (error) {
      console.error("❌ URL silme hatası:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  console.log('🎯 URL Tracking Service API endpoints registered');
  console.log('🔍 Saved URLs Manager API endpoints registered');

  // ==== SHOPIFY TRANSFER TRACKING API ENDPOINTS ====
  
  // Shopify transfer listesi
  app.get('/api/shopify/transferred-products', async (req, res) => {
    try {
      const { shopifyTransferTracker } = await import('./shopify-transfer-tracker');
      const limit = parseInt(req.query.limit as string) || 50;
      const products = await shopifyTransferTracker.getTrackedProducts(limit);
      
      res.json({
        success: true,
        products,
        total: products.length
      });
    } catch (error) {
      console.error('❌ Shopify transferred products listesi hatası:', error);
      res.status(500).json({
        success: false,
        error: 'Shopify ürün listesi alınamadı'
      });
    }
  });

  // Shopify transfer istatistikleri
  app.get('/api/shopify/transfer-stats', async (req, res) => {
    try {
      const { shopifyTransferTracker } = await import('./shopify-transfer-tracker');
      const stats = await shopifyTransferTracker.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('❌ Shopify transfer istatistikleri hatası:', error);
      res.status(500).json({
        success: false,
        error: 'İstatistikler alınamadı'
      });
    }
  });

  // Son değişiklikler
  app.get('/api/shopify/recent-changes', async (req, res) => {
    try {
      const { shopifyTransferTracker } = await import('./shopify-transfer-tracker');
      const limit = parseInt(req.query.limit as string) || 20;
      
      const changes = await shopifyTransferTracker.getRecentChanges(limit);
      
      res.json({
        success: true,
        changes
      });
    } catch (error) {
      console.error('❌ Son değişiklikler hatası:', error);
      res.status(500).json({
        success: false,
        error: 'Son değişiklikler alınamadı'
      });
    }
  });

  console.log('📦 Shopify transfer tracking API endpoints registered');

  // AI-Powered Routes Integration
  (async () => {
    try {
      const { addAIPoweredRoutes } = await import('./ai-powered-routes');
      addAIPoweredRoutes(app);
      console.log('🤖 AI-Powered routes başarıyla eklendi');
    } catch (error) {
      console.error('⚠️ AI routes yüklenemedi:', error);
    }
  })();

  // Enhanced Price Movement API Routes
  (async () => {
    try {
      const { priceMovementApiRouter } = await import('./price-movement-api');
      app.use('/api/price-movement', priceMovementApiRouter);
      console.log('📊 Enhanced Price Movement API routes eklendi');
    } catch (error) {
      console.error('⚠️ Price Movement API routes yüklenemedi:', error);
    }
  })();

  return httpServer;
}
