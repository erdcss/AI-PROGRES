/**
 * Fixed Variant Detection System
 * Only extracts authentic product variants, prevents false color detection
 */

export interface FixedVariantData {
  colors: string[];
  sizes: string[];
  totalVariants: number;
  hasRealColors: boolean;
  hasRealSizes: boolean;
}

export function detectAuthenticVariants(extractedVariants: any[]): FixedVariantData {
  console.log('🔍 Otantik varyant tespiti başlatılıyor...');
  
  // Extract colors only from actual variant data
  const colorsFromVariants = extractedVariants
    .map(v => v.color)
    .filter(Boolean)
    .filter((color, index, arr) => arr.indexOf(color) === index);
  
  // Extract sizes from actual variant data
  const sizesFromVariants = extractedVariants
    .map(v => v.size || v.value)
    .filter(Boolean)
    .filter(size => isValidSize(size))
    .filter((size, index, arr) => arr.indexOf(size) === index);
  
  // Determine if product has real color variants
  const hasRealColors = colorsFromVariants.length > 1;
  const finalColors = hasRealColors ? colorsFromVariants : [];
  
  // Determine if product has real size variants  
  const hasRealSizes = sizesFromVariants.length > 1;
  const finalSizes = hasRealSizes ? sizesFromVariants : [];
  
  const totalVariants = Math.max(finalColors.length, 1) * Math.max(finalSizes.length, 1);
  
  console.log(`✅ Otantik varyant tespiti tamamlandı:`);
  console.log(`   - Renkler: ${finalColors.length} (${hasRealColors ? 'gerçek varyantlar' : 'varyant yok'})`);
  console.log(`   - Bedenler: ${finalSizes.length} (${hasRealSizes ? 'gerçek varyantlar' : 'varyant yok'})`);
  console.log(`   - Toplam varyant: ${totalVariants}`);
  
  return {
    colors: finalColors,
    sizes: finalSizes,
    totalVariants,
    hasRealColors,
    hasRealSizes
  };
}

function isValidSize(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim().toUpperCase();
  
  const validSizePatterns = [
    /^(XS|S|M|L|XL|XXL|XXXL)$/,
    /^(36|38|40|42|44|46|48|50|52|54|56)$/,
    /^(TEK|STANDART|UNIVERSAL|ONE.?SIZE)$/i
  ];
  
  return validSizePatterns.some(pattern => pattern.test(cleaned));
}