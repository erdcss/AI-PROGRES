/**
 * Varyant doğrulayıcı - Beden ve renk seçeneklerinin doğruluğunu kontrol eder
 */

export interface VariantValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  colorValidation: {
    extractedColors: string[];
    validColors: string[];
    invalidColors: string[];
  };
  sizeValidation: {
    extractedSizes: string[];
    validSizes: string[];
    invalidSizes: string[];
  };
  stockValidation: {
    totalCombinations: number;
    inStockCombinations: number;
    outOfStockCombinations: number;
    stockIssues: string[];
  };
}

export class VariantValidator {
  // Geçerli renk seçenekleri
  private static readonly VALID_COLORS = [
    'Siyah', 'Beyaz', 'Gri', 'Lacivert', 'Mavi', 'Kırmızı', 'Yeşil', 'Sarı',
    'Turuncu', 'Mor', 'Pembe', 'Kahverengi', 'Bej', 'Krem', 'Bordo', 'Haki',
    'Turkuaz', 'Füme', 'Antrasit', 'Ekru', 'Vizon', 'Camel', 'Hardal',
    'Çok Renkli', 'Desenli', 'Karışık', 'Varsayılan'
  ];

  // Geçerli beden seçenekleri
  private static readonly VALID_SIZES = [
    'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL',
    '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
    'Tek Beden', 'Standart', 'Free Size', 'OS', 'One Size'
  ];

