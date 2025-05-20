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
        
        // ProductGroup türündeki ürünler için varyant çıkarımı
        if (data['@type'] === 'ProductGroup') {
          // hasVariant alanı içinde varyantlar
          if (data.hasVariant && Array.isArray(data.hasVariant)) {
            data.hasVariant.forEach((variant: any) => {
              // Renk varyantı
              if (variant.color && !variants.color.includes(variant.color)) {
                variants.color.push(variant.color);
                variants.hasVariants = true;
              }
              
              // Beden varyantı - string ise direk alınır
              if (typeof variant.size === 'string' && !variants.size.includes(variant.size)) {
                variants.size.push(variant.size);
                variants.hasVariants = true;
              }
              
              // Beden varyantı - dizi ise her bir öğe ayrı ayrı alınır
              if (Array.isArray(variant.size)) {
                variant.size.forEach((sizeItem: string) => {
                  if (sizeItem && !variants.size.includes(sizeItem)) {
                    variants.size.push(sizeItem);
                    variants.hasVariants = true;
                  }
                });
              }
            });
          }
        }
        
        // Ürün varyasyonu olan varyantlar için
        if (data['@type'] === 'Product') {
          // Renk varyantı
          if (data.color && !variants.color.includes(data.color)) {
            variants.color.push(data.color);
            variants.hasVariants = true;
          }
          
          // Beden varyantı
          if (typeof data.size === 'string' && !variants.size.includes(data.size)) {
            variants.size.push(data.size);
            variants.hasVariants = true;
          }
          
          // Beden varyantları dizi olarak gelmiş olabilir
          if (Array.isArray(data.size)) {
            data.size.forEach((sizeItem: string) => {
              if (sizeItem && !variants.size.includes(sizeItem)) {
                variants.size.push(sizeItem);
                variants.hasVariants = true;
              }
            });
          }
        }
        
        // additionalProperty içinde varyant bilgisi
        if (data.additionalProperty && Array.isArray(data.additionalProperty)) {
          data.additionalProperty.forEach((prop: any) => {
            if (prop.name === 'Renk' && prop.unitText && !variants.color.includes(prop.unitText)) {
              variants.color.push(prop.unitText);
              variants.hasVariants = true;
            }
            
            if (prop.name === 'Beden' && prop.unitText && !variants.size.includes(prop.unitText)) {
              variants.size.push(prop.unitText);
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
        
        // variesBy ile varyant tipleri
        if (data.variesBy && Array.isArray(data.variesBy)) {
          if (data.variesBy.includes('https://schema.org/size')) {
            console.log('Ürün beden varyantları içeriyor');
          }
          if (data.variesBy.includes('https://schema.org/color')) {
            console.log('Ürün renk varyantları içeriyor');
          }
        }
      } catch (e) {
        console.error('JSON-LD varyant çıkarma hatası:', e);
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