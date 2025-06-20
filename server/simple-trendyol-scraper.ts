/**
 * Basit Trendyol Ürün Veri Çıkarıcı
 * Sadece temel veriler: görseller, renkler, özellikler
 */

import * as cheerio from 'cheerio';
import axios from 'axios';

export interface SimpleProductData {
  success: boolean;
  title: string;
  brand: string;
  price: string;
  description: string;
  images: string[];
  colors: string[];
  features: Array<{key: string, value: string}>;
}

/**
 * Basit Trendyol ürün verisi çıkarma
 */
export async function scrapeSimpleTrendyolProduct(url: string): Promise<SimpleProductData> {
  console.log(`📡 Basit Trendyol verisi çekiliyor: ${url}`);
  
  try {
    // Sayfa içeriğini çek
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    const htmlContent = response.data;
    
    console.log(`📊 Response status: ${response.status}, Content length: ${htmlContent.length}`);
    
    // Temel bilgileri çıkar
    const title = extractTitle($);
    const brand = extractBrand($);
    const price = extractPrice($);
    const description = extractDescription($, title);
    
    // Görselleri çıkar
    const images = extractAllImages(htmlContent, $);
    
    // Renkleri çıkar
    const colors = extractColors(htmlContent, $);
    
    // Özellikleri çıkar
    const features = extractFeatures(htmlContent, $);
    
    console.log(`✅ Basit çıkarma tamamlandı: ${images.length} görsel, ${colors.length} renk, ${features.length} özellik`);
    
    return {
      success: true,
      title,
      brand,
      price,
      description,
      images,
      colors,
      features
    };
    
  } catch (error) {
    console.error('Basit scraping hatası:', error.message);
    throw error;
  }
}

/**
 * Başlık çıkarma
 */
function extractTitle($: cheerio.CheerioAPI): string {
  const selectors = [
    'h1.pr-new-br',
    'h1[data-test-id="product-name"]',
    '.pr-new-br h1',
    'h1'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const title = element.first().text().trim();
      if (title) return title;
    }
  }
  
  return 'Ürün Adı Bulunamadı';
}

/**
 * Marka çıkarma
 */
function extractBrand($: cheerio.CheerioAPI): string {
  const selectors = [
    'a[data-test-id="product-brand-name-link"]',
    '.pr-new-br a',
    '.product-brand a',
    'h1 a'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const brand = element.first().text().trim();
      if (brand) return brand;
    }
  }
  
  return 'Marka Bulunamadı';
}

/**
 * Fiyat çıkarma
 */
function extractPrice($: cheerio.CheerioAPI): string {
  const selectors = [
    '.prc-dsc',
    '.prc-org',
    '.price-current',
    '.product-price'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const price = element.first().text().trim();
      if (price) {
        const match = price.match(/(\d+(?:[.,]\d+)?)/);
        return match ? match[1] : price;
      }
    }
  }
  
  return '0';
}

/**
 * Açıklama çıkarma
 */
function extractDescription($: cheerio.CheerioAPI, title: string): string {
  const selectors = [
    '.product-description',
    '.pr-in-dt',
    '.detail-desc'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const desc = element.first().text().trim();
      if (desc && desc.length > 20) return desc;
    }
  }
  
  return `${title} - Ürün açıklaması.`;
}

/**
 * Tüm görselleri çıkar
 */
function extractAllImages(htmlContent: string, $: cheerio.CheerioAPI): string[] {
  const images = new Set<string>();
  
  // 1. Script verilerinden
  const scriptMatches = htmlContent.matchAll(/"(https?:\/\/[^"]*(?:dsmcdn\.com|trendyol)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const match of scriptMatches) {
    if (match[1] && (match[1].includes('prod/QC') || match[1].includes('mnresize'))) {
      images.add(match[1]);
    }
  }
  
  // 2. DOM'dan
  const imageSelectors = [
    'img[src*="dsmcdn.com"]',
    'img[data-src*="dsmcdn.com"]',
    'img[src*="prod/QC"]'
  ];
  
  imageSelectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src && (src.includes('dsmcdn.com') || src.includes('prod/QC'))) {
        let cleanSrc = src.startsWith('//') ? 'https:' + src : src;
        if (cleanSrc.includes('mnresize') || cleanSrc.includes('prod/QC')) {
          images.add(cleanSrc);
        }
      }
    });
  });
  
  // 3. Product state'den
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.images) {
        productState.product.images.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : (img.url || img.src);
          if (imgUrl) images.add(imgUrl);
        });
      }
      
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.images) {
            variant.images.forEach((img: any) => {
              const imgUrl = typeof img === 'string' ? img : (img.url || img.src);
              if (imgUrl) images.add(imgUrl);
            });
          }
        });
      }
    } catch (e) {}
  }
  
  return Array.from(images);
}

/**
 * Renkleri çıkar
 */
function extractColors(htmlContent: string, $: cheerio.CheerioAPI): string[] {
  const colors = new Set<string>();
  
  // 1. Script verilerinden
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.attributeValue) {
            colors.add(variant.attributeValue);
          }
        });
      }
    } catch (e) {}
  }
  
  // 2. URL'lerden
  const merchantMatches = htmlContent.matchAll(/renk=([^&"']+)/gi);
  for (const match of merchantMatches) {
    const colorName = decodeURIComponent(match[1]).replace(/\+/g, ' ').trim();
    if (colorName.length > 1 && colorName.length < 30) {
      colors.add(colorName);
    }
  }
  
  // 3. DOM'dan
  $('[data-color]').each((i, elem) => {
    const colorName = $(elem).attr('data-color');
    if (colorName && colorName.length > 1) {
      colors.add(colorName);
    }
  });
  
  const result = Array.from(colors).filter(color => color && color.trim().length > 1);
  return result.length > 0 ? result : ['tek renk'];
}

/**
 * Özellikleri çıkar
 */
function extractFeatures(htmlContent: string, $: cheerio.CheerioAPI): Array<{key: string, value: string}> {
  const features: Array<{key: string, value: string}> = [];
  
  // 1. Script verilerinden
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.properties) {
        productState.product.properties.forEach((prop: any) => {
          if (prop.name && prop.value) {
            features.push({
              key: prop.name,
              value: prop.value
            });
          }
        });
      }
      
      const product = productState.product;
      if (product) {
        if (product.brand) features.push({key: 'Marka', value: product.brand});
        if (product.color) features.push({key: 'Renk', value: product.color});
        if (product.material) features.push({key: 'Malzeme', value: product.material});
      }
    } catch (e) {}
  }
  
  // 2. DOM tabloları
  $('.product-details table tr, .product-features table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (key && value && key.length < 50 && value.length < 200) {
        features.push({key, value});
      }
    }
  });
  
  // 3. Listeler
  $('.product-details li, .product-features li').each((i, item) => {
    const text = $(item).text().trim();
    if (text.includes(':')) {
      const [key, ...valueParts] = text.split(':');
      const value = valueParts.join(':').trim();
      
      if (key && value && key.length < 50 && value.length < 200) {
        features.push({key: key.trim(), value});
      }
    }
  });
  
  return features;
}