  /**
   * Varyant verilerini doğrula
   */
  static validateVariants(variantData: any): VariantValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!variantData) {
      errors.push('Varyant verisi bulunamadı');
      return this.createEmptyResult(errors);
    }

    // Renk doğrulaması
    const colorValidation = this.validateColors(variantData.colors || []);
    
    // Beden doğrulaması
    const sizeValidation = this.validateSizes(variantData.sizes || []);
    
    // Stok doğrulaması
    const stockValidation = this.validateStock(variantData.stockMatrix || {});
    
    // Genel doğrulama
    if (colorValidation.invalidColors.length > 0) {
      warnings.push(`Tanınmayan renkler: ${colorValidation.invalidColors.join(', ')}`);
    }
    
    if (sizeValidation.invalidSizes.length > 0) {
      warnings.push(`Tanınmayan bedenler: ${sizeValidation.invalidSizes.join(', ')}`);
    }
    
    if (stockValidation.inStockCombinations === 0) {
      errors.push('Hiç stokta varyant bulunamadı');
    }
    
    // Tutarlılık kontrolü
    const consistencyIssues = this.checkConsistency(variantData);
    errors.push(...consistencyIssues);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      colorValidation,
      sizeValidation,
      stockValidation
    };
  }

  /**
   * Renk doğrulaması
   */
  private static validateColors(colors: any[]): {
    extractedColors: string[];
    validColors: string[];
    invalidColors: string[];
  } {
    const extractedColors = colors.map(c => c.name || c).filter(Boolean);
    const validColors: string[] = [];
    const invalidColors: string[] = [];

    extractedColors.forEach(color => {
      const normalizedColor = this.normalizeColorName(color);
      if (this.VALID_COLORS.includes(normalizedColor)) {
        validColors.push(normalizedColor);
      } else {
        invalidColors.push(color);
      }
    });

    return { extractedColors, validColors, invalidColors };
  }

  /**
   * Beden doğrulaması
   */
  private static validateSizes(sizes: any[]): {
    extractedSizes: string[];
    validSizes: string[];
    invalidSizes: string[];
  } {
    const extractedSizes = sizes.map(s => s.name || s).filter(Boolean);
    const validSizes: string[] = [];
    const invalidSizes: string[] = [];

    extractedSizes.forEach(size => {
      const normalizedSize = this.normalizeSizeName(size);
      if (this.VALID_SIZES.includes(normalizedSize)) {
        validSizes.push(normalizedSize);
      } else {
        invalidSizes.push(size);
      }
    });

    return { extractedSizes, validSizes, invalidSizes };
  }

  /**
   * Stok doğrulaması
   */
  private static validateStock(stockMatrix: any): {
    totalCombinations: number;
    inStockCombinations: number;
    outOfStockCombinations: number;
    stockIssues: string[];
  } {
    const combinations = Object.entries(stockMatrix);
    const totalCombinations = combinations.length;
    const inStockCombinations = combinations.filter(([_, data]: [string, any]) => 
      data.inStock && data.stockCount > 0
    ).length;
    const outOfStockCombinations = totalCombinations - inStockCombinations;
    
    const stockIssues: string[] = [];
    
    combinations.forEach(([key, data]: [string, any]) => {
      if (data.inStock && (!data.stockCount || data.stockCount <= 0)) {
        stockIssues.push(`${key}: Stokta olarak işaretli ama stok sayısı 0`);
      }
      
      if (!data.inStock && data.stockCount > 0) {
        stockIssues.push(`${key}: Stok var ama stokta değil olarak işaretli`);
      }
      
      if (!data.color || !data.size) {
        stockIssues.push(`${key}: Eksik renk veya beden bilgisi`);
      }
    });

    return {
      totalCombinations,
      inStockCombinations,
      outOfStockCombinations,
      stockIssues
    };
  }

  /**
   * Tutarlılık kontrolü
   */
  private static checkConsistency(variantData: any): string[] {
    const issues: string[] = [];
    
    const colors = variantData.colors || [];
    const sizes = variantData.sizes || [];
    const stockMatrix = variantData.stockMatrix || {};
    
    // Renk-beden kombinasyonu kontrolü
    const stockKeys = Object.keys(stockMatrix);
    const expectedCombinations = colors.length * sizes.length;
    
    if (stockKeys.length !== expectedCombinations && expectedCombinations > 0) {
      issues.push(`Beklenen kombinasyon sayısı: ${expectedCombinations}, Bulunan: ${stockKeys.length}`);
    }
    
    // Renk tutarlılığı
    colors.forEach((colorObj: any) => {
      const colorName = colorObj.name || colorObj;
      const colorCombinations = stockKeys.filter(key => key.startsWith(colorName + '-'));
      
      if (colorObj.inStock && colorCombinations.length === 0) {
        issues.push(`Renk "${colorName}" stokta olarak işaretli ama kombinasyon bulunamadı`);
      }
    });
    
    // Beden tutarlılığı
    sizes.forEach((sizeObj: any) => {
      const sizeName = sizeObj.name || sizeObj;
      const sizeCombinations = stockKeys.filter(key => key.endsWith('-' + sizeName));
      
      if (sizeObj.inStock && sizeCombinations.length === 0) {
        issues.push(`Beden "${sizeName}" stokta olarak işaretli ama kombinasyon bulunamadı`);
      }
    });

    return issues;
  }

  /**
   * Renk adını normalize et
   */
  private static normalizeColorName(color: string): string {
    const normalized = color.trim();
    
    // Türkçe karakter düzeltmeleri
    const corrections: Record<string, string> = {
      'siyah': 'Siyah',
      'beyaz': 'Beyaz',
      'gri': 'Gri',
      'mavi': 'Mavi',
      'kırmızı': 'Kırmızı',
      'yeşil': 'Yeşil',
      'turuncu': 'Turuncu',
      'sarı': 'Sarı'
    };
    
    return corrections[normalized.toLowerCase()] || normalized;
  }

  /**
   * Beden adını normalize et
   */
  private static normalizeSizeName(size: string): string {
    const normalized = size.trim().toUpperCase();
    
    // Beden düzeltmeleri
    const corrections: Record<string, string> = {
      'TEK BEDEN': 'Tek Beden',
      'ONESIZE': 'One Size',
      'FREE': 'Free Size',
      'STANDART': 'Standart'
    };
    
    return corrections[normalized] || normalized;
  }

  /**
   * Boş sonuç oluştur
   */
  private static createEmptyResult(errors: string[]): VariantValidationResult {
    return {
      isValid: false,
      errors,
      warnings: [],
      colorValidation: {
        extractedColors: [],
        validColors: [],
        invalidColors: []
      },
      sizeValidation: {
        extractedSizes: [],
        validSizes: [],
        invalidSizes: []
      },
      stockValidation: {
        totalCombinations: 0,
        inStockCombinations: 0,
        outOfStockCombinations: 0,
        stockIssues: []
      }
    };
  }
}