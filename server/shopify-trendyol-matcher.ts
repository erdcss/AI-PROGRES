import { Router } from 'express';
import { db } from './db';
import { products, productVariants } from '../shared/schema';
import { scenarioBasedScrape } from './scenario-based-scraper';
import { eq, isNotNull } from 'drizzle-orm';
import axios from 'axios';
import NodeTelegramBotApi from 'node-telegram-bot-api';

const router = Router();

// Telegram bot setup
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramBot = telegramBotToken ? new NodeTelegramBotApi(telegramBotToken, { polling: false }) : null;

interface ShopifyProduct {
  id: number;
  title: string;
  brand?: string;
  shopifyPrice?: string;
  variants?: any[];
}

interface TrendyolSearchResult {
  url: string;
  title: string;
  price: string;
  originalPrice?: string;
  brand?: string;
  inStock: boolean;
  variants?: any[];
  discount?: string;
}

interface MatchResult {
  shopifyProduct: ShopifyProduct;
  trendyolMatches: TrendyolSearchResult[];
  bestMatch?: TrendyolSearchResult;
  priceComparison?: {
    shopifyPrice: number;
    trendyolPrice: number;
    profitMargin: number;
    profitable: boolean;
  };
}

// Trendyol'da ürün arama fonksiyonu
async function searchProductOnTrendyol(productTitle: string, brand?: string): Promise<TrendyolSearchResult[]> {
  try {
    console.log(`🔍 Trendyol'da arıyor: "${productTitle}"`);
    
    // Ürün adını arama için temizle
    const searchQuery = productTitle
      .replace(/[^\w\sÇĞıİÖŞÜçğıiöşü]/g, '') // Özel karakterleri temizle
      .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluk yap
      .trim();

    // Trendyol arama URL'si
    const searchUrl = `https://www.trendyol.com/sr?q=${encodeURIComponent(searchQuery)}`;
    
    console.log(`🌐 Arama URL'si: ${searchUrl}`);

    // Scenario-based scraper ile arama sayfasını parse et
    const searchResults = await scenarioBasedScrape(searchUrl);
    
    if (!searchResults.success || !searchResults.products) {
      console.log(`❌ "${productTitle}" için arama sonucu bulunamadı`);
      return [];
    }

    // Arama sonuçlarını filtrele ve formatla
    const matches: TrendyolSearchResult[] = searchResults.products
      .slice(0, 5) // İlk 5 sonucu al
      .map((product: any) => ({
        url: product.url || '',
        title: product.title || '',
        price: product.price || '0',
        originalPrice: product.originalPrice,
        brand: product.brand,
        inStock: product.inStock !== false,
        variants: product.variants || [],
        discount: product.discount
      }));

    console.log(`✅ "${productTitle}" için ${matches.length} eşleşme bulundu`);
    return matches;

  } catch (error) {
    console.error(`❌ Trendyol arama hatası (${productTitle}):`, error);
    return [];
  }
}

// En iyi eşleşmeyi bul
function findBestMatch(shopifyTitle: string, trendyolResults: TrendyolSearchResult[]): TrendyolSearchResult | undefined {
  if (trendyolResults.length === 0) return undefined;

  // Basit string similarity ile en iyi eşleşmeyi bul
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    return (longer.length - editDistance) / longer.length;
  };

  let bestMatch = trendyolResults[0];
  let bestScore = calculateSimilarity(shopifyTitle, bestMatch.title);

  for (const result of trendyolResults) {
    const score = calculateSimilarity(shopifyTitle, result.title);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }

  return bestScore > 0.3 ? bestMatch : undefined; // En az %30 benzerlik
}

// Levenshtein distance algoritması
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

// Fiyat karşılaştırması yap
function comparePrices(shopifyPrice: string, trendyolPrice: string) {
  const shopifyNum = parseFloat(shopifyPrice.replace(/[^\d.,]/g, '').replace(',', '.'));
  const trendyolNum = parseFloat(trendyolPrice.replace(/[^\d.,]/g, '').replace(',', '.'));
  
  if (isNaN(shopifyNum) || isNaN(trendyolNum)) return null;

  const profitMargin = ((shopifyNum - trendyolNum) / trendyolNum) * 100;
  
  return {
    shopifyPrice: shopifyNum,
    trendyolPrice: trendyolNum,
    profitMargin: profitMargin,
    profitable: profitMargin > 0
  };
}

