/**
 * Shopify Varyant Hatası Düzeltici
 */

export interface VariantData {
  color: string;
  size: string;
  inStock: boolean;
}

export class ShopifyVariantFixer {
  
  static cleanAndDeduplicateVariants(variants: VariantData[]): VariantData[] {
    // Benzersiz varyantları tutmak için Map kullan
    const uniqueVariants = new Map<string, VariantData>();
    
    variants.forEach(variant => {
      // Varyant anahtarı oluştur (renk-beden kombinasyonu)
      const key = `${variant.color || 'default'}-${variant.size || 'default'}`.toLowerCase();
      
      // Eğer bu anahtar daha önce yoksa ekle
      if (!uniqueVariants.has(key)) {
        uniqueVariants.set(key, {
          color: variant.color || 'Varsayılan',
          size: variant.size || 'Tek Beden',
          inStock: variant.inStock
        });
      }
    });
    
    return Array.from(uniqueVariants.values());
  }
  
  static createShopifyVariants(variants: VariantData[], basePrice: number) {
    const cleanVariants = this.cleanAndDeduplicateVariants(variants);
    
    // Eğer varyant yoksa varsayılan varyant oluştur
    if (cleanVariants.length === 0) {
      return [{
        option1: 'Varsayılan',
        option2: 'Tek Beden',
        price: basePrice.toFixed(2),
        inventory_quantity: 10,
        inventory_management: 'shopify',
        inventory_policy: 'deny'
      }];
    }
    
    // Benzersiz varyantları Shopify formatına dönüştür
    return cleanVariants.map((variant, index) => ({
      option1: variant.color,
      option2: variant.size,
      price: basePrice.toFixed(2),
      sku: `VAR-${Date.now()}-${index}`,
      inventory_quantity: variant.inStock ? 10 : 0,
      inventory_management: 'shopify',
      inventory_policy: variant.inStock ? 'deny' : 'continue'
    }));
  }
  
  static createProductOptions(variants: VariantData[]) {
    const cleanVariants = this.cleanAndDeduplicateVariants(variants);
    
    if (cleanVariants.length === 0) {
      return [
        { name: 'Renk', values: ['Varsayılan'] },
        { name: 'Beden', values: ['Tek Beden'] }
      ];
    }
    
    // Benzersiz renkleri ve bedenleri çıkar
    const colors = [...new Set(cleanVariants.map(v => v.color))];
    const sizes = [...new Set(cleanVariants.map(v => v.size))];
    
    return [
      { name: 'Renk', values: colors },
      { name: 'Beden', values: sizes }
    ];
  }
  
  static validateShopifyData(productData: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Başlık kontrolü
    if (!productData.title || productData.title.trim().length === 0) {
      errors.push('Ürün başlığı boş olamaz');
    }
    
    // Varyant kontrolü
    if (!productData.variants || productData.variants.length === 0) {
      errors.push('En az bir varyant gerekli');
    } else {
      // Varyant benzersizlik kontrolü
      const variantKeys = new Set();
      productData.variants.forEach((variant: any, index: number) => {
        const key = `${variant.option1}-${variant.option2}`;
        if (variantKeys.has(key)) {
          errors.push(`Tekrar eden varyant: ${variant.option1} ${variant.option2}`);
        }
        variantKeys.add(key);
        
        // Fiyat kontrolü
        if (!variant.price || isNaN(parseFloat(variant.price))) {
          errors.push(`Varyant ${index + 1} geçersiz fiyat: ${variant.price}`);
        }
      });
    }
    
    // Seçenek kontrolü
    if (!productData.options || productData.options.length === 0) {
      errors.push('Ürün seçenekleri eksik');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}