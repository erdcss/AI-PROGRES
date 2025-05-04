import { z } from "zod";
import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import * as cheerio from "cheerio";
import { type InsertProduct } from "@shared/schema";
import { TrendyolScrapingError, ProductDataError, handleError } from "./errors";
import fetch from "node-fetch";
import { createObjectCsvWriter } from 'csv-writer';
import { getCategoryConfig } from './category-mapping';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fs from 'fs';

// Uygulama sabitleri ve yapılandırmaları
const DEFAULT_IMAGE_URL = "https://cdn.dsmcdn.com/assets/product/media/images/no-image-v2.png"; // Varsayılan görsel URL
const MAX_IMAGES = 8; // Shopify'a eklenecek maksimum görsel sayısı
const APP_VERSION = "0.13.1006"; // Yeni sürüm numarası (Shopify inventory policy ve fulfillment hatası düzeltmesi)
const MAX_TAG_LENGTH = 50; // Etiketlerin maksimum uzunluğu

function debug(message: string, ...args: any[]) {
  console.log(`[DEBUG] ${message}`, ...args);
}

function cleanPrice(price: string): number {
  return parseFloat(price.replace(/[^\d,]/g, '').replace(',', '.'));
}

async function fetchProductPage(url: string): Promise<cheerio.CheerioAPI> {
  try {
    // URL'yi normalize et
    if (!url.startsWith('http')) {
      url = 'https://www.' + url.replace(/^www\./, '');
    }

    debug(`Fetching URL: ${url}`);

    // @ts-ignore - node-fetch tiplemesi farklı olduğu için
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.trendyol.com/',
        'Origin': 'https://www.trendyol.com',
        'Connection': 'keep-alive'
      },
      // @ts-ignore - node-fetch tiplemesi farklı olduğu için
      follow: 10,
      redirect: 'follow'
    });

    if (!response.ok) {
      debug(`HTTP error! status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    if (!html || html.length < 1000) {
      debug("Sayfa içeriği çok kısa veya boş");
      throw new Error("Sayfa içeriği geçersiz");
    }

    debug(`HTML içeriği başarıyla alındı (${html.length} bytes)`);

    // Ürün sayfası kontrolü ekle
    const $ = cheerio.load(html);
    const isProductPage = $('.pr-new-br').length > 0 || $('.product-detail-container').length > 0;

    if (!isProductPage) {
      debug("Geçerli bir ürün sayfası bulunamadı");
      throw new Error("Geçerli bir ürün sayfası değil");
    }

    return $;

  } catch (error: any) {
    debug(`Veri çekme hatası: ${error.message}`);
    debug(`URL: ${url}`);
    debug(`Stack trace: ${error.stack}`);
    throw new TrendyolScrapingError("Sayfa yüklenemedi", {
      status: 500,
      statusText: "Fetch Error",
      details: error.message
    });
  }
}

function normalizeImageUrl(url: string): string {
  // Global değişkeni kullan - bu fonksiyon içinde tekrar tanımlamaya gerek yok
  
  try {
    // Boş URL kontrolü
    if (!url || typeof url !== 'string' || url.trim() === '') {
      debug(`Boş URL geçildi, varsayılan görsel kullanılıyor`);
      return DEFAULT_IMAGE_URL;
    }
    
    // URL'den parametreleri temizle
    url = url.split('?')[0];

    // Geçersiz URL'leri kontrol et
    if (url.match(/\.(mp4|webm|ogg|mov)$/i)) {
      debug(`Video dosyası filtrelendi: ${url}`);
      return DEFAULT_IMAGE_URL;
    }

    // URL'nin desteklenen bir resim formatı olup olmadığını kontrol et
    if (!url.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) {
      // .jpg ekle - bazı URL'ler uzantı içermiyor
      if (!url.includes('.')) {
        url += '.jpg';
        debug(`URL'ye .jpg uzantısı eklendi: ${url}`);
      } else {
        // Uzantısı olmayan ama nokta içeren URL'ler için de .jpg ekle
        if (!url.split('.').pop()?.match(/jpg|jpeg|png|webp|gif|svg/i)) {
          url += '.jpg';
          debug(`URL'ye .jpg uzantısı eklendi (nokta içeriyordu): ${url}`);
        } else {
          debug(`Desteklenmeyen dosya formatı: ${url}`);
          return DEFAULT_IMAGE_URL;
        }
      }
    }

    // Trendyol'un Görsel CDN URL'lerini düzelt
    if (url.includes('/ty')) {
      url = `https://cdn.dsmcdn.com${url}`;
    }

    // URL protokolünü düzelt
    if (url.startsWith('//')) {
      url = 'https:' + url;
    } else if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    // Boyut parametrelerini kaldır
    url = url.replace(/\/mnresize\/\d+\/\d+\//, '/');
    url = url.replace(/_\d+x\d+/, '');

    // Yüksek kaliteli sürüm için _org_zoom eklentisini ekle
    if (!url.includes('_org_zoom')) {
      url = url.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.$1');
    }
    
    // Son bir URL kontrolü yap
    try {
      new URL(url);
      debug(`Normalize edilmiş görsel URL: ${url}`);
      return url;
    } catch (urlError) {
      debug(`Geçersiz URL oluşturuldu, varsayılan görsel kullanılıyor: ${url}`);
      return DEFAULT_IMAGE_URL;
    }
  } catch (error: any) {
    debug(`URL normalizasyon hatası: ${error.message}, varsayılan görsel kullanılıyor`);
    return DEFAULT_IMAGE_URL;
  }
}

