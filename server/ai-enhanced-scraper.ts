/**
 * AI-Destekli Profesyonel Ürün Veri Çıkarıcı
 * Tüm görselleri, özellikleri ve detayları AI ile analiz ederek çıkarır
 */

import * as cheerio from 'cheerio';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AIEnhancedProductData {
  success: boolean;
  title: string;
  brand: string;
  price: string;
  description: string;
  images: string[];
  colors: Array<{
    name: string;
    images: string[];
    price?: string;
  }>;
  features: Array<{key: string, value: string}>;
  aiAnalysis: {
    category: string;
    targetAudience: string;
    season: string;
    materials: string[];
    style: string;
    priceRange: string;
  };
  shopifyData: {
    handle: string;
    tags: string[];
    vendor: string;
    productType: string;
    variants: Array<{
      title: string;
      price: string;
      sku: string;
      inventory: number;
      image: string;
    }>;
  };
  csvPreview: Array<Record<string, string>>;
}

/**
 * AI-destekli gelişmiş Trendyol ürün veri çıkarma
 */
export async function aiEnhancedScrape(url: string): Promise<AIEnhancedProductData> {
  console.log(`🚀 AI-destekli profesyonel veri çıkarma başlatılıyor: ${url}`);
  
  try {
    // 1. Ham veri çıkarma
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const htmlContent = response.data;
    
    console.log(`📊 AI analiz için veri hazırlanıyor - içerik uzunluğu: ${htmlContent.length}`);
    
    // 2. Temel veri çıkarma
    const basicData = extractBasicData($, htmlContent);
    
    // 3. AI ile gelişmiş analiz
    const aiAnalysis = await performAIAnalysis(basicData, htmlContent);
    
    // 4. Shopify formatında veri hazırlama
    const shopifyData = generateShopifyData(basicData, aiAnalysis);
    
    // 5. CSV oluşturma ve önizleme
    const { generateProfessionalCSV } = await import('./csv-generator');
    const csvContent = generateProfessionalCSV({...basicData, aiAnalysis});
    const csvPreview = generateCSVPreview(basicData, shopifyData);
    
    console.log(`✅ AI-destekli çıkarma tamamlandı: ${basicData.images.length} görsel, ${basicData.colors.length} renk`);
    
    return {
      success: true,
      ...basicData,
      aiAnalysis,
      shopifyData,
      csvPreview
    };
    
  } catch (error) {
    console.error('AI-destekli scraping hatası:', error.message);
    throw error;
  }
}

/**
 * Temel veri çıkarma (gelişmiş)
 */
function extractBasicData($: cheerio.CheerioAPI, htmlContent: string) {
  // Başlık çıkarma
  const title = extractEnhancedTitle($);
  
  // Marka çıkarma
  const brand = extractEnhancedBrand($);
  
  // Fiyat çıkarma (tüm varyantlar)
  const prices = extractAllPrices($, htmlContent);
  
  // Açıklama çıkarma
  const description = extractEnhancedDescription($, title);
  
  // Tüm görselleri çıkar (ultra gelişmiş)
  const images = extractAllImagesEnhanced(htmlContent, $);
  
  // Renk varyantları ve görselleri eşleştir
  const colors = extractColorVariantsWithImages(htmlContent, $, images);
  
  // Özellikleri çıkar (detaylı)
  const features = extractEnhancedFeatures(htmlContent, $);
  
  return {
    title,
    brand,
    price: prices.main || '0',
    description,
    images,
    colors,
    features
  };
}

/**
 * AI ile ürün analizi
 */
