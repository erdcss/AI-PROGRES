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
  hasVariants: boolean,
  availableSizes: string[], // Stokta olan bedenler
  unavailableSizes: string[] // Stokta olmayan bedenler
} {
  // Varyant bilgilerini tutacak nesne
  const variants = {
    size: [] as string[],
    color: [] as string[],
    hasVariants: false,
    availableSizes: [] as string[], // Stokta olan bedenleri tutacak dizi
    unavailableSizes: [] as string[] // Stokta olmayan bedenleri tutacak dizi
  };
  
  console.log("Varyant çıkarma başlatıldı...");

  try {
    // Özel durum: Gönderilen ekran görüntüsündeki tamamen yeni arayüz için
    // Beden butonları ve stok durumu tespiti - 2025 Trendyol
    console.log("Gösterilen örneğe uygun Trendyol 2025 beden butonları taranıyor...");
    
    // İkinci örnek için - Ayakkabı ürünü (https://www.trendyol.com/salomon/su-ve-soguga-karsi-dayanikli-erkek-kislik-outdoor-ayakkabisi-p-858626358)
    $(".variants-wrapper:contains('Numara'), .variants-container:contains('Numara')").each((_, container) => {
      // Numara seçeneklerini bul
      $(container).find('button, .variant-option, .variant-button').each((_, el) => {
        const size = $(el).text().trim();
        if (size && !variants.size.includes(size)) {
          variants.size.push(size);
          variants.hasVariants = true;
          
          // Stok durumu kontrolü
          const isDisabled = $(el).attr('disabled') !== undefined ||
                           $(el).hasClass('disabled') ||
                           $(el).hasClass('soldout') ||
                           $(el).find('.unavailable-icon').length > 0 ||
                           $(el).find('svg').length > 0;
          
          if (!isDisabled && !variants.availableSizes.includes(size)) {
            variants.availableSizes.push(size);
            console.log(`Ayakkabı örneği: Stokta bulunan numara: ${size}`);
          } else if (isDisabled && !variants.unavailableSizes.includes(size)) {
            variants.unavailableSizes.push(size);
            console.log(`Ayakkabı örneği: Stokta OLMAYAN numara: ${size}`);
          }
        }
      });
    });
    
    $(".v-cntnt .v-item, [data-testid='variantListItem']").each((_, el) => {
      const size = $(el).text().trim();
      if (size && !variants.size.includes(size)) {
        variants.size.push(size);
        variants.hasVariants = true;
        
        // Stok kontrolünü özel ikon tespiti ile yap
        // Ekran görüntüsünde gösterilen SVG ikon veya özel sınıf tespiti
        const isDisabled = $(el).hasClass('disabled') ||
                          $(el).find('svg').length > 0 || // Herhangi bir SVG ikon varsa (üzerine çarpı işareti)
                          $(el).find('[data-testid="unavailableIcon"]').length > 0 ||
                          $(el).find('.unavailable-icon').length > 0 ||
                          $(el).attr('disabled') !== undefined;
                          
        if (!isDisabled && !variants.availableSizes.includes(size)) {
          variants.availableSizes.push(size);
          console.log(`Trendyol 2025: Stokta bulunan beden: ${size}`);
        } else if (isDisabled && !variants.unavailableSizes.includes(size)) {
          variants.unavailableSizes.push(size);
          console.log(`Trendyol 2025: Stokta OLMAYAN beden: ${size}`);
        }
      }
    });
    
    // 0. Direkt ürün özelliklerinden ve attributes'dan renk çıkarma
    // HTML'den özellik arama
    const colorAttribute = $('div.detail-attr-container div.detail-attr-item:contains("Renk")').next().text().trim();
    if (colorAttribute) {
      console.log(`Özelliklerden renk bulundu: ${colorAttribute}`);
      if (!variants.color.includes(colorAttribute)) {
        variants.color.push(colorAttribute);
        variants.hasVariants = true;
      }
    }
    
    // Ürün attributeslarında doğrudan Renk alanı arama
    const attrNodes = $('[data-id="attribute-item"]');
    attrNodes.each((_, node) => {
      const attrName = $(node).find('[data-id="attribute-key"]').text().trim();
      const attrValue = $(node).find('[data-id="attribute-value"]').text().trim();
      
      if (attrName === "Renk" && attrValue) {
        console.log(`Attribute node'dan renk bulundu: ${attrValue}`);
        if (!variants.color.includes(attrValue)) {
          variants.color.push(attrValue);
          variants.hasVariants = true;
        }
      }
    });
    
    // 1. Beden varyantları (Sadece Beden seçeneği olan sayfalar)
    // Yöntem 1: Standart beden ayrıştırma
    $("div.sp-itm:contains('Beden')").next().find(".v-item").each((_, el) => {
      const size = $(el).text().trim();
      if (size && !variants.size.includes(size)) {
        variants.size.push(size);
        variants.hasVariants = true;
        
        // Stok kontrolü - disabled veya sold-out sınıfı YOKSA stokta var demektir
        const isDisabled = $(el).hasClass('disabled') || 
                           $(el).hasClass('soldout') || 
                           $(el).hasClass('sold-out') || 
                           $(el).hasClass('notInStock') ||
                           $(el).attr('disabled') !== undefined ||
                           // Yeni stok kontrolü - Trendyol'un güncel arayüzünde SVG ikonlar kullanılıyor
                           $(el).find('svg.unavailable-icon').length > 0 ||
                           $(el).find('i.ty-icon-unavailable').length > 0;
        
        if (!isDisabled && !variants.availableSizes.includes(size)) {
          variants.availableSizes.push(size);
          console.log(`Stokta bulunan beden: ${size}`);
        } else if (isDisabled && !variants.unavailableSizes.includes(size)) {
          variants.unavailableSizes.push(size);
          console.log(`Stokta OLMAYAN beden: ${size}`);
        }
      }
    });

    // Yöntem 2: Alternatif beden ayrıştırma (Farklı class yapısı)
    $("div.product-property:contains('Beden'), div.variants-wrapper:contains('Beden')").each((_, propEl) => {
      $(propEl).next().find("a.sp-item, button.variant-option, div.variant-option").each((_, sizeEl) => {
        const size = $(sizeEl).text().trim();
        if (size && !variants.size.includes(size)) {
          variants.size.push(size);
          variants.hasVariants = true;
          
          // Stok kontrolü - negatif sınıflar veya özellikler ile kontrol
          const isDisabled = $(sizeEl).hasClass('disabled') || 
                            $(sizeEl).hasClass('soldout') || 
                            $(sizeEl).hasClass('sold-out') || 
                            $(sizeEl).hasClass('not-available') ||
                            $(sizeEl).hasClass('notInStock') ||
                            $(sizeEl).attr('disabled') !== undefined ||
                            $(sizeEl).attr('data-stock') === '0' ||
                            // Trendyol'un güncel arayüzünde stok durumu için ikon kontrolü
                            $(sizeEl).find('svg.unavailable-icon').length > 0 ||
                            $(sizeEl).find('i.ty-icon-unavailable').length > 0 ||
                            $(sizeEl).closest('.ty-variation-item').find('.ty-icon-not-available').length > 0;
          
          // Ayrıca ebeveyn elementin de stok out olma durumunu kontrol et
          const parentHasNoStock = $(sizeEl).parent().hasClass('soldout') || 
                                   $(sizeEl).parent().hasClass('disabled') ||
                                   $(sizeEl).parent().find('svg.unavailable-icon').length > 0;
          
          if (!isDisabled && !parentHasNoStock && !variants.availableSizes.includes(size)) {
            variants.availableSizes.push(size);
            console.log(`Stokta bulunan beden (alternatif format): ${size}`);
          } else if ((isDisabled || parentHasNoStock) && !variants.unavailableSizes.includes(size)) {
            variants.unavailableSizes.push(size);
            console.log(`Stokta OLMAYAN beden (alternatif format): ${size}`);
          }
        }
      });
    });

    // Modern beden butonları - Gönderilen ekran görüntüsündeki gibi modern buton stiller 
    // Bu, Trendyol'un 2025 yılındaki yeni arayüzünü hedefler
    $(".ty-variation-body button, .ty-variation-container button, .ty-variartion-button-wrapper button").each((_, el) => {
      const size = $(el).text().trim();
      if (size && !variants.size.includes(size)) {
        variants.size.push(size);
        variants.hasVariants = true;
        
        // Stok kontrolü - modern ikonlar ve svg elementleri ile
        const isDisabled = $(el).attr('disabled') !== undefined || 
                          $(el).hasClass('unavailable') || 
                          $(el).hasClass('sold-out') ||
                          $(el).parent().hasClass('unavailable') ||
                          $(el).find('svg.unavailable-icon').length > 0 ||
                          $(el).find('svg.ty-icon').length > 0 ||
                          $(el).closest('.ty-variartion-button-wrapper').hasClass('unavailable');
        
        // Stokta var veya yok listesine ekle
        if (!isDisabled && !variants.availableSizes.includes(size)) {
          variants.availableSizes.push(size);
          console.log(`Stokta bulunan beden (modern buton): ${size}`);
        } else if (isDisabled && !variants.unavailableSizes.includes(size)) {
          variants.unavailableSizes.push(size);
          console.log(`Stokta OLMAYAN beden (modern buton): ${size}`);
        }
      }
    });

    // Beden seçenekleri dropdown menüde olabilir
    $("select.product-size-dropdown option").each((_, el) => {
      const size = $(el).text().trim();
      if (size && size !== "Beden Seçiniz" && !variants.size.includes(size)) {
        variants.size.push(size);
        variants.hasVariants = true;
        
        // Dropdown seçeneklerinde stokta olmayan bedenler genellikle disabled özelliği ile işaretlenir
        const isDisabled = $(el).attr('disabled') !== undefined || 
                          $(el).hasClass('disabled') ||
                          $(el).attr('data-stock') === '0' ||
                          $(el).attr('data-in-stock') === "false";
        
        if (!isDisabled && !variants.availableSizes.includes(size)) {
          variants.availableSizes.push(size);
          console.log(`Stokta bulunan beden (dropdown): ${size}`);
        } else if (isDisabled && !variants.unavailableSizes.includes(size)) {
          variants.unavailableSizes.push(size);
          console.log(`Stokta OLMAYAN beden (dropdown): ${size}`);
        }
      }
    });

    // 2. Renk varyantları
    // Yöntem 1: Standart renk ayrıştırma
    $(".slc-img").each((_, el) => {
      const color = $(el).attr("alt") || "";
      if (color && !variants.color.includes(color)) {
        variants.color.push(color);
        variants.hasVariants = true;
        console.log(`Renk varyantı bulundu (standart): ${color}`);
      }
    });

    // Yöntem 2: Alternatif renk ayrıştırma
    $("div.product-property:contains('Renk'), div.variants-wrapper:contains('Renk')").each((_, propEl) => {
      $(propEl).next().find("a.sp-item, button.variant-option, div.color-option").each((_, colorEl) => {
        const color = $(colorEl).attr("title") || $(colorEl).text().trim();
        if (color && !variants.color.includes(color)) {
          variants.color.push(color);
          variants.hasVariants = true;
          console.log(`Renk varyantı bulundu (alternatif): ${color}`);
        }
      });
    });
    
    // Yöntem 3: Ek renk selektörleri - Trendyol'un güncel tasarımında renk seçenekleri
    $("button[data-pk='color'], .color-select-option, .color-wrapper .variant").each((_, el) => {
      let color = $(el).attr("title") || $(el).attr("data-value") || $(el).text().trim();
      // Renk ismi yoksa aria-label veya data-pk'dan almayı dene
      if (!color || color === "") {
        color = $(el).attr("aria-label") || "";
      }
      
      if (color && !variants.color.includes(color)) {
        variants.color.push(color);
        variants.hasVariants = true;
        console.log(`Renk varyantı bulundu (ek): ${color}`);
      }
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
              // Renk varyantı - string olarak
              if (variant.color && typeof variant.color === 'string' && !variants.color.includes(variant.color)) {
                variants.color.push(variant.color);
                variants.hasVariants = true;
              }
              
              // Bazen renk bilgisi sku içinde olabilir
              if (variant.sku && typeof variant.sku === 'string') {
                // SKU'dan renk çıkarma
                const colorMatch = variant.sku.match(/([a-z]+-)*([a-z]+)$/i);
                if (colorMatch && colorMatch[2]) {
                  const color = colorMatch[2].toLowerCase();
                  // Sadece belli renk isimlerini al
                  const colorNames = ['beyaz', 'siyah', 'mavi', 'kirmizi', 'kırmızı', 'yesil', 'yeşil', 
                                     'sari', 'sarı', 'mor', 'pembe', 'turuncu', 'kahverengi', 'gri', 
                                     'lacivert', 'bordo', 'pudra', 'mint', 'bej', 'haki', 'lila', 'indigo', 
                                     'turkuaz', 'fume', 'füme', 'ekru'];
                  if (colorNames.includes(color) && !variants.color.includes(color)) {
                    variants.color.push(color);
                    variants.hasVariants = true;
                  }
                }
              }
              
              // name içinde renk bilgisi
              if (variant.name && typeof variant.name === 'string') {
                const nameParts = variant.name.split(' ');
                if (nameParts.length >= 2) {
                  // Son iki kelimeyi kontrol et, renk olabilir
                  const lastWords = nameParts.slice(-2).join(' ').toLowerCase();
                  // Beyaz Pudra gibi renk bileşimleri
                  if (lastWords.includes('beyaz') || lastWords.includes('siyah') || 
                      lastWords.includes('pudra') || lastWords.includes('mavi')) {
                    if (!variants.color.includes(lastWords)) {
                      variants.color.push(lastWords);
                      variants.hasVariants = true;
                    }
                  }
                }
              }
              
              // Beden varyantı - string ise direk alınır
              if (typeof variant.size === 'string' && !variants.size.includes(variant.size)) {
                variants.size.push(variant.size);
                variants.hasVariants = true;
                
                // Stok kontrolü - eğer availability veya stock bilgisi varsa kontrol et
                const isInStock = variant.offers?.availability?.includes('InStock') || 
                                  variant.offers?.itemCondition?.includes('NewCondition') ||
                                  variant.availability?.includes('InStock') ||
                                  !variant.offers?.availability?.includes('OutOfStock');
                
                if (isInStock && !variants.availableSizes.includes(variant.size)) {
                  variants.availableSizes.push(variant.size);
                  console.log(`Stokta bulunan beden (JSON-LD product): ${variant.size}`);
                } else if (!isInStock && !variants.unavailableSizes.includes(variant.size)) {
                  variants.unavailableSizes.push(variant.size);
                  console.log(`Stokta OLMAYAN beden (JSON-LD product): ${variant.size}`);
                }
              }
              
              // Beden varyantı - dizi ise her bir öğe ayrı ayrı alınır
              if (Array.isArray(variant.size)) {
                variant.size.forEach((sizeItem: string) => {
                  if (sizeItem && !variants.size.includes(sizeItem)) {
                    variants.size.push(sizeItem);
                    variants.hasVariants = true;
                    
                    // Stok kontrolü - variant nesnesindeki availability bilgisini kullan
                    const isInStock = variant.offers?.availability?.includes('InStock') || 
                                      variant.offers?.itemCondition?.includes('NewCondition') ||
                                      variant.availability?.includes('InStock') ||
                                      !variant.offers?.availability?.includes('OutOfStock');
                    
                    if (isInStock && !variants.availableSizes.includes(sizeItem)) {
                      variants.availableSizes.push(sizeItem);
                      console.log(`Stokta bulunan beden (JSON-LD array): ${sizeItem}`);
                    }
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
            
            // Stok kontrolü
            const isInStock = data.offers?.availability?.includes('InStock') ||
                             data.offers?.itemCondition?.includes('NewCondition') ||
                             !data.offers?.availability?.includes('OutOfStock');
            
            if (isInStock && !variants.availableSizes.includes(data.size)) {
              variants.availableSizes.push(data.size);
              console.log(`Stokta bulunan beden (Product): ${data.size}`);
            }
          }
          
          // Beden varyantları dizi olarak gelmiş olabilir
          if (Array.isArray(data.size)) {
            data.size.forEach((sizeItem: string) => {
              if (sizeItem && !variants.size.includes(sizeItem)) {
                variants.size.push(sizeItem);
                variants.hasVariants = true;
                
                // Stok kontrolü
                const isInStock = data.offers?.availability?.includes('InStock') ||
                                 data.offers?.itemCondition?.includes('NewCondition') ||
                                 !data.offers?.availability?.includes('OutOfStock');
                
                if (isInStock && !variants.availableSizes.includes(sizeItem)) {
                  variants.availableSizes.push(sizeItem);
                  console.log(`Stokta bulunan beden (Product Array): ${sizeItem}`);
                }
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
    const title = $("h1.pr-new-br").text().trim() || $("h1.detail-name").text().trim() || $(".pr-new-br").text().trim();
    if (title) {
      console.log(`Ürün başlığı: ${title}`);
      
      // Başlıktan doğrudan "Beyaz Pudra" gibi birleşik renk çıkarımı
      if (title.includes("Beyaz Pudra")) {
        if (!variants.color.includes("Beyaz Pudra")) {
          variants.color.push("Beyaz Pudra");
          variants.hasVariants = true;
          console.log("Renk varyantı bulundu: Beyaz Pudra");
        }
      }
      
      // Renk çıkarımı - tekli renkler
      const colorRegex = /\b(beyaz|siyah|mavi|kırmızı|yeşil|sarı|mor|pembe|turuncu|kahverengi|gri|lacivert|bordo|pudra|mint|bej|haki|lila|indigo|turkuaz|füme|ekru)\b/i;
      const colorMatches = title.match(new RegExp(colorRegex, 'gi'));
      if (colorMatches) {
        colorMatches.forEach(match => {
          if (!variants.color.includes(match)) {
            variants.color.push(match);
            variants.hasVariants = true;
            console.log(`Renk varyantı bulundu: ${match}`);
          }
        });
      }
      
      // Bileşik renk çıkarımı (örn: "Beyaz Pudra")
      const compoundColorRegex = /(beyaz|siyah|mavi)\s+(pudra|füme|gri|pembe|mint|sarı|lacivert)/i;
      const compoundMatch = title.match(compoundColorRegex);
      if (compoundMatch && compoundMatch[0] && !variants.color.includes(compoundMatch[0])) {
        variants.color.push(compoundMatch[0]);
        variants.hasVariants = true;
        console.log(`Bileşik renk varyantı bulundu: ${compoundMatch[0]}`);
      }
      
      // Beden çıkarımı (numara)
      const sizeRegex = /\b(\d{2,3})\s*(numara|beden)\b/i;
      const sizeMatch = title.match(sizeRegex);
      if (sizeMatch && sizeMatch[1] && !variants.size.includes(sizeMatch[1])) {
        variants.size.push(sizeMatch[1]);
        variants.hasVariants = true;
      }
      
      // Manuel renk ekleme - Başlıktan renk bilgisini doğrudan çıkarma 
      if (title.toLowerCase().includes("beyaz pudra")) {
        if (!variants.color.includes("Beyaz Pudra")) {
          variants.color.push("Beyaz Pudra");
          variants.hasVariants = true;
          console.log("Manuel renk eklendi: Beyaz Pudra");
        }
      }
      
      // Başlıktaki son iki kelime genellikle renk bilgisi olabilir
      const words = title.split(' ');
      if (words.length >= 3) {
        // "Kadın" ve "Erkek" gibi cinsiyet belirteçlerini atlayarak renk bilgisini bulalım
        const nonGenderWords = words.filter(w => 
          !['kadın', 'erkek', 'unisex', 'çocuk', 'kız', 'erkek çocuk', 'kız çocuk'].includes(w.toLowerCase()));
        
        if (nonGenderWords.length >= 2) {
          const possibleColor = `${nonGenderWords[nonGenderWords.length-2]} ${nonGenderWords[nonGenderWords.length-1]}`;
          if (possibleColor.toLowerCase().includes('beyaz') || 
              possibleColor.toLowerCase().includes('siyah') || 
              possibleColor.toLowerCase().includes('mavi')) {
            console.log(`Başlıktan muhtemel renk çıkarıldı: ${possibleColor}`);
            if (!variants.color.includes(possibleColor)) {
              variants.color.push(possibleColor);
              variants.hasVariants = true;
            }
          }
        }
      }
      
      // Siyah Füme varyantı
      if (title.toLowerCase().includes("siyah füme")) {
        if (!variants.color.includes("Siyah Füme")) {
          variants.color.push("Siyah Füme");
          variants.hasVariants = true;
          console.log("Renk varyantı bulundu: Siyah Füme");
        }
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