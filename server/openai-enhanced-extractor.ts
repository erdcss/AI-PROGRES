import OpenAI from 'openai';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

interface ProductData {
  title: string;
  brand: string;
  price: number;
  images: string[];
  features: Array<{ key: string; value: string }>;
  description?: string;
  category?: string;
  variants?: {
    colors: string[];
    sizes: string[];
  };
}

interface EnhancedProductData extends ProductData {
  enhancedDescription: string;
  seoTitle: string;
  seoDescription: string;
  suggestedTags: string[];
  categoryMatch: string;
  qualityScore: number;
  marketingDescription: string;
  targetAudience: string;
  aiAnalysis: {
    productType: string;
    mainFeatures: string[];
    competitiveAdvantages: string[];
    recommendations: string[];
  };
}

class OpenAIEnhancedExtractor {
  
  async enhanceProductData(productData: ProductData): Promise<EnhancedProductData> {
    try {
      console.log('🤖 OpenAI ile ürün verisi geliştiriliyor...');
      
      const prompt = `
Sen bir e-ticaret uzmanısın. Aşağıdaki ürün verilerini analiz et ve geliştir:

ÜRÜN BİLGİLERİ:
- Başlık: ${productData.title}
- Marka: ${productData.brand}
- Fiyat: ${productData.price} TL
- Özellik Sayısı: ${productData.features.length}
- Görsel Sayısı: ${productData.images.length}

ÖZELLİKLER:
${productData.features.map(f => `- ${f.key}: ${f.value}`).join('\n')}

Lütfen aşağıdaki bilgileri JSON formatında ver:

{
  "enhancedDescription": "Türkçe pazarlama odaklı detaylı ürün açıklaması (150-200 kelime)",
  "seoTitle": "SEO uyumlu başlık (60 karakter altı)",
  "seoDescription": "SEO meta açıklaması (160 karakter altı)", 
  "suggestedTags": ["etiket1", "etiket2", "etiket3", "etiket4", "etiket5"],
  "categoryMatch": "En uygun kategori adı",
  "qualityScore": 85,
  "marketingDescription": "Satış odaklı kısa açıklama (50-80 kelime)",
  "targetAudience": "Hedef kitle tanımı",
  "aiAnalysis": {
    "productType": "Ürün tipi kategorisi",
    "mainFeatures": ["özellik1", "özellik2", "özellik3"],
    "competitiveAdvantages": ["avantaj1", "avantaj2"],
    "recommendations": ["öneri1", "öneri2"]
  }
}
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Sen Türkiye'deki e-ticaret pazarını çok iyi bilen, SEO ve pazarlama uzmanı bir yapay zekasın. Ürün verilerini analiz edip geliştiriyorsun."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000
      });

      const aiResult = JSON.parse(response.choices[0].message.content || '{}');
      
      const enhancedData: EnhancedProductData = {
        ...productData,
        enhancedDescription: aiResult.enhancedDescription || productData.description || '',
        seoTitle: aiResult.seoTitle || productData.title,
        seoDescription: aiResult.seoDescription || '',
        suggestedTags: aiResult.suggestedTags || [],
        categoryMatch: aiResult.categoryMatch || 'Genel',
        qualityScore: aiResult.qualityScore || 75,
        marketingDescription: aiResult.marketingDescription || '',
        targetAudience: aiResult.targetAudience || '',
        aiAnalysis: aiResult.aiAnalysis || {
          productType: 'Belirtilmemiş',
          mainFeatures: [],
          competitiveAdvantages: [],
          recommendations: []
        }
      };

      console.log(`✅ OpenAI analizi tamamlandı - Kalite skoru: ${enhancedData.qualityScore}`);
      return enhancedData;

    } catch (error) {
      console.error('❌ OpenAI enhancement error:', error);
      
      // Fallback: Return original data with basic enhancements
      return {
        ...productData,
        enhancedDescription: productData.description || productData.title,
        seoTitle: productData.title.substring(0, 60),
        seoDescription: `${productData.brand} ${productData.title}`.substring(0, 160),
        suggestedTags: [productData.brand.toLowerCase(), 'türkiye', 'kaliteli'],
        categoryMatch: 'Genel Ürünler',
        qualityScore: 60,
        marketingDescription: productData.title,
        targetAudience: 'Genel müşteriler',
        aiAnalysis: {
          productType: 'Standart Ürün',
          mainFeatures: productData.features.slice(0, 3).map(f => f.value),
          competitiveAdvantages: ['Kaliteli', 'Uygun fiyat'],
          recommendations: ['Ürün açıklaması geliştirilebilir']
        }
      };
    }
  }

  async generateProductSummary(productData: ProductData): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system", 
            content: "Sen ürün özetleri yazan uzman bir yazarsın. Kısa, net ve etkili özetler yazıyorsun."
          },
          {
            role: "user",
            content: `Bu ürün için 2-3 cümlelik özet yaz: ${productData.title} - ${productData.brand}, ${productData.price} TL`
          }
        ],
        max_tokens: 150,
        temperature: 0.5
      });

      return response.choices[0].message.content || productData.title;
    } catch (error) {
      console.error('❌ OpenAI summary error:', error);
      return `${productData.brand} markasından ${productData.title}. Yüksek kaliteli ürün, ${productData.price} TL fiyatıyla.`;
    }
  }

  async analyzeImageContent(imageUrl: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Bu ürün görselini analiz et ve ana özelliklerini, renklerini, tasarım detaylarını Türkçe olarak açıkla."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 300
      });

      return response.choices[0].message.content || 'Görsel analizi yapılamadı';
    } catch (error) {
      console.error('❌ OpenAI image analysis error:', error);
      return 'Görsel analizi mevcut değil';
    }
  }

  async improveProductTitle(title: string, brand: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Sen SEO uzmanısın. Ürün başlıklarını e-ticaret platformları için optimize ediyorsun."
          },
          {
            role: "user", 
            content: `Bu ürün başlığını SEO-uyumlu ve pazarlama etkili hale getir: "${title}" - Marka: ${brand}`
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      });

      const improvedTitle = response.choices[0].message.content?.trim();
      return improvedTitle && improvedTitle.length > 10 ? improvedTitle : title;
    } catch (error) {
      console.error('❌ OpenAI title improvement error:', error);
      return title;
    }
  }

  async generateSearchKeywords(productData: ProductData): Promise<string[]> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Sen SEO anahtar kelime uzmanısın. Türkiye e-ticaret pazarı için etkili anahtar kelimeler üretiyorsun."
          },
          {
            role: "user",
            content: `Bu ürün için 10-15 anahtar kelime öner: ${productData.title} - ${productData.brand}. JSON array formatında ver.`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 200
      });

      const result = JSON.parse(response.choices[0].message.content || '{"keywords":[]}');
      return result.keywords || [];
    } catch (error) {
      console.error('❌ OpenAI keywords error:', error);
      return [productData.brand.toLowerCase(), 'türkiye', 'online alışveriş'];
    }
  }

  async detectProductQualityIssues(productData: ProductData): Promise<string[]> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Sen ürün kalitesi analiz uzmanısın. Ürün verilerindeki eksiklikleri ve iyileştirme önerilerini tespit ediyorsun."
          },
          {
            role: "user",
            content: `Bu ürün verisini analiz et ve kalite sorunlarını listele:
            Başlık: ${productData.title}
            Marka: ${productData.brand}
            Özellik sayısı: ${productData.features.length}
            Görsel sayısı: ${productData.images.length}
            
            JSON formatında sorunları listele: {"issues": ["sorun1", "sorun2"]}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 300
      });

      const result = JSON.parse(response.choices[0].message.content || '{"issues":[]}');
      return result.issues || [];
    } catch (error) {
      console.error('❌ OpenAI quality detection error:', error);
      return [];
    }
  }
}

export const openaiEnhancedExtractor = new OpenAIEnhancedExtractor();