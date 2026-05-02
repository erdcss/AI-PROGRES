import OpenAI from "openai";
import { validatePriceWithGemini } from "./gemini-enhancer";

interface PriceAnalysisResult {
  extractedPrice: number;
  confidence: number;
  reasoning: string;
  priceType: 'original' | 'discounted' | 'sale' | 'current';
  currency: string;
  isReasonable: boolean;
}

interface OpenAIPriceRequest {
  htmlContent: string;
  extractedPrices: Array<{
    price: number;
    source: string;
    method: string;
  }>;
  productTitle?: string;
  productCategory?: string;
}

export class OpenAIPriceEnhancer {
  private openai: OpenAI;
  private isEnabled: boolean = false;

  constructor() {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    try {
      const openaiKey = process.env.OPENAI_API_KEY_NEW || process.env.OPENAI_API_KEY;
      if (openaiKey) {
        this.openai = new OpenAI({
          apiKey: openaiKey
        });
        this.isEnabled = true;
        console.log('🤖 OpenAI Price Enhancer başlatıldı - GPT-4o model aktif');
      } else {
        console.log('⚠️ OpenAI API anahtarı bulunamadı - OpenAI desteği pasif');
      }
    } catch (error) {
      console.error('❌ OpenAI başlatma hatası:', error);
      this.isEnabled = false;
    }
  }

