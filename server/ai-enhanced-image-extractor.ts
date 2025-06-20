/**
 * AI Destekli Görsel Çıkarma Sistemi
 * Yapay zeka ile görsel kalitesi analizi, renk tespiti ve varyant görsellerinin otomatik kategorilendirmesi
 */

import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';

// AI instance
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AIImageAnalysis {
  imageQuality: 'high' | 'medium' | 'low';
  isProductImage: boolean;
  colors: string[];
  imageType: 'main' | 'variant' | 'detail' | 'lifestyle' | 'texture';
  confidence: number;
  description: string;
  suitableForEcommerce: boolean;
}

export interface AIEnhancedImageExtraction {
  allImages: string[];
  highQualityImages: string[];
  variantImages: Record<string, string[]>; // renk -> görseller
  categorizedImages: {
    main: string[];
    variants: string[];
    details: string[];
    lifestyle: string[];
  };
  aiAnalysis: Record<string, AIImageAnalysis>;
  totalProcessed: number;
  qualityScore: number;
}

/**
 * AI destekli görsel analizi
 */
async function analyzeImageWithAI(imageUrl: string): Promise<AIImageAnalysis> {
  try {
    console.log(`🤖 AI görsel analizi başlatılıyor: ${imageUrl.substring(0, 80)}...`);
    
    const prompt = `Bu e-ticaret ürün görselini analiz et ve şu bilgileri JSON formatında ver:

{
  "imageQuality": "high|medium|low",
  "isProductImage": true/false,
  "colors": ["renk1", "renk2"],
  "imageType": "main|variant|detail|lifestyle|texture",
  "confidence": 0.0-1.0,
  "description": "kısa açıklama",
  "suitableForEcommerce": true/false
}

Görsel URL: ${imageUrl}

Kalite kriterleri:
- high: 800px+, net, profesyonel
- medium: 400-800px, kabul edilebilir
- low: <400px, bulanık, düşük kalite

Görsel tipleri:
- main: Ana ürün görseli
- variant: Renk/beden varyantı
- detail: Detay/yakın çekim
- lifestyle: Kullanım/ambiyans
- texture: Kumaş/malzeme detayı`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // the newest Anthropic model is "claude-sonnet-4-20250514" which was released May 14, 2025. Use this by default unless user has already selected claude-3-7-sonnet-20250219
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysisText = response.content[0].text;
    const analysis = JSON.parse(analysisText);
    
    console.log(`✅ AI analizi tamamlandı: ${analysis.imageType}, kalite: ${analysis.imageQuality}`);
    return analysis;
    
  } catch (error) {
    console.log(`⚠️ AI analizi hatası, varsayılan değerler kullanılıyor: ${error.message}`);
    return {
      imageQuality: 'medium',
      isProductImage: true,
      colors: [],
      imageType: 'main',
      confidence: 0.5,
      description: 'AI analizi yapılamadı',
      suitableForEcommerce: true
    };
  }
}

/**
 * Gelişmiş görsel URL optimizasyonu
 */
