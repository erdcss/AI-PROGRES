/**
 * Manuel Renk Seçimi Sistemi - Shopify 100 varyant limitini aşmamak için
 * Kullanıcı belirli renkleri seçebilir, otomatik çıkarılan 112 varyant yerine
 */

export interface ManualColorSelection {
  selectedColors: string[];
  selectedSizes: string[];
  maxVariants: number;
}

export interface ColorOverrideResult {
  originalColors: string[];
  originalSizes: string[];
  filteredColors: string[];
  filteredSizes: string[];
  variantCount: number;
  message: string;
}

export class ManualColorOverride {
  
  /**
   * Otomatik çıkarılan renkleri manuel seçime göre filtrele
   * @param extractedColors Otomatik çıkarılan tüm renkler
   * @param extractedSizes Otomatik çıkarılan tüm bedenler
   * @param manualSelection Kullanıcının manuel seçimi
   */
  static filterVariants(
    extractedColors: string[], 
    extractedSizes: string[], 
    manualSelection: ManualColorSelection
  ): ColorOverrideResult {
    
    console.log(`🎨 Manuel filtre başlatılıyor:`);
    console.log(`   Çıkarılan renkler (${extractedColors.length}):`, extractedColors);
    console.log(`   Çıkarılan bedenler (${extractedSizes.length}):`, extractedSizes);
    console.log(`   Manuel seçim:`, manualSelection);
    
    // Manuel seçim yapılmışsa kullan, yoksa otomatik limitle
    let filteredColors = extractedColors;
    let filteredSizes = extractedSizes;
    
    if (manualSelection.selectedColors.length > 0) {
      // Sadece manuel seçilen renkleri kullan
      filteredColors = extractedColors.filter(color => 
        manualSelection.selectedColors.includes(color)
      );
      console.log(`🎯 Manuel renk seçimi uygulandı: ${filteredColors.length} renk`);
    }
    
    if (manualSelection.selectedSizes.length > 0) {
      // Sadece manuel seçilen bedenleri kullan  
      filteredSizes = extractedSizes.filter(size =>
        manualSelection.selectedSizes.includes(size)
      );
      console.log(`🎯 Manuel beden seçimi uygulandı: ${filteredSizes.length} beden`);
    }
    
    // Varyant sayısını hesapla
    const variantCount = filteredColors.length * filteredSizes.length;
    
    // Shopify limitini kontrol et
    if (variantCount > manualSelection.maxVariants) {
      console.log(`⚠️ Varyant limiti aşıldı: ${variantCount} > ${manualSelection.maxVariants}`);
      
      // Otomatik azaltma - en popüler renkleri seç
      const maxColors = Math.floor(manualSelection.maxVariants / filteredSizes.length);
      filteredColors = filteredColors.slice(0, maxColors);
      
      console.log(`🔧 Otomatik azaltma: İlk ${maxColors} renk seçildi`);
    }
    
    const finalVariantCount = filteredColors.length * filteredSizes.length;
    
    return {
      originalColors: extractedColors,
      originalSizes: extractedSizes,
      filteredColors,
      filteredSizes,
      variantCount: finalVariantCount,
      message: `${extractedColors.length}→${filteredColors.length} renk, ${extractedSizes.length}→${filteredSizes.length} beden, ${variantCount}→${finalVariantCount} varyant`
    };
  }
  
  /**
   * En popüler renkleri otomatik seç (kullanıcı manuel seçim yapmadığında)
   */
  static autoSelectPopularColors(colors: string[], maxCount: number = 5): string[] {
    // Türkiye'de popüler renkler sıralaması
    const popularColors = [
      'Siyah', 'Beyaz', 'Lacivert', 'Gri', 'Mavi',
      'Kırmızı', 'Pembe', 'Yeşil', 'Kahverengi', 'Sarı',
      'Mor', 'Turuncu', 'Bej', 'Bordo', 'Füme'
    ];
    
    // Çıkarılan renkler arasından popüler olanları seç
    const sortedColors = colors.sort((a, b) => {
      const aIndex = popularColors.indexOf(a);
      const bIndex = popularColors.indexOf(b);
      
      // Popüler listede varsa öncelik ver
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      // Alfabetik sırala
      return a.localeCompare(b, 'tr');
    });
    
    return sortedColors.slice(0, maxCount);
  }
  
  /**
   * Shopify için güvenli varyant sayısı hesapla
   */
  static calculateSafeVariantCount(colors: string[], sizes: string[], maxVariants: number = 99): {
    maxColors: number;
    maxSizes: number;
    recommendation: string;
  } {
    const totalVariants = colors.length * sizes.length;
    
    if (totalVariants <= maxVariants) {
      return {
        maxColors: colors.length,
        maxSizes: sizes.length,
        recommendation: `Mevcut ${totalVariants} varyant Shopify limitinde`
      };
    }
    
    // En uygun renk/beden kombinasyonunu bul
    const maxColors = Math.floor(maxVariants / sizes.length);
    const maxSizes = Math.floor(maxVariants / colors.length);
    
    if (maxColors >= 3) {
      return {
        maxColors,
        maxSizes: sizes.length,
        recommendation: `${maxColors} renk x ${sizes.length} beden = ${maxColors * sizes.length} varyant önerisi`
      };
    } else {
      return {
        maxColors: colors.length,
        maxSizes: maxSizes,
        recommendation: `${colors.length} renk x ${maxSizes} beden = ${colors.length * maxSizes} varyant önerisi`
      };
    }
  }
}

/**
 * Frontend için renk seçim arayüzü verisi
 */
export interface ColorSelectionData {
  extractedColors: string[];
  extractedSizes: string[];
  popularColors: string[];
  recommendations: {
    maxColors: number;
    maxSizes: number;
    suggestion: string;
  };
  limits: {
    shopifyMax: number;
    currentVariants: number;
    exceeds: boolean;
  };
}

export function generateColorSelectionData(
  colors: string[], 
  sizes: string[]
): ColorSelectionData {
  const currentVariants = colors.length * sizes.length;
  const shopifyMax = 99;
  
  const popularColors = ManualColorOverride.autoSelectPopularColors(colors, 5);
  const recommendations = ManualColorOverride.calculateSafeVariantCount(colors, sizes);
  
  return {
    extractedColors: colors,
    extractedSizes: sizes,
    popularColors,
    recommendations: {
      maxColors: recommendations.maxColors,
      maxSizes: recommendations.maxSizes,
      suggestion: recommendations.recommendation
    },
    limits: {
      shopifyMax,
      currentVariants,
      exceeds: currentVariants > shopifyMax
    }
  };
}