// Kategori parse fonksiyonunu geliştir
function extractCategories($: cheerio.CheerioAPI): { categories: string[], fullPath: string[], breadcrumbPath: string[] } {
  const categories: string[] = [];
  const fullPath: string[] = [];
  const breadcrumbFullPath: string[] = [];

  // JavaScript state'den detaylı kategori yolunu al
  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';
    if (scriptContent.includes('window.__PRODUCT_DETAIL_APP_INITIAL_STATE__')) {
      try {
        // @ts-ignore - s flag desteği için
        const match = scriptContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
        if (match) {
          const data = JSON.parse(match[1]);
          if (data.product?.category?.hierarchy) {
            data.product.category.hierarchy.forEach((cat: any) => {
              if (cat.name) {
                categories.push(cat.name);
                fullPath.push(cat.name);
              }
            });
            debug(`Detaylı kategori yolu bulundu: ${fullPath.join(' > ')}`);
          } else if (data.product?.category?.name) {
            // Ana kategori adını al
            categories.push(data.product.category.name);
            fullPath.push(data.product.category.name);
            debug(`Ana kategori bulundu: ${data.product.category.name}`);
          }
        }
      } catch (error) {
        debug(`State parse hatası: ${error}`);
      }
    }
  });

  // Breadcrumb'dan tam kategori yolunu al
  const breadcrumbCategories: string[] = [];
  const breadcrumbPath: string[] = [];
  
  // Tüm breadcrumb içeriğini de sakla
  let fullBreadcrumb = "";
  
  $('.breadcrumb-wrapper .breadcrumb li, .breadcrumb li').each((_, el) => {
    const category = $(el).text().trim();
    if (category && !category.includes('>') && category !== 'Anasayfa') {
      if (category !== 'Trendyol') {
        breadcrumbCategories.push(category);
        breadcrumbPath.push(category);
      }
      
      // Tam breadcrumb zincirini de oluştur
      if (fullBreadcrumb === "") {
        fullBreadcrumb = category;
      } else {
        fullBreadcrumb += ` > ${category}`;
      }
    }
  });
  
  debug(`Breadcrumb yolu (tam): ${fullBreadcrumb}`);
  
  // Tam breadcrumb'ı breadcrumbFullPath'e ekle
  if (fullBreadcrumb) {
    breadcrumbFullPath.push(fullBreadcrumb);
  }
  
  if (breadcrumbCategories.length > 0) {
    debug(`Breadcrumb'dan kategoriler alındı: ${breadcrumbCategories.join(' > ')}`);
    debug(`Tam breadcrumb yolu: ${fullBreadcrumb}`);
    
    if (categories.length === 0) {
      categories.push(...breadcrumbCategories);
      fullPath.push(...breadcrumbPath);
    } else {
      // Breadcrumb kategorileri ayrıca fullPath'e ekle
      for (const cat of breadcrumbCategories) {
        if (!fullPath.includes(cat)) {
          fullPath.push(cat);
        }
      }
    }
  }

  // Alternatif kategori çekme yöntemi - daha geniş selektor kullan
  if (categories.length === 0) {
    $('.product-container .product-detail-container [data-tracker-id="Category Info"], .breadcrumb li, div[class*="breadcrumb"], div[class*="Breadcrumb"]').each((_, el) => {
      const category = $(el).text().trim();
      if (category && category !== 'Anasayfa' && category !== 'Trendyol' && !category.includes('>')) {
        categories.push(category);
        fullPath.push(category);
      }
    });
    debug(`Ürün detayından kategoriler alındı: ${categories.join(', ')}`);
  }
  
  // Microdata / JSON-LD'den kategori çekmeyi dene
  if (categories.length === 0) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '{}');
        if (data.itemListElement) {
          const breadcrumbs = data.itemListElement;
          for (const item of breadcrumbs) {
            if (item.item && item.item.name && item.item.name !== 'Anasayfa' && item.item.name !== 'Trendyol') {
              categories.push(item.item.name);
              fullPath.push(item.item.name);
            }
          }
        }
      } catch (error) {
        debug(`JSON-LD parse hatası: ${error}`);
      }
    });
    if (categories.length > 0) {
      debug(`JSON-LD'den kategoriler alındı: ${categories.join(', ')}`);
    }
  }

  // Sayfanın meta etiketlerinden kategori bilgisi çek
  if (categories.length === 0) {
    $('meta[property="og:title"], meta[name="twitter:title"], meta[name="keywords"], meta[name="description"]').each((_, el) => {
      const content = $(el).attr('content') || '';
      if (content) {
        // Özel kategoriler için regex
        const categoryMatches = content.match(/(?:Elektronik|Giyim|Ayakkabı|Çanta|Aksesuar|Kozmetik|Mobilya|Ev|Oyuncak|Spor|Kitap)/gi);
        if (categoryMatches && categoryMatches.length > 0) {
          for (const match of categoryMatches) {
            if (!categories.includes(match)) {
              categories.push(match);
              fullPath.push(match);
            }
          }
          debug(`Meta etiketlerinden kategoriler alındı: ${categoryMatches.join(', ')}`);
        }
      }
    });
  }
  
  // Son çare: Sayfa başlığından kategori çıkarımı
  if (categories.length === 0) {
    const pageTitle = $('title').text().trim();
    const titleMatch = pageTitle.match(/(?:in|de) ([^>]+?) (?:Modelleri|Fiyatları|Ürünleri)/i);
    if (titleMatch && titleMatch[1]) {
      categories.push(titleMatch[1].trim());
      fullPath.push(titleMatch[1].trim());
      debug(`Sayfa başlığından kategori çıkarıldı: ${titleMatch[1]}`);
    }
  }

  // Hala kategori bulunamadıysa, ürün başlığından ipucu ara
  if (categories.length === 0) {
    const productTitle = $('.pr-new-br').text().trim() || $('.prdct-desc-cntnr-name').text().trim();
    if (productTitle) {
      let defaultCategory = 'Diğer';
      if (productTitle.toLowerCase().includes('saat')) defaultCategory = 'Saat';
      else if (productTitle.toLowerCase().includes('ayakkabı')) defaultCategory = 'Ayakkabı';
      else if (productTitle.toLowerCase().includes('çanta')) defaultCategory = 'Çanta';
      categories.push(defaultCategory);
      fullPath.push(defaultCategory);
      debug(`Ürün başlığından varsayılan kategori belirlendi: ${defaultCategory}`);
    }
  }

  return {
    categories: categories.length > 0 ? categories : ['Diğer'],
    fullPath: fullPath.length > 0 ? fullPath : ['Diğer'],
    breadcrumbPath: breadcrumbFullPath.length > 0 ? breadcrumbFullPath : []
  };
}