function optimizeImageUrl(url: string): string {
  if (!url) return '';
  
  // Trendyol CDN optimizasyonu
  if (url.includes('cdn.dsmcdn.com')) {
    return url
      .replace(/\/\d+\/\d+\//, '/1200/1800/') // Yüksek çözünürlük
      .replace(/(_\d+x\d+)/, '') // Boyut kısıtlamalarını kaldır
      .replace(/\?.*$/, ''); // Query parametrelerini temizle
  }
  
  return url;
}

/**
 * AI destekli görsel çıkarma ana fonksiyonu
 */
export async function extractImagesWithAI(htmlContent: string, productId: string): Promise<AIEnhancedImageExtraction> {
  const $ = cheerio.load(htmlContent);
  const allImageUrls = new Set<string>();
  
  console.log('🤖 AI destekli görsel çıkarma başlatılıyor...');
  
  // 1. Kapsamlı görsel seçicileri
  const imageSelectors = [
    'img[src*="prod/QC"]',
    'img[data-src*="prod/QC"]',
    'img[data-original*="prod/QC"]',
    '.product-gallery img',
    '.gallery img',
    '.image-gallery img',
    '.product-images img',
    '.slider img',
    '.carousel img',
    '.variant-image img',
    '.color-image img',
    '[data-color] img',
    '[data-variant] img',
    '.thumb img',
    '.thumbnail img',
    '.zoom img',
    '.product-photo img'
  ];
  
  // 2. DOM'dan görsel toplama
  imageSelectors.forEach(selector => {
    $(selector).each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original');
      if (src && (src.includes('cdn.dsmcdn.com') || src.includes('prod/QC'))) {
        const optimizedUrl = optimizeImageUrl(src);
        if (optimizedUrl) {
          allImageUrls.add(optimizedUrl);
        }
      }
    });
  });
  
  // 3. Script içindeki görselleri AI ile tespit et
  $('script').each((i, script) => {
    const scriptContent = $(script).html() || '';
    
    // JSON içindeki görsel URL'lerini bul
    const imageMatches = scriptContent.match(/"(https?:\/\/[^"]*prod\/QC[^"]*\.jpg)"/g);
    if (imageMatches) {
      imageMatches.forEach(match => {
        const url = match.replace(/"/g, '');
        const optimizedUrl = optimizeImageUrl(url);
        if (optimizedUrl) {
          allImageUrls.add(optimizedUrl);
        }
      });
    }
  });
  
  const allImages = Array.from(allImageUrls);
  console.log(`📸 ${allImages.length} görsel bulundu, AI analizi başlatılıyor...`);
  
  // 4. AI analizi ile görselleri kategorilendirme
  const aiAnalysisPromises = allImages.slice(0, 15).map(async (imageUrl) => {
    const analysis = await analyzeImageWithAI(imageUrl);
    return { url: imageUrl, analysis };
  });
  
  const aiResults = await Promise.all(aiAnalysisPromises);
  
  // 5. Sonuçları kategorilendirme
  const result: AIEnhancedImageExtraction = {
    allImages,
    highQualityImages: [],
    variantImages: {},
    categorizedImages: {
      main: [],
      variants: [],
      details: [],
      lifestyle: []
    },
    aiAnalysis: {},
    totalProcessed: aiResults.length,
    qualityScore: 0
  };
  
  let totalQualityScore = 0;
  
  aiResults.forEach(({ url, analysis }) => {
    result.aiAnalysis[url] = analysis;
    
    // Kalite skoru hesaplama
    const qualityPoints = analysis.imageQuality === 'high' ? 3 : 
                         analysis.imageQuality === 'medium' ? 2 : 1;
    totalQualityScore += qualityPoints;
    
    // Yüksek kaliteli görseller
    if (analysis.imageQuality === 'high' && analysis.isProductImage) {
      result.highQualityImages.push(url);
    }
    
    // Kategorilendirme
    switch (analysis.imageType) {
      case 'main':
        result.categorizedImages.main.push(url);
        break;
      case 'variant':
        result.categorizedImages.variants.push(url);
        // Renk bazlı gruplandırma
        analysis.colors.forEach(color => {
          if (!result.variantImages[color]) {
            result.variantImages[color] = [];
          }
          result.variantImages[color].push(url);
        });
        break;
      case 'detail':
        result.categorizedImages.details.push(url);
        break;
      case 'lifestyle':
        result.categorizedImages.lifestyle.push(url);
        break;
    }
  });
  
  result.qualityScore = totalQualityScore / Math.max(aiResults.length, 1);
  
  console.log(`✅ AI destekli görsel analizi tamamlandı:`);
  console.log(`   📊 Toplam: ${allImages.length} görsel`);
  console.log(`   🏆 Yüksek kalite: ${result.highQualityImages.length} görsel`);
  console.log(`   🎯 Ana görseller: ${result.categorizedImages.main.length}`);
  console.log(`   🎨 Varyant görselleri: ${result.categorizedImages.variants.length}`);
  console.log(`   📋 Detay görselleri: ${result.categorizedImages.details.length}`);
  console.log(`   🌟 Kalite skoru: ${result.qualityScore.toFixed(2)}/3.0`);
  
  return result;
}

/**
 * AI destekli renk tespiti
 */
export async function detectColorsWithAI(imageUrls: string[]): Promise<Record<string, string[]>> {
  const colorMap: Record<string, string[]> = {};
  
  try {
    console.log('🎨 AI ile renk tespiti başlatılıyor...');
    
    const prompt = `Bu ürün görsellerindeki renkleri analiz et ve her görsel için dominant renkleri tespit et.

Görseller:
${imageUrls.slice(0, 5).map((url, i) => `${i+1}. ${url}`).join('\n')}

JSON formatında döndür:
{
  "image1_url": ["renk1", "renk2"],
  "image2_url": ["renk1", "renk2"]
}

Türkçe renk isimleri kullan: beyaz, siyah, mavi, kırmızı, yeşil, sarı, pembe, mor, turuncu, kahverengi, gri, lacivert, bordo vb.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const colorsData = JSON.parse(response.content[0].text);
    
    Object.entries(colorsData).forEach(([imageUrl, colors]) => {
      if (Array.isArray(colors)) {
        colorMap[imageUrl] = colors as string[];
      }
    });
    
    console.log(`✅ ${Object.keys(colorMap).length} görsel için renk tespiti tamamlandı`);
    
  } catch (error) {
    console.log(`⚠️ AI renk tespiti hatası: ${error.message}`);
  }
  
  return colorMap;
}