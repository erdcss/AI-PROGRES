/**
 * Trendyol Stok Filtreleme Sistemi
 * Gerçek DOM yapısından stokta olmayan bedenleri filtreler
 */

import { Page } from 'puppeteer';

export interface StockFilterResult {
  inStockSizes: string[];
  outOfStockSizes: string[];
  totalSizes: number;
  method: string;
}

export async function filterOutOfStockSizes(page: Page): Promise<StockFilterResult> {
  console.log('🔍 Trendyol stok filtreleme başlatılıyor...');
  
  try {
    const stockData = await page.evaluate(() => {
      const results = {
        inStock: [] as string[],
        outOfStock: [] as string[],
        method: 'unknown'
      };
      
      // Trendyol'un farklı beden seçici yapıları (öncelik sırasına göre)
      const selectorStrategies = [
        {
          name: 'data-testid',
          selector: 'button[data-testid*="size"]'
        },
        {
          name: 'size-option-class',
          selector: '[class*="size-option"] button, [class*="sizeOption"] button'
        },
        {
          name: 'pr-in-sz',
          selector: '.pr-in-sz button'
        },
        {
          name: 'size-variant',
          selector: '.size-variant button, [data-variant="size"] button'
        },
        {
          name: 'generic-size',
          selector: '[class*="size"]:not([class*="color"]) button'
        }
      ];
      
      // Her stratejiyi dene
      for (const strategy of selectorStrategies) {
        const buttons = document.querySelectorAll(strategy.selector);
        console.log(`${strategy.name}: ${buttons.length} buton bulundu`);
        
        if (buttons.length > 0) {
          results.method = strategy.name;
          
          buttons.forEach(button => {
            const sizeText = button.textContent?.trim() || '';
            
            // Trendyol'da stokta olmayan bedenlerin belirtileri
            const isOutOfStock = 
              button.disabled ||
              button.classList.contains('disabled') ||
              button.classList.contains('out-of-stock') ||
              button.classList.contains('stock-out') ||
              button.getAttribute('aria-disabled') === 'true' ||
              sizeText.includes('Tükendi') ||
              sizeText.includes('Stokta Yok') ||
              parseFloat(getComputedStyle(button).opacity) < 0.5 ||
              getComputedStyle(button).pointerEvents === 'none';
            
            // Sadece geçerli beden formatlarını kabul et
            if (sizeText && /^[\d\-\/]+$/.test(sizeText) && sizeText.length <= 6) {
              if (isOutOfStock) {
                results.outOfStock.push(sizeText);
                console.log(`❌ Stokta yok: ${sizeText}`);
              } else {
                results.inStock.push(sizeText);
                console.log(`✅ Stokta var: ${sizeText}`);
              }
            }
          });
          
          // Başarılı strateji bulundu, dur
          if (results.inStock.length > 0 || results.outOfStock.length > 0) {
            break;
          }
        }
      }
      
      // Hiçbir strateji çalışmadıysa HTML text analizi
      if (results.inStock.length === 0 && results.outOfStock.length === 0) {
        results.method = 'text-analysis';
        const bodyText = document.body.innerText;
        
        // Beden formatlarını bul
        const sizePattern = /\b(\d{2}\/\d{2}|\d{2}-\d{2}|\d{2})\b/g;
        const sizeMatches = bodyText.match(sizePattern) || [];
        
        sizeMatches.forEach(size => {
          const sizeIndex = bodyText.indexOf(size);
          const context = bodyText.substring(sizeIndex - 30, sizeIndex + 30);
          
          if (context.includes('Tükendi') || context.includes('Stokta Yok')) {
            if (!results.outOfStock.includes(size)) {
              results.outOfStock.push(size);
            }
          } else {
            if (!results.inStock.includes(size)) {
              results.inStock.push(size);
            }
          }
        });
      }
      
      return results;
    });
    
    const result: StockFilterResult = {
      inStockSizes: stockData.inStock,
      outOfStockSizes: stockData.outOfStock,
      totalSizes: stockData.inStock.length + stockData.outOfStock.length,
      method: stockData.method
    };
    
    console.log(`✅ Stok analizi tamamlandı (${result.method}):`);
    console.log(`   🟢 Stokta: ${result.inStockSizes.length} beden`);
    console.log(`   🔴 Stokta yok: ${result.outOfStockSizes.length} beden`);
    
    return result;
    
  } catch (error) {
    console.log(`⚠️ Stok filtreleme hatası: ${error.message}`);
    
    return {
      inStockSizes: [],
      outOfStockSizes: [],
      totalSizes: 0,
      method: 'error'
    };
  }
}