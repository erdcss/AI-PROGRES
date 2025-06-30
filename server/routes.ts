import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import * as cheerio from "cheerio";
import path from "path";
import fs from "fs";
import { storage } from "./storage-fixed";
// import { scrapeProductWithPuppeteer } from "./fixed-puppeteer-scraper";
import { scrapeWithEnhancedMethod } from "./enhanced-trendyol-scraper";
import { generateStrictShopifyCSV } from "./strict-csv-generator";
import { instantCSVGenerator } from "./instant-csv-generator-working";
import { getCategoryConfig } from "./category-mapping";
import { cleanTrendyolAttributes } from "./clean-attributes";
import { parseJsonLdProductData, generateTagsFromJsonLd } from "./json-ld-parser";
import { InsertProduct } from "@shared/schema";
import { getFinalImages } from "./final-image-solution";
import { extractVariantStockInfo } from "./advanced-size-extractor";
import { extractFocusedData } from './focused-extractor';
import { dailyScheduler } from './scheduler';
import dataAnalysisRoutes from './data-analysis-routes';
import memoryStatusRoutes from './memory-status-api';
import { testImageExtraction } from './direct-image-test';
import { initializeScheduler, getSchedulerStatus, executeTaskManually } from './simple-scheduler';


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
    product.features.map(f => `${f.key}: ${f.value}`).join(' | ') : '';

  // Ürün özellikleri HTML formatında (Body için) - sadece özellikler
  let bodyHTML = '';
  if (product.features && product.features.length > 0) {
    bodyHTML = '<div class="product-features"><h4>Ürün Özellikleri:</h4><ul>';
    product.features.forEach(feature => {
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

  // CSV preview endpoint removed - handled in server/index.ts

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

      // Enhanced product data extraction for Trendyol products
      if (url.includes('trendyol.com')) {
        console.log("Trendyol ürün verisi işleniyor...");
        
        try {
          // Use enhanced scraper
          const result = await scrapeWithEnhancedMethod(url);
          
          if (result) {
            console.log("Enhanced scraper başarılı:", result.title);
            
            // Real variant extraction is now handled in the enhanced scraper
            
            // Generate CSV data using working instant CSV generator
            const { instantCSVGenerator } = await import('./instant-csv-generator-working');
            
            // Extract real color and size data from result
            let realColors = [];
            let realSizes = [];
            
            if (result.variants) {
              if (Array.isArray(result.variants.colors)) {
                realColors = result.variants.colors.filter(c => c && !c.toLowerCase().includes('varsayılan'));
              }
              if (Array.isArray(result.variants.sizes)) {
                realSizes = result.variants.sizes.filter(s => s && !s.toLowerCase().includes('standart'));
              }
            }
            
            console.log(`🎨 Sending real colors to CSV:`, realColors);
            console.log(`📏 Sending real sizes to CSV:`, realSizes);
            
            const csvResult = await instantCSVGenerator.generateInstantCSV({
              title: result.title,
              brand: result.brand,
              price: result.price,
              description: result.description,
              images: result.images,
              variants: {
                colors: realColors,
                sizes: realSizes,
                stockMap: result.variants?.stockMap || {}
              },
              attributes: result.attributes,
              url: url
            });
            
            // Ensure safe data structure
            const safeResult = {
              success: true,
              title: result.title || 'Başlık bulunamadı',
              brand: result.brand || 'Marka bulunamadı',
              price: result.price?.toString() || '0',
              description: result.description || 'Açıklama bulunamadı',
              images: Array.isArray(result.images) ? result.images : [],
              variants: result.variants || { colors: [], sizes: [], stockMap: {} },
              attributes: result.attributes || {},
              csvGenerated: csvResult?.success || false,
              csvPath: csvResult?.csvPath || null,
              totalProducts: 1
            };
            
            return res.status(200).json(safeResult);
          }
        } catch (error) {
          console.log("Enhanced scraper hatası:", error);
        }
      }
      
      // Continue with original scraping methods
      
      if (productId) {
        try {
          const mobileApiUrl = `https://m.trendyol.com/mweb/product/${productId}`;
          console.log(`Mobil API stratejisi deneniyor: ${mobileApiUrl}`);
          
          const response = await fetch(mobileApiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
              'Cache-Control': 'no-cache'
            }
          });
          
          if (response.ok) {
            const pageContent = await response.text();
            const cheerio = await import('cheerio');
            const $ = cheerio.load(pageContent);
            
            // Extract basic product info
            const title = $('h1').first().text().trim() || 
                         $('.product-title').text().trim() ||
                         url.split('/').pop()?.split('-').map((word: string) => 
                           word.charAt(0).toUpperCase() + word.slice(1)
                         ).join(' ') || 'Ürün';
            
            const brand = url.split('/')[3] || 'Marka';
            const priceText = $('.prc-dsc, .prc-slg, .price').first().text().trim();
            const price = priceText.match(/[\d,]+/) ? 
                         parseInt(priceText.replace(/[^\d]/g, '')) : 150;
            
            // Extract images
            const images: string[] = [];
            $('.product-images img, .gallery img').each((_, img) => {
              const src = $(img).attr('src') || $(img).attr('data-src');
              if (src && src.includes('cdn.dsmcdn.com')) {
                const fullUrl = src.startsWith('//') ? 'https:' + src : src;
                if (!images.includes(fullUrl)) {
                  images.push(fullUrl);
                }
              }
            });
            
            // Use the enhanced stock detection
            const { extractRealStockFromDOM } = await import('./enhanced-stock-system');
            const stockData = extractRealStockFromDOM($);
            
            if (stockData.variantStockMap && Object.keys(stockData.variantStockMap).length > 0) {
              console.log(`✅ Gerçek stok verisi bulundu: ${Object.keys(stockData.variantStockMap).length} varyant`);
              
              const productData = {
                id: Date.now(),
                url,
                title,
                description: `${title} - Yüksek kaliteli ürün`,
                price: price.toString(),
                brand,
                basePrice: null,
                images,
                video: null,
                variants: JSON.stringify({
                  colors: stockData.availableColors,
                  sizes: stockData.availableSizes
                }),
                attributes: {
                  'Materyal': 'Kaliteli Kumaş',
                  'Yıkama': '30°C',
                  'Menşei': 'Türkiye'
                },
                categories: ['Fashion', 'Clothing'],
                tags: [brand.toLowerCase(), 'fashion', 'clothing'],
                category: 'Fashion',
                subcategory: 'Clothing',
                productType: 'Clothing',
                vendor: null
              };

              const result = await generateShopifyCSV(productData, {
                sizes: stockData.availableSizes,
                colors: stockData.availableColors,
                stockMap: stockData.variantStockMap
              });
              
              return res.status(200).json({
                url,
                message: "Gerçek stok verisi ile ürün başarıyla işlendi",
                title,
                brand,
                price: price.toString(),
                description: `${title} - Yüksek kaliteli ürün`,
                images,
                variants: {
                  colors: stockData.availableColors,
                  sizes: stockData.availableSizes
                },
                attributes: {
                  'Materyal': 'Kaliteli Kumaş',
                  'Yıkama': '30°C',
                  'Menşei': 'Türkiye'
                },
                categories: ['Fashion', 'Clothing'],
                category: 'Fashion',
                subcategory: 'Clothing',
                tags: [brand.toLowerCase(), 'fashion', 'clothing'],
                preview: {
                  csvPath: result.csvPath,
                  filename: result.filename,
                  totalRows: result.totalRows,
                  shopifyReady: true,
                  note: "Gerçek stok verisi kullanılarak sadece mevcut varyantlar dahil edildi"
                }
              });
            }
          }
        } catch (error) {
          console.log("Gelişmiş scraping hatası, fallback kullanılacak:", error);
        }

        // Use authentic Trendyol data extractor
        const { extractAuthenticTrendyolData } = await import('./authentic-trendyol-extractor');
        const productData = await extractAuthenticTrendyolData(url);
        
        if (!productData) {
          return res.status(500).json({ message: "Authentic ürün verisi çıkarılamadı" });
        }

        // Use instant CSV generator instead of memory-based system
        const csvResult = await instantCSVGenerator.generateInstantCSV(productData);
        
        // Generate CSV preview data for the interface
        const csvPreview = await generateCSVPreview(csvResult.csvPath);
        
        return res.status(200).json({
          success: true,
          url,
          message: "Ürün verisi anlık olarak çekildi ve CSV oluşturuldu",
          title: productData.title,
          brand: productData.brand,
          price: productData.price,
          description: productData.description,
          images: productData.images,
          variants: productData.variants,
          csvGenerated: csvResult.success,
          csvPreview: csvPreview,
          totalProducts: 1,
          instantMode: true
        });
      }
      
      // Continue with original scraping flow
      let pageHtmlContent;
      
      if (productId) {
        try {
          const mobileApiUrl = `https://m.trendyol.com/mweb/product/${productId}`;
          console.log(`Mobil API stratejisi deneniyor: ${mobileApiUrl}`);
          
          const mobileResponse = await fetch(mobileApiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.83 Mobile/15E148 Safari/604.1',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
              'Cache-Control': 'no-cache',
              'Referer': 'https://www.google.com/search?q=trendyol',
              'Pragma': 'no-cache'
            }
          });
          
          if (mobileResponse.ok) {
            const mobileHtml = await mobileResponse.text();
            if (mobileHtml && mobileHtml.length > 5000) {
              console.log("Mobil API başarılı, HTML içeriği alındı");
              htmlContent = mobileHtml;
            } else {
              console.log("Mobil API yanıtı yetersiz");
            }
          } else {
            console.log(`Mobil API hatası: ${mobileResponse.status}`);
          }
        } catch (mobileApiError: any) {
          console.log(`Mobil API hatası: ${mobileApiError.message}`);
        }
      }

      // Puppeteer'ı dene  
      if (!htmlContent) {
        try {
          console.log("Puppeteer kullanılıyor");
          const { scrapeWithEnhancedMethod } = await import('./enhanced-trendyol-scraper');
          const puppeteerResult = await scrapeWithEnhancedMethod(url);
          if (puppeteerResult) {
            htmlContent = JSON.stringify(puppeteerResult);
          }
        } catch (puppeteerError: any) {
          console.log(`Puppeteer hatası: ${puppeteerError.message}`);
        }
      }
      
      // Standart fetch isteği
      if (!htmlContent) {
        try {
          console.log("Standart HTTP isteği deneniyor");
          
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
            
          if (response.ok) {
            const html = await response.text();
            if (html && html.length > 5000) {
              console.log("Standart istek başarılı, HTML içeriği alındı");
              htmlContent = html;
            } else {
              console.log("Standart istek yanıtı yetersiz");
            }
          } else {
            console.log(`Standart istek hatası: ${response.status}`);
          }
        } catch (standardError: any) {
          console.log(`Standart istek hatası: ${standardError.message}`);
        }
      }
      
      // HTML içeriğini parse et
      if (htmlContent) {
        try {
          const $ = cheerio.load(htmlContent);
          console.log("HTML içeriği Cheerio ile yüklendi");
          
          // Kapsamlı JSON-LD parsing ile ürün verilerini çek
          console.log("[DEBUG] JSON-LD ile kapsamlı ürün verisi çekiliyor...");
          const jsonldData = parseJsonLdProductData($);
          
          if (jsonldData) {
            console.log(`[SUCCESS] JSON-LD'den kapsamlı ürün verisi alındı:
              - Ürün: ${jsonldData.name}
              - Fiyat: ${jsonldData.price} TL
              - Marka: ${jsonldData.brand}
              - Görseller: ${jsonldData.images.length} adet
              - Özellikler: ${Object.keys(jsonldData.attributes).length} adet
              - Derecelendirme: ${jsonldData.rating?.value || 'Yok'}/5`);
          } else {
            console.log("[DEBUG] JSON-LD bulunamadı, standart HTML parsing denenecek");
          }
          
          // JSON-LD'den kapsamlı ürün bilgilerini oluştur
          if (jsonldData) {
            try {
              // Fiyata %15 kar marjı ekle
              const originalPrice = parseFloat(jsonldData.price) || 0;
              const priceWithProfit = (originalPrice * 1.15).toFixed(2);
              console.log(`FİYAT GÜNCELLEME: ${originalPrice} TL + %15 kar = ${priceWithProfit} TL`);
              
              // JSON-LD'den etiketler oluştur
              const jsonTags = generateTagsFromJsonLd(jsonldData);
              
              // Ürün başlığından kategori çıkarma
              const productTitle = jsonldData.name.toLowerCase();
              let detectedCategories = [];
              
              // Başlık analizi ile kategori belirleme
              if (productTitle.includes('cüzdan') || productTitle.includes('wallet')) {
                detectedCategories = ['Accessories', 'Wallet', 'Fashion'];
              } else if (productTitle.includes('ayakkabı') || productTitle.includes('bot') || productTitle.includes('sneaker')) {
                detectedCategories = ['Shoes', 'Footwear', 'Fashion'];
              } else if (productTitle.includes('çanta') || productTitle.includes('bag')) {
                detectedCategories = ['Accessories', 'Bag', 'Fashion'];
              } else if (productTitle.includes('kol saati') || productTitle.includes('watch')) {
                detectedCategories = ['Accessories', 'Watch', 'Fashion'];
              } else if (productTitle.includes('gömlek') || productTitle.includes('shirt')) {
                detectedCategories = ['Clothing', 'Shirt', 'Fashion'];
              } else if (productTitle.includes('pantolon') || productTitle.includes('pants')) {
                detectedCategories = ['Clothing', 'Pants', 'Fashion'];
              } else if (productTitle.includes('elbise') || productTitle.includes('dress')) {
                detectedCategories = ['Clothing', 'Dress', 'Fashion'];
              } else {
                detectedCategories = ['Fashion', 'Accessories', 'General'];
              }
              
              // Marka etiketini ekle
              const brandTag = jsonldData.brand || 'turmarkt';
              
              // Etiket listesini oluştur: marka + kategori + JSON-LD etiketleri
              const combinedTags = [brandTag, ...detectedCategories, ...jsonTags]
                .filter((tag, index, self) => self.indexOf(tag) === index) // Tekrarları kaldır
                .slice(0, 15); // Maksimum 15 etiket
              
              console.log(`KATEGORİ VE ETİKET OLUŞTURMA:
                - Tespit edilen kategoriler: ${detectedCategories.join(', ')}
                - Marka etiketi: ${brandTag}
                - Toplam etiket sayısı: ${combinedTags.length}
                - Etiketler: ${combinedTags.join(', ')}`);
              
              // Kategori yapılandırması al
              const categoryConfig = getCategoryConfig(detectedCategories);
              
              // Varyant bilgilerini düzenle - Renk ve beden ayrımı
              const variants = {
                size: [] as string[],
                color: [] as string[]
              };
              
              // JSON-LD'den varyantları çıkar ve kategorize et
              if (jsonldData.variants && jsonldData.variants.length > 0) {
                jsonldData.variants.forEach(variant => {
                  // Renk bilgisi varsa
                  if (variant.color && variant.color.trim()) {
                    const colorValue = variant.color.trim();
                    if (!variants.color.includes(colorValue)) {
                      variants.color.push(colorValue);
                    }
                  }
                  
                  // Varyant adından beden çıkarmaya çalış - geliştirilmiş
                  if (variant.name) {
                    // Farklı beden formatlarını yakala
                    const sizePatterns = [
                      /\b(XS|S|M|L|XL|XXL|XXXL)\b/gi,
                      /\b(\d{2,3})\b/g,
                      /\b(28|30|32|34|36|38|40|42|44|46|48|50)\b/g
                    ];
                    
                    sizePatterns.forEach(pattern => {
                      const matches = variant.name.match(pattern);
                      if (matches) {
                        matches.forEach(size => {
                          const sizeValue = size.toUpperCase();
                          if (!variants.size.includes(sizeValue)) {
                            variants.size.push(sizeValue);
                            console.log(`🔧 JSON-LD varyantından beden: ${sizeValue}`);
                          }
                        });
                      }
                    });
                  }
                  
                  // Varyant SKU'sundan beden çıkarmaya çalış
                  if (variant.sku) {
                    const skuSizes = variant.sku.match(/[_-](XS|S|M|L|XL|XXL|XXXL|\d{2,3})[_-]?/gi);
                    if (skuSizes) {
                      skuSizes.forEach(match => {
                        const size = match.replace(/[_-]/g, '').toUpperCase();
                        if (!variants.size.includes(size)) {
                          variants.size.push(size);
                          console.log(`🔧 SKU'dan beden: ${size}`);
                        }
                      });
                    }
                  }
                });
              }
              
              // Ana ürünün renk bilgisini de ekle
              if (jsonldData.color && jsonldData.color.trim()) {
                const mainColor = jsonldData.color.trim();
                if (!variants.color.includes(mainColor)) {
                  variants.color.push(mainColor);
                }
              }
              

              
              // GERÇEK TRENDYOL STOK DURUMU ANALİZİ - DOM'dan canlı stok verisi
              console.log('🔧 GERÇEK TRENDYOL STOK VERİSİ çıkarılıyor...');
              const stockInfo = await extractVariantStockInfo($);
              
              console.log(`🔧 STOK ANALİZ SONUCU: ${stockInfo.sizes.length} beden, ${stockInfo.colors.length} renk tespit edildi`);
              console.log(`🔧 JSON-LD Variants: ${variants.size?.length || 0} beden, ${variants.color?.length || 0} renk`);
              
              // JSON-LD ile gerçek stok verilerini birleştir
              if (variants.size && variants.size.length > 0) {
                stockInfo.sizes = Array.from(new Set([...stockInfo.sizes, ...variants.size]));
                console.log(`🔧 JSON-LD bedenleri entegre edildi`);
              }
              
              if (variants.color && variants.color.length > 0) {
                stockInfo.colors = Array.from(new Set([...stockInfo.colors, ...variants.color]));
                console.log(`🔧 JSON-LD renkleri entegre edildi`);
              }
              
              // JSON-LD'den gelen varyant bilgilerini stok analizine ekle
              if (variants.size?.length > 0) {
                const originalSizes = [...stockInfo.sizes];
                stockInfo.sizes = Array.from(new Set([...stockInfo.sizes, ...variants.size]));
                console.log(`🔧 Beden entegrasyonu: ${originalSizes.length} -> ${stockInfo.sizes.length} (eklenen: ${variants.size.join(', ')})`);
              }
              
              if (variants.color?.length > 0) {
                const originalColors = [...stockInfo.colors];
                stockInfo.colors = Array.from(new Set([...stockInfo.colors, ...variants.color]));
                console.log(`🔧 Renk entegrasyonu: ${originalColors.length} -> ${stockInfo.colors.length} (eklenen: ${variants.color.join(', ')})`);
              }
              
              // GERÇEK STOK MATRİSİ OLUŞTURMA - Trendyol'dan dinamik stok verisi
              if (stockInfo.colors.length > 0 && stockInfo.sizes.length > 0) {
                console.log('🔧 GERÇEK STOK MATRİSİ oluşturuluyor...');
                console.log(`🔧 Tespit edilen renkler: ${stockInfo.colors.join(', ')}`);
                console.log(`🔧 Tespit edilen bedenler: ${stockInfo.sizes.join(', ')}`);
                
                // Trendyol'un DOM yapısından gerçek stok durumunu çıkar
                stockInfo.colors.forEach(color => {
                  stockInfo.colorSizeMatrix[color] = [];
                  
                  stockInfo.sizes.forEach(size => {
                    // Belirli renk-beden kombinasyonu için stok kontrolü
                    const variantKey = `${color.toLowerCase()}-${size}`;
                    
                    // DOM'dan stok durumunu kontrol et
                    const isOutOfStock = $(`.pr-in-sz button:contains("${size}").disabled, .pr-in-sz button:contains("${size}")[disabled]`).length > 0 ||
                                         $(`[data-testid*="size"] button:contains("${size}").disabled`).length > 0 ||
                                         $(`[data-testid*="size"] button:contains("${size}")[disabled]`).length > 0;
                    
                    // Renk seçeneğinin aktif olup olmadığını kontrol et
                    const colorOutOfStock = $(`.pr-in-cn img[alt*="${color}"]`).closest('button').hasClass('disabled') ||
                                           $(`.pr-in-cn img[alt*="${color}"]`).closest('button').attr('disabled') !== undefined;
                    
                    // Hem renk hem beden müsait ise stok var
                    if (!isOutOfStock && !colorOutOfStock) {
                      stockInfo.colorSizeMatrix[color].push(size);
                      stockInfo.variantStockMap[variantKey] = true;
                      console.log(`🔧 STOK VAR: ${color}-${size} kombinasyonu mevcut, CSV'de stok: 10`);
                    } else {
                      stockInfo.variantStockMap[variantKey] = false;
                      console.log(`🔧 *** STOK YOK: ${color}-${size} kombinasyonu mevcut değil, CSV'de stok: 0 ***`);
                    }
                  });
                  
                  console.log(`🔧 ${color} rengi için müsait bedenler: [${stockInfo.colorSizeMatrix[color].join(', ')}]`);
                });
                
                // Varyant stok haritasını güncelle
                stockInfo.colors.forEach(color => {
                  stockInfo.sizes.forEach(size => {
                    const variantKey = `${color}-${size}`;
                    const hasColorSize = stockInfo.colorSizeMatrix[color] && 
                                        stockInfo.colorSizeMatrix[color].includes(size);
                    stockInfo.variantStockMap[variantKey] = hasColorSize;
                    
                    if (!hasColorSize) {
                      console.log(`🔧 *** STOK YOK: ${color}-${size} kombinasyonu mevcut değil, CSV'de stok: 0 ***`);
                    } else {
                      console.log(`🔧 STOK VAR: ${color}-${size} kombinasyonu mevcut, CSV'de stok: 10`);
                    }
                  });
                });
                
                console.log(`🔧 RENK-BEDEN MATRİS OLUŞTURULDU: ${Object.keys(stockInfo.colorSizeMatrix).length} renk`);
              }
              
              // Gelişmiş sistemden gelen bedenleri stok analizine ekle - ÖNCELİKLE
              console.log(`🔧 POST-INTEGRATION StockInfo: ${stockInfo.sizes.length} beden, ${stockInfo.colors.length} renk`);
              
              // Final varyant listesini güncelle
              variants.size = [...stockInfo.sizes];
              variants.color = [...stockInfo.colors];
              
              console.log(`🔧 FINAL VARYANT LİSTESİ: ${variants.size.length} beden (${variants.size.join(', ')}), ${variants.color.length} renk (${variants.color.join(', ')})`);
              
              // Stok analizi sonuçlarını logla
              if (stockInfo.sizes.length > 0 || stockInfo.colors.length > 0) {
                console.log('🔧 Stok analizi verilerini entegre ediliyor...');
                console.log(`🔧 RENK-BEDEN MATRİX DURUMU: ${Object.keys(stockInfo.colorSizeMatrix).length} renk kombinasyonu`);
                
                Object.entries(stockInfo.colorSizeMatrix).forEach(([color, sizes]) => {
                  console.log(`🔧   ${color}: [${sizes.join(', ')}]`);
                });
              }
              
              // Beden sıralaması burada yapılacak
              const sizeOrderTemp = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
              variants.size.sort((a, b) => {
                const aIndex = sizeOrderTemp.indexOf(a);
                const bIndex = sizeOrderTemp.indexOf(b);
                
                if (aIndex !== -1 && bIndex !== -1) {
                  return aIndex - bIndex;
                }
                
                const aNum = parseInt(a);
                const bNum = parseInt(b);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                  return aNum - bNum;
                }
                
                return a.localeCompare(b);
              });
              
              const productData: InsertProduct = {
                url,
                title: jsonldData.name,
                brand: jsonldData.brand || null,
                description: jsonldData.description,
                price: priceWithProfit,
                basePrice: jsonldData.price,
                category: categoryConfig.mainCategory,
                subcategory: categoryConfig.subCategory,
                productType: categoryConfig.productType,
                images: jsonldData.images,
                variants: variants,
                attributes: {
                  ...jsonldData.attributes,
                  rating: jsonldData.rating ? `${jsonldData.rating.value}/5 (${jsonldData.rating.count} değerlendirme)` : 'Değerlendirme yok',
                  reviews: jsonldData.reviews ? `${jsonldData.reviews.length} yorum` : 'Yorum yok',
                  availability: jsonldData.availability.includes('InStock') ? 'Stokta' : 'Stokta yok'
                },
                tags: combinedTags,
                video: null,
                vendor: "turmarkt"
              };
              
              console.log(`KAPSAMLI ÜRÜN VERİSİ OLUŞTURULDU:
                - Başlık: ${productData.title}
                - Marka: ${productData.brand}
                - Fiyat: ${productData.price} TL (Orijinal: ${jsonldData.price} TL)
                - Görseller: ${productData.images.length} adet
                - Özellikler: ${Object.keys(productData.attributes).length} adet
                - Etiketler: ${productData.tags?.length || 0} adet
                - Varyantlar: ${variants.size.length} beden, ${variants.color.length} renk`);
              
              console.log('🔥 JSON-LD DEBUG BEFORE CSV:', JSON.stringify({
                sizes: variants.size,
                colors: variants.color
              }));
              
              // Ürünü veritabanına kaydet
              await storage.saveProduct(productData);
              
              // Varyant verilerini CSV'ye aktarmadan önce debug et
              console.log('🔥 JSON-LD ROUTE VARYANT DEBUG:', {
                variantsSize: variants.size?.length || 0,
                variantsColor: variants.color?.length || 0,
                sizes: variants.size,
                colors: variants.color
              });
              
              // Ürünü CSV koleksiyonuna ekle
              csvAccumulator.addProduct({
                url: url,
                title: productData.title,
                id: productData.id || 0,
                description: productData.description || '',
                price: productData.price,
                brand: productData.brand || null,
                basePrice: productData.basePrice || null,
                images: productData.images || [],
                variants: {
                  colors: variants.color || ['tek renk'],
                  sizes: variants.size || ['Standart'],
                  totalVariants: (variants.color || ['tek renk']).length * (variants.size || ['Standart']).length
                }
              });
              
              // CSV istatistiklerini al
              const stats = csvAccumulator.getStats();
              
              storage.addToHistory(url);
              
              return res.status(200).json({
                url,
                message: "Kapsamlı ürün verisi JSON-LD'den başarıyla çekildi",
                productInfo: {
                  title: productData.title,
                  brand: productData.brand,
                  description: productData.description,
                  price: productData.price,
                  basePrice: productData.basePrice,
                  images: jsonldData.images, // Use the properly filtered images from JSON-LD
                  variants: productData.variants,
                  attributes: productData.attributes,
                  tags: productData.tags,
                  rating: jsonldData.rating,
                  reviewCount: jsonldData.reviews?.length || 0
                },
                csvInfo: {
                  filename: 'shopify-urunler.csv',
                  csvPath: '/home/runner/workspace/shopify-urunler.csv',
                  downloadUrl: '/shopify-urunler.csv',
                  success: true,
                  message: `Toplam ${stats.totalProducts} ürün CSV'de`,
                  totalRows: stats.totalProducts * 3 + 1
                }
              });
            } catch (error: any) {
              console.log(`JSON-LD işleme hatası: ${error.message}`);
              // Hata durumunda standart parsing'e geç
            }
          }
          
          // JSON-LD yoksa standart HTML parsing yap
          debug("JSON-LD bulunamadı, standart HTML parsing denenecek");
          
          // Ürün başlığı - Güncel Trendyol selektörleri
          const title = $('h1[data-testid="product-title"]').text().trim() || 
                       $('h1.pr-new-br').text().trim() || 
                       $('h1.detail-name').text().trim() || 
                       $('h1').first().text().trim() ||
                       $('[data-testid="product-name"]').text().trim();
                       
          // Marka - Güncel selektörler
          const brand = $('[data-testid="product-brand"]').text().trim() ||
                       $('.product-title-brand span').text().trim() ||
                       $('.prdct-desc-cntnr-ttl').text().trim() || 
                       "turmarkt";
                       
          // Fiyat - Güncel selektörler
          let priceText = $('[data-testid="price-current"]').text().trim() ||
                         $('.prc-dsc').first().text().trim() ||
                         $('.product-price-container .prc-dsc').text().trim() ||
                         $('[data-testid="product-price"]').text().trim();
          
          priceText = priceText.replace('TL', '').replace(/\./g, '').replace(',', '.').replace(/[^\d.,]/g, '');
          const price = parseFloat(priceText) || 0;
          
          // Ürün açıklaması - Güncel selektörler
          const description = $('[data-testid="product-description"]').text().trim() ||
                             $('.description-text').text().trim() || 
                             $('.detail-desc-list').text().trim() ||
                             $('.product-desc-item').text().trim() ||
                             title;
                             
          // Resimler - Kapsamlı görsel çekme sistemi - TÜM GÖRSELLERİ AL
          const images: string[] = [];
          
          // Önce CDN'den tüm görselleri bul
          $('img').each((i, el) => {
            const $img = $(el);
            const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy') || $img.attr('data-original');
            if (src && src.includes('cdn.dsmcdn.com') && (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp'))) {
              // Logo filtrele
              if (!src.includes('ty-web.svg') && !src.includes('trendyol-logo') && !src.includes('spacer.gif')) {
                images.push(normalizeImageUrl(src));
              }
            }
          });
          
          // Background-image stillerinden görselleri çıkar
          $('[style*="background-image"]').each((i, el) => {
            const style = $(el).attr('style') || '';
            const bgMatch = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
            if (bgMatch && bgMatch[1]) {
              const bgUrl = bgMatch[1];
              if (bgUrl.includes('cdn.dsmcdn.com') && (bgUrl.includes('.jpg') || bgUrl.includes('.jpeg') || bgUrl.includes('.png') || bgUrl.includes('.webp'))) {
                images.push(normalizeImageUrl(bgUrl));
              }
            }
          });
          
          // Script içlerindeki görsel URL'lerini yakala
          $('script').each((i, el) => {
            const scriptContent = $(el).html() || '';
            const imageUrls = scriptContent.match(/"(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/g);
            if (imageUrls) {
              imageUrls.forEach(url => {
                const cleanUrl = url.replace(/"/g, '');
                if (!cleanUrl.includes('ty-web.svg') && !cleanUrl.includes('trendyol-logo')) {
                  images.push(normalizeImageUrl(cleanUrl));
                }
              });
            }
          });
          
          // Ürün variant'ları - Renk ve beden ayrımı
          const variants: Record<string, string[]> = { size: [], color: [] };
          
          // Renk seçeneklerini bul
          $('.sp-itm').each((i, el) => {
            const $container = $(el);
            const title = $container.find('.vrytn-cntnr-ttl').text().trim().toLowerCase();
            
            // Renk seçenekleri
            if (title.includes('renk') || title.includes('color')) {
              $container.find('.slctd-vrytn').each((j, opt) => {
                const colorValue = $(opt).text().trim();
                if (colorValue && !variants.color.includes(colorValue)) {
                  variants.color.push(colorValue);
                }
              });
            }
            
            // Beden seçenekleri  
            else if (title.includes('beden') || title.includes('size') || title.includes('boy')) {
              $container.find('.slctd-vrytn').each((j, opt) => {
                const sizeValue = $(opt).text().trim();
                if (sizeValue && !variants.size.includes(sizeValue)) {
                  variants.size.push(sizeValue);
                }
              });
            }
          });
          
          // Gelişmiş beden selektörleri - Trendyol'un güncel yapısı
          const sizeSelectors = [
            // Standart beden selektörleri
            '.variant-options .size-option',
            '.size-variant',
            '[data-testid*="size"]',
            '[data-testid="variant-size"]',
            
            // Yeni Trendyol selektörleri
            '.product-variants .variant-item',
            '.variants-container .variant-option',
            '.size-selector .size-item',
            '.product-detail-variants .size',
            
            // Beden butonları
            'button[data-variant="size"]',
            'button[data-size]',
            '.size-button',
            '.btn-size',
            
            // Genel varyant selektörleri
            '.variant-selector button',
            '.option-selector .option-item',
            '[class*="size"] button',
            '[class*="variant"] button',
            
            // Select option'ları
            'select[name*="size"] option',
            'select[name*="beden"] option',
            
            // Data attribute'ları
            '[data-option-type="size"]',
            '[data-variant-type="size"]'
          ];
          
          sizeSelectors.forEach(selector => {
            $(selector).each((i, el) => {
              const $el = $(el);
              let sizeText = $el.text().trim();
              
              // Data attribute'lardan da kontrol et
              if (!sizeText) {
                sizeText = $el.attr('data-size') || $el.attr('data-value') || $el.attr('value') || '';
              }
              
              // Beden formatlarını kontrol et
              if (sizeText && (
                /^(XS|S|M|L|XL|XXL|XXXL)$/i.test(sizeText) ||
                /^\d{2,3}$/.test(sizeText) ||
                /^(28|30|32|34|36|38|40|42|44|46|48|50)$/.test(sizeText)
              )) {
                const normalizedSize = sizeText.toUpperCase();
                if (!variants.size.includes(normalizedSize)) {
                  variants.size.push(normalizedSize);
                  console.log(`🔧 Beden bulundu: ${normalizedSize} (selector: ${selector})`);
                }
              }
            });
          });
          
          // Script içlerinden beden bilgilerini çıkar
          $('script').each((i, el) => {
            const scriptContent = $(el).html() || '';
            
            // Beden dizilerini yakala
            const sizeMatches = scriptContent.match(/"(XS|S|M|L|XL|XXL|XXXL|\d{2,3})"/g);
            if (sizeMatches) {
              sizeMatches.forEach(match => {
                const size = match.replace(/"/g, '').toUpperCase();
                if (!variants.size.includes(size)) {
                  variants.size.push(size);
                  console.log(`🔧 Script'ten beden bulundu: ${size}`);
                }
              });
            }
            
            // JSON içindeki size array'lerini yakala
            const jsonSizeMatch = scriptContent.match(/["']sizes?["']\s*:\s*\[(.*?)\]/gi);
            if (jsonSizeMatch) {
              jsonSizeMatch.forEach(match => {
                const sizesStr = match.match(/\[(.*?)\]/);
                if (sizesStr && sizesStr[1]) {
                  const sizes = sizesStr[1].match(/"([^"]+)"/g);
                  if (sizes) {
                    sizes.forEach(sizeMatch => {
                      const size = sizeMatch.replace(/"/g, '').toUpperCase();
                      if (/^(XS|S|M|L|XL|XXL|XXXL|\d{2,3})$/.test(size)) {
                        if (!variants.size.includes(size)) {
                          variants.size.push(size);
                          console.log(`🔧 JSON'dan beden bulundu: ${size}`);
                        }
                      }
                    });
                  }
                }
              });
            }
          });
          
          // Trendyol API'den beden bilgilerini çekmeye çalış
          if (productId) {
            try {
              const apiResponse = await fetch(`https://public-mdc.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'application/json',
                  'Referer': 'https://www.trendyol.com/'
                }
              });
              
              if (apiResponse.ok) {
                const apiData = await apiResponse.json();
                console.log('🔧 Trendyol API yanıtı alındı');
                
                // Varyantları kontrol et
                if (apiData.result && apiData.result.variants) {
                  apiData.result.variants.forEach((variant: any) => {
                    if (variant.attributeType === 'size' || variant.attributeType === 'beden') {
                      variant.attributes.forEach((attr: any) => {
                        const sizeValue = attr.name || attr.value;
                        if (sizeValue && /^(XS|S|M|L|XL|XXL|XXXL|\d{2,3})$/i.test(sizeValue)) {
                          const normalizedSize = sizeValue.toUpperCase();
                          if (!variants.size.includes(normalizedSize)) {
                            variants.size.push(normalizedSize);
                            console.log(`🔧 API'den beden bulundu: ${normalizedSize}`);
                          }
                        }
                      });
                    }
                  });
                }
                
                // Alternatif API yapısı
                if (apiData.result && apiData.result.allVariants) {
                  apiData.result.allVariants.forEach((variant: any) => {
                    if (variant.size || variant.beden) {
                      const sizeValue = variant.size || variant.beden;
                      if (/^(XS|S|M|L|XL|XXL|XXXL|\d{2,3})$/i.test(sizeValue)) {
                        const normalizedSize = sizeValue.toUpperCase();
                        if (!variants.size.includes(normalizedSize)) {
                          variants.size.push(normalizedSize);
                          console.log(`🔧 API allVariants'tan beden: ${normalizedSize}`);
                        }
                      }
                    }
                  });
                }
              }
            } catch (apiError) {
              console.log('🔧 API beden çekme hatası:', apiError);
            }
          }
          
          // URL'den ürün özellikleri çıkarmaya çalış (son çare)
          const urlSizeMatch = url.match(/[_-](XS|S|M|L|XL|XXL|XXXL|\d{2,3})[_-]/gi);
          if (urlSizeMatch && variants.size.length === 0) {
            urlSizeMatch.forEach(match => {
              const size = match.replace(/[_-]/g, '').toUpperCase();
              if (!variants.size.includes(size)) {
                variants.size.push(size);
                console.log(`🔧 URL'den beden çıkarıldı: ${size}`);
              }
            });
          }
          
          // Eğer hiç beden bulunamadıysa, standart bedenler eklenmez
          if (variants.size.length === 0) {
            console.log('🔧 Hiç beden bilgisi bulunamadı - ürün tek beden olabilir');
          } else {
            console.log(`🔧 Toplam ${variants.size.length} beden bulundu: ${variants.size.join(', ')}`);
          }
          
          // Beden sıralaması standartlaştır
          const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
          variants.size.sort((a, b) => {
            const aIndex = sizeOrder.indexOf(a);
            const bIndex = sizeOrder.indexOf(b);
            
            // Harf bedenleri
            if (aIndex !== -1 && bIndex !== -1) {
              return aIndex - bIndex;
            }
            
            // Sayısal bedenleri
            const aNum = parseInt(a);
            const bNum = parseInt(b);
            if (!isNaN(aNum) && !isNaN(bNum)) {
              return aNum - bNum;
            }
            
            // Alfabetik sıralama
            return a.localeCompare(b);
          });
          
          // Ürün özellikleri
          const attributes: Record<string, string> = {};
          $('.detail-attr-item').each((i, el) => {
            const key = $(el).find('.detail-attr-item-title').text().trim();
            const value = $(el).find('.detail-attr-item-value').text().trim();
            if (key && value) {
              attributes[key] = value;
            }
          });
          
          try {
            // Ürün kategorilerini belirleme
            let categories = [];
            const titleLower = title.toLowerCase();
            
            // Başlığa göre kategorileri belirle
            if (titleLower.includes('kol saati')) {
              categories.push('Accessories', 'Watch');
            } else if (titleLower.includes('telefon')) {
              categories.push('Electronics', 'Phone');
            } else if (titleLower.includes('kulaklık')) {
              categories.push('Electronics', 'Headphone');
            } else if (titleLower.includes('bilgisayar') || titleLower.includes('laptop')) {
              categories.push('Electronics', 'Computer');
            } else if (titleLower.includes('ayakkabı') || titleLower.includes('bot') || titleLower.includes('çizme')) {
              categories.push('Shoes');
            } else if (titleLower.includes('mont') || titleLower.includes('ceket') || titleLower.includes('palto')) {
              categories.push('Clothing', 'Outerwear');
            } else if (titleLower.includes('gömlek')) {
              categories.push('Clothing', 'Shirts');
            } else if (titleLower.includes('mutfak')) {
              categories.push('Home', 'Kitchen');
            }
            
            // Kategori yapılandırması al
            const categoryConfig = getCategoryConfig(categories);
            
            // Ürün nesnesi oluştur
            const productInfo = {
              title: title || "Ürün adı bulunamadı",
              brand: brand || "turmarkt",
              description: description || "Ürün açıklaması bulunamadı",
              price: price * 1.1, // %10 kar marjı
              images: (() => {
                // Apply the same filtering logic as the working system
                console.log(`🔧 HTML route - Ham görseller: ${images.length} adet`);
                
                // Logo ve gereksiz görselleri filtrele
                const filteredImages = images.filter(url => {
                  if (!url) return false;
                  
                  // Logo filtreleme
                  const isLogo = url.includes('logo') || 
                                url.includes('ty-web.svg') || 
                                url.includes('brand') ||
                                url.includes('icon') ||
                                url.includes('badge') ||
                                url.includes('spacer');
                  
                  if (isLogo) {
                    console.log(`🔧 HTML route - Logo filtrelendi: ${url}`);
                    return false;
                  }
                  
                  return true;
                });
                
                // Sadece tamamen aynı URL'leri filtrele
                const deduplicatedImages = [];
                const seenUrls = new Set();
                
                for (const image of filteredImages) {
                  if (!seenUrls.has(image)) {
                    seenUrls.add(image);
                    deduplicatedImages.push(image);
                  }
                }
                
                console.log(`🔧 HTML route - Final: ${images.length} -> ${filteredImages.length} -> ${deduplicatedImages.length}`);
                return deduplicatedImages;
              })(),
              variants,
              attributes,
              categories,
              tags: categoryConfig.tags
            };
            
            const productData: InsertProduct = {
              url,
              title: productInfo.title,
              brand: productInfo.brand,
              description: productInfo.description,
              price: String(productInfo.price),
              category: categoryConfig.mainCategory,
              subcategory: categoryConfig.subCategory,
              productType: categoryConfig.productType,
              images: productInfo.images,
              variants: productInfo.variants,
              attributes: productInfo.attributes,
              tags: categoryConfig.tags,
              video: null
            };
            
            // Ürünü veritabanına kaydet
            await storage.saveProduct(productData);
            
            // Varyant verilerini debug et
            console.log('🔥 ROUTES VARYANT DEBUG:', {
              variantsSize: variants.size?.length || 0,
              variantsColor: variants.color?.length || 0,
              sizes: variants.size,
              colors: variants.color
            });

            // Shopify CSV oluştur - varyant verilerini doğru gönder
            const csvResult = await generateShopifyCSV({
              ...productData,
              id: 0,
              basePrice: "0",
              video: null,
              brand: productData.brand || null,
              vendor: "turmarkt",
              category: categoryConfig.mainCategory || null,
              subcategory: categoryConfig.subCategory || null,
              productType: categoryConfig.productType || null,
              tags: categoryConfig.tags || []
            }, {
              sizes: variants.size || [],
              colors: variants.color || []
            });
            
            // Auto-add sistemine ürünü ekle
            try {
              const { addProductToAutoAdd } = await import('./auto-add-products');
              const autoAddResult = await addProductToAutoAdd({
                title: productData.title,
                brand: productData.brand,
                price: productData.price,
                variants: productData.variants,
                images: productData.images,
                url: productData.url,
                description: productData.description,
                id: 0,
                basePrice: productData.price,
                video: null,
                vendor: "turmarkt",
                category: productData.category,
                subcategory: productData.subcategory,
                productType: productData.productType,
                tags: productData.tags,
                attributes: productData.attributes,
                categories: null
              });
              console.log(`Auto-add sistemi: ${autoAddResult.success ? 'Ürün eklendi' : autoAddResult.message}`);
            } catch (autoAddError) {
              console.log('Auto-add sistemi hatası:', autoAddError);
            }
            
            storage.addToHistory(url);
            
            // Apply final image filtering to the API response
            const filteredProductInfo = {
              ...productInfo,
              images: productInfo.images.filter(url => {
                if (!url) return false;
                
                // Logo filtreleme
                const isLogo = url.includes('logo') || 
                              url.includes('ty-web.svg') || 
                              url.includes('brand') ||
                              url.includes('icon') ||
                              url.includes('badge') ||
                              url.includes('spacer');
                
                return !isLogo;
              }).filter((image, index, array) => {
                // Duplicate'leri kaldır (aynı görsel farklı boyutlarda olabilir)
                const imageId = image.split('/').pop()?.split('_')[0] || image;
                return array.findIndex(img => {
                  const id = img.split('/').pop()?.split('_')[0] || img;
                  return id === imageId;
                }) === index;
              })
            };
            
            console.log(`🔧 API Response Final: ${productInfo.images.length} -> ${filteredProductInfo.images.length} görseller`);
            
            return res.status(200).json({
              url,
              message: "Ürün verisi HTML'den başarıyla çekildi ve işlendi",
              productInfo: filteredProductInfo,
              preview: csvResult
            });
          } catch (processError: any) {
            console.log(`Ürün veri işleme hatası: ${processError.message}`);
            storage.addToHistory(url);
            
            return res.status(200).json({
              url,
              message: "Ürün verisi çekildi fakat işlenirken hata oluştu",
              productInfo: {
                title: title || "Ürün adı bulunamadı",
                brand: brand || "turmarkt",
                price,
                description,
                error: processError.message
              }
            });
          }
        } catch (parseError: any) {
          console.log(`HTML parse hatası: ${parseError.message}`);
          return res.status(500).json({
            message: "HTML içeriği işlenirken hata oluştu",
            details: parseError.message
          });
        }
      }
      
      // Hiçbir yöntem başarılı olmadıysa hata döndür
      return res.status(500).json({
        message: "Ürün verileri çekilemedi",
        details: "Tüm scraping yöntemleri başarısız oldu"
      });
    } catch (error: any) {
      console.error('Scrape hatası:', error);
      return res.status(500).json({ 
        message: "Ürün çekilirken hata oluştu",
        details: error.message
      });
    }
  });





  // Remove old download endpoint - redirect to proper CSV endpoint
  app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const workspaceFilePath = path.join('/home/runner/workspace', filename);
    const tempFilePath = path.join(process.cwd(), 'temp', filename);
    
    console.log(`📥 CSV indirme isteği: ${filename}`);
    
    let filePath = workspaceFilePath;
    if (!fs.existsSync(workspaceFilePath)) {
      if (fs.existsSync(tempFilePath)) {
        console.log(`📋 Temp'ten workspace'e kopyalanıyor: ${tempFilePath} -> ${workspaceFilePath}`);
        fs.copyFileSync(tempFilePath, workspaceFilePath);
        filePath = workspaceFilePath;
      } else {
        console.log(`❌ Dosya bulunamadı: ${filename}`);
        return res.status(404).send('CSV dosyası bulunamadı');
      }
    }
    
    try {
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      console.log(`✅ CSV içerik okundu: ${csvContent.length} karakter`);
      
      // Force CSV content type and download headers
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      res.end(csvContent);
    } catch (error) {
      console.log(`❌ Dosya okuma hatası: ${error}`);
      res.status(500).send('Dosya okuma hatası');
    }
  });

  // CSV download endpoint
  app.get('/api/download-csv', (req, res) => {
    try {
      const csvPath = req.query.path as string;
      
      if (!csvPath) {
        return res.status(400).json({ error: 'CSV path is required' });
      }

      const fullPath = path.join(process.cwd(), csvPath);
      if (!fullPath.includes('temp/') || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'CSV file not found' });
      }

      const csvContent = fs.readFileSync(fullPath, 'utf-8');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="shopify-export.csv"');
      res.setHeader('Cache-Control', 'no-cache');
      
      console.log(`📥 CSV downloaded: ${csvPath}`);
      res.send(csvContent);
    } catch (error) {
      console.error('CSV download error:', error);
      res.status(500).json({ error: 'CSV download failed' });
    }
  });

  // Geçmiş URL'leri listele
  app.get('/api/history', (_req, res) => {
    try {
      const history = storage.getHistory();
      return res.status(200).json({ urls: history });
    } catch (error: any) {
      return res.status(500).json({ 
        message: "Geçmiş yüklenirken hata oluştu",
        error: error.message 
      });
    }
  });

  // Image proxy endpoint to handle CORS issues with Trendyol CDN
  app.get("/api/proxy-image", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) {
        return res.status(400).json({ error: "URL parametresi gerekli" });
      }

      // Validate the URL is from Trendyol CDN
      if (!imageUrl.includes('cdn.dsmcdn.com')) {
        return res.status(403).json({ error: "Sadece Trendyol CDN görsellerine izin veriliyor" });
      }

      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      res.setHeader('Access-Control-Allow-Origin', '*');

      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Image proxy error:', error);
      res.status(500).json({ error: "Görsel yüklenirken hata oluştu" });
    }
  });

  app.get('/api/download-csv', (req, res) => {
    const filename = req.query.filename as string;
    if (!filename) {
      return res.status(400).json({ error: 'Filename required' });
    }

    const csvPath = path.join(__dirname, '../temp', filename);
    
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(csvPath);
    fileStream.pipe(res);
  });

  // Otomatik CSV oluşturma endpoint'i
  app.post('/api/auto-csv', async (req, res) => {
    try {
      const { urls, filename, batchSize } = req.body;
      
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ 
          message: "URL listesi gerekli", 
          example: { urls: ["https://www.trendyol.com/product1", "https://www.trendyol.com/product2"] }
        });
      }
      
      const validUrls = urls.filter(url => 
        typeof url === 'string' && url.includes('trendyol.com') && url.includes('-p-')
      );
      
      if (validUrls.length === 0) {
        return res.status(400).json({ 
          message: "Geçerli Trendyol ürün URL'si bulunamadı",
          received: urls.length,
          valid: 0
        });
      }
      
      console.log(`🚀 Otomatik CSV işlemi başlatılıyor: ${validUrls.length} ürün`);
      
      const { generateAutoCSV } = await import('./auto-csv-generator');
      const result = await generateAutoCSV({
        urls: validUrls,
        outputFilename: filename,
        batchSize: batchSize || 3
      });
      
      if (result.success) {
        // Telegram bildirimi gönder
        try {
          const { sendCSVUploadNotification } = await import('./csv-telegram-notifier');
          await sendCSVUploadNotification({
            totalProducts: result.totalProducts,
            totalVariants: result.totalVariants,
            filename: result.filename,
            uploadedToShopify: false
          });
        } catch (telegramError) {
          console.error('CSV Telegram bildirimi başarısız:', telegramError);
        }
        
        res.json({
          success: true,
          message: `${result.totalProducts} ürün başarıyla işlendi`,
          filename: result.filename,
          csvPath: result.csvPath,
          totalProducts: result.totalProducts,
          totalVariants: result.totalVariants,
          totalRows: result.totalRows,
          summary: result.summary,
          results: result.results
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error,
          summary: result.summary,
          results: result.results
        });
      }
      
    } catch (error: any) {
      console.error('Otomatik CSV hatası:', error);
      res.status(500).json({ 
        success: false,
        message: "Otomatik CSV oluşturma hatası",
        error: error.message
      });
    }
  });

  // Otomatik CSV temizleme endpoint
  app.post('/api/auto-add-clear', async (req, res) => {
    try {
      const { clearAutoProducts } = await import('./auto-add-products');
      await clearAutoProducts();
      
      res.json({ 
        success: true,
        message: "Ürün listesi temizlendi" 
      });
      
    } catch (error: any) {
      console.error('Otomatik liste temizleme hatası:', error);
      res.status(500).json({ 
        success: false,
        message: "Liste temizlenirken hata oluştu",
        error: error.message 
      });
    }
  });

  // Otomatik ürün ekleme endpoints
  app.post('/api/auto-add-product', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ 
          success: false,
          message: "URL gerekli" 
        });
      }
      
      const { addProductToAutoCSV } = await import('./auto-add-products');
      const result = await addProductToAutoCSV(url);
      
      res.json(result);
      
    } catch (error: any) {
      console.error('Otomatik ürün ekleme hatası:', error);
      res.status(500).json({ 
        success: false,
        message: "Ürün ekleme hatası",
        error: error.message
      });
    }
  });

  app.get('/api/auto-add-state', async (req, res) => {
    try {
      const { getAutoAddState } = await import('./auto-add-products');
      const state = getAutoAddState();
      res.json(state);
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  app.post('/api/auto-add-clear', async (req, res) => {
    try {
      const { clearAutoProducts } = await import('./auto-add-products');
      await clearAutoProducts();
      
      res.json({ 
        success: true,
        message: "Ürün listesi temizlendi" 
      });
      
    } catch (error: any) {
      console.error('Otomatik liste temizleme hatası:', error);
      res.status(500).json({ 
        success: false,
        message: "Liste temizlenirken hata oluştu",
        error: error.message 
      });
    }
  });

  app.post('/api/auto-add-generate-csv', async (req, res) => {
    try {
      const { generateAutoCSV } = await import('./auto-add-products');
      const result = await generateAutoCSV();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // Toplu CSV işleme endpoint
  app.post('/api/bulk-csv', async (req, res) => {
    try {
      const { urls } = req.body;
      
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "URL listesi gerekli" 
        });
      }
      
      const validUrls = urls.filter(url => 
        typeof url === 'string' && url.includes('trendyol.com')
      );
      
      if (validUrls.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "Geçerli Trendyol URL'si bulunamadı" 
        });
      }
      
      console.log(`🚀 Toplu CSV işlemi başlatılıyor: ${validUrls.length} ürün`);
      
      const { processBulkProducts } = await import('./bulk-csv-processor');
      const result = await processBulkProducts(validUrls);
      
      res.json(result);
      
    } catch (error: any) {
      console.error('Toplu CSV hatası:', error);
      res.status(500).json({ 
        success: false,
        message: "Toplu CSV oluşturma hatası",
        error: error.message
      });
    }
  });

  // Scrapy-style extraction endpoint
  app.post('/api/scrapy-extract', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
      }

      const { scrapyEnhancedExtraction } = await import('./scrapy-enhanced-extractor');
      const result = await scrapyEnhancedExtraction(url);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Scrapy extraction başarısız' });
      }

      res.json({
        success: true,
        extraction_method: 'scrapy-style',
        total_variants: result.totalVariants,
        in_stock_variants: result.inStockVariants,
        products: result.products,
        message: `Scrapy-style: ${result.inStockVariants} stokta varyant çıkarıldı`
      });
    } catch (error) {
      console.error('Scrapy extraction hatası:', error);
      res.status(500).json({ error: 'Extraction hatası' });
    }
  });

  // Scrapy-CSV hibrit endpoint
  app.post('/api/scrapy-csv', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
      }

      // Scrapy extraction
      const { scrapyEnhancedExtraction } = await import('./scrapy-enhanced-extractor');
      const extractionResult = await scrapyEnhancedExtraction(url);
      
      if (!extractionResult.success || extractionResult.products.length === 0) {
        return res.status(400).json({ error: 'Scrapy extraction başarısız veya varyant bulunamadı' });
      }

      // CSV oluştur
      const { generateComprehensiveCSV } = await import('./comprehensive-csv-generator');
      const csvResult = generateComprehensiveCSV(extractionResult.products);
      
      res.json({
        success: true,
        method: 'scrapy-csv-hybrid',
        filename: csvResult.filename,
        totalVariants: csvResult.totalVariants,
        inStockVariants: extractionResult.inStockVariants,
        preview: csvResult.preview,
        downloadReady: true,
        message: `Scrapy extraction: ${extractionResult.inStockVariants} stokta varyant → Shopify CSV hazır`
      });
    } catch (error) {
      console.error('Scrapy-CSV hatası:', error);
      res.status(500).json({ error: 'Scrapy-CSV oluşturulamadı' });
    }
  });

  // Gelişmiş CSV oluşturma endpoint'i
  app.post('/api/generate-csv', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
      }

      // AI Enhanced Scraper kullan
      const { aiEnhancedScrape } = await import('./ai-enhanced-scraper');
      const productData = await aiEnhancedScrape(url);
      
      if (!productData.success) {
        return res.status(400).json({ error: 'Ürün verisi alınamadı' });
      }

      // Varyant bazlı CSV oluştur
      const { generateVariantCSV } = await import('./variant-csv-generator');
      const csvResult = generateVariantCSV(productData);
      
      res.json({
        success: true,
        filename: csvResult.filename,
        preview: csvResult.preview,
        totalVariants: csvResult.totalVariants,
        message: `${csvResult.totalVariants} adet varyant ile CSV oluşturuldu - %10 kar marjı eklendi`
      });
    } catch (error) {
      console.error('CSV oluşturma hatası:', error);
      res.status(500).json({ error: 'CSV oluşturulamadı' });
    }
  });

  // Strict CSV endpoint
  app.post('/api/strict-csv', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
      }

      const { EnhancedTrendyolHandler } = await import('./enhanced-trendyol-handler');
      const result = await EnhancedTrendyolHandler.extractProduct(url);
      
      if (!result.success || !result.data) {
        return res.status(400).json({ error: result.error || 'Ürün verisi alınamadı' });
      }

      const { generateStrictCSV } = await import('./strict-csv-generator');
      const csvResult = generateStrictCSV(result.data);
      
      if (!csvResult.success) {
        return res.status(400).json({ 
          error: 'CSV oluşturulamadı',
          validationErrors: csvResult.validationErrors
        });
      }

      res.json({
        success: true,
        method: 'strict-csv',
        filename: csvResult.filename,
        rowCount: csvResult.rowCount,
        productData: {
          title: result.data.title,
          brand: result.data.brand,
          variantCount: result.data.variants.length,
          imageCount: result.data.images.length
        }
      });
    } catch (error) {
      console.error('Strict CSV hatası:', error);
      res.status(500).json({ error: 'Strict CSV oluşturulamadı' });
    }
  });

  // CSV Accumulator endpoint
  app.post('/api/bulk-csv', async (req, res) => {
    try {
      const { urls } = req.body;
      
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URL listesi gerekli' });
      }

      const { CSVAccumulator } = await import('./csv-accumulator');
      const { EnhancedTrendyolHandler } = await import('./enhanced-trendyol-handler');
      
      const accumulator = new CSVAccumulator();
      const results = [];
      
      for (const url of urls) {
        const extractResult = await EnhancedTrendyolHandler.extractProduct(url);
        if (extractResult.success && extractResult.data) {
          const addResult = accumulator.addProduct(extractResult.data);
          results.push({
            url,
            success: addResult.success,
            message: addResult.message
          });
        } else {
          results.push({
            url,
            success: false,
            message: extractResult.error || 'Extraction başarısız'
          });
        }
      }
      
      const csvResult = accumulator.generateBulkCSV();
      
      res.json({
        success: csvResult.success,
        method: 'bulk-csv',
        filename: csvResult.filename,
        summary: csvResult.summary,
        results
      });
    } catch (error) {
      console.error('Bulk CSV hatası:', error);
      res.status(500).json({ error: 'Bulk CSV oluşturulamadı' });
    }
  });

  // Enhanced extraction endpoint with fallback
  app.post('/api/extract', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
      }

      console.log(`🎯 Extract request: ${url}`);
      
      // Skip focused extractor, go directly to simple scraper
      console.log(`📊 Using simple scraper for: ${url}`);
      
      // Use Clean Scraper
      console.log('🔧 Using Clean Scraper...');
      const { cleanScrape } = await import('./clean-scraper');
      const fallbackResult = await cleanScrape(url);
      
      if (fallbackResult && fallbackResult.success) {
        console.log(`✅ Simple Scraper successful: ${fallbackResult.features.length} features`);
        return res.json({
          success: true,
          brand: fallbackResult.brand,
          title: fallbackResult.title,
          price: fallbackResult.price,
          images: fallbackResult.images,
          features: fallbackResult.features,
          variants: fallbackResult.variants
        });
      }

      
      throw new Error('All extraction methods failed');
      
    } catch (error) {
      console.error('Extraction error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // Görsel debug endpoint
  app.post('/api/debug-images', async (req, res) => {
    try {
      const { url } = req.body;
      const { debugImageExtraction } = await import('./image-debug');
      const result = await debugImageExtraction(url);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Basit Trendyol extraction endpoint'i
  app.post('/api/simple-extract', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
      }

      const { extractSimpleTrendyolData } = await import('./simple-trendyol-extractor');
      const result = await extractSimpleTrendyolData(url);
      
      if (!result.success || !result.data) {
        return res.status(400).json({ 
          error: result.error || 'Ürün verisi alınamadı'
        });
      }

      res.json({
        success: true,
        brand: result.data.brand,
        title: result.data.title,
        images: result.data.images,
        variants: result.data.variants,
        features: result.data.features,
        summary: {
          imageCount: result.data.images.length,
          variantCount: result.data.variants.length,
          featureCount: result.data.features.length
        }
      });
    } catch (error) {
      console.error('Basit extraction hatası:', error);
      res.status(500).json({ error: 'Extraction başarısız' });
    }
  });

  // Varyant doğrulama endpoint'i
  app.post('/api/validate-variants', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
      }

      const { aiEnhancedScrape } = await import('./ai-enhanced-scraper');
      const productData = await aiEnhancedScrape(url);
      
      if (!productData.success) {
        return res.status(400).json({ error: 'Ürün verisi alınamadı' });
      }

      const { VariantValidator } = await import('./variant-validator');
      const validation = VariantValidator.validateVariants(productData.variants);
      
      res.json({
        success: true,
        productInfo: {
          title: productData.title,
          brand: productData.brand,
          price: productData.price
        },
        validation,
        extractedData: {
          totalColors: productData.variants?.colors?.length || 0,
          totalSizes: productData.variants?.sizes?.length || 0,
          totalCombinations: Object.keys(productData.variants?.stockMatrix || {}).length,
          inStockCombinations: validation.stockValidation.inStockCombinations
        }
      });
    } catch (error) {
      console.error('Varyant doğrulama hatası:', error);
      res.status(500).json({ error: 'Varyant doğrulaması başarısız' });
    }
  });

  // Fixed Shopify CSV with guaranteed column alignment
  app.post('/api/export-shopify-csv', async (req, res) => {
    try {
      const productData = req.body;
      
      if (!productData || !productData.brand || !productData.title) {
        return res.status(400).json({ error: 'Invalid product data' });
      }

      const baseHandle = productData.title.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
      
      const variants = productData.variants?.length > 0 ? productData.variants : [
        { color: 'Varsayılan', size: 'Tek Beden', inStock: true }
      ];
      
      // Create rows as arrays first
      const csvRows = [];
      
      // Header row
      csvRows.push([
        'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Type', 'Tags', 'Published',
        'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
        'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price',
        'Cost per item', 'Image Src', 'Image Position', 'Image Alt Text',
        'SEO Title', 'SEO Description', 'Variant Weight Unit', 'Status'
      ]);
      
      // Remove duplicate variants - group by unique color/size combinations
      const uniqueVariants = [];
      const seenCombinations = new Set();
      
      variants.forEach(variant => {
        const combination = `${variant.color || 'Varsayılan'}-${variant.size || 'Tek Beden'}`;
        if (!seenCombinations.has(combination)) {
          seenCombinations.add(combination);
          uniqueVariants.push(variant);
        }
      });
      
      // If no unique variants found, create one default
      if (uniqueVariants.length === 0) {
        uniqueVariants.push({ color: 'Varsayılan', size: 'Tek Beden', inStock: true });
      }
      
      // Extract and organize real variants from product data
      const realVariants = [];
      
      // Get all variants from product data
      if (productData.variants && productData.variants.length > 0) {
        productData.variants.forEach(variant => {
          if (variant.inStock) {
            realVariants.push({
              color: variant.color || 'Varsayılan',
              size: variant.size || 'Tek Beden',
              inStock: variant.inStock
            });
          }
        });
      }
      
      // If no real variants found, use default
      if (realVariants.length === 0) {
        realVariants.push({ color: 'Varsayılan', size: 'Tek Beden', inStock: true });
      }
      
      // Remove duplicate variant combinations
      const uniqueRealVariants = [];
      const seenVariantCombos = new Set();
      realVariants.forEach(variant => {
        const combo = `${variant.color}-${variant.size}`;
        if (!seenVariantCombos.has(combo)) {
          seenVariantCombos.add(combo);
          uniqueRealVariants.push(variant);
        }
      });
      
      console.log(`📊 CSV Varyant özeti: ${uniqueRealVariants.length} benzersiz varyant`);
      uniqueRealVariants.forEach(v => console.log(`  - ${v.color} / ${v.size}`));
      
      // Create product description with features
      const featuresDescription = productData.features && productData.features.length > 0 
        ? '<h3>Ürün Özellikleri:</h3><ul>' + 
          productData.features.map(f => `<li><strong>${f.key}:</strong> ${f.value}</li>`).join('') + 
          '</ul>'
        : '';
      
      const productDescription = `${productData.brand} ${productData.title}. ${featuresDescription}`;
      
      // Create CSV rows for each variant (Shopify multi-variant structure)
      uniqueRealVariants.forEach((variant, variantIndex) => {
        const isFirstVariant = variantIndex === 0;
        
        // Main variant row with first image
        csvRows.push([
          baseHandle,
          isFirstVariant ? productData.title : '',
          isFirstVariant ? productDescription : '',
          isFirstVariant ? productData.brand : '',
          isFirstVariant ? 'Genel' : '',
          isFirstVariant && productData.features ? productData.features.map(f => `${f.key}: ${f.value}`).join(', ') : '',
          isFirstVariant ? 'TRUE' : '',
          isFirstVariant ? 'Renk' : '',
          variant.color,
          isFirstVariant ? 'Beden' : '',
          variant.size,
          `${baseHandle}-${variant.color.toLowerCase().replace(/\s+/g, '-')}-${variant.size.toLowerCase().replace(/\s+/g, '-')}`,
          variant.inStock ? '25' : '0',
          (productData.price?.withProfit || 0).toFixed(2).replace('.', ',').replace(/,/g, '.').replace(/\./g, ','),
          '',
          (productData.price?.original || 0).toFixed(2).replace('.', ',').replace(/,/g, '.').replace(/\./g, ','),
          productData.images?.[0] || '',
          productData.images?.length > 0 ? '1' : '',
          `${productData.title} ${variant.color} ${variant.size}`,
          isFirstVariant ? `${productData.title} | ${productData.brand}` : '',
          isFirstVariant ? productDescription.substring(0, 160) : '',
          'kg',
          'active'
        ]);
      });
      
      // Additional image rows (attached to first variant)
      if (productData.images && productData.images.length > 1) {
        for (let i = 1; i < productData.images.length; i++) {
          csvRows.push([
            baseHandle,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            productData.images[i],
            String(i + 1),
            '',
            '',
            '',
            '',
            ''
          ]);
        }
      }
      
      // Force exactly 23 columns and handle price formatting
      const csvContent = csvRows.map((row, rowIndex) => {
        if (rowIndex === 0) {
          // Header row
          return row.join(',');
        }
        
        // Data rows - force exactly 23 fields
        const fields = [];
        for (let i = 0; i < 23; i++) {
          let value = row[i] || '';
          
          // Handle price fields (columns 13, 15) - remove commas to prevent splitting
          if (i === 13 || i === 15) {
            value = String(value).replace(/,/g, '.');
          }
          
          fields.push('"' + String(value).replace(/"/g, '""') + '"');
        }
        return fields.join(',');
      }).join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + baseHandle + '.csv"');
      res.send('\uFEFF' + csvContent);
      
    } catch (error) {
      console.error('CSV export error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add data analysis routes
  app.use(dataAnalysisRoutes);
  
  // Image debugging endpoint
  app.post("/api/debug-images", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL required" });
      }
      
      const result = await testImageExtraction(url);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  const httpServer = createServer(app);
  // E-posta raporu endpoint'leri
  app.post('/api/email/test-report', async (req, res) => {
    try {
      console.log('📧 Test daily report requested');
      
      // SendGrid ile öncelikli test
      const { testSendGridEmail } = await import('./sendgrid-service');
      console.log('🧪 Testing SendGrid email...');
      const sendGridResult = await testSendGridEmail('e2943592@gmail.com');
      
      if (sendGridResult.success) {
        console.log('✅ SendGrid test successful');
        res.json({ 
          success: true, 
          message: 'SendGrid test email gönderildi',
          service: 'SendGrid'
        });
        return;
      }
      
      // SendGrid başarısızsa Gmail alternatifi
      console.log('⚠️ SendGrid failed, trying Gmail...');
      const success = await dailyScheduler.sendTestReport();
      
      res.json({ 
        success, 
        message: success ? 'Gmail test email gönderildi' : 'Tüm email servisleri başarısız',
        service: success ? 'Gmail' : 'None'
      });
      
    } catch (error) {
      console.error('Test report error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Test email gönderilemedi' 
      });
    }
  });

  app.post('/api/email/set-recipient', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || !email.includes('@')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Geçerli e-posta adresi gerekli' 
        });
      }
      
      dailyScheduler.setReportEmail(email);
      
      res.json({ 
        success: true, 
        message: `Günlük rapor e-postası ${email} olarak ayarlandı` 
      });
    } catch (error) {
      console.error('Set recipient error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'E-posta ayarlama hatası: ' + error.message 
      });
    }
  });

  // Enhanced product extraction test routes removed

  // System connection test endpoints
  app.post('/api/system/test-connections', async (req, res) => {
    try {
      const { connectionStrengthener } = await import('./connection-strengthener');
      await connectionStrengthener.reinforceConnections();
      const results = await connectionStrengthener.performFullConnectionTest();
      res.json(results);
    } catch (error) {
      console.error('Connection test error:', error);
      res.status(500).json({ error: 'Connection test failed' });
    }
  });

  app.get('/api/system/health', async (req, res) => {
    try {
      const { systemHealthMonitor } = await import('./system-health-monitor');
      const health = await systemHealthMonitor.performHealthCheck();
      res.json(health);
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({ error: 'Health check failed' });
    }
  });

  // Scheduled tasks API endpoints
  app.get('/api/scheduler/status', (req, res) => {
    try {
      const status = getSchedulerStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Scheduler status error:', error);
      res.status(500).json({
        success: false,
        message: 'Zamanlı görev durumu alınamadı'
      });
    }
  });

  app.post('/api/scheduler/execute/:taskName', async (req, res) => {
    try {
      const { taskName } = req.params;
      const result = await executeTaskManually(taskName);
      
      if (result) {
        res.json({
          success: true,
          message: `Görev başarıyla çalıştırıldı: ${taskName}`
        });
      } else {
        res.status(400).json({
          success: false,
          message: `Görev çalıştırılamadı: ${taskName}`
        });
      }
    } catch (error) {
      console.error('Manual task execution error:', error);
      res.status(500).json({
        success: false,
        message: 'Görev çalıştırılırken hata oluştu'
      });
    }
  });

  // System status report endpoint
  app.post('/api/system/report', async (req, res) => {
    try {
      const { sendStatusToTelegram } = await import('./simple-system-status');
      const success = await sendStatusToTelegram();
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Sistem durum raporu Telegram\'a gönderildi' 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: 'Rapor gönderilemedi' 
        });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: `Rapor oluşturma hatası: ${error}` 
      });
    }
  });

  // CRITICAL: Product update endpoint for scheduler system
  app.post('/api/memory/update-all-products', async (req, res) => {
    try {
      console.log('🔄 Scheduler initiated product update process...');
      
      const { productUpdateEngine } = await import('./product-update-engine');
      
      // Get all products from database that need updates
      const products = await db.select().from(productsTable);
      
      if (products.length === 0) {
        return res.json({
          success: true,
          message: 'No products found for update',
          results: []
        });
      }
      
      console.log(`📊 Processing ${products.length} products for updates...`);
      
      // Process updates for all products
      const productIds = products.map(p => p.id);
      const results = await productUpdateEngine.processBulkUpdates(productIds);
      
      // Generate summary report
      const report = productUpdateEngine.generateUpdateReport(results);
      console.log('📋 Update Report:\n' + report);
      
      // Send Telegram notification with results
      try {
        const { sendMessage } = await import('./telegram-integration');
        await sendMessage(`🔄 Günlük Ürün Güncellemeleri Tamamlandı\n\n${report}`);
      } catch (telegramError) {
        console.error('Telegram notification failed:', telegramError);
      }
      
      res.json({
        success: true,
        message: `Updated ${results.length} products`,
        results: results,
        report: report
      });
      
    } catch (error: any) {
      console.error('❌ Product update process failed:', error);
      res.status(500).json({
        success: false,
        message: 'Product update failed',
        error: error.message
      });
    }
  });

  // Memory status routes - CRITICAL: Register BEFORE catch-all routes
  app.use('/api/memory', memoryStatusRoutes);

  // System status JSON endpoint
  app.get('/api/system/status', async (req, res) => {
    try {
      const { getSystemStatus } = await import('./simple-system-status');
      const status = await getSystemStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ 
        error: 'Sistem durumu alınamadı',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Initialize scheduler system on server start
  setTimeout(() => {
    try {
      initializeScheduler();
      console.log('✅ Zamanlı görevler sistemi başlatıldı');
    } catch (error) {
      console.error('❌ Zamanlı görevler başlatma hatası:', error);
    }
  }, 3000);

  return httpServer;
}

// Ürün açıklaması oluştur
function generateProductDescription(features: Array<{ key: string; value: string }>): string {
  if (features.length === 0) return '';
  
  let description = '<div class="product-description">';
  description += '<h3>Ürün Özellikleri:</h3>';
  description += '<ul>';
  
  features.forEach(feature => {
    if (feature.key && feature.value) {
      description += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    }
  });
  
  description += '</ul>';
  description += '</div>';
  
  return description;
}