async function scrapeProduct(url: string): Promise<InsertProduct> {
  debug("Scraping başlatıldı");

  try {
    const $ = await fetchProductPage(url);

    // Ürün verilerini parse et
    const productData = $('script').map((_, element) => {
      const content = $(element).html() || '';
      if (content.includes('window.__PRODUCT_DETAIL_APP_INITIAL_STATE__')) {
        try {
          // @ts-ignore - s flag desteği için
          const match = content.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
          if (match) {
            return JSON.parse(match[1]);
          }
        } catch (error) {
          debug(`JSON parse hatası: ${error}`);
        }
      }
      return null;
    }).get().find(data => data !== null);

    if (!productData || !productData.product) {
      throw new Error("Ürün verisi bulunamadı");
    }

    const brand = productData.product.brand?.name || $('.pr-new-br span').first().text().trim() ||
                  $('h1.pr-new-br').first().text().trim();
    debug(`Marka: ${brand}`);

    const productName = productData.product.name || $('.prdct-desc-cntnr-name').text().trim() ||
                       $('.pr-in-w').first().text().trim()
                       .replace(/\d+(\.\d+)?\s*TL.*$/, '')
                       .replace(/\d+,\d+.*$/, '')
                       .replace(/\d+\.?\d*,?\d*\s*(TL)?/g, '')  // More comprehensive price removal
                       .replace(new RegExp(brand, 'gi'), '')
                       .trim();
    debug(`Ürün adı: ${productName}`);

    let title = '';
    if (brand && productName) {
      // Put brand at the start, clean up the title
      title = `${brand} ${productName}`
        .replace(/\d+\.?\d*,?\d*\s*(TL)?/g, '')  // Remove any remaining price
        .replace(/\s+/g, ' ')  // Normalize spaces
        .replace(new RegExp(`${brand}.*${brand}`, 'gi'), brand)  // Remove duplicate brand mentions
        .replace(/(.+?)\s+\1/gi, '$1')  // Remove duplicate phrases
        .replace(/\s*,\s*$/, '')  // Remove trailing comma
        .trim();
    } else {
      throw new ProductDataError("Ürün başlığı oluşturulamadı", "title");
    }

    if (!title) {
      throw new ProductDataError("Ürün başlığı bulunamadı", "title");
    }

    // Fiyat bilgisini al
    const price = productData.product.price?.discountedPrice?.value || 
                  productData.product.price?.sellingPrice?.value;

    if (!price) {
      throw new ProductDataError("Ürün fiyatı bulunamadı", "price");
    }

    const basePrice = price;
    const finalPrice = (basePrice * 1.10).toFixed(2);
    debug(`İşlenmiş fiyat: ${finalPrice} (baz: ${basePrice}, kar marjı: %10)`);

    // Kategori bilgisini güncelle
    let categoryInfo = extractCategories($);
    
    // Eğer kategori hala bulunamadıysa productData'dan doğrudan çekmeyi dene
    if (categoryInfo.categories.length === 1 && categoryInfo.categories[0] === 'Diğer') {
      try {
        if (productData.product.category && productData.product.category.hierarchy) {
          const hierarchy = productData.product.category.hierarchy;
          const categories: string[] = [];
          const fullPath: string[] = [];
          
          debug(`Ürün JSON state'inden kategori hiyerarşisi bulundu`);
          
          // Kategori hiyerarşisini düzleştirme
          if (Array.isArray(hierarchy)) {
            hierarchy.forEach((cat: any) => {
              if (cat.name) {
                categories.push(cat.name);
                fullPath.push(cat.name);
              }
            });
          } else if (typeof hierarchy === 'object') {
            // Nesne olarak sunulmuş kategori hiyerarşisi
            for (const key in hierarchy) {
              if (Object.prototype.hasOwnProperty.call(hierarchy, key) && hierarchy[key].name) {
                categories.push(hierarchy[key].name);
                fullPath.push(hierarchy[key].name);
              }
            }
          }
          
          if (categories.length > 0) {
            categoryInfo = {
              categories,
              fullPath,
              breadcrumbPath: [`Trendyol > ${categories.join(' > ')}`]
            };
            debug(`JSON state'den çekilen kategoriler: ${categories.join(' > ')}`);
          }
        }
      } catch (error) {
        debug(`State parse hatası: ${error}`);
      }
    }

    // Görselleri al
    const images = new Set<string>();
    if (productData.product.images) {
      productData.product.images.forEach((img: any) => {
        if (!img) return; // Null kontrolü
        
        let imgUrl = '';
        if (typeof img === 'string') {
          imgUrl = img;
        } else if (typeof img === 'object' && img.url) {
          imgUrl = img.url;
        }
        
        // URL'leri kontrol et ve temizle
        if (imgUrl && typeof imgUrl === 'string') {
          const normalizedUrl = normalizeImageUrl(imgUrl);
          if (normalizedUrl) images.add(normalizedUrl);
        }
      });
    }

    const uniqueImages = Array.from(images).filter((url, index) => {
      try {
        new URL(url);
        return index < 8; // Maksimum 8 görsel al
      } catch {
        return false;
      }
    });

    // Ürün özelliklerini çek
    const attributes: Record<string, string> = {};

    // Öne Çıkan Özellikler bölümünü çek
    $('.detail-attr-container').each((_, section) => {
      const $section = $(section);
      $section.find('.detail-attr-item').each((_, item) => {
        const $item = $(item);
        const key = $item.find('.detail-attr-key').text().trim();
        const value = $item.find('.detail-attr-value').text().trim();
        if (key && value) {
          attributes[key] = value;
          debug(`Özellik bulundu (detail-attr): ${key} = ${value}`);
        }
      });
    });

    // HTML'den özellikleri çek
    $('.product-feature-container .featured-item').each((_, item) => {
      const $item = $(item);
      const key = $item.find('.feature-name').text().trim();
      const value = $item.find('.feature-value').text().trim();
      if (key && value) {
        attributes[key] = value;
        debug(`Özellik bulundu (featured): ${key} = ${value}`);
      }
    });

    // JSON-LD'den özellikleri çek
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const data = JSON.parse($(element).html() || '');
        if (data.additionalProperty) {
          data.additionalProperty.forEach((prop: any) => {
            if (prop.name && (prop.value || prop.unitText)) {
              attributes[prop.name] = prop.value || prop.unitText;
              debug(`Özellik bulundu (JSON-LD): ${prop.name} = ${prop.value || prop.unitText}`);
            }
          });
        }
      } catch (error) {
        debug(`JSON parse hatası: ${error}`);
      }
    });

    // Varyant bilgilerini çek
    const variants = {
      sizes: [] as string[],
      colors: [] as string[],
      stockInfo: {} as Record<string, any>
    };

    // Varyant verilerini parse et
    if (productData.product) {
      // Renk bilgisini al
      if (productData.product.color) {
        // @ts-ignore - Tip belirtilmediği için
        const colors = productData.product.color.split(',').map((c: string) => c.split('-')[0].trim());
        variants.colors = colors;
        debug(`Renkler bulundu: ${colors.join(', ')}`);
      }

      // Tüm varyant kaynaklarını kontrol et
      const allSizes = new Set<string>();
      const stockInfo: Record<string, any> = {};

      // 1. variants yapısından al
      if (productData.product.variants) {
        productData.product.variants.forEach((v: any) => {
          if ((v.attributeName === "Beden" || v.attributeName === "Numara") && 
              (v.value || v.attributeValue)) {
            const sizeKey = v.value || v.attributeValue;
            stockInfo[sizeKey] = {
              inStock: v.inStock || false,
              sellable: v.sellable || false,
              stock: v.stock || 0
            };

            if (v.inStock || v.sellable) {
              allSizes.add(sizeKey);
            }
          }
        });
      }

      // 2. slicedAttributes yapısından al
      if (productData.product.slicedAttributes) {
        productData.product.slicedAttributes.forEach((attr: any) => {
          if (attr.name === "Beden" || attr.name === "Numara") {
            attr.attributes?.forEach((item: any) => {
              if (item.value) {
                stockInfo[item.value] = {
                  inStock: item.inStock || false,
                  sellable: item.sellable || false,
                  stock: item.stock || 0
                };

                if (item.inStock || item.sellable) {
                  allSizes.add(item.value);
                }
              }
            });
          }
        });
      }

      // 3. allVariants yapısından al
      if (productData.product.allVariants) {
        productData.product.allVariants.forEach((variant: any) => {
          if (variant.value || variant.attributeValue) {
            const sizeKey = variant.value || variant.attributeValue;
            stockInfo[sizeKey] = {
              inStock: variant.inStock || false,
              sellable: variant.sellable || false,
              stock: variant.stock || 0
            };

            if (variant.inStock || variant.sellable) {
              allSizes.add(sizeKey);
            }
          }
        });
      }

      // Bulunan tüm bedenleri variants objesine ekle
      variants.sizes = Array.from(allSizes);
      variants.stockInfo = stockInfo;

      debug(`Tüm bulunan bedenler: ${variants.sizes.join(', ')}`);
      debug(`Stok bilgileri: ${JSON.stringify(stockInfo, null, 2)}`);
    }

    // Kategori konfigürasyonunu al
    const categoryConfig = getCategoryConfig(categoryInfo.categories);
    
    // Ürün nesnesini oluştur
    const product: InsertProduct = {
      url,
      title,
      description: productData.product.description || $('.product-description').text().trim() || "",
      price: finalPrice.toString(),
      basePrice: basePrice.toString(),
      images: uniqueImages,
      video: null,
      variants,
      attributes,
      categories: categoryInfo.categories,
      tags: []
    };
    
    // Etiketleri oluştur ve ürüne ekle
    product.tags = generateProductTags(product, categoryConfig);
    debug(`Oluşturulan etiketler: ${product.tags.join(', ')}`);

    return product;

  } catch (error: any) {
    if (error instanceof ProductDataError) {
      throw error;
    }
    throw new TrendyolScrapingError("Ürün verisi işlenirken hata oluştu", {
      status: 500,
      statusText: "Processing Error",
      details: error.message
    });
  }
}

