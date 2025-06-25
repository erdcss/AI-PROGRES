/**
 * Real Size Extractor - Gerçek Beden Seçeneklerini Çıkaran Sistem
 * Trendyol'dan ürünün gerçek güncel beden seçeneklerini alır
 */

import * as cheerio from 'cheerio';

export interface RealSizeData {
  size: string;
  inStock: boolean;
  stockCount?: number;
}

export interface RealSizeResult {
  sizes: RealSizeData[];
  totalSizes: number;
  availableSizes: number;
}

export function extractRealSizes(html: string): RealSizeResult {
  console.log('🎯 Gerçek beden seçenekleri çıkarılıyor...');
  
  const $ = cheerio.load(html);
  const sizes: RealSizeData[] = [];
  const sizesSet = new Set<string>();

  // Method 1: Size selector buttons
  console.log('📏 Method 1: Beden seçici butonları aranıyor...');
  $('.pr-in-dt-sz button, .size-variant button, .variant-size button').each((i, elem) => {
    const $elem = $(elem);
    const sizeText = $elem.text().trim();
    const isDisabled = $elem.hasClass('disabled') || $elem.attr('disabled') || $elem.hasClass('soldout');
    
    if (sizeText && !sizesSet.has(sizeText)) {
      sizesSet.add(sizeText);
      sizes.push({
        size: sizeText,
        inStock: !isDisabled
      });
      console.log(`📏 Beden bulunamadı: ${sizeText} (${isDisabled ? 'Stok yok' : 'Stokta'})`);
    }
  });

  // Method 2: Size options in select elements
  console.log('📏 Method 2: Select elementi beden seçenekleri aranıyor...');
  $('select option').each((i, elem) => {
    const $elem = $(elem);
    const sizeText = $elem.text().trim();
    const value = $elem.attr('value');
    
    // Beden gibi görünen değerleri filtrele
    if (sizeText && /^(XS|S|M|L|XL|XXL|\d{2,3})$/.test(sizeText) && !sizesSet.has(sizeText)) {
      sizesSet.add(sizeText);
      sizes.push({
        size: sizeText,
        inStock: !$elem.attr('disabled')
      });
      console.log(`📏 Select beden bulundu: ${sizeText}`);
    }
  });

  // Method 3: JSON-LD data mining
  console.log('📏 Method 3: JSON-LD veri madenciliği...');
  $('script[type="application/ld+json"]').each((i, elem) => {
    try {
      const jsonData = JSON.parse($(elem).html() || '{}');
      
      if (jsonData.offers && Array.isArray(jsonData.offers)) {
        jsonData.offers.forEach((offer: any) => {
          if (offer.size && !sizesSet.has(offer.size)) {
            sizesSet.add(offer.size);
            sizes.push({
              size: offer.size,
              inStock: offer.availability === 'InStock' || offer.availability === 'https://schema.org/InStock'
            });
            console.log(`📏 JSON-LD beden bulundu: ${offer.size}`);
          }
        });
      }
    } catch (e) {
      // JSON parse hatası, devam et
    }
  });

  // Method 4: Script data mining for size arrays
  console.log('📏 Method 4: Script verilerinde beden dizileri aranıyor...');
  $('script').each((i, elem) => {
    const scriptContent = $(elem).html() || '';
    
    // Size dizilerini ara
    const sizeArrayMatches = scriptContent.match(/sizes?["':]?\s*\[([^\]]+)\]/gi);
    if (sizeArrayMatches) {
      sizeArrayMatches.forEach(match => {
        const sizeMatch = match.match(/["']([^"']+)["']/g);
        if (sizeMatch) {
          sizeMatch.forEach(size => {
            const cleanSize = size.replace(/["']/g, '');
            if (cleanSize && /^(XS|S|M|L|XL|XXL|\d{2,3})$/.test(cleanSize) && !sizesSet.has(cleanSize)) {
              sizesSet.add(cleanSize);
              sizes.push({
                size: cleanSize,
                inStock: true // Script verilerinde stok bilgisi genelde yok
              });
              console.log(`📏 Script beden bulundu: ${cleanSize}`);
            }
          });
        }
      });
    }

    // Variant objects içinde beden ara
    const variantMatches = scriptContent.match(/variants?["':]?\s*\[([^\]]+)\]/gi);
    if (variantMatches) {
      variantMatches.forEach(match => {
        // Size properties ara
        const sizeProps = match.match(/["']?size["']?\s*:\s*["']([^"']+)["']/gi);
        if (sizeProps) {
          sizeProps.forEach(prop => {
            const sizeMatch = prop.match(/["']([^"']+)["']$/);
            if (sizeMatch) {
              const size = sizeMatch[1];
              if (size && !sizesSet.has(size)) {
                sizesSet.add(size);
                sizes.push({
                  size: size,
                  inStock: true
                });
                console.log(`📏 Variant beden bulundu: ${size}`);
              }
            }
          });
        }
      });
    }
  });

  // Method 5: Data attributes and classes
  console.log('📏 Method 5: Data attributeleri ve CSS sınıfları aranıyor...');
  $('[data-size], [data-variant-size], .size-item, .variant-item').each((i, elem) => {
    const $elem = $(elem);
    const sizeFromData = $elem.attr('data-size') || $elem.attr('data-variant-size');
    const sizeFromText = $elem.text().trim();
    
    [sizeFromData, sizeFromText].forEach(size => {
      if (size && /^(XS|S|M|L|XL|XXL|\d{2,3})$/.test(size) && !sizesSet.has(size)) {
        sizesSet.add(size);
        sizes.push({
          size: size,
          inStock: !$elem.hasClass('disabled') && !$elem.hasClass('soldout')
        });
        console.log(`📏 Data attribute beden bulundu: ${size}`);
      }
    });
  });

  // Bedenları sayısal sıraya koy
  const sortedSizes = sizes.sort((a, b) => {
    // Sayısal bedenler
    const aNum = parseInt(a.size);
    const bNum = parseInt(b.size);
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    
    // Harf bedenler
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const aIndex = sizeOrder.indexOf(a.size);
    const bIndex = sizeOrder.indexOf(b.size);
    
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    
    // Alfabetik sıralama
    return a.size.localeCompare(b.size);
  });

  const availableSizes = sortedSizes.filter(s => s.inStock).length;

  console.log(`✅ Toplam ${sortedSizes.length} beden bulundu, ${availableSizes} adedi stokta`);
  sortedSizes.forEach(size => {
    console.log(`   📏 ${size.size}: ${size.inStock ? '✅ Stokta' : '❌ Stok yok'}`);
  });

  return {
    sizes: sortedSizes,
    totalSizes: sortedSizes.length,
    availableSizes: availableSizes
  };
}

export default { extractRealSizes };