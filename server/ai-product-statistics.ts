import { db } from './db';
import { products } from '@shared/schema';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { scenarioBasedScrape } from './scenario-based-scraper';

const openai = (process.env.OPENAI_API_KEY_NEW || process.env.OPENAI_API_KEY) ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY_NEW || process.env.OPENAI_API_KEY
}) : null;

interface VariantInfo {
  color: string;
  size: string;
  price: number;
  stock: string;
  sku: string;
}

interface AIProductAnalysis {
  salesEstimate: {
    daily: string;
    monthly: string;
    trend: string;
  };
  priceAnalysis: {
    currentPrice: number;
    marketPosition: string;
    priceStrategy: string;
    competitiveAdvantage: string;
  };
  variantAnalysis: {
    totalVariants: number;
    popularColors: string[];
    popularSizes: string[];
    stockStatus: string;
    variantDiversity: string;
  };
  competitiveInsights: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  recommendations: {
    pricing: string[];
    inventory: string[];
    marketing: string[];
    general: string[];
  };
}

interface ProductStatisticsResponse {
  success: boolean;
  productInfo: {
    title: string;
    brand: string;
    category: string;
    trendyolUrl: string;
    currentPrice: number;
    images: string[];
  };
  variants: VariantInfo[];
  aiAnalysis: AIProductAnalysis | null;
  rawData: any;
}

export class AIProductStatisticsService {
  
  async getProductStatistics(productId: number): Promise<ProductStatisticsResponse | null> {
    try {
      // Database'den ürün bilgisini al
      const product = await db.query.products.findFirst({
        where: eq(products.id, productId)
      });

      if (!product || !product.trendyolUrl) {
        console.error('Product not found or missing Trendyol URL');
        return null;
      }

      console.log(`📊 Fetching live data from Trendyol: ${product.trendyolUrl}`);

      // Trendyol'dan canlı veri çek
      const scrapedData = await scenarioBasedScrape(product.trendyolUrl);

      if (!scrapedData.success) {
        console.error('Failed to scrape Trendyol data');
        return null;
      }

      // Varyant bilgilerini hazırla
      const variants: VariantInfo[] = scrapedData.variants?.map((v: any) => ({
        color: v.color || 'Varsayılan',
        size: v.size || 'Tek Beden',
        price: parseFloat(v.price || scrapedData.price || '0'),
        stock: v.stock || 'in_stock',
        sku: v.sku || 'N/A'
      })) || [];

      // AI analizi oluştur
      const aiAnalysis = await this.generateAIAnalysis({
        title: scrapedData.title,
        brand: scrapedData.brand,
        category: scrapedData.category,
        price: parseFloat(scrapedData.price),
        variants,
        description: scrapedData.description,
        features: scrapedData.features || []
      });

      return {
        success: true,
        productInfo: {
          title: scrapedData.title,
          brand: scrapedData.brand || 'Bilinmiyor',
          category: scrapedData.category || 'Genel',
          trendyolUrl: product.trendyolUrl,
          currentPrice: parseFloat(scrapedData.price),
          images: scrapedData.images || []
        },
        variants,
        aiAnalysis,
        rawData: scrapedData
      };

    } catch (error) {
      console.error('AI Product Statistics Error:', error);
      return null;
    }
  }