  /**
   * OpenAI ile fiyat analizi yap - kritik durumlarda devreye girer
   */
  async enhancePriceExtraction(request: OpenAIPriceRequest): Promise<PriceAnalysisResult | null> {
    if (!this.isEnabled) {
      console.log('⚠️ OpenAI pasif - standart fiyat algılama kullanılacak');
      return null;
    }

    try {
      console.log('🤖 OpenAI Price Analysis başlatılıyor...');
      
      const prompt = this.buildPriceAnalysisPrompt(request);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "Sen bir e-ticaret fiyat analiz uzmanısın. Trendyol HTML içeriğini analiz edip en doğru fiyatı tespit ediyorsun. Türk Lirası formatlarını (2.957,52 TL) doğru okuyup JSON formatında cevap veriyorsun."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 800
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (result.extractedPrice && result.confidence) {
        console.log(`🎯 OpenAI fiyat analizi: ${result.extractedPrice} TL (güven: ${result.confidence}%)`);
        console.log(`📝 Gerekçe: ${result.reasoning}`);
        
        return {
          extractedPrice: parseFloat(result.extractedPrice),
          confidence: result.confidence / 100,
          reasoning: result.reasoning || 'OpenAI analysis',
          priceType: result.priceType || 'current',
          currency: result.currency || 'TL',
          isReasonable: result.isReasonable !== false
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ OpenAI fiyat analizi hatası:', error);
      return null;
    }
  }

  /**
   * Zor durumlarda HTML içeriğini OpenAI ile analiz et
   */
  async analyzeComplexPrice(htmlContent: string, productTitle?: string): Promise<PriceAnalysisResult | null> {
    if (!this.isEnabled) return null;

    try {
      console.log('🔍 OpenAI karmaşık fiyat analizi başlatılıyor...');
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: `Sen bir Trendyol fiyat uzmanısın. HTML içeriğinde gizli fiyatları bulup çıkarıyorsun.

            Önemli kurallar:
            1. Türk Lirası formatını doğru oku (2.957,52 TL = 2957.52)
            2. Binlik ayırıcı nokta (.), ondalık ayırıcı virgül (,)
            3. İndirimli fiyat varsa onu tercih et
            4. 10 TL altı ve 50.000 TL üstü fiyatları şüpheli kabul et
            5. JSON formatında cevap ver

            Çıktı formatı:
            {
              "extractedPrice": sayı,
              "confidence": 0-100 arası güven skoru,
              "reasoning": "neden bu fiyatı seçtin",
              "priceType": "original|discounted|sale|current",
              "currency": "TL",
              "isReasonable": true/false
            }`
          },
          {
            role: "user",
            content: `Ürün: ${productTitle || 'Bilinmiyor'}

            HTML İçerik (fiyat bilgilerini analiz et):
            ${htmlContent.slice(0, 4000)}...
            
            Bu HTML'den en doğru fiyatı çıkar ve analiz et.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 600
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (result.extractedPrice) {
        console.log(`🤖 OpenAI karmaşık analiz: ${result.extractedPrice} TL`);
        return {
          extractedPrice: parseFloat(result.extractedPrice),
          confidence: (result.confidence || 70) / 100,
          reasoning: result.reasoning || 'OpenAI complex analysis',
          priceType: result.priceType || 'current',
          currency: result.currency || 'TL',
          isReasonable: result.isReasonable !== false
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ OpenAI karmaşık analiz hatası:', error);
      return null;
    }
  }

  /**
   * Fiyat doğrulama - mevcut sonuçları OpenAI ile kontrol et
   */
  async validatePriceResults(prices: Array<{price: number, method: string}>, context?: string): Promise<{
    recommendedPrice: number;
    confidence: number;
    reasoning: string;
    dualValidated?: boolean;
  } | null> {
    if (!this.isEnabled || prices.length === 0) return null;

    try {
      console.log('✅ OpenAI + Gemini paralel fiyat doğrulama başlatılıyor...');

      const candidates = prices.map(p => ({ price: p.price, source: p.method }));

      // OpenAI ve Gemini'yi paralel çalıştır
      const [openaiResponse, geminiResult] = await Promise.all([
        this.openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "system",
              content: `Sen bir e-ticaret fiyat doğrulama uzmanısın. Çoklu fiyat seçeneklerinden en makul olanını seçiyorsun.

            Kriterler:
            1. 10-50.000 TL arasında olmalı
            2. Lüks ürünlerde (>1000 TL) yüksek fiyat tercih et
            3. Normal ürünlerde (<1000 TL) düşük fiyat tercih et  
            4. Aşırı indirimli fiyatlar şüpheli
            5. JSON formatında cevap ver

            Çıktı:
            {
              "recommendedPrice": en_iyi_fiyat,
              "confidence": 0-100_güven_skoru,
              "reasoning": "seçim_gerekçesi"
            }`
            },
            {
              role: "user",
              content: `Tespit edilen fiyatlar:
${prices.map((p, i) => `${i+1}. ${p.price} TL (Yöntem: ${p.method})`).join('\n')}

Ek bilgi: ${context || 'Yok'}

Bu fiyatlardan en doğru olanını seç ve gerekçesini açıkla.`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 400
        }),
        validatePriceWithGemini(candidates, context || 'Trendyol ürünü').catch(() => null)
      ]);

      const openaiData = JSON.parse(openaiResponse.choices[0].message.content || '{}');
      const openaiPrice = parseFloat(openaiData.recommendedPrice) || 0;
      const geminiPrice = geminiResult?.bestPrice || 0;

      // İki AI aynı fiyatı öneriyorsa çift doğrulama
      const priceDiff = openaiPrice > 0 && geminiPrice > 0
        ? Math.abs(openaiPrice - geminiPrice) / Math.max(openaiPrice, geminiPrice)
        : 1;
      const dualValidated = priceDiff < 0.05; // %5 fark toleransı

      // En yüksek güven skoruna sahip fiyatı seç
      let recommendedPrice = openaiPrice;
      let confidence = (openaiData.confidence || 80) / 100;

      if (geminiResult && geminiResult.confidence > (openaiData.confidence || 0)) {
        recommendedPrice = geminiPrice;
        confidence = geminiResult.confidence / 100;
      }

      if (dualValidated) {
        confidence = Math.min(0.99, confidence + 0.10);
        console.log(`✅ Çift AI fiyat doğrulama: OpenAI=${openaiPrice} TL, Gemini=${geminiPrice} TL → UYUMLU`);
      } else {
        console.log(`⚠️ AI fiyat farkı: OpenAI=${openaiPrice} TL, Gemini=${geminiPrice} TL → ${(priceDiff*100).toFixed(1)}% fark`);
      }

      if (recommendedPrice > 0) {
        console.log(`🎯 Seçilen fiyat: ${recommendedPrice} TL (güven: ${(confidence*100).toFixed(0)}%, çift=${dualValidated})`);
        return {
          recommendedPrice,
          confidence,
          reasoning: openaiData.reasoning || geminiResult?.reasoning || 'Çift AI doğrulama',
          dualValidated,
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Fiyat doğrulama hatası:', error);
      return null;
    }
  }

  private buildPriceAnalysisPrompt(request: OpenAIPriceRequest): string {
    const { htmlContent, extractedPrices, productTitle, productCategory } = request;
    
    return `Trendyol ürün sayfası fiyat analizi:

Ürün: ${productTitle || 'Bilinmiyor'}
Kategori: ${productCategory || 'Bilinmiyor'}

Çıkarılan fiyatlar:
${extractedPrices.map((p, i) => `${i+1}. ${p.price} TL (Kaynak: ${p.source}, Yöntem: ${p.method})`).join('\n')}

HTML İçerik (önemli kısımlar):
${htmlContent.slice(0, 3000)}...

Görev: Bu fiyatlardan en doğru olanını seç veya HTML'den yeni bir fiyat çıkar.

Türk Lirası formatı: 2.957,52 TL = 2957.52 TL
Lüks ürünler (>1000 TL): Yüksek fiyat tercih et
Normal ürünler (<1000 TL): Düşük fiyat tercih et

JSON formatında cevap ver:
{
  "extractedPrice": seçilen_fiyat_sayı,
  "confidence": 0-100_güven_skoru,
  "reasoning": "neden_bu_fiyatı_seçtin",
  "priceType": "original|discounted|sale|current",
  "currency": "TL",
  "isReasonable": true/false
}`;
  }

  /**
   * Acil durum fiyat çıkarma - son çare
   */
  async emergencyPriceExtraction(htmlSnippet: string): Promise<number | null> {
    if (!this.isEnabled) return null;

    try {
      console.log('🚨 OpenAI acil durum fiyat çıkarma...');
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "Sen fiyat çıkarma uzmanısın. HTML'den sadece sayısal fiyat çıkar. Türk Lirası formatını doğru oku (2.957,52 = 2957.52). Sadece sayı döndür."
          },
          {
            role: "user", 
            content: `Bu HTML parçasından fiyat çıkar (sadece sayı döndür):
            
${htmlSnippet.slice(0, 1000)}`
          }
        ],
        temperature: 0,
        max_tokens: 50
      });

      const result = response.choices[0].message.content?.trim();
      const price = parseFloat(result?.replace(/[^\d.,]/g, '').replace(',', '.') || '0');
      
      if (price > 0 && price < 50000) {
        console.log(`🚨 OpenAI acil durum fiyat: ${price} TL`);
        return price;
      }
      
      return null;
    } catch (error) {
      console.error('❌ OpenAI acil durum hatası:', error);
      return null;
    }
  }

  isActive(): boolean {
    return this.isEnabled;
  }
}

// Singleton instance
export const openaiPriceEnhancer = new OpenAIPriceEnhancer();