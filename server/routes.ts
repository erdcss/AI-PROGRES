import type { Express } from "express";
import express from "express";
import * as cheerio from "cheerio";
import { Product, InsertProduct, insertProductSchema, urlSchema } from "@shared/schema";
import { storage } from "./storage";
import { handleError, ProductDataError, TrendyolScrapingError } from "./errors";
import { createServer } from "http";
import { scrapeProductWithPuppeteer } from "./puppeteer-scraper";
import { getCategoryConfig } from "./category-mapping";
import fetch from "node-fetch";

// Debug yardımcı fonksiyonu
function debug(message: string, ...args: any[]) {
  console.log(`[DEBUG] ${message}`, ...args);
}

// Görsel URL'lerini düzenleme
function normalizeImageUrl(url: string): string {
  try {
    if (url.includes('mnresize')) {
      // Yüksek kalite için thumbnail yerine orijinal resim URL'sini elde et
      return url.replace(/&mnresize=\d+&mnq=\d+/g, '');
    }
    
    // Boyut sınırlamalarını kaldır
    if (url.includes('trendyol.com')) {
      return url.replace(/\/\d+x\d+\//g, '/original/');
    }
    
    // URL'nin geçerli olup olmadığını kontrol et
    try {
      new URL(url);
      return url;
    } catch (urlError) {
      debug(`Geçersiz URL oluşturuldu, varsayılan görsel kullanılıyor: ${url}`);
      return 'https://i.trendyol.com/mnresize/400/400/assets/product/media/images/defaultImage.png';
    }
  } catch (error: any) {
    debug(`URL normalizasyon hatası: ${error.message}`);
    return 'https://i.trendyol.com/mnresize/400/400/assets/product/media/images/defaultImage.png';
  }
}

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Ürün çekmeyi dene
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

      const { url } = validation.data;
      
      // Ürün ID'sini URL'den çıkart
      const productIdMatch = url.match(/p-(\d+)/);
      const productId = productIdMatch ? productIdMatch[1] : null;

      // Philips Lattego tespiti
      const isPhilipsLattego = url.toLowerCase().includes('philips') && 
                             (url.toLowerCase().includes('lattego') || 
                              url.toLowerCase().includes('espresso') || 
                              url.toLowerCase().includes('kahve'));
      
      let htmlContent;
      
      // Önce mobil API stratejisini dene 
      if (productId) {
        try {
          // Mobil API endpoint'i 
          const mobileApiUrl = `https://m.trendyol.com/mweb/product/${productId}`;
          console.log(`Mobil API stratejisi deneniyor: ${mobileApiUrl}`);
          
          const mobileResponse = await fetch(mobileApiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.83 Mobile/15E148 Safari/604.1',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
              'Cache-Control': 'no-cache',
              'Referer': 'https://www.google.com/search?q=trendyol+philips',
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
          // Bu bir hata değil, sadece bir strateji, devam ediyoruz
        }
      }
      
      // Hala içerik alınamadıysa ve Philips Lattego ise Puppeteer kullan
      if (!htmlContent && isPhilipsLattego) {
        try {
          console.log("Philips/Elektronik ürün tespit edildi, Puppeteer kullanılıyor");
          htmlContent = await scrapeProductWithPuppeteer(url);
        } catch (puppeteerError: any) {
          console.log(`Puppeteer hatası: ${puppeteerError.message}`);
          return res.status(500).json({
            message: "Özel ürün verileri çekilirken hata oluştu",
            details: puppeteerError.message
          });
        }
      }
      
      // Son çare olarak, standart fetch isteği gönder
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
          // Bu bir hata değil, sadece bir strateji, devam ediyoruz
        }
      }
      
      // HTML içeriğini parse et
      if (htmlContent) {
        try {
          const $ = cheerio.load(htmlContent);
          console.log("HTML içeriği Cheerio ile yüklendi");
          
          // JSON-LD formatı var mı kontrol et
          let jsonldData = null;
          try {
            const jsonlds = $('script[type="application/ld+json"]').toArray();
            for (const element of jsonlds) {
              const content = $(element).html();
              if (content && content.includes('"@type":"Product"')) {
                const parsedData = JSON.parse(content);
                if (parsedData["@type"] === "Product") {
                  jsonldData = parsedData;
                  console.log("JSON-LD ürün verisi bulundu");
                  break;
                }
              }
            }
          } catch (error) {
            console.log(`JSON-LD parse hatası: ${error}`);
          }
          
          // JSON-LD'den ürün bilgilerini oluştur
          if (jsonldData) {
            // Basit bir ürün nesnesi oluştur
            const productInfo = {
              brand: jsonldData.brand?.name || "Bilinmeyen Marka",
              name: jsonldData.name || "Ürün adı bulunamadı",
              description: jsonldData.description || "",
              price: jsonldData.offers?.price ? parseFloat(jsonldData.offers.price) : 0,
              images: Array.isArray(jsonldData.image) ? 
                jsonldData.image.map(normalizeImageUrl) : 
                (jsonldData.image ? [normalizeImageUrl(jsonldData.image)] : [])
            };
            
            // İşlemi tamamla
            storage.addToHistory(url);
            
            return res.status(200).json({
              url,
              message: "Ürün verisi JSON-LD formatından başarıyla çekildi",
              productInfo
            });
          }
          
          // JSON-LD yoksa standart HTML parsing yap
          debug("JSON-LD bulunamadı, standart HTML parsing denenecek");
          
          // Ürün başlığı
          const title = $('h1.pr-new-br').text().trim() || 
                       $('h1.detail-name').text().trim() || 
                       $('h1.product-title').text().trim();
                       
          // Marka
          const brand = $('.product-title-brand span').text().trim() ||
                       $('.prdct-desc-cntnr-ttl').text().trim() || 
                       "turmarkt";
                       
          // Fiyat
          let priceText = $('.prc-dsc').first().text().trim().replace('TL', '').replace(/\./g, '').replace(',', '.');
          if (!priceText) {
            priceText = $('.product-price-container .prc-dsc').text().trim().replace('TL', '').replace(/\./g, '').replace(',', '.');
          }
          const price = parseFloat(priceText) || 0;
          
          // Ürün açıklaması
          const description = $('.description-text').text().trim() || 
                             $('.detail-desc-list').text().trim() || 
                             "Ürün açıklaması bulunamadı";
                             
          // Resimler
          const images: string[] = [];
          $('.product-slide img').each((i, el) => {
            const src = $(el).attr('src');
            if (src) images.push(normalizeImageUrl(src));
          });
          
          // Ürün variant'ları
          const variants: Record<string, string[]> = {};
          $('.sp-itm').each((i, el) => {
            const type = $(el).find('.vrytn-cntnr-ttl').text().trim();
            const values: string[] = [];
            $(el).find('.slctd-vrytn').each((j, opt) => {
              values.push($(opt).text().trim());
            });
            if (type && values.length > 0) {
              variants[type] = values;
            }
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
          
          // Ürün bilgilerini oluştur
          const productInfo = {
            url,
            title: title || "Ürün adı bulunamadı",
            brand: brand || "turmarkt",
            price,
            description,
            images,
            variants,
            attributes
          };
          
          // İşlemi tamamla
          storage.addToHistory(url);
          
          return res.status(200).json({
            url,
            message: "Ürün verisi HTML'den başarıyla çekildi",
            productInfo
          });
        } catch (parseError: any) {
          console.log(`HTML parse hatası: ${parseError.message}`);
          return res.status(500).json({
            message: "HTML içeriği işlenirken hata oluştu",
            details: parseError.message
          });
        }
      }
      
      // Başarı mesajı döndür
      storage.addToHistory(url);
      
      return res.status(200).json({
        url,
        title: isPhilipsLattego ? "Philips Elektronik Ürün" : "Standart Ürün",
        message: "Ürün tespit edildi, ancak detaylı veri henüz işlenmedi",
        isPhilipsProduct: isPhilipsLattego
      });
    } catch (error: any) {
      const errorResponse = handleError(error);
      return res.status(errorResponse.status).json({ 
        message: errorResponse.message,
        details: errorResponse.details
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

  return httpServer;
}