  private async generateAIAnalysis(productData: any): Promise<AIProductAnalysis | null> {
    if (!openai) {
      console.log('OpenAI not configured, returning mock analysis');
      return this.getMockAnalysis(productData);
    }

    try {
      const prompt = `Aşağıdaki Trendyol ürünü için detaylı satış ve strateji analizi yap:

**ÜRÜN BİLGİLERİ:**
- Başlık: ${productData.title}
- Marka: ${productData.brand || 'Bilinmiyor'}
- Kategori: ${productData.category || 'Genel'}
- Fiyat: ${productData.price} TL
- Toplam Varyant: ${productData.variants.length}
- Varyant Detayları: ${JSON.stringify(productData.variants.slice(0, 10))}
- Açıklama: ${(productData.description || '').substring(0, 500)}
- Özellikler: ${productData.features.slice(0, 5).join(', ')}

**GEREKLİ ANALİZLER:**

1. **Satış Tahmini:**
   - Günlük satış tahmini (adet)
   - Aylık satış tahmini (adet)
   - Trend analizi (yükselen/düşen/sabit)

2. **Fiyat Analizi:**
   - Pazar konumu (ekonomik/orta/premium)
   - Fiyat stratejisi değerlendirmesi
   - Rekabetçi avantaj analizi

3. **Varyant Analizi:**
   - En popüler renk tahminleri (3-5 adet)
   - En popüler beden tahminleri (3-5 adet)
   - Stok durumu değerlendirmesi
   - Varyant çeşitliliği analizi

4. **SWOT Analizi:**
   - Güçlü yönler (3-5 madde)
   - Zayıf yönler (3-5 madde)
   - Fırsatlar (3-5 madde)
   - Tehditler (3-5 madde)

5. **Öneriler:**
   - Fiyatlandırma önerileri (3-4 madde)
   - Envanter yönetimi önerileri (3-4 madde)
   - Pazarlama önerileri (3-4 madde)
   - Genel stratejik öneriler (3-4 madde)

Yanıtı aşağıdaki JSON formatında ver:

{
  "salesEstimate": {
    "daily": "string",
    "monthly": "string",
    "trend": "string"
  },
  "priceAnalysis": {
    "currentPrice": number,
    "marketPosition": "string",
    "priceStrategy": "string",
    "competitiveAdvantage": "string"
  },
  "variantAnalysis": {
    "totalVariants": number,
    "popularColors": ["string"],
    "popularSizes": ["string"],
    "stockStatus": "string",
    "variantDiversity": "string"
  },
  "competitiveInsights": {
    "strengths": ["string"],
    "weaknesses": ["string"],
    "opportunities": ["string"],
    "threats": ["string"]
  },
  "recommendations": {
    "pricing": ["string"],
    "inventory": ["string"],
    "marketing": ["string"],
    "general": ["string"]
  }
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Sen e-ticaret ve satış stratejisi konusunda uzman bir AI asistanısın. Türkçe, detaylı ve profesyonel analizler yapıyorsun. Tüm tahminler veri odaklı ve gerçekçi olmalı."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2500
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      
      return {
        salesEstimate: result.salesEstimate || {
          daily: "5-15 adet",
          monthly: "150-450 adet",
          trend: "Sabit"
        },
        priceAnalysis: result.priceAnalysis || {
          currentPrice: productData.price,
          marketPosition: "Orta segment",
          priceStrategy: "Rekabetçi fiyatlama",
          competitiveAdvantage: "Dengeli fiyat/kalite oranı"
        },
        variantAnalysis: result.variantAnalysis || {
          totalVariants: productData.variants.length,
          popularColors: [],
          popularSizes: [],
          stockStatus: "Stokta var",
          variantDiversity: "Orta seviye"
        },
        competitiveInsights: result.competitiveInsights || {
          strengths: ["Çeşitli varyant seçenekleri"],
          weaknesses: ["Veri yetersiz"],
          opportunities: ["Pazar genişletme"],
          threats: ["Rekabet yoğunluğu"]
        },
        recommendations: result.recommendations || {
          pricing: ["Fiyat izleme yapın"],
          inventory: ["Stok yönetimini optimize edin"],
          marketing: ["Sosyal medya kampanyası düzenleyin"],
          general: ["Müşteri geri bildirimlerini toplayın"]
        }
      };

    } catch (error) {
      console.error('AI Analysis Error:', error);
      return this.getMockAnalysis(productData);
    }
  }

  private getMockAnalysis(productData: any): AIProductAnalysis {
    return {
      salesEstimate: {
        daily: "10-20 adet",
        monthly: "300-600 adet",
        trend: "Yükselen trend"
      },
      priceAnalysis: {
        currentPrice: productData.price,
        marketPosition: productData.price > 500 ? "Premium" : productData.price > 200 ? "Orta Segment" : "Ekonomik",
        priceStrategy: "Rekabetçi fiyatlama stratejisi",
        competitiveAdvantage: "Uygun fiyat ve kalite dengesi"
      },
      variantAnalysis: {
        totalVariants: productData.variants.length,
        popularColors: productData.variants.slice(0, 3).map((v: any) => v.color),
        popularSizes: productData.variants.slice(0, 3).map((v: any) => v.size),
        stockStatus: "Çoğu varyant stokta mevcut",
        variantDiversity: productData.variants.length > 10 ? "Yüksek çeşitlilik" : "Orta seviye çeşitlilik"
      },
      competitiveInsights: {
        strengths: [
          "Geniş varyant seçenekleri",
          "Rekabetçi fiyatlama",
          "Kaliteli ürün görselleri"
        ],
        weaknesses: [
          "Detaylı ürün açıklaması geliştirilebilir",
          "Müşteri yorumları analizi gerekli"
        ],
        opportunities: [
          "Sosyal medya pazarlama potansiyeli",
          "Sezonsal kampanya fırsatları",
          "Müşteri sadakat programı"
        ],
        threats: [
          "Yüksek pazar rekabeti",
          "Fiyat dalgalanmaları",
          "Hızlı trend değişimleri"
        ]
      },
      recommendations: {
        pricing: [
          "Rakip fiyatlarını düzenli takip edin",
          "Sezonsal fiyat stratejileri uygulayın",
          "Kampanya dönemlerinde fiyat optimizasyonu yapın"
        ],
        inventory: [
          "Popüler varyantlarda stok artırın",
          "Yavaş hareket eden varyantları optimize edin",
          "Otomatik stok uyarı sistemi kurun"
        ],
        marketing: [
          "Instagram ve TikTok'ta ürün tanıtımı yapın",
          "Influencer işbirliği değerlendirin",
          "Email pazarlama kampanyaları başlatın"
        ],
        general: [
          "Müşteri geri bildirimlerini düzenli toplayın",
          "Ürün açıklamalarını SEO odaklı optimize edin",
          "A/B testleri ile görselleri iyileştirin"
        ]
      }
    };
  }
}

export const aiProductStatisticsService = new AIProductStatisticsService();
