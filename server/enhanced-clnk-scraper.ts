/**
 * Enhanced CLNK Scraper - Özel CLNK ürün bilgileri çıkarma sistemi
 */

import * as cheerio from 'cheerio';
import { ultimateBypass } from './ultimate-bypass-scraper';

interface CLNKProductData {
  success: boolean;
  images: string[];
  features: Array<{key: string, value: string, category?: string}>;
  description?: string;
  specifications?: Array<{key: string, value: string}>;
  error?: string;
}

// CLNK ürünler için özel görsel çıkarma
async function extractCLNKImages(html: string, url: string): Promise<string[]> {
  console.log('🖼️ CLNK görsel çıkarma başlatılıyor...');
  const $ = cheerio.load(html);
  const images: string[] = [];
  
  // CLNK ürünleri için kapsamlı selektörler
  const imageSelectors = [
    '.gallery-modal img',
    '.product-gallery img', 
    '.slider-item img',
    '.product-images img',
    '.image-gallery img',
    '[data-testid="product-image"] img',
    '.pdp-gallery img',
    '.product-detail-images img',
    // CLNK boutique özel selektörler
    '.boutique-product-images img',
    '.merchant-gallery img',
    '.product-photo img',
    '.main-image img',
    '.zoom-image img',
    'img[src*="cdn.dsmcdn.com"]',
    'img[data-src*="cdn.dsmcdn.com"]',
    'img[data-original*="cdn.dsmcdn.com"]'
  ];
  
  // Her selektör için görsel ara
  imageSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const src = $(element).attr('src') || $(element).attr('data-src') || $(element).attr('data-original');
      if (src && src.includes('cdn.dsmcdn.com')) {
        // Yüksek kalite versiyon
        if (src.includes('_org_zoom.jpg') || src.includes('_zoom.jpg')) {
          images.push(src);
        }
        // Normal versiyonu yüksek kaliteye çevir
        else {
          const highQuality = src.replace(/(_\d+x\d+)?\.(jpg|jpeg|png)$/i, '_org_zoom.jpg');
          images.push(highQuality);
        }
      }
    });
  });
  
  // Script içindeki görselleri ara (Gelişmiş)
  const scriptTexts = $('script').map((_, script) => $(script).html()).get();
  
  for (const scriptText of scriptTexts) {
    if (scriptText && (scriptText.includes('images') || scriptText.includes('cdn.dsmcdn.com'))) {
      // Kapsamlı görsel regex'i
      const imageRegexes = [
        /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.(?:jpg|jpeg|png)/gi,
        /"url":\s*"(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png))"/gi,
        /"src":\s*"(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png))"/gi,
        /"image":\s*"(https:\/\/cdn\.dsmcdn\.com[^"]*\.(?:jpg|jpeg|png))"/gi,
        /cdn\.dsmcdn\.com[^"'\s]*\/[^"'\s]*\.(?:jpg|jpeg|png)/gi
      ];
      
      imageRegexes.forEach(regex => {
        let match;
        while ((match = regex.exec(scriptText)) !== null) {
          const imageUrl = match[1] || match[0];
          if (imageUrl && imageUrl.includes('cdn.dsmcdn.com')) {
            // URL'yi tam format'a çevir
            const fullUrl = imageUrl.startsWith('http') ? imageUrl : `https://${imageUrl}`;
            // Yüksek kaliteye çevir
            if (fullUrl.includes('_org_zoom.jpg')) {
              images.push(fullUrl);
            } else {
              const highQuality = fullUrl.replace(/(_\d+x\d+)?\.(jpg|jpeg|png)$/i, '_org_zoom.jpg');
              images.push(highQuality);
            }
          }
        }
      });
    }
  }
  
  // Eğer hala görsel yoksa, tüm CDN linklerini tara
  if (images.length === 0) {
    console.log('🔍 Tüm HTML içeriğinde CDN arama yapılıyor...');
    const allCdnRegex = /https?:\/\/cdn\.dsmcdn\.com[^"'\s]*\.(?:jpg|jpeg|png)/gi;
    const allMatches = html.match(allCdnRegex);
    
    if (allMatches) {
      allMatches.forEach(match => {
        if (match.includes('_org_zoom.jpg') || match.includes('zoom')) {
          images.push(match);
        } else {
          const highQuality = match.replace(/(_\d+x\d+)?\.(jpg|jpeg|png)$/i, '_org_zoom.jpg');
          images.push(highQuality);
        }
      });
    }
  }
  
  // Tekrarları kaldır ve sırala
  const uniqueImages = [...new Set(images)];
  console.log(`🖼️ CLNK görseller bulundu: ${uniqueImages.length}`);
  
  return uniqueImages.slice(0, 10); // En fazla 10 görsel
}