async function performAIAnalysis(basicData: any, htmlContent: string): Promise<any> {
  try {
    const analysisPrompt = `
Aşağıdaki Trendyol ürün verilerini analiz et ve JSON formatında detaylı bilgi ver:

Ürün Başlığı: ${basicData.title}
Marka: ${basicData.brand}
Fiyat: ${basicData.price}
Açıklama: ${basicData.description}

Lütfen şu bilgileri çıkar:
- category: Ürün kategorisi (örn: "Giyim", "Elektronik", "Ev & Yaşam")
- targetAudience: Hedef kitle (örn: "Kadın", "Erkek", "Çocuk", "Unisex")
- season: Mevsim (örn: "Yaz", "Kış", "Her Mevsim")
- materials: Malzeme listesi (array)
- style: Stil (örn: "Casual", "Formal", "Spor")
- priceRange: Fiyat aralığı (örn: "Ekonomik", "Orta", "Premium")

Sadece JSON formatında yanıt ver.
`;

    const message = await anthropic.messages.create({
      max_tokens: 1024,
      messages: [{ role: 'user', content: analysisPrompt }],
      model: 'claude-sonnet-4-20250514',
    });

    const aiResponse = message.content[0].text;
    
    try {
      return JSON.parse(aiResponse);
    } catch (parseError) {
      // Fallback analiz
      return {
        category: detectCategory(basicData.title),
        targetAudience: detectAudience(basicData.title),
        season: "Her Mevsim",
        materials: ["Pamuk"],
        style: "Casual",
        priceRange: detectPriceRange(parseFloat(basicData.price))
      };
    }
  } catch (error) {
    console.error('AI analiz hatası:', error);
    return {
      category: "Genel",
      targetAudience: "Unisex",
      season: "Her Mevsim",
      materials: [],
      style: "Casual",
      priceRange: "Orta"
    };
  }
}

/**
 * Shopify formatında veri hazırlama
 */
function generateShopifyData(basicData: any, aiAnalysis: any) {
  const handle = basicData.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  const variants = basicData.colors.map((color: any, index: number) => ({
    title: `${basicData.title} - ${color.name}`,
    price: color.price || basicData.price,
    sku: `SKU-${Date.now()}-${index}`,
    inventory: 100,
    image: color.images[0] || basicData.images[0]
  }));

  return {
    handle,
    tags: [aiAnalysis.category, aiAnalysis.style, aiAnalysis.targetAudience],
    vendor: basicData.brand,
    productType: aiAnalysis.category,
    variants
  };
}

/**
 * CSV önizleme oluşturma
 */
function generateCSVPreview(basicData: any, shopifyData: any): Array<Record<string, string>> {
  return shopifyData.variants.slice(0, 5).map((variant: any) => ({
    'Handle': shopifyData.handle,
    'Title': variant.title,
    'Body (HTML)': basicData.description,
    'Vendor': shopifyData.vendor,
    'Product Type': shopifyData.productType,
    'Tags': shopifyData.tags.join(', '),
    'Variant Price': variant.price,
    'Variant SKU': variant.sku,
    'Variant Inventory Qty': variant.inventory.toString(),
    'Image Src': variant.image
  }));
}

/**
 * Gelişmiş görsel çıkarma
 */
function extractAllImagesEnhanced(htmlContent: string, $: cheerio.CheerioAPI): string[] {
  const images = new Set<string>();
  
  // 1. Script verilerinden (JSON-LD, product state)
  const scriptMatches = htmlContent.matchAll(/"(https?:\/\/[^"]*(?:dsmcdn\.com|trendyol)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const match of scriptMatches) {
    if (match[1] && (match[1].includes('prod/QC') || match[1].includes('mnresize'))) {
      images.add(match[1]);
    }
  }
  
  // 2. Product detail state
  const productStateRegex = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/;
  const productStateMatch = htmlContent.match(productStateRegex);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      extractImagesFromState(productState, images);
    } catch (e) {}
  }
  
  // 3. DOM selectors
  const imageSelectors = [
    'img[src*="dsmcdn.com"]',
    'img[data-src*="dsmcdn.com"]',
    'img[src*="prod/QC"]',
    '.image-container img',
    '.product-image img'
  ];
  
  imageSelectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src && src.includes('dsmcdn.com')) {
        images.add(src.startsWith('//') ? 'https:' + src : src);
      }
    });
  });
  
  return Array.from(images);
}

/**
 * State'den görsel çıkarma
 */
function extractImagesFromState(state: any, images: Set<string>) {
  if (state.product?.images) {
    state.product.images.forEach((img: any) => {
      const imgUrl = typeof img === 'string' ? img : (img.url || img.src);
      if (imgUrl) images.add(imgUrl);
    });
  }
  
  if (state.product?.allVariants) {
    state.product.allVariants.forEach((variant: any) => {
      if (variant.images) {
        variant.images.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : (img.url || img.src);
          if (imgUrl) images.add(imgUrl);
        });
      }
    });
  }
}

