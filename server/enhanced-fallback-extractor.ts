/**
 * Fallback Veri Çıkarma Sistemi
 * AI servisleri çalışmadığında kullanılacak kapsamlı çıkarma
 */

import * as cheerio from 'cheerio';

export interface FallbackData {
  images: string[];
  colors: string[];
  features: Array<{key: string, value: string, category: string}>;
  variants: Array<{color: string, price?: number, available: boolean}>;
}

/**
 * Kapsamlı fallback veri çıkarma
 */
export function extractComprehensiveFallbackData(htmlContent: string, $: cheerio.CheerioAPI): FallbackData {
  console.log('🔄 Kapsamlı fallback veri çıkarma başlatılıyor...');
  
  const data: FallbackData = {
    images: [],
    colors: [],
    features: [],
    variants: []
  };
  
  // 1. Görsel çıkarma - Kapsamlı
  data.images = extractAllImages(htmlContent, $);
  
  // 2. Renk çıkarma - Detaylı
  data.colors = extractAllColors(htmlContent, $);
  
  // 3. Özellik çıkarma - Yapılandırılmış
  data.features = extractAllFeatures(htmlContent, $);
  
  // 4. Varyant çıkarma - Fiyat dahil
  data.variants = extractAllVariants(htmlContent, $);
  
  console.log(`✅ Fallback çıkarma tamamlandı: ${data.images.length} görsel, ${data.colors.length} renk, ${data.features.length} özellik`);
  
  return data;
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
  
  // 2. DOM elementlerinden
  const imageSelectors = [
    'img[src*="dsmcdn.com"]',
    'img[data-src*="dsmcdn.com"]',
    'img[src*="prod/QC"]',
    '.product-image img',
    '.gallery img',
    '.variant-image img'
  ];
  
  imageSelectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-original');
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
      
      // Ana görseller
      if (productState.product?.images) {
        productState.product.images.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : (img.url || img.src);
          if (imgUrl) images.add(imgUrl);
        });
      }
      
      // Varyant görselleri
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
      
      // Renk görselleri
      if (productState.product?.colorOptions) {
        productState.product.colorOptions.forEach((color: any) => {
          if (color.images) {
            color.images.forEach((img: any) => {
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
 * Tüm renkleri çıkar
 */
function extractAllColors(htmlContent: string, $: cheerio.CheerioAPI): string[] {
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
      
      if (productState.product?.colorOptions) {
        productState.product.colorOptions.forEach((color: any) => {
          if (color.name || color.colorName) {
            colors.add(color.name || color.colorName);
          }
        });
      }
    } catch (e) {}
  }
  
  // 2. URL'lerden renk çıkarma
  const merchantMatches = htmlContent.matchAll(/renk=([^&"']+)/gi);
  for (const match of merchantMatches) {
    const colorName = decodeURIComponent(match[1]).replace(/\+/g, ' ').trim();
    if (colorName.length > 1 && colorName.length < 30) {
      colors.add(colorName);
    }
  }
  
  // 3. DOM elementlerinden
  const colorSelectors = [
    '[data-color]',
    '.color-option',
    '.variant-color',
    '.color-selector .color'
  ];
  
  colorSelectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const colorName = $(elem).attr('data-color') || $(elem).attr('title') || $(elem).text().trim();
      if (colorName && colorName.length > 1 && colorName.length < 30) {
        colors.add(colorName);
      }
    });
  });
  
  return Array.from(colors).filter(color => color && color.trim().length > 1);
}

/**
 * Tüm özellikleri çıkar
 */
function extractAllFeatures(htmlContent: string, $: cheerio.CheerioAPI): Array<{key: string, value: string, category: string}> {
  const features: Array<{key: string, value: string, category: string}> = [];
  
  // 1. Script verilerinden
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      // Product properties
      if (productState.product?.properties) {
        productState.product.properties.forEach((prop: any) => {
          if (prop.name && prop.value) {
            features.push({
              key: prop.name,
              value: prop.value,
              category: categorizeFeature(prop.name)
            });
          }
        });
      }
      
      // Basic product info
      const product = productState.product;
      if (product) {
        if (product.brand) features.push({key: 'Marka', value: product.brand, category: 'basic'});
        if (product.name) features.push({key: 'Ürün Adı', value: product.name, category: 'basic'});
        if (product.color) features.push({key: 'Renk', value: product.color, category: 'basic'});
        if (product.material) features.push({key: 'Malzeme', value: product.material, category: 'material'});
        if (product.model) features.push({key: 'Model', value: product.model, category: 'basic'});
      }
      
    } catch (e) {}
  }
  
  // 2. DOM tabloları ve listelerden
  const tableSelectors = [
    '.product-details table tr',
    '.product-features table tr',
    '.specifications table tr',
    '.product-info table tr'
  ];
  
  tableSelectors.forEach(selector => {
    $(selector).each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        
        if (key && value && key.length < 50 && value.length < 200) {
          features.push({
            key,
            value,
            category: categorizeFeature(key)
          });
        }
      }
    });
  });
  
  // 3. Özellik listelerinden
  const listSelectors = [
    '.product-details li',
    '.product-features li',
    '.specifications li'
  ];
  
  listSelectors.forEach(selector => {
    $(selector).each((i, item) => {
      const text = $(item).text().trim();
      if (text.includes(':')) {
        const [key, ...valueParts] = text.split(':');
        const value = valueParts.join(':').trim();
        
        if (key && value && key.length < 50 && value.length < 200) {
          features.push({
            key: key.trim(),
            value,
            category: categorizeFeature(key.trim())
          });
        }
      }
    });
  });
  
  // 4. Meta verilerden
  const metaSelectors = [
    'meta[property="product:brand"]',
    'meta[property="product:color"]',
    'meta[property="product:material"]'
  ];
  
  metaSelectors.forEach(selector => {
    const meta = $(selector);
    if (meta.length > 0) {
      const content = meta.attr('content');
      const property = meta.attr('property')?.replace('product:', '');
      
      if (content && property) {
        features.push({
          key: property.charAt(0).toUpperCase() + property.slice(1),
          value: content,
          category: categorizeFeature(property)
        });
      }
    }
  });
  
  return features;
}

