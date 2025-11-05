import { db } from './db';
import { products, productVariants, priceHistory, stockHistory } from '@shared/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

interface PriceHistoryData {
  date: string;
  price: number;
  change: number;
}

interface VariantChangeData {
  variantId: number;
  color: string;
  size: string;
  changeType: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
}

interface AIInsights {
  salesEstimate: string;
  popularVariants: string[];
  priceStrategy: string;
  competitiveAnalysis: string;
  recommendations: string[];
}

interface ProductStatisticsResponse {
  productId: number;
  title: string;
  brand: string;
  category: string;
  currentPrice: string;
  priceHistory: PriceHistoryData[];
  variantChanges: VariantChangeData[];
  aiInsights: AIInsights | null;
}

export class ProductStatisticsService {
  
  async getProductStatistics(productId: number): Promise<ProductStatisticsResponse | null> {
    // Ürün bilgilerini al
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
      with: {
        variants: {
          with: {
            priceHistory: {
              orderBy: [desc(priceHistory.createdAt)],
              limit: 100 // Son 100 fiyat değişikliği
            },
            stockHistory: {
              orderBy: [desc(stockHistory.createdAt)],
              limit: 50 // Son 50 stok değişikliği
            }
          }
        }
      }
    });

    if (!product) {
      return null;
    }

    // Fiyat geçmişini hazırla
    const allPriceChanges: PriceHistoryData[] = [];
    
    product.variants.forEach(variant => {
      variant.priceHistory.forEach(history => {
        const oldPriceNum = parseFloat(history.oldPrice || '0');
        const newPriceNum = parseFloat(history.newPrice);
        const change = oldPriceNum > 0 
          ? ((newPriceNum - oldPriceNum) / oldPriceNum) * 100 
          : 0;

        allPriceChanges.push({
          date: history.createdAt.toISOString(),
          price: newPriceNum,
          change: change
        });
      });
    });

    // Tarihe göre sırala
    allPriceChanges.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Varyant değişikliklerini hazırla
    const variantChanges: VariantChangeData[] = [];
    
    product.variants.forEach(variant => {
      // Fiyat değişiklikleri
      variant.priceHistory.forEach(history => {
        variantChanges.push({
          variantId: variant.id,
          color: variant.color,
          size: variant.size,
          changeType: 'Fiyat',
          oldValue: history.oldPrice ? `${parseFloat(history.oldPrice).toFixed(2)} TL` : '-',
          newValue: `${parseFloat(history.newPrice).toFixed(2)} TL`,
          changedAt: history.createdAt.toISOString()
        });
      });

      // Stok değişiklikleri
      variant.stockHistory.forEach(history => {
        variantChanges.push({
          variantId: variant.id,
          color: variant.color,
          size: variant.size,
          changeType: 'Stok',
          oldValue: `${history.oldStock} adet`,
          newValue: `${history.newStock} adet`,
          changedAt: history.createdAt.toISOString()
        });
      });
    });

    // Tarihe göre sırala (en yeniden eskiye)
    variantChanges.sort((a, b) => 
      new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
    );

    // AI insights oluştur
    const aiInsights = await this.generateAIInsights(product, allPriceChanges, variantChanges);

    return {
      productId: product.id,
      title: product.title,
      brand: product.brand || 'Bilinmiyor',
      category: product.category || 'Genel',
      currentPrice: product.currentPrice,
      priceHistory: allPriceChanges,
      variantChanges: variantChanges.slice(0, 50), // Son 50 değişiklik
      aiInsights
    };
  }

  private async generateAIInsights(
    product: any, 
    priceHistory: PriceHistoryData[], 
    variantChanges: VariantChangeData[]
  ): Promise<AIInsights | null> {
    if (!openai) {
      console.log('OpenAI API key not configured, skipping AI insights');
      return null;
    }

    try {
      // Fiyat trendlerini analiz et
      const priceChanges = priceHistory.map(h => h.change);
      const avgPriceChange = priceChanges.length > 0 
        ? priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length 
        : 0;

      // Varyant bilgilerini topla
      const colorVariants = [...new Set(variantChanges.map(v => v.color))];
      const sizeVariants = [...new Set(variantChanges.map(v => v.size))];

      const prompt = `Aşağıdaki Trendyol ürünü için satış ve strateji analizi yap:

Ürün: ${product.title}
Marka: ${product.brand || 'Bilinmiyor'}
Kategori: ${product.category || 'Genel'}
Güncel Fiyat: ${parseFloat(product.currentPrice).toFixed(2)} TL
Toplam Fiyat Değişikliği: ${priceHistory.length}
Ortalama Fiyat Değişimi: ${avgPriceChange.toFixed(2)}%
Renk Seçenekleri: ${colorVariants.length} (${colorVariants.slice(0, 5).join(', ')})
Beden Seçenekleri: ${sizeVariants.length} (${sizeVariants.slice(0, 5).join(', ')})

Lütfen şu bilgileri sağla:
1. Satış Tahmini (günlük/aylık)
2. En popüler 3-5 varyant tahmini
3. Fiyat stratejisi değerlendirmesi
4. Rekabet avantajları ve dezavantajları
5. 3-5 stratejik öneri

Yanıtı JSON formatında ver:
{
  "salesEstimate": "string",
  "popularVariants": ["string"],
  "priceStrategy": "string",
  "competitiveAnalysis": "string",
  "recommendations": ["string"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Sen e-ticaret ürün analizi konusunda uzman bir AI asistanısın. Türkçe yanıtlar veriyorsun."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1500
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      
      return {
        salesEstimate: result.salesEstimate || 'Veri yetersiz',
        popularVariants: result.popularVariants || [],
        priceStrategy: result.priceStrategy || 'Analiz edilemiyor',
        competitiveAnalysis: result.competitiveAnalysis || 'Veri yetersiz',
        recommendations: result.recommendations || []
      };

    } catch (error) {
      console.error('AI insights generation error:', error);
      return null;
    }
  }
}

export const productStatisticsService = new ProductStatisticsService();
