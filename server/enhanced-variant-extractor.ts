/**
 * Geliştirilmiş Varyant Çıkarıcı
 * Trendyol ürünlerinden beden ve renk varyantlarını daha etkili şekilde çıkarır
 */

import * as cheerio from 'cheerio';

/**
 * HTML içeriğinden beden ve renk varyantlarını çıkarır
 * @param $ Cheerio HTML içeriği
 * @returns Varyant bilgilerini içeren nesne
 */
export function extractVariants($: cheerio.CheerioAPI): { 
  size: string[], 
  color: string[], 
  hasVariants: boolean 
} {
  // Varyant bilgilerini tutacak nesne
  const variants = {
    size: [] as string[],
    color: [] as string[],
    hasVariants: false
  };

  try {
    // 1. Beden varyantları (Sadece Beden seçeneği olan sayfalar)
    // Yöntem 1: Standart beden ayrıştırma
    $("div.sp-itm:contains('Beden')").next().find(".v-item").each((_, el) => {
      const size = $(el).text().trim();
      if (size && !variants.size.includes(size)) {
        variants.size.push(size);
        variants.hasVariants = true;
      }
    });

    // Yöntem 2: Alternatif beden ayrıştırma (Farklı class yapısı)
    $("div.product-property:contains('Beden'), div.variants-wrapper:contains('Beden')").each((_, propEl) => {
      $(propEl).next().find("a.sp-item, button.variant-option, div.variant-option").each((_, sizeEl) => {
        const size = $(sizeEl).text().trim();
        if (size && !variants.size.includes(size)) {
          variants.size.push(size);
          variants.hasVariants = true;
        }
      });
    });

    // Beden seçenekleri dropdown menüde olabilir
    $("select.product-size-dropdown option").each((_, el) => {
      const size = $(el).text().trim();
      if (size && size !== "Beden Seçiniz" && !variants.size.includes(size)) {
        variants.size.push(size);
        variants.hasVariants = true;
      }
    });

    // 2. Renk varyantları
    // Yöntem 1: Standart renk ayrıştırma
    $(".slc-img").each((_, el) => {
      const color = $(el).attr("alt") || "";
      if (color && !variants.color.includes(color)) {
        variants.color.push(color);
        variants.hasVariants = true;
      }
    });

    // Yöntem 2: Alternatif renk ayrıştırma
    $("div.product-property:contains('Renk'), div.variants-wrapper:contains('Renk')").each((_, propEl) => {
      $(propEl).next().find("a.sp-item, button.variant-option, div.color-option").each((_, colorEl) => {
        const color = $(colorEl).attr("title") || $(colorEl).text().trim();
        if (color && !variants.color.includes(color)) {
          variants.color.push(color);
          variants.hasVariants = true;
        }
      });
    });

    // JSON-LD içinden varyant bilgilerini al
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const jsonContent = $(script).html();
        if (!jsonContent) return;
        
        const data = JSON.parse(jsonContent);
        
        // Tip 1: hasVariant içinde
        if (data.hasVariant && Array.isArray(data.hasVariant)) {
          data.hasVariant.forEach((variant: any) => {
            // Renk varyantı
            if (variant.color && !variants.color.includes(variant.color)) {
              variants.color.push(variant.color);
              variants.hasVariants = true;
            }
            
            // Beden varyantı
            if (variant.size && !variants.color.includes(variant.size)) {
              variants.size.push(variant.size);
              variants.hasVariants = true;
            }
          });
        }
        
        // Tip 2: model içinde
        if (data.model && typeof data.model === 'string') {
          // Bazen model alanında renk bilgisi olabilir
          const colorMatch = data.model.match(/renk:\s*([^,]+)/i);
          if (colorMatch && colorMatch[1] && !variants.color.includes(colorMatch[1])) {
            variants.color.push(colorMatch[1].trim());
            variants.hasVariants = true;
          }
        }
      } catch (e) {
        // JSON parse hataları sessizce geçilir
      }
    });

    // 3. Ürün başlığından varyant çıkarımı
    const title = $("h1.pr-new-br").text().trim() || $("h1.detail-name").text().trim();
    if (title) {
      // Renk çıkarımı
      const colorRegex = /\b(beyaz|siyah|mavi|kırmızı|yeşil|sarı|mor|pembe|turuncu|kahverengi|gri|lacivert|bordo|pudra|mint|bej|haki|lila|indigo|turkuaz|füme|ekru)\b/i;
      const colorMatch = title.match(colorRegex);
      if (colorMatch && colorMatch[1] && !variants.color.includes(colorMatch[1])) {
        variants.color.push(colorMatch[1]);
        variants.hasVariants = true;
      }
      
      // Beden çıkarımı (numara)
      const sizeRegex = /\b(\d{2,3})\s*(numara|beden)\b/i;
      const sizeMatch = title.match(sizeRegex);
      if (sizeMatch && sizeMatch[1] && !variants.size.includes(sizeMatch[1])) {
        variants.size.push(sizeMatch[1]);
        variants.hasVariants = true;
      }
    }

    // Sonuçları sırala
    variants.color.sort();
    variants.size.sort((a, b) => {
      // Sayısal sıralama
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      // Metinsel sıralama
      return a.localeCompare(b);
    });

    console.log(`Varyant bilgileri: ${variants.size.length} beden, ${variants.color.length} renk`);
    return variants;
  } catch (error) {
    console.error('Varyant çıkarma hatası:', error);
    return variants;
  }
}