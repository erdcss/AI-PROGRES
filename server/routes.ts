import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import * as cheerio from "cheerio";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { scrapeProductWithPuppeteer } from "./fixed-puppeteer-scraper";
import { generateShopifyCSV } from "./shopify-export";
import { getCategoryConfig } from "./category-mapping";
import { cleanTrendyolAttributes } from "./clean-attributes";
import { parseJsonLdProductData, generateTagsFromJsonLd } from "./json-ld-parser";
import { InsertProduct } from "@shared/schema";
import { getFinalImages } from "./final-image-solution";

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

      let htmlContent;
      
      // Mobil API stratejisini dene 
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
                  
                  // Varyant adından beden çıkarmaya çalış
                  if (variant.name) {
                    const sizeMath = variant.name.match(/\b(XS|S|M|L|XL|XXL|XXXL|\d{2,3})\b/gi);
                    if (sizeMath) {
                      sizeMath.forEach(size => {
                        const sizeValue = size.toUpperCase();
                        if (!variants.size.includes(sizeValue)) {
                          variants.size.push(sizeValue);
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
              
              // Beden sıralaması
              const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
              variants.size.sort((a, b) => {
                const aIndex = sizeOrder.indexOf(a);
                const bIndex = sizeOrder.indexOf(b);
                
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
              
              // Ürünü veritabanına kaydet
              await storage.saveProduct(productData);
              
              // Shopify CSV oluştur
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
              }, {});
              
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
          
          // Alternatif beden selektörleri
          $('.variant-options .size-option, .size-variant, [data-testid*="size"]').each((i, el) => {
            const sizeText = $(el).text().trim();
            if (sizeText && /^(XS|S|M|L|XL|XXL|XXXL|\d+)$/.test(sizeText)) {
              if (!variants.size.includes(sizeText)) {
                variants.size.push(sizeText);
              }
            }
          });
          
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
            
            // Shopify CSV oluştur
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
            }, {});
            
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
      const filepath = path.join('./temp', filename);
      
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: 'CSV dosyası bulunamadı' });
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

  const httpServer = createServer(app);
  return httpServer;
}