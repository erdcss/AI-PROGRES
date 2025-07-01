/**
 * Improved Variant System
 * Gerçek varyantları tespit eder, varsayılan değerleri kullanmaz
 */

export interface ImprovedVariantData {
  colors: string[];
  sizes: string[];
  hasRealColors: boolean;
  hasRealSizes: boolean;
  shouldCreateVariants: boolean;
  variantStructure: 'none' | 'color-only' | 'size-only' | 'color-size';
}

/**
 * Ürün için gerçek varyant yapısını belirler
 */
export function analyzeProductVariants(productData: any): ImprovedVariantData {
  console.log('🔍 Gelişmiş varyant analizi başlatılıyor...');
  
  let colors: string[] = [];
  let sizes: string[] = [];
  
  // Varyant verilerinden gerçek renk ve beden bilgilerini çıkar
  if (productData.variants && Array.isArray(productData.variants)) {
    colors = productData.variants
      .map((v: any) => v.color)
      .filter(Boolean)
      .filter((color: string) => !isDefaultValue(color))
      .filter((color: string, index: number, arr: string[]) => arr.indexOf(color) === index);
    
    sizes = productData.variants
      .map((v: any) => v.size)
      .filter(Boolean)
      .filter((size: string) => !isDefaultValue(size))
      .filter((size: string, index: number, arr: string[]) => arr.indexOf(size) === index);
  }
  
  // Alternatif kaynaklardan kontrol et
  if (colors.length === 0 && productData.colors) {
    colors = productData.colors.filter((c: string) => !isDefaultValue(c));
  }
  
  if (sizes.length === 0 && productData.sizes) {
    sizes = productData.sizes.filter((s: string) => !isDefaultValue(s));
  }
  
  // Gerçek varyant varlığını belirle
  const hasRealColors = colors.length > 1;
  const hasRealSizes = sizes.length > 1;
  
  // Varyant yapısını belirle
  let variantStructure: 'none' | 'color-only' | 'size-only' | 'color-size' = 'none';
  
  if (hasRealColors && hasRealSizes) {
    variantStructure = 'color-size';
  } else if (hasRealColors) {
    variantStructure = 'color-only';
  } else if (hasRealSizes) {
    variantStructure = 'size-only';
  }
  
  const shouldCreateVariants = hasRealColors || hasRealSizes;
  
  console.log(`✅ Varyant analizi tamamlandı:`);
  console.log(`   - Renkler: ${colors.length} (${hasRealColors ? 'çoklu varyant' : 'tek renk/yok'})`);
  console.log(`   - Bedenler: ${sizes.length} (${hasRealSizes ? 'çoklu varyant' : 'tek beden/yok'})`);
  console.log(`   - Yapı: ${variantStructure}`);
  console.log(`   - Varyant oluştur: ${shouldCreateVariants}`);
  
  return {
    colors: hasRealColors ? colors : [],
    sizes: hasRealSizes ? sizes : [],
    hasRealColors,
    hasRealSizes,
    shouldCreateVariants,
    variantStructure
  };
}

/**
 * Varsayılan/geçersiz değerleri tespit eder
 */
function isDefaultValue(value: string): boolean {
  if (!value || typeof value !== 'string') return true;
  
  const defaultValues = [
    'varsayılan', 'default', 'standart', 'standard', 
    'tek beden', 'tek renk', 'one size', 'universal',
    'genel', 'normal', 'undefined', 'null', ''
  ];
  
  return defaultValues.includes(value.toLowerCase().trim());
}

/**
 * Shopify CSV için varyant satırları oluşturur
 */
export function generateVariantRows(baseRow: any, variantData: ImprovedVariantData): any[] {
  const rows: any[] = [];
  
  if (!variantData.shouldCreateVariants) {
    // Varyant yok - option alanları boş
    const singleRow = {
      ...baseRow,
      option1_name: '',
      option1_value: '',
      option2_name: '',
      option2_value: ''
    };
    rows.push(singleRow);
    return rows;
  }
  
  let isFirstRow = true;
  
  if (variantData.variantStructure === 'color-size') {
    // Renk + Beden varyantları
    variantData.colors.forEach(color => {
      variantData.sizes.forEach(size => {
        const variantRow = isFirstRow ? baseRow : { ...baseRow, title: '', body_html: '', tags: '', images: '' };
        
        variantRow.option1_name = 'Renk';
        variantRow.option1_value = color;
        variantRow.option2_name = 'Beden';
        variantRow.option2_value = size;
        variantRow.variant_sku = `${baseRow.handle}-${color.toLowerCase()}-${size.toLowerCase()}`;
        
        rows.push(variantRow);
        isFirstRow = false;
      });
    });
  } else if (variantData.variantStructure === 'color-only') {
    // Sadece renk varyantları
    variantData.colors.forEach(color => {
      const variantRow = isFirstRow ? baseRow : { ...baseRow, title: '', body_html: '', tags: '', images: '' };
      
      variantRow.option1_name = 'Renk';
      variantRow.option1_value = color;
      variantRow.option2_name = '';
      variantRow.option2_value = '';
      variantRow.variant_sku = `${baseRow.handle}-${color.toLowerCase()}`;
      
      rows.push(variantRow);
      isFirstRow = false;
    });
  } else if (variantData.variantStructure === 'size-only') {
    // Sadece beden varyantları
    variantData.sizes.forEach(size => {
      const variantRow = isFirstRow ? baseRow : { ...baseRow, title: '', body_html: '', tags: '', images: '' };
      
      variantRow.option1_name = 'Beden';
      variantRow.option1_value = size;
      variantRow.option2_name = '';
      variantRow.option2_value = '';
      variantRow.variant_sku = `${baseRow.handle}-${size.toLowerCase()}`;
      
      rows.push(variantRow);
      isFirstRow = false;
    });
  }
  
  return rows;
}