function parseCategoryPath(categories: string[]): string {
  // Sadeleştirilmiş kategori yolu (en fazla 3 kategori alınır)
  const maxCategories = Math.min(categories.length, 3);
  const selectedCategories = categories.slice(0, maxCategories);
  
  return selectedCategories
    .map(cat => cat.trim())
    .filter(cat => cat && !cat.includes('>'))
    .join(' ) ');
}

// Ürün özelliklerinden anahtar kelimeleri çıkaran yardımcı fonksiyon
function extractKeywordsFromAttributes(attributes: Record<string, string>): string[] {
  const keywords: Set<string> = new Set();
  
  // Özellik isimlerinden ve değerlerinden anahtar kelimeleri çıkar
  for (const [key, value] of Object.entries(attributes)) {
    if (!key || !value) continue;
    
    const lowerKey = key.toLowerCase();
    const lowerValue = value.toLowerCase();
    
    // Önemli özellikler
    if (lowerKey.includes('renk') || lowerKey.includes('color')) {
      keywords.add(value.trim());
      keywords.add(`${value.trim()}_renk`);
    }
    
    if (lowerKey.includes('materyal') || lowerKey.includes('malzeme') || lowerKey.includes('material')) {
      keywords.add(value.trim());
      keywords.add(`${value.trim()}_malzeme`);
    }
    
    if (lowerKey.includes('marka') || lowerKey.includes('brand')) {
      keywords.add(value.trim());
      keywords.add(`${value.trim()}_marka`);
    }
    
    // Elektronik ürün özellikleri
    if (lowerKey.includes('güç') || lowerKey.includes('watt') || lowerKey.includes('power')) {
      keywords.add(value.trim());
      
      // Watt değeri varsa ekle
      const wattMatch = lowerValue.match(/(\d+)\s*w/i);
      if (wattMatch && wattMatch[1]) {
        const watt = parseInt(wattMatch[1]);
        if (watt <= 500) {
          keywords.add('500W_ve_altı');
        } else if (watt <= 1000) {
          keywords.add('500-1000W');
        } else if (watt <= 1500) {
          keywords.add('1000-1500W');
        } else if (watt <= 2000) {
          keywords.add('1500-2000W');
        } else {
          keywords.add('2000W_ve_üstü');
        }
      }
    }
    
    // Elektronik ürünler için
    if (lowerKey.includes('güç') || lowerKey.includes('watt') || lowerKey.includes('power')) {
      keywords.add(`${value.trim()} güç`);
    }
    
    // Kapasiteler
    if (lowerKey.includes('kapasite') || lowerKey.includes('capacity')) {
      keywords.add(`${value.trim()} kapasite`);
    }
    
    // Boyutlar
    if (lowerKey.includes('boyut') || lowerKey.includes('ölçü') || lowerKey.includes('size')) {
      keywords.add(value.trim());
    }
  }
  
  return Array.from(keywords);
}

// Ürün başlığından anahtar kelimeleri çıkaran yardımcı fonksiyon
function extractKeywordsFromTitle(title: string): string[] {
  const keywords: Set<string> = new Set();
  
  // Yaygın elektrikli ev aletleri
  const commonAppliances = [
    'blender', 'mikser', 'rondo', 'robot', 'tost makinesi', 'çay makinesi', 
    'kahve makinesi', 'su ısıtıcı', 'kettle', 'ütü', 'saç kurutma', 'fön', 
    'epilasyon', 'traş makinesi', 'elektrikli süpürge', 'süpürge', 'aspiratör',
    'fryer', 'fritöz', 'airfryer'
  ];
  
  // Ortak özellikleri kontrol et
  const lowerTitle = title.toLowerCase();
  
  for (const appliance of commonAppliances) {
    if (lowerTitle.includes(appliance)) {
      keywords.add(appliance);
    }
  }
  
  // Popüler teknoloji kelimeleri
  const techKeywords = [
    'kablosuz', 'şarjlı', 'akıllı', 'bluetooth', 'wifi', 'led', 
    'dokunmatik', 'otomatik', 'dijital', 'set', 'takım'
  ];
  
  for (const keyword of techKeywords) {
    if (lowerTitle.includes(keyword)) {
      keywords.add(keyword);
    }
  }
  
  return Array.from(keywords);
}

// Ürün için otomatik etiketler oluşturan fonksiyon
function generateProductTags(product: InsertProduct, categoryConfig: any): string[] {
  let tags: string[] = [];
  const MAX_TAG_LENGTH = 20;
  
  // Trendyol sayfasından breadcrumb'ları çekip kullan
  // Breadcrumb kategorilerini filtrele
  const filteredCategories = product.categories
    .filter(cat => {
      const lowercaseCat = cat.toLowerCase();
      return !(
        lowercaseCat === 'trendyol' || 
        lowercaseCat === 'anasayfa' ||
        lowercaseCat === 'philips' ||
        lowercaseCat === 'tefal' ||
        lowercaseCat === 'osg' ||
        lowercaseCat.includes('com')
      );
    })
    .map(cat => cat.trim());
  
  debug(`Filtrelenmiş kategori listesi: ${filteredCategories.join(', ')}`);
  
  // Shopify uyumluluğu için T-shirt etiketleri
  const titleLower = (product.title || '').toLowerCase();
  const isTshirt = titleLower.includes('tişört') || 
                  titleLower.includes('t-shirt') || 
                  titleLower.includes('t shirt');
  
  if (isTshirt) {
    tags.push('T-Shirts');
    tags.push('Apparel');
    tags.push('Clothing');
  }
  
  // Breadcrumb'ı kullanarak etiketleri oluştur
  if (filteredCategories.length > 0) {
    // 1. Etiket: Üst kategori (breadcrumb'ın ilk öğesi)
    if (filteredCategories.length > 0) {
      const ustKategori = filteredCategories[0]
        .replace(/\s+/g, '')
        .substring(0, MAX_TAG_LENGTH);
      
      if (ustKategori && !tags.includes(ustKategori)) {
        tags.push(ustKategori);
      }
    }
    
    // 2. Etiket: Alt kategori (breadcrumb'ın ikinci öğesi)
    if (filteredCategories.length > 1) {
      const altKategori = filteredCategories[1]
        .replace(/\s+/g, '')
        .substring(0, MAX_TAG_LENGTH);
      
      if (altKategori && !tags.includes(altKategori)) {
        tags.push(altKategori);
      }
    }
    
    // 3. Etiket: Ürün tipi (breadcrumb'ın son öğesi)
    if (filteredCategories.length > 2) {
      const urunTipi = filteredCategories[filteredCategories.length - 1]
        .replace(/\s+/g, '')
        .substring(0, MAX_TAG_LENGTH);
      
      // Sadece daha önceden eklenmemişse ekle
      if (urunTipi && !tags.includes(urunTipi)) {
        tags.push(urunTipi);
      }
    }
    
    // Eğer yeterli etiket yoksa, eksikleri tamamla
    if (tags.length < 3) {
      // Renk bilgisini kullan
      for (const [key, value] of Object.entries(product.attributes)) {
        if (!key || !value) continue;
        
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('renk') || lowerKey.includes('color')) {
          const colorTag = value
            .replace(/\s+/g, '')
            .substring(0, MAX_TAG_LENGTH);
            
          if (!tags.includes(colorTag)) {
            tags.push(colorTag);
            if (tags.length >= 5) break;
          }
        }
      }
      
      // Hala 3'e ulaşamadıysak, diğer filtrelenmiş kategorileri ekle
      for (let i = 2; i < filteredCategories.length - 1 && tags.length < 5; i++) {
        // Son öğeyi yukarıda zaten ekledik, burada atlıyoruz
        if (i !== filteredCategories.length - 1) {
          const categoryTag = filteredCategories[i]
            .replace(/\s+/g, '')
            .substring(0, MAX_TAG_LENGTH);
            
          if (!tags.includes(categoryTag)) {
            tags.push(categoryTag);
          }
        }
      }
    }
  }
  
  // Debug - etiketi logla
  debug(`Oluşturulan etiketler: ${tags.join(', ')}`);
  
  // Maksimum 3 etiket
  return tags.slice(0, 3);
}