// Telegram mesajı gönder
async function sendTelegramReport(matches: MatchResult[]) {
  if (!telegramBot) {
    console.log('❌ Telegram bot token bulunamadı');
    return;
  }

  try {
    // Profitable ürünleri filtrele
    const profitableMatches = matches.filter(match => 
      match.priceComparison?.profitable && match.priceComparison.profitMargin > 10
    );

    const report = `🎯 *Shopify-Trendyol Fiyat Analizi*

📊 *Genel Durum:*
• Toplam ürün: ${matches.length}
• Eşleşme bulunan: ${matches.filter(m => m.bestMatch).length}
• Karlı ürün: ${profitableMatches.length}

💰 *En Karlı Ürünler:*
${profitableMatches.slice(0, 10).map(match => {
  const comparison = match.priceComparison!;
  return `• ${match.shopifyProduct.title.substring(0, 40)}...
  Shopify: ${comparison.shopifyPrice.toLocaleString('tr-TR')} TL
  Trendyol: ${comparison.trendyolPrice.toLocaleString('tr-TR')} TL
  Kar: %${comparison.profitMargin.toFixed(1)}`;
}).join('\n\n')}

${profitableMatches.length > 10 ? `\n📋 Ve ${profitableMatches.length - 10} ürün daha...` : ''}

⏰ Analiz Zamanı: ${new Date().toLocaleString('tr-TR')}`;

    // Telegram'a gönder (grup chat ID kullan)
    const chatId = '-1002405506985'; // Grup chat ID'nizi buraya yazın
    
    await telegramBot.sendMessage(chatId, report, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true 
    });

    console.log('✅ Telegram raporu gönderildi');
  } catch (error) {
    console.error('❌ Telegram gönderim hatası:', error);
  }
}

// Ana matching endpoint'i
router.post('/match-shopify-products', async (req, res) => {
  try {
    console.log('🚀 Shopify-Trendyol ürün eşleştirme başlıyor...');

    // Hafızadaki Shopify ürünlerini al
    const shopifyProducts = await db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        currentPrice: products.currentPrice,
        shopifyProductId: products.shopifyProductId
      })
      .from(products)
      .where(isNotNull(products.shopifyProductId))
      .limit(50); // İlk 50 ürünle test

    console.log(`📦 ${shopifyProducts.length} Shopify ürünü bulundu`);

    const matches: MatchResult[] = [];

    // Her ürün için Trendyol'da arama yap
    for (let i = 0; i < shopifyProducts.length; i++) {
      const product = shopifyProducts[i];
      
      console.log(`🔄 İşleniyor ${i + 1}/${shopifyProducts.length}: ${product.title}`);

      try {
        // Trendyol'da ara
        const trendyolResults = await searchProductOnTrendyol(product.title, product.brand || undefined);
        
        // En iyi eşleşmeyi bul
        const bestMatch = findBestMatch(product.title, trendyolResults);
        
        const matchResult: MatchResult = {
          shopifyProduct: {
            id: product.id,
            title: product.title,
            brand: product.brand || undefined,
            shopifyPrice: product.currentPrice?.toString()
          },
          trendyolMatches: trendyolResults,
          bestMatch
        };

        // Fiyat karşılaştırması yap
        if (bestMatch && product.currentPrice) {
          const priceComparison = comparePrices(product.currentPrice.toString(), bestMatch.price);
          if (priceComparison) {
            matchResult.priceComparison = priceComparison;
          }
        }

        matches.push(matchResult);

        // Rate limiting için bekleme
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Ürün işleme hatası (${product.title}):`, error);
      }
    }

    console.log(`✅ ${matches.length} ürün işlendi`);

    // Telegram'a rapor gönder
    await sendTelegramReport(matches);

    res.json({
      success: true,
      message: `${matches.length} ürün başarıyla analiz edildi`,
      totalMatches: matches.filter(m => m.bestMatch).length,
      profitableProducts: matches.filter(m => m.priceComparison?.profitable).length,
      matches: matches.slice(0, 10) // İlk 10 sonucu döndür
    });

  } catch (error) {
    console.error('❌ Matching hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Ürün eşleştirme sırasında hata oluştu'
    });
  }
});

// Belirli bir ürün için detaylı analiz
router.post('/analyze-single-product/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    
    const product = await db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        currentPrice: products.currentPrice,
        shopifyProductId: products.shopifyProductId
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (product.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ürün bulunamadı'
      });
    }

    const shopifyProduct = product[0];
    
    // Trendyol'da ara
    const trendyolResults = await searchProductOnTrendyol(shopifyProduct.title, shopifyProduct.brand || undefined);
    const bestMatch = findBestMatch(shopifyProduct.title, trendyolResults);
    
    let priceComparison = null;
    if (bestMatch && shopifyProduct.currentPrice) {
      priceComparison = comparePrices(shopifyProduct.currentPrice.toString(), bestMatch.price);
    }

    res.json({
      success: true,
      shopifyProduct,
      trendyolResults,
      bestMatch,
      priceComparison
    });

  } catch (error) {
    console.error('❌ Tek ürün analiz hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Ürün analizi sırasında hata oluştu'
    });
  }
});

export default router;