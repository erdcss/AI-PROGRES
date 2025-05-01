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
  try {
    url = url.split('?')[0];

    if (url.match(/\.(mp4|webm|ogg|mov)$/i)) {
      debug(`Video dosyası filtrelendi: ${url}`);
      return '';
    }

    if (!url.match(/\.(jpg|jpeg|png|webp)$/i)) {
      debug(`Desteklenmeyen dosya formatı: ${url}`);
      return '';
    }

    if (url.includes('/ty')) {
      url = `https://cdn.dsmcdn.com${url}`;
    }

    if (url.startsWith('//')) {
      url = 'https:' + url;
    } else if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    url = url.replace(/\/mnresize\/\d+\/\d+\//, '/');
    url = url.replace(/_\d+x\d+/, '');

    if (!url.includes('_org_zoom')) {
      url = url.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.$1');
    }

    debug(`Normalize edilmiş görsel URL: ${url}`);
    return url;
  } catch (error: any) {
    debug(`URL normalizasyon hatası: ${error.message}`);
    return '';
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
  
  $('.breadcrumb-wrapper .breadcrumb li').each((_, el) => {
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

  // Alternatif kategori çekme yöntemi
  if (categories.length === 0) {
    $('.product-container .product-detail-container [data-tracker-id="Category Info"]').each((_, el) => {
      const category = $(el).text().trim();
      if (category) {
        const parts = category.split('>').map(part => part.trim());
        categories.push(...parts);
        fullPath.push(...parts);
      }
    });
    debug(`Ürün detayından kategoriler alındı: ${categories.join(', ')}`);
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
    const finalPrice = (basePrice * 1.15).toFixed(2);
    debug(`İşlenmiş fiyat: ${finalPrice} (baz: ${basePrice})`);

    // Kategori bilgisini güncelle
    const categoryInfo = extractCategories($);

    // Görselleri al
    const images = new Set<string>();
    if (productData.product.images) {
      productData.product.images.forEach((img: any) => {
        const imgUrl = normalizeImageUrl(typeof img === 'string' ? img : img.url);
        if (imgUrl) images.add(imgUrl);
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
  return categories
    .map(cat => cat.trim())
    .filter(cat => cat && !cat.includes('>'))
    .join(' > ');
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
    }
    
    if (lowerKey.includes('materyal') || lowerKey.includes('malzeme') || lowerKey.includes('material')) {
      keywords.add(value.trim());
    }
    
    if (lowerKey.includes('marka') || lowerKey.includes('brand')) {
      keywords.add(value.trim());
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
  const allTags: Set<string> = new Set();
  const title = product.title.toLowerCase();
  const categories = product.categories.map(c => c.toLowerCase());
  const joinedCategories = categories.join(' ');
  
  // Trendyol breadcrumb'dan alınan tam kategori yolunu ekle
  if (product.url) {
    try {
      const $ = cheerio.load(`<div>${product.url}</div>`);
      const breadcrumbPath = extractCategories($).breadcrumbPath;
      if (breadcrumbPath && breadcrumbPath.length > 0) {
        for (const path of breadcrumbPath) {
          allTags.add(`B> ${path}`);
        }
      }
    } catch (error) {
      debug(`Breadcrumb çekilirken hata oluştu: ${error}`);
    }
  }
  
  // Kategori zincirini oluştur (Trendyol hiyerarşisi)
  if (categories.length > 0) {
    // Kategori zincirini oluştur
    let categoryChain = "";
    for (let i = 0; i < categories.length; i++) {
      if (categories[i]) {
        // İlk kategori için _ ekle, diğerleri için ) ekle
        if (i === 0) {
          categoryChain = `_ ${categories[i].trim()}`;
        } else {
          categoryChain += ` ) ${categories[i].trim()}`;
        }
        
        // Her kategori zincirini ekle
        allTags.add(categoryChain);
      }
    }
    
    // Eski biçimdeki kategori yolunu da ekle (geriye dönük uyumluluk için)
    allTags.add(`${categories.join(' > ')}`);
  }
  
  // Shopify kategorilerini de ekle - Excel dosyasından eşleştirme
  if (categoryConfig && categoryConfig.shopifyCategory) {
    const shopifyCategories = categoryConfig.shopifyCategory.split(' > ');
    
    // Ana Shopify kategorisi
    if (shopifyCategories.length > 0) {
      allTags.add(`$${shopifyCategories[0]}`);
    }
    
    // Shopify alt kategorileri
    if (shopifyCategories.length > 1) {
      let shopifyCategoryChain = `$${shopifyCategories[0]}`;
      for (let i = 1; i < shopifyCategories.length; i++) {
        shopifyCategoryChain += ` > ${shopifyCategories[i]}`;
        allTags.add(shopifyCategoryChain);
      }
    }
  }
  
  // Eski kategoriler için uyumluluk sağla (# ile)
  for (const category of categories) {
    if (category) {
      allTags.add(`#${category.replace(/\s+/g, '')}`);
    }
  }
  
  // Ürün özelliklerinden otomatik anahtar kelimeler çıkar (@ ile)
  const attributeKeywords = extractKeywordsFromAttributes(product.attributes);
  for (const keyword of attributeKeywords) {
    allTags.add(`@${keyword.replace(/\s+/g, '_')}`);
  }
  
  // Ürün başlığından otomatik anahtar kelimeler çıkar (@ ile)
  const titleKeywords = extractKeywordsFromTitle(product.title);
  for (const keyword of titleKeywords) {
    allTags.add(`@${keyword.replace(/\s+/g, '_')}`);
  }
  
  // Ana Kategori Etiketleri - Bunlar Shopify'da koleksiyonlara ekleme için
  if (joinedCategories.includes('kadın')) {
    allTags.add('#kadın');
  }
  
  if (joinedCategories.includes('erkek')) {
    allTags.add('#erkek');
  }
  
  if (joinedCategories.includes('çocuk') || joinedCategories.includes('cocuk')) {
    allTags.add('#çocuk');
  }
  
  // Ürün Tür Etiketleri
  if (joinedCategories.includes('giyim') || 
      joinedCategories.includes('elbise') || 
      joinedCategories.includes('pantolon') || 
      joinedCategories.includes('gömlek')) {
    allTags.add('#giyim');
  }
  
  if (joinedCategories.includes('aksesuar') || 
      joinedCategories.includes('takı') || 
      joinedCategories.includes('saat')) {
    allTags.add('#aksesuar');
  }
  
  if (joinedCategories.includes('ayakkabı') || 
      joinedCategories.includes('bot') || 
      joinedCategories.includes('çizme')) {
    allTags.add('#ayakkabı');
  }
  
  if (joinedCategories.includes('çanta') || 
      joinedCategories.includes('cüzdan')) {
    allTags.add('#çanta');
  }
  
  if (joinedCategories.includes('elektronik') || 
      joinedCategories.includes('telefon') || 
      joinedCategories.includes('bilgisayar')) {
    allTags.add('#elektronik');
  }
  
  if (joinedCategories.includes('ev') || 
      joinedCategories.includes('mobilya') || 
      joinedCategories.includes('dekorasyon')) {
    allTags.add('#evyaşam');
  }
  
  if (joinedCategories.includes('kozmetik') || 
      joinedCategories.includes('makyaj') || 
      joinedCategories.includes('parfüm') ||
      joinedCategories.includes('cilt bakım')) {
    allTags.add('#kozmetik');
    allTags.add('#kişiselbakım');
  }
  
  // Özel ürün tipleri için
  if (title.includes('saç maşası') || 
      (title.includes('saç') && title.includes('maşa'))) {
    allTags.add('#kadın');
    allTags.add('#kişiselbakımürünleri');
    allTags.add('#saçbakımürünleri');
    allTags.add('#saçmaşası');
  }
  
  if ((title.includes('telefon') && title.includes('kılıf')) || 
      title.includes('telefon kılıfı')) {
    allTags.add('#telefon');
    allTags.add('#telefonaksesuarları');
    allTags.add('#telefonkılıfları');
  }
  
  // Ana Shopify kategorisi için etiket
  if (categoryConfig && categoryConfig.shopifyCategory) {
    const shopifyCategories = categoryConfig.shopifyCategory.split(' > ');
    for (const cat of shopifyCategories) {
      if (cat && cat !== 'Other') {
        allTags.add(`#${cat.toLowerCase().replace(/\s+/g, '')}`);
      }
    }
  }
  
  return Array.from(allTags);
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

  app.post("/api/export", async (req, res) => {
    try {
      const { product } = req.body;
      if (!product) {
        throw new Error("Ürün verisi bulunamadı");
      }

      // Ürün verilerini kontrol et
      if (!product.title || !product.price) {
        throw new Error("Gerekli ürün bilgileri eksik");
      }

      const categoryConfig = getCategoryConfig(product.categories);
      const categoryPath = parseCategoryPath(product.categories);
      
      // Otomatik etiketler oluştur
      const productTags = generateProductTags(product, categoryConfig);
      debug(`Oluşturulan etiketler: ${productTags.join(', ')}`);

      // Handle oluştur (URL'den)
      const handle = product.title
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

      // Ana ürün bilgileri
      const baseProduct = {
        handle,
        title: product.title,
        body: generateProductBody(product.description, product.attributes),
        vendor: product.categories[0] || 'Trendyol',
        product_category: categoryConfig.shopifyCategory,
        custom_category: categoryPath,
        type: product.categories[product.categories.length - 1] || 'Giyim',
        tags: productTags.join(', '),
        published: 'TRUE',
        option1_name: '',
        option1_value: '',
        option2_name: '',
        option2_value: '',
        variant_sku: '',
        variant_price: '',
        variant_inventory_policy: 'deny',
        variant_inventory_quantity: 0,
        variant_weight: '0.5',
        variant_weight_unit: 'kg',
        status: 'active', // Status değerini 'active' olarak ayarla
        image_src: '',
        image_position: ''
      };

      const variants = product.variants || {};
      const hasVariants = variants.sizes?.length > 0 || variants.colors?.length > 0;

      if (hasVariants) {
        const sizes = variants.sizes || [];
        const colors = variants.colors || [];

        if (sizes.length > 0) baseProduct.option1_name = categoryConfig.variantConfig.sizeLabel || 'Beden';
        if (colors.length > 0) baseProduct.option2_name = categoryConfig.variantConfig.colorLabel || 'Renk';

        // Her beden için bir varyant oluştur
        for (const size of sizes) {
          for (const color of colors.length > 0 ? colors : [null]) {
            const variant = {
              ...baseProduct,
              option1_value: size,
              option2_value: color || '',
              variant_sku: `${handle}-${size}${color ? `-${color}` : ''}`,
              variant_price: product.price,
              variant_inventory_quantity: categoryConfig.variantConfig.defaultStock || 50
            };
            csvRows.push(variant);
          }
        }
      } else {
        // Varyantsız ürün için tek bir satır
        csvRows.push({
          ...baseProduct,
          variant_sku: handle,
          variant_price: product.price,
          variant_inventory_quantity: categoryConfig.variantConfig.defaultStock || 50
        });
      }

      // Görselleri ekle
      if (product.images && product.images.length > 0 && csvRows.length > 0) {
        // İlk görsel ana ürün varyantı için
        const firstRow = {
          ...csvRows[0],
          image_src: product.images[0],
          image_position: '1'
        };
        csvRows[0] = firstRow;

        // Diğer görseller için yeni satırlar
        for (let i = 1; i < product.images.length; i++) {
          csvRows.push({
            handle,
            image_src: product.images[i],
            image_position: (i + 1).toString()
          });
        }
      }

      // CSV başlıklarını oluştur
      const csvWriter = createObjectCsvWriter({
        path: join(tmpdir(), 'shopify_products.csv'),
        header: [
          { id: 'handle', title: 'Handle' },
          { id: 'title', title: 'Title' },
          { id: 'body', title: 'Body (HTML)' },
          { id: 'vendor', title: 'Vendor' },
          { id: 'product_category', title: 'Product Category' },
          { id: 'custom_category', title: 'Custom Category' },
          { id: 'type', title: 'Type' },
          { id: 'tags', title: 'Tags' },
          { id: 'published', title: 'Published' },
          { id: 'option1_name', title: 'Option1 Name' },
          { id: 'option1_value', title: 'Option1 Value' },
          { id: 'option2_name', title: 'Option2 Name' },
          { id: 'option2_value', title: 'Option2 Value' },
          { id: 'variant_sku', title: 'Variant SKU' },
          { id: 'variant_price', title: 'Variant Price' },
          { id: 'variant_inventory_policy', title: 'Variant Inventory Policy' },
          { id: 'variant_inventory_quantity', title: 'Variant Inventory Quantity' },
          { id: 'variant_weight', title: 'Variant Weight' },
          { id: 'variant_weight_unit', title: 'Variant Weight Unit' },
          { id: 'status', title: 'Status' },
          { id: 'image_src', title: 'Image Src' },
          { id: 'image_position', title: 'Image Position' }
        ]
      });

      // CSV dosyasını yaz
      await csvWriter.writeRecords(csvRows);

      // CSV dosyasını gönder
      res.download(join(tmpdir(), 'shopify_products.csv'), 'shopify_products.csv');

    } catch (error: any) {
      debug("CSV export hatası");
      const { status, message, details } = handleError(error);
      res.status(status).json({ message, details });
    }
  });

  return httpServer;
}