// URL doğrulama şeması
const productUrlSchema = z.object({
  url: z.string().transform(val => {
    if (!val.startsWith('http')) {
      return 'https://www.' + val.replace(/^www\./, '');
    }
    return val;
  })
});

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  app.post("/api/scrape", async (req, res) => {
    try {
      debug("Scrape isteği alındı");
      const { url } = productUrlSchema.parse(req.body);

      storage.reset();

      debug("Ürün verileri çekiliyor");
      const product = await scrapeProduct(url);
      
      // Kategori ayarlarını al ve etiketleri oluştur
      const categoryConfig = getCategoryConfig(product.categories);
      // Ürün başarıyla çekildi, kaydediliyor
      debug("Ürün başarıyla çekildi, kaydediliyor");
      const saved = await storage.saveProduct(product);

      res.json(saved);

    } catch (error) {
      debug("API hatası");
      const { status, message, details } = handleError(error);
      res.status(status).json({ message, details });
    }
  });

  app.all("/api/export", async (req, res) => {
    try {
      debug("CSV export isteği alındı");
      
      let productToExport = null;
      
      // URL parametresi varsa önce onu kontrol et (GET isteği için)
      if (req.query.url) {
        const url = req.query.url as string;
        debug(`Query URL parametresine göre ürün alınıyor: ${url}`);
        productToExport = await storage.getProduct(url);
      }
      // Önce request body'den ürün bilgisini almayı dene (POST isteği için)
      else if (req.body?.product && req.body.product.title) {
        debug("İstek ile gönderilen ürün bilgisi kullanılıyor");
        productToExport = req.body.product;
      } 
      // İstek ile ürün gönderilmediyse ve body.url varsa, URL'ye göre ürünü al
      else if (req.body?.url) {
        debug(`URL'ye göre ürün alınıyor: ${req.body.url}`);
        productToExport = await storage.getProduct(req.body.url);
      }
      // Son olarak geçmişten son URL'yi kullan
      else {
        debug("İstek içinde ürün bilgisi bulunamadı, depodan son ürün alınıyor");
        const history = storage.getHistory();
        if (history.length > 0) {
          const lastUrl = history[0];
          debug(`Son URL'den ürün alınıyor: ${lastUrl}`);
          productToExport = await storage.getProduct(lastUrl);
        }
      }
      
      // Hala ürün bulunamadıysa hata döndür
      if (!productToExport) {
        debug("Hiçbir ürün bulunamadı");
        return res.status(404).json({ 
          message: "Ürün bulunamadı. Lütfen önce bir ürün çekin (Ürünü Getir butonuna tıklayın)." 
        });
      }
      
      // Ürün verilerini kontrol et
      if (!productToExport.title || !productToExport.price) {
        debug("Ürün verileri eksik", productToExport);
        return res.status(400).json({ 
          message: "Ürün bilgileri eksik. Lütfen tekrar ürün çekin." 
        });
      }
      
      debug(`Dışa aktarılacak ürün: ${productToExport.title}`);
      if (productToExport.categories) {
        debug(`Ürün kategorileri: ${productToExport.categories.join(', ')}`);
      }

      // productToExport kullan (product yerine)
      const categoryConfig = getCategoryConfig(productToExport.categories);
      const categoryPath = parseCategoryPath(productToExport.categories);
      
      // Otomatik etiketler oluştur
      const productTags = generateProductTags(productToExport, categoryConfig);
      debug(`Oluşturulan etiketler: ${productTags.join(', ')}`);

      // Handle oluştur (URL'den)
      const handle = productToExport.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const csvRows = [];

      // Body HTML oluştur
      const generateProductBody = (description: string, attributes: Record<string, string>) => {
        let html = description ? `<p>${description}</p>\n\n` : '';

        if (Object.keys(attributes).length > 0) {
          html += `<h3>Ürün Özellikleri</h3>\n<ul>`;
          for (const [key, value] of Object.entries(attributes)) {
            html += `\n  <li><strong>${key}:</strong> ${value}</li>`;
          }
          html += '\n</ul>';
        }

        return html;
      };

      // Ana ürün bilgileri - Shopify'dan alınan örnek dosyaya göre
      const baseProduct = {
        handle,
        title: productToExport.title,
        body: generateProductBody(productToExport.description, productToExport.attributes),
        vendor: 'turmarkt', // Tüm ürünler için sabit satıcı adı
        product_category: categoryConfig.shopifyCategory || 'Apparel & Accessories > Clothing',
        type: productToExport.categories[productToExport.categories.length - 1] || 'Giyim',
        tags: productTags.join(','),
        published: 'true', // Her zaman yayınlanmış olmalı - true olarak değiştirildi (küçük harf)
        option1_name: 'Title', // Varsayılan olarak en az bir seçenek gerekiyor
        option1_value: 'Default Title', // Varsayılan değer
        option2_name: '',
        option2_value: '',
        option3_name: '',
        option3_value: '',
        variant_sku: handle, // Varsayılan SKU
        variant_grams: '500', // 0.5kg = 500 gram
        variant_inventory_tracker: 'shopify',
        variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
        variant_inventory_policy: 'deny',
        variant_fulfillment_service: 'manual', // Zorunlu alan
        variant_price: productToExport.price, // Fiyat alanını açıkça belirle
        variant_compare_at_price: '', // Compare at price değil normal fiyat kullan
        variant_requires_shipping: 'true', // Boolean değer küçük harfle
        variant_taxable: 'true', // Boolean değer küçük harfle
        variant_barcode: '',
        image_src: '',
        image_position: '',
        image_alt_text: productToExport.title || '',
        gift_card: 'false', // Boolean değer küçük harfle
        seo_title: productToExport.title || '',
        seo_description: productToExport.description || '',
        google_shopping_metafields: categoryConfig.shopifyCategory || '',
        google_shopping_age_group: '',
        google_shopping_gender: '',
        google_shopping_mpn: '',
        google_shopping_adwords_grouping: '',
        google_shopping_adwords_labels: '',
        google_shopping_condition: 'New',
        google_shopping_custom_product: '',
        google_shopping_custom_label_0: '',
        google_shopping_custom_label_1: '',
        google_shopping_custom_label_2: '',
        google_shopping_custom_label_3: '',
        google_shopping_custom_label_4: '',
        variant_image: '',
        variant_weight_unit: 'g',
        variant_tax_code: '',
        cost_per_item: '',
        status: 'active' // Status değerini 'active' olarak ayarla
      };

      const variants = productToExport.variants || {};
      const hasVariants = variants.sizes?.length > 0 || variants.colors?.length > 0;

      // Hata ayıklama için varyant sayısını kaydet
      debug(`Varyant kontrol: ${hasVariants ? 'Varyantlar var' : 'Varyant yok'}`);
      if (variants.sizes) debug(`Beden sayısı: ${variants.sizes.length}`);
      if (variants.colors) debug(`Renk sayısı: ${variants.colors.length}`);
      
      if (hasVariants) {
        const sizes = variants.sizes || [];
        const colors = variants.colors || [];

        debug(`Varyantlar: ${sizes.length} beden, ${colors.length} renk`);
        
        // Ürün türüne göre özel kontrol
        // Ürün kategorilerinde belirli anahtar kelimeleri arayalım
        const isKitchenProduct = productToExport.categories.some((cat: string) => 
          cat.toLowerCase().includes('mutfak') || 
          cat.toLowerCase().includes('kitchen') || 
          cat.toLowerCase().includes('saklama')
        );
        
        // Ayakkabı/terlik ürün kontolü
        const isShoeProduct = productToExport.categories.some((cat: string) => 
          cat.toLowerCase().includes('ayakkabı') || 
          cat.toLowerCase().includes('shoe') || 
          cat.toLowerCase().includes('terlik') || 
          cat.toLowerCase().includes('sandalet') || 
          cat.toLowerCase().includes('bot') || 
          cat.toLowerCase().includes('çizme')
        );
        
        // Shopify'ın beklediği standart İngilizce adlar kullan
        // Seçenek adlarını tüm ürünler için standartlaştır
        if (sizes.length > 0) {
          baseProduct.option1_name = 'Size'; // Şart: Tüm ürünlerde Size olmalı (Shopify standardı)
        }
        
        if (colors.length > 0) {
          // Sadece bir renk varsa ve tek varyant olacaksa Title/Default Title kullan
          if (colors.length === 1 && sizes.length === 0 && (isKitchenProduct || isShoeProduct)) {
            baseProduct.option1_name = 'Title';
          } else {
            // Eğer Size varsa Color ikinci seçenek olmalı
            baseProduct.option2_name = 'Color'; // Şart: Tüm ürünlerde Color olmalı (Shopify standardı)
          }
        }

        // Her ürün türü için şablona tam olarak uyan varyantlar oluştur
        
        // 1. Beden ve renk varyantları (örn. ayakkabılar, giysiler)
        if (sizes.length > 0 && colors.length > 0) {
          // İlk satır - ürün bilgileri
          const firstVariant = {
            ...baseProduct,
            option1_name: 'Size',
            option1_value: sizes[0],
            option2_name: 'Color',
            option2_value: colors[0],
            variant_sku: `${handle}-${sizes[0]}-${colors[0]}`,
            variant_price: productToExport.price,
            variant_inventory_policy: 'deny',
            variant_fulfillment_service: 'manual',
            variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
            status: 'active'
          };
          csvRows.push(firstVariant);
          debug(`İlk varyant satırı eklendi: ${sizes[0]} ${colors[0]}`);
          
          // Diğer varyant satırları - sadece gerekli bilgiler
          let counter = 1;
          for (const size of sizes) {
            for (const color of colors) {
              // İlk varyantı atla, zaten ekledik
              if (counter === 1) {
                counter++;
                continue;
              }
              
              const variant = {
                handle,
                title: '',
                body: '',
                vendor: '',
                product_category: '',
                type: '',
                tags: '',
                published: '',
                option1_name: 'Size',
                option1_value: size,
                option2_name: 'Color',
                option2_value: color,
                option3_name: '',
                option3_value: '',
                variant_sku: `${handle}-${size}-${color}`,
                variant_grams: '',
                variant_inventory_tracker: 'shopify',
                variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
                variant_inventory_policy: 'deny',
                variant_fulfillment_service: 'manual',
                variant_price: productToExport.price,
                variant_compare_at_price: '',
                variant_requires_shipping: 'true',
                variant_taxable: 'true',
                variant_barcode: '',
                status: 'active'
              };
              csvRows.push(variant);
              debug(`Varyant satırı eklendi: ${size} ${color}`);
              counter++;
            }
          }
        }
        // 2. Sadece beden varyantları (örn. tek renkli ürünler)
        else if (sizes.length > 0 && colors.length === 0) {
          // İlk satır - ürün bilgileri
          const firstVariant = {
            ...baseProduct,
            option1_name: 'Size',
            option1_value: sizes[0],
            variant_sku: `${handle}-${sizes[0]}`,
            variant_price: productToExport.price,
            variant_inventory_policy: 'deny',
            variant_fulfillment_service: 'manual',
            variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
            status: 'active'
          };
          csvRows.push(firstVariant);
          debug(`İlk beden varyantı eklendi: ${sizes[0]}`);
          
          // Diğer varyant satırları - sadece gerekli bilgiler
          for (let i = 1; i < sizes.length; i++) {
            const variant = {
              handle,
              title: '',
              body: '',
              vendor: '',
              product_category: '',
              type: '',
              tags: '',
              published: '',
              option1_name: 'Size',
              option1_value: sizes[i],
              option2_name: '',
              option2_value: '',
              option3_name: '',
              option3_value: '',
              variant_sku: `${handle}-${sizes[i]}`,
              variant_grams: '',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_price: productToExport.price,
              variant_compare_at_price: '',
              variant_requires_shipping: 'true',
              variant_taxable: 'true',
              variant_barcode: '',
              status: 'active'
            };
            csvRows.push(variant);
            debug(`Beden varyantı eklendi: ${sizes[i]}`);
          }
        }
        // 3. Sadece renk varyantları (örn. bazı ev/mutfak ürünleri)
        else if (sizes.length === 0 && colors.length > 0) {
          // 3.1 Özel ürünler için tek varyant (Title/Default Title)
          if ((isKitchenProduct || isShoeProduct) && colors.length === 1) {
            const variant = {
              ...baseProduct,
              option1_name: 'Title',
              option1_value: 'Default Title',
              variant_sku: handle,
              variant_price: productToExport.price,
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
              status: 'active'
            };
            csvRows.push(variant);
            debug(`Tekli ürün varyantı eklendi: Default Title`);
          }
          // 3.2 Çok renkli özel ürünler
          else {
            // İlk satır - ürün bilgileri
            const firstVariant = {
              ...baseProduct,
              option1_name: 'Color',
              option1_value: colors[0],
              variant_sku: `${handle}-${colors[0]}`,
              variant_price: productToExport.price,
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
              status: 'active'
            };
            csvRows.push(firstVariant);
            debug(`İlk renk varyantı eklendi: ${colors[0]}`);
            
            // Diğer varyant satırları - sadece gerekli bilgiler
            for (let i = 1; i < colors.length; i++) {
              const variant = {
                handle,
                title: '',
                body: '',
                vendor: '',
                product_category: '',
                type: '',
                tags: '',
                published: '',
                option1_name: 'Color',
                option1_value: colors[i],
                option2_name: '',
                option2_value: '',
                option3_name: '',
                option3_value: '',
                variant_sku: `${handle}-${colors[i]}`,
                variant_grams: '',
                variant_inventory_tracker: 'shopify',
                variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
                variant_inventory_policy: 'deny',
                variant_fulfillment_service: 'manual',
                variant_price: productToExport.price,
                variant_compare_at_price: '',
                variant_requires_shipping: 'true',
                variant_taxable: 'true',
                variant_barcode: '',
                status: 'active'
              };
              csvRows.push(variant);
              debug(`Renk varyantı eklendi: ${colors[i]}`);
            }
          }
        }
      } else {
        // Varyantsız ürün için tek bir satır - Shopify formatına uygun
        const defaultVariant = {
          ...baseProduct,
          option1_name: 'Title', // Tek varyantlı ürünler için gerekli
          option1_value: 'Default Title', // Tek varyantlı ürünler için gerekli
          variant_sku: handle,
          variant_price: productToExport.price,
          variant_inventory_policy: 'deny', // Shopify için gerekli
          variant_fulfillment_service: 'manual', // Shopify için gerekli
          variant_inventory_qty: categoryConfig.variantConfig?.defaultStock || 50,
          status: 'active' // Aktif durumda olduğunu belirt
        };
        csvRows.push(defaultVariant);
        debug(`Tek varyant satırı eklendi: ${handle}`);
      }
      
      debug(`CSV satır sayısı (görseller hariç): ${csvRows.length}`);
      
      // CSV satırlarının var olup olmadığını kontrol et
      if (csvRows.length === 0) {
        debug("CSV satırları oluşturulamadı, manuel olarak ekle");
        // Son çare: Her durumda en azından bir satır olmasını sağla
        const DEFAULT_IMAGE_URL = "https://cdn.dsmcdn.com/assets/product/media/images/no-image-v2.png";
        
        const manualRow = {
          handle,
          title: productToExport.title || "Ürün",
          body: generateProductBody(productToExport.description, productToExport.attributes),
          vendor: 'turmarkt', // Tüm ürünler için sabit satıcı adı
          product_category: categoryConfig.shopifyCategory || 'Apparel & Accessories > Clothing',
          type: productToExport.categories && productToExport.categories.length > 0 
            ? productToExport.categories[productToExport.categories.length - 1] 
            : 'Giyim',
          tags: productTags.join(','),
          published: 'true',
          option1_name: 'Title',
          option1_value: 'Default Title',
          option2_name: '',
          option2_value: '',
          option3_name: '',
          option3_value: '',
          variant_sku: handle,
          variant_grams: '500',
          variant_inventory_tracker: 'shopify',
          variant_inventory_qty: 50,
          variant_inventory_policy: 'deny',
          variant_fulfillment_service: 'manual',
          variant_price: productToExport.price || "0",
          variant_compare_at_price: '',
          variant_requires_shipping: 'true',
          variant_taxable: 'true',
          variant_barcode: '',
          image_src: DEFAULT_IMAGE_URL,
          image_position: "1",
          image_alt_text: (productToExport.title || "Ürün"),
          gift_card: 'false',
          status: 'active'
        };
        
        csvRows.push(manualRow);
        debug("Manuel satır eklendi, varsayılan görsel kullanıldı");
      }

      // ******************************************
      // ** GÖRSEL İŞLEME - CSV için görsel URL'lerini hazırla **
      // ******************************************
      
      // MAX_IMAGES sabiti yukarıda tanımlandı
      
      // CSV için görsellerimizi hazırlayalım
      debug(`Görsel işleme başlıyor: ${productToExport.images ? productToExport.images.length : 0} adet görsel var`);
      
      // Görsel URL'lerini işle ve geçerli olanları filtrele
      let validImages: string[] = [];
      
      if (productToExport.images && Array.isArray(productToExport.images)) {
        validImages = productToExport.images
          // Boş ve geçersiz URL'leri filtrele
          .filter((url: string) => {
            if (!url || typeof url !== 'string' || url.trim() === '') {
              return false;
            }
            
            try {
              new URL(url);
              return true;
            } catch (e) {
              debug(`Geçersiz URL: ${url}`);
              return false;
            }
          })
          // URL'leri normalize et
          .map((url: string) => {
            let processed = url.trim();
            
            // Görsel uzantısı ekle - bazı URL'ler uzantısız olabiliyor
            if (!processed.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) {
              processed += '.jpg';
            }
            
            // CDN URL'lerini HTTP yerine HTTPS olarak ayarla
            if (processed.startsWith('http://') && processed.includes('cdn.')) {
              processed = processed.replace('http://', 'https://');
            }
            
            return processed;
          })
          // Görsel sayısını sınırla
          .slice(0, MAX_IMAGES);
      }
      
      debug(`Geçerli görsel sayısı: ${validImages.length}`);
      
      // En az bir görsel olduğundan emin ol
      const productImages = validImages.length > 0 
        ? validImages 
        : [DEFAULT_IMAGE_URL];
      
      // İlk satıra ana görseli ekle
      if (csvRows.length > 0) {
        csvRows[0] = {
          ...csvRows[0],
          image_src: productImages[0],
          image_position: '1'
        };
        
        // Diğer görseller için ek satırlar ekle
        for (let i = 1; i < productImages.length; i++) {
          if (!productImages[i]) continue;
          
          // Shopify için görsel formatı - yalnızca handle ve görsel bilgilerini içerir
          csvRows.push({
            handle, // Handle hep sabit olmalı
            title: '', // Boş kalmalı
            body: '', // Boş kalmalı
            vendor: '',
            product_category: '',
            type: '',
            tags: '',
            published: 'true', // Görsellerin de yayınlanması gerekiyor
            option1_name: 'Title', // Ana ürünle aynı seçenek adı olmalı
            option1_value: 'Default Title', // Ana ürünle aynı seçenek değeri olmalı
            option2_name: '',
            option2_value: '',
            option3_name: '',
            option3_value: '',
            variant_sku: '',
            variant_grams: '',
            variant_inventory_tracker: '',
            variant_inventory_qty: '',
            variant_inventory_policy: 'deny', // Shopify için 'deny' değeri gerekli
            variant_fulfillment_service: 'manual', // Shopify için 'manual' değeri gerekli
            variant_price: '',
            variant_compare_at_price: '',
            variant_requires_shipping: '',
            variant_taxable: '',
            variant_barcode: '',
            image_src: productImages[i],
            image_position: (i + 1).toString(),
            image_alt_text: `${productToExport.title || 'Ürün'} - Görsel ${i + 1}`,
            gift_card: '',
            seo_title: '',
            seo_description: '',
            google_shopping_metafields: '',
            google_shopping_age_group: '',
            google_shopping_gender: '',
            google_shopping_mpn: '',
            google_shopping_adwords_grouping: '',
            google_shopping_adwords_labels: '',
            google_shopping_condition: '',
            google_shopping_custom_product: '',
            google_shopping_custom_label_0: '',
            google_shopping_custom_label_1: '',
            google_shopping_custom_label_2: '',
            google_shopping_custom_label_3: '',
            google_shopping_custom_label_4: '',
            variant_image: '',
            variant_weight_unit: '',
            variant_tax_code: '',
            cost_per_item: '',
            status: 'active' // Görsel satırlarının da aktif olması gerekiyor
          });
        }
        
        // Son kontrol - boş görsel URL'lerini varsayılan ile değiştir ve boolean değerleri kontrol et
        csvRows.forEach((row: any) => {
          // Görsel URL kontrol
          if (!row.image_src || row.image_src.trim() === '') {
            row.image_src = DEFAULT_IMAGE_URL;
          }
          
          // Boolean değerleri küçük harfe çevir - Shopify'ın beklediği format
          if (row.published === 'TRUE') row.published = 'true';
          if (row.published === 'FALSE') row.published = 'false';
          
          if (row.variant_requires_shipping === 'TRUE') row.variant_requires_shipping = 'true';
          if (row.variant_requires_shipping === 'FALSE') row.variant_requires_shipping = 'false';
          
          if (row.variant_taxable === 'TRUE') row.variant_taxable = 'true';
          if (row.variant_taxable === 'FALSE') row.variant_taxable = 'false';
          
          if (row.gift_card === 'TRUE') row.gift_card = 'true';
          if (row.gift_card === 'FALSE') row.gift_card = 'false';
          
          // Variant Fulfillment Service alanı zorunlu olarak 'manual' olmalı
          row.variant_fulfillment_service = 'manual';
        });
        
        debug(`CSV görsel ekleme tamamlandı: ${productImages.length} görsel eklendi`);
      }

      // CSV başlıklarını oluştur - TAM Shopify.com örnek dosyasından alınan başlıklarla
      const csvWriter = createObjectCsvWriter({
        path: join(tmpdir(), 'shopify_products.csv'),
        header: [
          { id: 'title', title: 'Title' },
          { id: 'handle', title: 'URL handle' },
          { id: 'body', title: 'Description' },
          { id: 'vendor', title: 'Vendor' },
          { id: 'product_category', title: 'Product category' },
          { id: 'type', title: 'Type' },
          { id: 'tags', title: 'Tags' },
          { id: 'published', title: 'Published on online store' },
          { id: 'status', title: 'Status' },
          { id: 'variant_sku', title: 'SKU' },
          { id: 'variant_barcode', title: 'Barcode' },
          { id: 'option1_name', title: 'Option1 name' },
          { id: 'option1_value', title: 'Option1 value' },
          { id: 'option2_name', title: 'Option2 name' },
          { id: 'option2_value', title: 'Option2 value' },
          { id: 'option3_name', title: 'Option3 name' },
          { id: 'option3_value', title: 'Option3 value' },
          { id: 'variant_price', title: 'Price' },
          { id: 'intl_price', title: 'Price / International' },
          { id: 'variant_compare_at_price', title: 'Compare-at price' },
          { id: 'intl_compare_at_price', title: 'Compare-at price / International' },
          { id: 'cost_per_item', title: 'Cost per item' },
          { id: 'variant_taxable', title: 'Charge tax' },
          { id: 'tax_code', title: 'Tax code' },
          { id: 'variant_inventory_tracker', title: 'Inventory tracker' },
          { id: 'variant_inventory_qty', title: 'Inventory quantity' },
          { id: 'variant_inventory_policy', title: 'Continue selling when out of stock' },
          { id: 'variant_grams', title: 'Weight value (grams)' },
          { id: 'variant_weight_unit', title: 'Weight unit for display' },
          { id: 'variant_requires_shipping', title: 'Requires shipping' },
          { id: 'variant_fulfillment_service', title: 'Fulfillment service' },
          { id: 'image_src', title: 'Product image URL' },
          { id: 'image_position', title: 'Image position' },
          { id: 'image_alt_text', title: 'Image alt text' },
          { id: 'variant_image', title: 'Variant image URL' },
          { id: 'gift_card', title: 'Gift card' },
          { id: 'seo_title', title: 'SEO title' },
          { id: 'seo_description', title: 'SEO description' },
          { id: 'google_shopping_metafields', title: 'Google Shopping / Google product category' },
          { id: 'google_shopping_gender', title: 'Google Shopping / Gender' },
          { id: 'google_shopping_age_group', title: 'Google Shopping / Age group' },
          { id: 'google_shopping_mpn', title: 'Google Shopping / MPN' },
          { id: 'google_shopping_adwords_grouping', title: 'Google Shopping / AdWords Grouping' },
          { id: 'google_shopping_adwords_labels', title: 'Google Shopping / AdWords labels' },
          { id: 'google_shopping_condition', title: 'Google Shopping / Condition' },
          { id: 'google_shopping_custom_product', title: 'Google Shopping / Custom product' },
          { id: 'google_shopping_custom_label_0', title: 'Google Shopping / Custom label 0' },
          { id: 'google_shopping_custom_label_1', title: 'Google Shopping / Custom label 1' },
          { id: 'google_shopping_custom_label_2', title: 'Google Shopping / Custom label 2' },
          { id: 'google_shopping_custom_label_3', title: 'Google Shopping / Custom label 3' },
          { id: 'google_shopping_custom_label_4', title: 'Google Shopping / Custom label 4' }
        ]
      });

      // Son kontrol
      debug(`CSV yazılıyor: ${csvRows.length} satır oluşturuldu`);
      
      if (csvRows.length === 0) {
        return res.status(400).json({ message: "CSV satırları oluşturulamadı, lütfen tekrar ürün çekin." });
      }
      
      try {
        // CSV dosyasını yaz
        await csvWriter.writeRecords(csvRows);
        
        // CSV dosyasını oluşum durumunu kontrol et
        const csvPath = join(tmpdir(), 'shopify_products.csv');
        
        // CSV dosyasının yazıldığı bilgisini logla
        debug(`CSV yazıldı: ${csvPath}`);
        
        try {
          // Dosya adı oluşturma - timestamp ekleyerek benzersiz olmasını sağla
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const safeTitle = productToExport.title
            ? productToExport.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)
            : 'product';
          const filename = `shopify_${safeTitle}_${timestamp}.csv`;
          
          // CSV dosyasını oku
          const csvData = fs.readFileSync(csvPath, 'utf8');
          
          // Tarayıcı önbelleğini devre dışı bırak
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          
          // CSV dosyasını gönder
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.status(200).send(csvData);
          debug(`CSV indirme başarılı: ${filename}`);
        } catch (readError) {
          debug("CSV okuma hatası:", readError);
          
          // Okuma hatası olursa klasik download() fonksiyonunu kullan
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const safeTitle = productToExport.title
            ? productToExport.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)
            : 'product';
          const filename = `shopify_${safeTitle}_${timestamp}.csv`;
          
          // Tarayıcı önbelleğini devre dışı bırak
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          
          res.download(csvPath, filename, (err) => {
            if (err) {
              debug("CSV indirme hatası:", err);
              return res.status(500).json({ message: "CSV indirme hatası: " + err.message });
            }
            debug(`CSV indirme başarılı (download metodu): ${filename}`);
          });
        }
      } catch (csvError: any) { // Type assertion to fix TypeScript error
        debug("CSV yazma hatası:", csvError);
        return res.status(500).json({ message: "CSV oluşturma hatası: " + (csvError.message || "Bilinmeyen hata") });
      }

    } catch (error: any) {
      debug("CSV export hatası");
      const { status, message, details } = handleError(error);
      res.status(status).json({ message, details });
    }
  });

  return httpServer;
}