/**
 * Renk varyantları ve görselleri eşleştirme
 */
function extractColorVariantsWithImages(htmlContent: string, $: cheerio.CheerioAPI, allImages: string[]) {
  const colors = new Map<string, {name: string, images: string[], price?: string}>();
  
  // Product state'den renk bilgileri
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.attributeValue) {
            const colorName = variant.attributeValue;
            const variantImages = variant.images || [];
            const price = variant.price?.toString();
            
            colors.set(colorName, {
              name: colorName,
              images: variantImages,
              price
            });
          }
        });
      }
    } catch (e) {}
  }
  
  // Eğer renk bulunamazsa, tüm görselleri tek renk olarak kabul et
  if (colors.size === 0) {
    colors.set('Tek Renk', {
      name: 'Tek Renk',
      images: allImages.slice(0, 10) // İlk 10 görsel
    });
  }
  
  return Array.from(colors.values());
}

/**
 * Gelişmiş özellik çıkarma
 */
function extractEnhancedFeatures(htmlContent: string, $: cheerio.CheerioAPI): Array<{key: string, value: string}> {
  const features: Array<{key: string, value: string}> = [];
  
  // Product state'den özellikler
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
    } catch (e) {}
  }
  
  // DOM'dan ek özellikler
  $('.product-detail-info table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (key && value && key.length < 50 && value.length < 200) {
        features.push({key, value});
      }
    }
  });
  
  return features;
}

// Yardımcı fonksiyonlar
function extractEnhancedTitle($: cheerio.CheerioAPI): string {
  const selectors = [
    'h1.pr-new-br',
    'h1[data-test-id="product-name"]',
    '.pr-new-br h1',
    'h1',
    '.product-name'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const title = element.first().text().trim();
      if (title && title.length > 5) return title;
    }
  }
  
  return 'Ürün Adı Bulunamadı';
}

function extractEnhancedBrand($: cheerio.CheerioAPI): string {
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
      if (brand && brand.length > 1) return brand;
    }
  }
  
  return 'Marka Bulunamadı';
}

function extractAllPrices($: cheerio.CheerioAPI, htmlContent: string): {main: string, variants: Record<string, string>} {
  const prices = {main: '0', variants: {}};
  
  // Ana fiyat
  const priceSelectors = ['.prc-dsc', '.prc-org', '.price-current'];
  for (const selector of priceSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      const price = element.first().text().trim();
      const match = price.match(/(\d+(?:[.,]\d+)?)/);
      if (match) {
        prices.main = match[1];
        break;
      }
    }
  }
  
  return prices;
}

function extractEnhancedDescription($: cheerio.CheerioAPI, title: string): string {
  const selectors = [
    '.product-description',
    '.pr-in-dt',
    '.detail-desc',
    '.product-detail-description'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const desc = element.first().text().trim();
      if (desc && desc.length > 20) return desc;
    }
  }
  
  return `${title} - Profesyonel kalitede ürün.`;
}

function detectCategory(title: string): string {
  const categories = {
    'Giyim': ['tişört', 'tisört', 'şort', 'pantolon', 'elbise', 'gömlek', 'kazak'],
    'Ayakkabı': ['ayakkabı', 'spor ayakkabı', 'bot', 'sandalet'],
    'Aksesuar': ['çanta', 'saat', 'bilezik', 'kolye', 'yüzük'],
    'Elektronik': ['telefon', 'laptop', 'kulaklık', 'şarj']
  };
  
  const lowerTitle = title.toLowerCase();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => lowerTitle.includes(keyword))) {
      return category;
    }
  }
  
  return 'Genel';
}

function detectAudience(title: string): string {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('kadın') || lowerTitle.includes('bayan')) return 'Kadın';
  if (lowerTitle.includes('erkek') || lowerTitle.includes('adam')) return 'Erkek';
  if (lowerTitle.includes('çocuk') || lowerTitle.includes('bebek')) return 'Çocuk';
  return 'Unisex';
}

function detectPriceRange(price: number): string {
  if (price < 100) return 'Ekonomik';
  if (price < 500) return 'Orta';
  return 'Premium';
}