/**
 * Tüm varyantları çıkar
 */
function extractAllVariants(htmlContent: string, $: cheerio.CheerioAPI): Array<{color: string, price?: number, available: boolean}> {
  const variants: Array<{color: string, price?: number, available: boolean}> = [];
  
  // Script verilerinden varyant çıkarma
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.attributeValue) {
            variants.push({
              color: variant.attributeValue,
              price: variant.price ? parseFloat(variant.price) : undefined,
              available: variant.isAvailable !== false
            });
          }
        });
      }
    } catch (e) {}
  }
  
  // Merchant verilerinden
  const merchantMatches = htmlContent.matchAll(/"merchants":\s*\[([^\]]+)\]/g);
  for (const match of merchantMatches) {
    try {
      const merchantsData = JSON.parse(`[${match[1]}]`);
      merchantsData.forEach((merchant: any) => {
        if (merchant.url && merchant.url.includes('renk=')) {
          const colorMatch = merchant.url.match(/renk=([^&]+)/);
          if (colorMatch) {
            const colorName = decodeURIComponent(colorMatch[1]).replace(/\+/g, ' ');
            variants.push({
              color: colorName,
              price: merchant.price ? parseFloat(merchant.price) : undefined,
              available: merchant.isAvailable !== false
            });
          }
        }
      });
    } catch (e) {}
  }
  
  return variants;
}

/**
 * Özellik kategorisini belirle
 */
function categorizeFeature(name: string): string {
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('malzeme') || nameLower.includes('kumaş') || nameLower.includes('materyal')) {
    return 'material';
  }
  if (nameLower.includes('beden') || nameLower.includes('ölçü') || nameLower.includes('boyut')) {
    return 'size';
  }
  if (nameLower.includes('renk') || nameLower.includes('color')) {
    return 'color';
  }
  if (nameLower.includes('bakım') || nameLower.includes('yıkama') || nameLower.includes('temizlik')) {
    return 'care';
  }
  if (nameLower.includes('marka') || nameLower.includes('model') || nameLower.includes('ad')) {
    return 'basic';
  }
  
  return 'technical';
}