// CLNK ürünler için detaylı özellik çıkarma
function extractCLNKFeatures(html: string): Array<{key: string, value: string, category: string}> {
  console.log('📋 CLNK özellik çıkarma başlatılıyor...');
  const $ = cheerio.load(html);
  const features: Array<{key: string, value: string, category: string}> = [];
  
  // Ürün açıklama tablolarını ara
  $('.product-attribute-list .product-attribute').each((_, element) => {
    const key = $(element).find('.product-attribute-key').text().trim();
    const value = $(element).find('.product-attribute-value').text().trim();
    if (key && value) {
      features.push({
        key: key.replace(':', ''),
        value,
        category: 'Teknik Özellik'
      });
    }
  });
  
  // Özellik tabloları
  $('.detail-attr-item').each((_, element) => {
    const $item = $(element);
    const key = $item.find('.detail-attr-item-key, .attr-key, .attribute-key').text().trim();
    const value = $item.find('.detail-attr-item-value, .attr-value, .attribute-value').text().trim();
    if (key && value && key !== value) {
      features.push({
        key: key.replace(':', ''),
        value,
        category: 'Ürün Bilgisi'
      });
    }
  });
  
  // Description bölümünden özellikler çıkar
  const description = $('.product-detail-desc, .product-description, .detail-desc').text();
  if (description) {
    // Özellik listelerini ara
    const featureLines = description.split('\n').filter(line => 
      line.includes(':') && 
      line.length < 100 && 
      !line.includes('http')
    );
    
    featureLines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      if (key && value && key.trim().length > 0 && value.length > 0) {
        features.push({
          key: key.trim(),
          value: value,
          category: 'Açıklama'
        });
      }
    });
  }
  
  // Script içindeki JSON verilerden özellik çıkar
  const scripts = $('script').map((_, script) => $(script).html()).get();
  
  for (const scriptText of scripts) {
    if (scriptText && scriptText.includes('attributes')) {
      try {
        // JSON objelerini bul
        const jsonMatches = scriptText.match(/{[^{}]*"attributes"[^{}]*}/g);
        if (jsonMatches) {
          jsonMatches.forEach(jsonStr => {
            try {
              const data = JSON.parse(jsonStr);
              if (data.attributes && Array.isArray(data.attributes)) {
                data.attributes.forEach((attr: any) => {
                  if (attr.key && attr.value) {
                    features.push({
                      key: attr.key,
                      value: attr.value,
                      category: 'JSON Verisi'
                    });
                  }
                });
              }
            } catch {}
          });
        }
      } catch {}
    }
  }
  
  console.log(`📋 CLNK özellikler bulundu: ${features.length}`);
  return features;
}

// CLNK ürün açıklaması çıkar
function extractCLNKDescription(html: string): string {
  const $ = cheerio.load(html);
  
  const descriptionSelectors = [
    '.product-detail-desc',
    '.product-description', 
    '.detail-desc',
    '.product-desc',
    '[data-testid="product-description"]',
    '.pdp-product-desc'
  ];
  
  for (const selector of descriptionSelectors) {
    const description = $(selector).text().trim();
    if (description && description.length > 50) {
      return description;
    }
  }
  
  return '';
}

export async function enhancedCLNKScraper(url: string): Promise<CLNKProductData> {
  try {
    console.log('🚀 Enhanced CLNK scraper başlatılıyor...');
    
    // Ultimate bypass ile HTML al
    const result = await ultimateBypass(url);
    
    if (!result.success || !result.html) {
      return {
        success: false,
        images: [],
        features: [],
        error: 'HTML içeriği alınamadı'
      };
    }
    
    console.log(`📄 CLNK HTML alındı: ${result.html.length} karakter`);
    
    // Paralel olarak tüm verileri çıkar
    const [images, features, description] = await Promise.all([
      extractCLNKImages(result.html, url),
      Promise.resolve(extractCLNKFeatures(result.html)),
      Promise.resolve(extractCLNKDescription(result.html))
    ]);
    
    return {
      success: true,
      images,
      features,
      description,
      specifications: features.filter(f => f.category === 'Teknik Özellik')
    };
    
  } catch (error: any) {
    console.error('❌ Enhanced CLNK scraper hatası:', error.message);
    return {
      success: false,
      images: [],
      features: [],
      error: error.message
    };
  }
}