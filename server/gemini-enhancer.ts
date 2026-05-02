import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

const MODEL = 'gemini-2.0-flash';

export interface GeminiValidationResult {
  isValid: boolean;
  confidence: number;
  correctedTitle?: string;
  correctedPrice?: number;
  suggestedCategory?: string;
  seoKeywords?: string[];
  productSummary?: string;
  brandVerified?: boolean;
  source: 'gemini';
}

export interface GeminiPriceValidation {
  bestPrice: number;
  confidence: number;
  reasoning: string;
  isReasonable: boolean;
}

function isEnabled(): boolean {
  return genAI !== null;
}

/**
 * Ürün verilerini Gemini ile hızlıca doğrula ve zenginleştir
 * OpenAI ile paralel çalışarak çift doğrulama sağlar
 */
export async function validateProductWithGemini(product: {
  title: string;
  brand: string;
  price: number;
  category?: string;
  description?: string;
  colors?: string[];
  sizes?: string[];
}): Promise<GeminiValidationResult | null> {
  if (!isEnabled()) {
    console.log('⚠️ Gemini API anahtarı yok - Gemini doğrulaması atlanıyor');
    return null;
  }

  try {
    const model = genAI!.getGenerativeModel({ model: MODEL });

    const prompt = `Sen bir Türk e-ticaret ürün uzmanısın. Aşağıdaki ürün verilerini hızlıca analiz et ve JSON formatında yanıt ver.

ÜRÜN:
- Başlık: ${product.title}
- Marka: ${product.brand}
- Fiyat: ${product.price} TL
- Kategori: ${product.category || 'Belirtilmemiş'}
- Renkler: ${product.colors?.join(', ') || 'Yok'}
- Bedenler: ${product.sizes?.join(', ') || 'Yok'}
${product.description ? `- Açıklama: ${product.description.substring(0, 200)}` : ''}

Şu JSON yapısında yanıt ver (başka hiçbir şey yazma):
{
  "isValid": true/false,
  "confidence": 0-100,
  "correctedTitle": "düzeltilmiş başlık veya null",
  "suggestedCategory": "önerilen Shopify kategorisi",
  "seoKeywords": ["anahtar1", "anahtar2", "anahtar3"],
  "productSummary": "1-2 cümlelik Türkçe özet",
  "brandVerified": true/false
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini geçersiz JSON döndürdü');

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`✅ Gemini doğrulama: güven=${parsed.confidence}%, geçerli=${parsed.isValid}`);

    return { ...parsed, source: 'gemini' };
  } catch (err) {
    console.error('❌ Gemini doğrulama hatası:', (err as Error).message);
    return null;
  }
}

/**
 * Gemini ile fiyat doğrulaması — birden fazla fiyat adayı arasından en doğrusunu seç
 */
export async function validatePriceWithGemini(
  candidates: Array<{ price: number; source: string }>,
  productTitle: string,
  htmlSnippet?: string
): Promise<GeminiPriceValidation | null> {
  if (!isEnabled() || candidates.length === 0) return null;

  try {
    const model = genAI!.getGenerativeModel({ model: MODEL });

    const candidateText = candidates
      .map((c, i) => `${i + 1}. ${c.price} TL (kaynak: ${c.source})`)
      .join('\n');

    const prompt = `Türk e-ticaret sitesinde "${productTitle}" ürünü için fiyat adayları:

${candidateText}
${htmlSnippet ? `\nHTML ipuçları: ${htmlSnippet.substring(0, 300)}` : ''}

Gerçek satış fiyatını belirle. Sadece JSON döndür:
{
  "bestPrice": <sayı>,
  "confidence": <0-100>,
  "reasoning": "<kısa açıklama>",
  "isReasonable": <true/false>
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON bulunamadı');

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`✅ Gemini fiyat doğrulama: ${parsed.bestPrice} TL (güven: ${parsed.confidence}%)`);
    return parsed;
  } catch (err) {
    console.error('❌ Gemini fiyat doğrulama hatası:', (err as Error).message);
    return null;
  }
}

/**
 * Hem OpenAI hem Gemini sonuçlarını birleştirerek en güvenilir veriyi döndür
 * Her iki AI da aynı sonucu verirse güven çok yüksek
 */
export function mergeAIResults(
  openaiResult: any,
  geminiResult: GeminiValidationResult | null
): { merged: any; dualValidated: boolean; finalConfidence: number } {
  if (!geminiResult) {
    return { merged: openaiResult, dualValidated: false, finalConfidence: openaiResult?.qualityScore || 70 };
  }

  const dualValidated = geminiResult.isValid && (openaiResult?.qualityScore || 0) > 60;

  const finalConfidence = dualValidated
    ? Math.min(99, ((openaiResult?.qualityScore || 70) + geminiResult.confidence) / 2 + 10)
    : Math.max((openaiResult?.qualityScore || 70), geminiResult.confidence);

  const merged = {
    ...openaiResult,
    seoKeywords: [
      ...(openaiResult?.suggestedTags || []),
      ...(geminiResult.seoKeywords || [])
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 10),
    suggestedCategory: openaiResult?.categoryMatch || geminiResult.suggestedCategory,
    productSummary: geminiResult.productSummary,
    dualAIValidated: dualValidated,
    geminiConfidence: geminiResult.confidence,
    finalConfidence,
  };

  console.log(`🤖 Çift AI doğrulama: OpenAI + Gemini → güven=${finalConfidence.toFixed(0)}%, çift=${dualValidated}`);
  return { merged, dualValidated, finalConfidence };
}

export const geminiEnhancer = {
  isEnabled,
  validateProduct: validateProductWithGemini,
  validatePrice: validatePriceWithGemini,
  mergeResults: mergeAIResults,
};
