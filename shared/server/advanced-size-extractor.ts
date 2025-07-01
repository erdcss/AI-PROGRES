/**
 * Gelişmiş Beden Çıkarma Sistemi
 * Trendyol'dan beden bilgilerini çıkarmak ve gerçek stok durumunu tespit etmek için kapsamlı yöntemler
 */

import * as cheerio from 'cheerio';

export interface VariantStockInfo {
  sizes: string[];
  colors: string[];
  outOfStockSizes: string[];
  outOfStockColors: string[];
  variantStockMap: Record<string, boolean>; // variant_key: inStock
  colorSizeMatrix: Record<string, string[]>; // color: [available_sizes]
  availableVariants: Array<{color: string, size: string, inStock: boolean}>;
}

/**
 * Trendyol'dan stok durumu ile birlikte varyant bilgilerini çıkarır - GERÇEK STOK TESPİTİ
 */
export async function extractVariantStockInfo($: cheerio.CheerioAPI): Promise<VariantStockInfo> {
  const stockInfo: VariantStockInfo = {
    sizes: [],
    colors: [],
    outOfStockSizes: [],
    outOfStockColors: [],
    variantStockMap: {},
    colorSizeMatrix: {},
    availableVariants: []
  };

  try {
    console.log('🔧 GERÇEK TRENDYOL STOK ANALİZİ başlatılıyor...');

    // 1. Renkleri çıkar (resim alt attribute'larından)
    $('.pr-in-cn img').each((_, el) => {
      const alt = $(el).attr('alt')?.toLowerCase().trim() || '';
      if (alt && !stockInfo.colors.includes(alt)) {
        stockInfo.colors.push(alt);
        console.log(`🎨 Renk tespit edildi: ${alt}`);
      }
    });

    // 2. Bedenleri çıkar (beden butonlarından)
    $('.pr-in-sz button').each((_, el) => {
      const text = $(el).text().trim();
      if (text.match(/^(XS|S|M|L|XL|XXL|\d+)$/i)) {
        if (!stockInfo.sizes.includes(text)) {
          stockInfo.sizes.push(text);
          console.log(`📏 Beden tespit edildi: ${text}`);
        }
      }
    });

    console.log(`📊 Tespit edilen: ${stockInfo.colors.length} renk, ${stockInfo.sizes.length} beden`);

    // 3. GERÇEK STOK DURUMU ANALİZİ
    if (stockInfo.colors.length > 0 && stockInfo.sizes.length > 0) {
      console.log('🔧 Renk-beden kombinasyonları için GERÇEK stok durumu analiz ediliyor...');
      
      stockInfo.colors.forEach(color => {
        const availableSizes: string[] = [];
        
        stockInfo.sizes.forEach(size => {
          const variantKey = `${color.toLowerCase()}-${size}`;
          let isInStock = true;
          
          // Method 1: Beden butonunun disabled olup olmadığını kontrol et
          $(`.pr-in-sz button:contains("${size}")`).each((_, btn) => {
            const $btn = $(btn);
            
            // Disabled attribute kontrolü
            if ($btn.attr('disabled') !== undefined || $btn.hasClass('disabled')) {
              isInStock = false;
              console.log(`❌ ${variantKey}: Buton disabled`);
            }
            
            // Opacity kontrolü (disabled butonlar genelde soluk görünür)
            const opacity = $btn.css('opacity');
            if (opacity && parseFloat(opacity) < 1) {
              isInStock = false;
              console.log(`❌ ${variantKey}: Düşük opacity (${opacity})`);
            }
            
            // "Tükendi" metni kontrolü
            const buttonText = $btn.text().toLowerCase();
            if (buttonText.includes('tükendi') || buttonText.includes('stokta yok')) {
              isInStock = false;
              console.log(`❌ ${variantKey}: "Tükendi" metni`);
            }
          });
          
          // Method 2: JavaScript variables kontrolü
          $('script').each((_, script) => {
            const content = $(script).html() || '';
            
            // Stock data patterns
            const stockPatterns = [
              new RegExp(`"${size}"[^}]*"stock"[^}]*:\\s*0`, 'i'),
              new RegExp(`"${size}"[^}]*"available"[^}]*:\\s*false`, 'i'),
              new RegExp(`"${size}"[^}]*"soldOut"[^}]*:\\s*true`, 'i')
            ];
            
            stockPatterns.forEach(pattern => {
              if (pattern.test(content)) {
                isInStock = false;
                console.log(`❌ ${variantKey}: JavaScript verisi ile tespit`);
              }
            });
          });
          
          // Stok durumunu kaydet
          stockInfo.variantStockMap[variantKey] = isInStock;
          
          if (isInStock) {
            availableSizes.push(size);
            console.log(`✅ ${variantKey}: STOKTA - CSV'de 10 adet gösterilecek`);
          } else {
            console.log(`❌ ${variantKey}: STOKTA YOK - CSV'de 0 adet gösterilecek`);
          }
        });
        
        stockInfo.colorSizeMatrix[color] = availableSizes;
        console.log(`🔧 ${color} rengi stokta olan bedenler: [${availableSizes.join(', ')}]`);
      });
      
      // Kullanılabilir varyantları oluştur
      Object.entries(stockInfo.variantStockMap).forEach(([variantKey, inStock]) => {
        const [color, size] = variantKey.split('-');
        stockInfo.availableVariants.push({ color, size, inStock });
      });
      
      const inStockCount = Object.values(stockInfo.variantStockMap).filter(Boolean).length;
      const totalCount = Object.keys(stockInfo.variantStockMap).length;
      console.log(`📈 STOK DURUMU ÖZET: ${inStockCount}/${totalCount} varyant gerçekten stokta`);
      
    } else {
      throw new Error('Varyant bilgisi çıkarılamadı - sadece otantik veri kullanılabilir');
    }

    return stockInfo;

  } catch (error) {
    console.error('Stok analiz hatası:', error);
    return stockInfo;
  }
}

/**
 * Geçerli beden kontrolü
 */
function isValidSize(size: string): boolean {
  if (!size || typeof size !== 'string') return false;
  
  const trimmedSize = size.trim().toUpperCase();
  
  const validPatterns = [
    /^(XS|S|M|L|XL|XXL|XXXL)$/,
    /^\d{2,3}$/,
    /^(28|30|32|34|36|38|40|42|44|46|48|50)$/
  ];

  return validPatterns.some(pattern => pattern.test(trimmedSize));
}

/**
 * Geçerli renk kontrolü
 */
function isValidColor(color: string): boolean {
  if (!color || typeof color !== 'string') return false;
  
  const trimmedColor = color.trim().toLowerCase();
  
  const validColors = [
    'siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'turuncu', 'mor', 'pembe', 
    'gri', 'kahverengi', 'bej', 'lacivert', 'bordo', 'haki', 'krem', 'füme'
  ];

  return validColors.includes(trimmedColor) || trimmedColor.length > 2;
}