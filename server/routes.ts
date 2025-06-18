import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import * as cheerio from "cheerio";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { scrapeProductWithPuppeteer } from "./fixed-puppeteer-scraper";
import { scrapeWithEnhancedMethod } from "./enhanced-trendyol-scraper";
import { generateShopifyCSV } from "./shopify-export-fixed";
import { getCategoryConfig } from "./category-mapping";
import { cleanTrendyolAttributes } from "./clean-attributes";
import { parseJsonLdProductData, generateTagsFromJsonLd } from "./json-ld-parser";
import { InsertProduct } from "@shared/schema";
import { getFinalImages } from "./final-image-solution";
import { extractVariantStockInfo } from "./advanced-size-extractor";

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

export async function registerRoutes(app: Express) {
  // CSV önizleme endpoint'i
  app.get('/api/preview/:filename', (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join('./temp', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'CSV dosyası bulunamadı' });
      }
      
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const rows = csvContent.split('\n').filter(row => row.trim());
      
      if (rows.length === 0) {
        return res.status(400).json({ message: 'CSV dosyası boş' });
      }
      
      // Başlık satırını ayır
      const headers = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      // Veri satırlarını ayır ve en fazla 5 satır göster
      const dataRows = rows.slice(1, 6).map(row => {
        if (!row.trim()) return {}; // Boş satırları atla
        
        // CSV parsing için gelişmiş yöntem - tırnak içindeki virgülleri koruma
        const values: string[] = [];
        let currentValue = '';
        let inQuotes = false;
        
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim());
        
        const rowObject: Record<string, string> = {};
        headers.forEach((header, index) => {
          let value = values[index] || '';
          // JSON için güvenli hale getir
          value = value.replace(/[\x00-\x1F\x7F]/g, '').substring(0, 100);
          rowObject[header] = value;
        });
        
        return rowObject;
      }).filter(row => Object.keys(row).length > 0);
      
      const preview = {
        filePath,
        headers,
        rows: dataRows,
        totalRows: rows.length - 1 // Başlık satırını çıkar
      };
      
      return res.status(200).json(preview);
    } catch (error) {
      return res.status(500).json({ message: "CSV önizleme hatası", error: String(error) });
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

      // Enhanced product data extraction for Modagen and other Trendyol products
      if (url.includes('modagen') || url.includes('trendyol.com/')) {
        console.log("Ürün verisi işleniyor...");
        
        if (url.includes('modagen')) {
          const { handleModagenProduct } = await import('./modagen-handler');
          const result = await handleModagenProduct(url, productId || '');
          return res.status(200).json(result);
        }
        
        // Use enhanced Trendyol handler for all other products
        const { scrapeTrendyolProduct } = await import('./enhanced-trendyol-handler');
        const trendyolResult = await scrapeTrendyolProduct(url);
        
        // Ürünü otomatik olarak CSV'ye ekle
        try {
          const { addProductToAutoCSV } = await import('./auto-add-products');
          await addProductToAutoCSV(url);
          console.log('✅ Ürün otomatik CSV listesine eklendi');
        } catch (error) {
          console.log('⚠️ Otomatik CSV ekleme hatası:', error);
        }
        
        return res.status(200).json(trendyolResult);
      }
      
      // Continue with original flow for non-Trendyol URLs
      let htmlContent;
      
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

        const result = await generateShopifyCSV({
          id: Date.now(),
          url,
          title: productData.title,
          description: productData.description,
          price: productData.price,
          brand: productData.brand,
          basePrice: null,
          images: productData.images,
          video: null,
          variants: productData.variants,
          attributes: productData.attributes,
          categories: productData.categories,
          tags: [productData.brand, ...productData.categories],
          category: productData.categories[0] || 'Fashion',
          subcategory: productData.categories[1] || 'Clothing',
          productType: 'Product',
          vendor: null
        }, {
          sizes: productData.variants.sizes,
          colors: productData.variants.colors,
          stockMap: productData.stockMap
        });
        
        return res.status(200).json({
          url,
          message: "Authentic ürün verisi başarıyla çekildi ve işlendi",
          title: productData.title,
          brand: productData.brand,
          price: productData.price,
          description: productData.description,
          images: productData.images,
          variants: productData.variants,
          attributes: productData.attributes,
          categories: productData.categories,
          category: productData.categories[0] || 'Fashion',
          subcategory: productData.categories[1] || 'Clothing',
          tags: [productData.brand, ...productData.categories],
          preview: {
            csvPath: result.csvPath,
            filename: result.filename,
            totalRows: result.totalRows,
            shopifyReady: true,
            note: "Authentic stok verisi kullanılarak CSV oluşturuldu"
          }
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
          htmlContent = await scrapeProductWithPuppeteer(url);
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
              // Fiyata %10 kar marjı ekle
              const originalPrice = parseFloat(jsonldData.price) || 0;
              const priceWithProfit = (originalPrice * 1.10).toFixed(2);
              console.log(`FİYAT GÜNCELLEME: ${originalPrice} TL + %10 kar = ${priceWithProfit} TL`);
              
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
              
              const csvResult = await generateShopifyCSV({
                ...productData,
                id: 0,
                brand: productData.brand || null,
                video: productData.video || null,
                vendor: productData.vendor || null,
                basePrice: productData.basePrice || null,
                category: productData.category || null,
                subcategory: productData.subcategory || null,
                productType: productData.productType || null,
                tags: productData.tags || null
              }, {
                sizes: variants.size || [],
                colors: variants.color || [],
                availability: jsonldData.availability,
                stockMap: stockInfo.variantStockMap,
                colorSizeMatrix: stockInfo.colorSizeMatrix
              });
              
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
                preview: csvResult
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

  // CSV dosyası indirme endpoint'i
  app.get('/api/download/:filename', (req, res) => {
    try {
      const filename = req.params.filename;
      // Hem temp hem de /tmp klasörlerini kontrol et
      let filepath = path.join('./temp', filename);
      
      if (!fs.existsSync(filepath)) {
        // /tmp klasöründe de ara
        filepath = path.join('/tmp', filename);
        if (!fs.existsSync(filepath)) {
          console.log(`CSV dosyası bulunamadı: ${filename} (./temp ve /tmp kontrol edildi)`);
          return res.status(404).json({ message: `CSV dosyası bulunamadı: ${filename}` });
        }
      }
      
      const csvContent = fs.readFileSync(filepath, 'utf8');
      
      if (!csvContent.startsWith('Handle,') && !csvContent.includes(',')) {
        return res.status(400).json({ message: 'Geçersiz CSV dosyası formatı' });
      }
      
      res.setHeader('Content-Type', 'application/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      res.send(csvContent);
      
    } catch (error: any) {
      console.error('CSV indirme hatası:', error);
      return res.status(500).json({ 
        message: "CSV dosyası indirilemedi",
        error: error.message 
      });
    }
  });

  // CSV preview endpoint - must be before other routes
  app.get('/api/preview/:filename', (req, res) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(process.cwd(), 'temp', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'CSV file not found' });
      }

      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return res.json({ headers: [], rows: [], totalRows: 0 });
      }

      // Parse CSV headers properly
      const headerLine = lines[0];
      const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
      
      // Parse first 3 data rows with proper CSV parsing
      const dataRows = lines.slice(1, 4).map(line => {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (!inQuotes) {
              inQuotes = true;
            } else if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i++; // Skip next quote
            } else {
              inQuotes = false;
            }
          } else if (char === ',' && !inQuotes) {
            values.push(current.replace(/^"|"$/g, '').trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.replace(/^"|"$/g, '').trim());
        
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

      res.json({
        headers: headers.slice(0, 5),
        rows: dataRows,
        totalRows: lines.length - 1,
        fileInfo: {
          shopifyCompatible: true,
          variants: dataRows.length,
          columns: headers.length,
          hasImages: headers.includes('Image Src'),
          hasPricing: headers.includes('Variant Price'),
          hasInventory: headers.includes('Variant Inventory Qty')
        }
      });
    } catch (error) {
      console.error('CSV preview error:', error);
      res.status(500).json({ error: 'Failed to read CSV file' });
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

  const httpServer = createServer(app);
  return httpServer;
}