/**
 * Trendyol Stok Tespit Sistemi
 * Gerçek stok verilerini çeker ve varyant bazında stok durumunu belirler
 */

import * as cheerio from 'cheerio';
import puppeteer, { Page } from 'puppeteer';

export interface StockVariant {
  color: string;
  size: string;
  inStock: boolean;
  stockCount?: number;
}

export interface StockAnalysis {
  variants: StockVariant[];
  stockMap: Record<string, boolean>; // "color-size": boolean
  totalVariants: number;
  inStockVariants: number;
}

/**
 * Trendyol sayfasından gerçek stok verilerini çıkarır
 */
export async function extractRealStockData(page: Page, $: cheerio.CheerioAPI): Promise<StockAnalysis> {
  console.log('🔧 GERÇEK STOK VERİSİ çıkarılıyor...');
  
  const analysis: StockAnalysis = {
    variants: [],
    stockMap: {},
    totalVariants: 0,
    inStockVariants: 0
  };

  try {
    // Sayfa yüklendikten sonra stok verilerini bekle
    await new Promise(resolve => setTimeout(resolve, 2000));

    // JavaScript ile stok durumunu kontrol et
    const stockData = await page.evaluate(() => {
      const variants: any[] = [];
      
      // Trendyol'un varyant butonlarını bul
      const colorElements = document.querySelectorAll('[data-testid*="color"], .pr-in-cn img, [class*="color"]');
      const sizeElements = document.querySelectorAll('[data-testid*="size"], .pr-in-sz button, [class*="size"]');
      
      // Renkleri çıkar
      const colors: string[] = [];
      colorElements.forEach(el => {
        const colorName = el.getAttribute('alt') || el.getAttribute('title') || (el as HTMLElement).innerText?.trim();
        if (colorName && !colors.includes(colorName)) {
          colors.push(colorName);
        }
      });
      
      // Bedenleri çıkar
      const sizes: string[] = [];
      sizeElements.forEach(el => {
        const sizeName = (el as HTMLElement).innerText?.trim() || el.getAttribute('data-size');
        if (sizeName && sizeName.match(/^(XS|S|M|L|XL|XXL|\d+)$/i)) {
          if (!sizes.includes(sizeName)) {
            sizes.push(sizeName);
          }
        }
      });
      
      console.log('JavaScript tarafında bulunan renkler:', colors);
      console.log('JavaScript tarafında bulunan bedenler:', sizes);
      
      // Her renk-beden kombinasyonu için stok durumunu kontrol et
      colors.forEach(color => {
        sizes.forEach(size => {
          // Kombination butonunu bul ve stok durumunu kontrol et
          const variantButton = document.querySelector(`[data-color="${color}"][data-size="${size}"]`) ||
                               document.querySelector(`button[title*="${color}"][title*="${size}"]`);
          
          let inStock = true;
          
          if (variantButton) {
            const isDisabled = variantButton.hasAttribute('disabled') ||
                              variantButton.classList.contains('disabled') ||
                              variantButton.classList.contains('out-of-stock') ||
                              variantButton.classList.contains('sold-out');
            inStock = !isDisabled;
          }
          
          variants.push({
            color,
            size,
            inStock,
            variantKey: `${color}-${size}`
          });
        });
      });
      
      return { variants, colors, sizes };
    });

    console.log(`🔧 JavaScript'ten ${stockData.variants.length} varyant bulundu`);
    
    // Sadece JavaScript verisi kullanılıyor - HTML fallback kaldırıldı
    
    // JavaScript verilerini entegre et
    stockData.variants.forEach(variant => {
      const existing = analysis.variants.find(v => 
        v.color.toLowerCase() === variant.color.toLowerCase() && 
        v.size.toLowerCase() === variant.size.toLowerCase()
      );
      
      if (!existing) {
        analysis.variants.push({
          color: variant.color,
          size: variant.size,
          inStock: variant.inStock
        });
        analysis.stockMap[variant.variantKey] = variant.inStock;
      }
    });
    
    analysis.totalVariants = analysis.variants.length;
    analysis.inStockVariants = analysis.variants.filter(v => v.inStock).length;
    
    console.log(`🔧 STOK ANALİZ SONUCU: ${analysis.inStockVariants}/${analysis.totalVariants} varyant stokta`);
    
  } catch (error) {
    console.error('Stok verisi çıkarma hatası:', error);
  }
  
  return analysis;
}

/**
 * HTML'den stok bilgilerini çıkarır
 */
async function extractStockFromHTML($: cheerio.CheerioAPI, analysis: StockAnalysis): Promise<void> {
  console.log('🔧 HTML\'den stok verisi çıkarılıyor...');
  
  // Trendyol'un yeni yapısındaki stok bilgilerini çıkar
  const stockSelectors = [
    '.pr-in-at button',
    '.product-variants button',
    '[data-testid*="variant"] button',
    '.variant-button',
    '.size-variant',
    '.color-variant'
  ];
  
  const colors: string[] = [];
  const sizes: string[] = [];
  
  // Renkleri bul
  $('.pr-in-cn img, [data-testid*="color"] img, .color-option img').each((_, el) => {
    const colorName = $(el).attr('alt') || $(el).attr('title') || '';
    if (colorName && !colors.includes(colorName)) {
      colors.push(colorName);
    }
  });
  
  // Bedenleri bul
  $('.pr-in-sz button, [data-testid*="size"] button, .size-option').each((_, el) => {
    const sizeName = $(el).text().trim();
    if (sizeName && sizeName.match(/^(XS|S|M|L|XL|XXL|\d+)$/i)) {
      if (!sizes.includes(sizeName)) {
        sizes.push(sizeName);
      }
    }
  });
  
  console.log(`🔧 HTML'den bulunan renkler: ${colors.join(', ')}`);
  console.log(`🔧 HTML'den bulunan bedenler: ${sizes.join(', ')}`);
  
  // Her kombinasyon için stok durumunu kontrol et
  colors.forEach(color => {
    sizes.forEach(size => {
      const variantKey = `${color}-${size}`;
      
      // Stok durumunu belirle (varsayılan olarak stokta)
      let inStock = true;
      
      // Disabled butonları kontrol et
      const disabledButton = $(`.pr-in-sz button:contains("${size}").disabled, .pr-in-sz button:contains("${size}")[disabled]`);
      if (disabledButton.length > 0) {
        inStock = false;
      }
      
      analysis.variants.push({
        color,
        size,
        inStock
      });
      
      analysis.stockMap[variantKey] = inStock;
      
      console.log(`🔧 ${variantKey}: ${inStock ? 'STOKTA' : 'STOKTA YOK'}`);
    });
  });
}

/**
 * Stok haritasını optimize eder ve sadece stokta olanları döner
 */
export function optimizeStockMap(stockMap: Record<string, boolean>): Record<string, boolean> {
  const optimized: Record<string, boolean> = {};
  
  Object.entries(stockMap).forEach(([key, inStock]) => {
    if (inStock) {
      optimized[key] = true;
      console.log(`✅ STOKTA: ${key}`);
    } else {
      console.log(`❌ STOKTA YOK: ${key}`);
    }
  });
  
  return optimized;
}