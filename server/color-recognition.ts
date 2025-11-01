/**
 * Color Recognition System for Turkish E-commerce
 * 
 * Intelligently extracts color names from:
 * - Product URLs
 * - Product titles
 * - HTML attributes (title, alt, aria-label)
 * 
 * Supports compound colors like "Açık Mavi", "Koyu Gri", etc.
 */

// ✅ PURE COLOR NAMES ONLY - No modifiers!
const TURKISH_COLORS = [
  // Basic colors
  'siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı',
  'turuncu', 'mor', 'pembe', 'gri', 'kahverengi', 'lacivert',
  
  // Extended colors
  'bordo', 'haki', 'bej', 'krem', 'lila', 'turkuaz', 'vizon',
  'füme', 'ekru', 'antrasit', 'pudra', 'mürdüm', 'indigo',
  'bakır', 'altın', 'gümüş', 'bronz', 'mercan', 'yavruağzı',
  'çivit', 'zeytin', 'hardal', 'kiremit', 'eflatun', 'menekşe',
  'leylak', 'limon', 'fıstık', 'çimen', 'deniz', 'gökyüzü',
  'çam', 'erik', 'vişne', 'gül', 'şeftali', 'mavisi'
];

// Color modifiers that combine with color names (NOT colors themselves!)
const COLOR_MODIFIERS = [
  'açık', 'koyu', 'orta', 'parlak', 'mat', 'pastel',
  'neon', 'metalik', 'bebe', 'su', 'ince', 'kalın'
];

// Non-color words that might appear in URLs (product types, attributes)
const NON_COLOR_WORDS = [
  // Clothing types
  'tshirt', 'shirt', 'sweatshirt', 'hoodie', 'kazak', 'hirka',
  'pantolon', 'jean', 'etek', 'elbise', 'ceket', 'mont',
  'ayakkabi', 'bot', 'sandalet', 'terlik', 'corap', 'çorap',
  'atlet', 'gomlek', 'gömlek', 'yelek', 'pijama', 'mayo',
  'bikini', 'sort', 'esofman', 'tayt', 'tunik', 'bluz',
  
  // Attributes
  'unisex', 'erkek', 'kadin', 'kadın', 'cocuk', 'çocuk',
  'bebek', 'yetiskin', 'yetişkin', 'slim', 'fit', 'regular',
  'oversize', 'relaxed', 'skinny', 'straight', 'boyfriend',
  
  // Styles
  'dik', 'yuvarlak', 'v', 'polo', 'kapusonlu', 'fermuarli',
  'dugmeli', 'düğmeli', 'askili', 'askılı', 'kisa', 'kısa',
  'uzun', 'midi', 'maxi', 'mini', 'yaka', 'kol', 'kollari',
  'kolları', 'boyu', 'boy', 'bel', 'kesim', 'model',
  
  // Materials
  'pamuklu', 'pamuk', 'polyester', 'viskon', 'kot', 'denim',
  'kumas', 'kumaş', 'örme', 'triko', 'polar', 'polarli',
  'içi', 'ici', 'disi', 'dışı', 'astarlı', 'astarli',
  
  // Other
  'set', 'takim', 'takım', 'parça', 'parca', 'adet', 'lu',
  'lü', 'li', 'lı', 'yarim', 'yarım', 'tam'
];

/**
 * Check if a word is a known color
 */
export function isColor(word: string): boolean {
  const normalized = word.toLowerCase().trim();
  return TURKISH_COLORS.includes(normalized);
}

/**
 * Check if a word is a color modifier (açık, koyu, etc.)
 */
export function isColorModifier(word: string): boolean {
  const normalized = word.toLowerCase().trim();
  return COLOR_MODIFIERS.includes(normalized);
}

/**
 * Check if a word is NOT a color (product type, attribute, etc.)
 */
export function isNonColor(word: string): boolean {
  const normalized = word.toLowerCase().trim();
  return NON_COLOR_WORDS.includes(normalized);
}

/**
 * Extract color from URL
 * Handles compound colors like "acik-mavi" → "Açık Mavi"
 */
export function extractColorFromUrl(url: string): string | null {
  try {
    console.log('🎨 COLOR EXTRACTION: Analyzing URL for color...');
    console.log(`   URL: ${url}`);
    
    // Extract the product slug part (between brand and p-number)
    // Example: /brand/acik-mavi-slim-fit-gomlek-p-123 → "acik-mavi-slim-fit-gomlek"
    const slugMatch = url.match(/\/([^\/]+)\/([^\/]+)-p-\d+/);
    if (!slugMatch) {
      console.log('   ❌ No product slug found');
      return null;
    }
    
    const slug = slugMatch[2]; // "acik-mavi-slim-fit-gomlek"
    const words = slug.split('-');
    console.log(`   📝 Slug words: ${words.join(', ')}`);
    
    const modifiers: string[] = [];
    const baseColors: string[] = [];
    let foundColor = false;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Skip non-color words
      if (isNonColor(word)) {
        console.log(`   ⏭️  Skipping non-color: "${word}"`);
        // If we already found a color, stop here
        if (foundColor) break;
        continue;
      }
      
      // ✅ CRITICAL: Collect modifiers but DON'T add to final result yet
      if (isColorModifier(word)) {
        modifiers.push(word);
        console.log(`   📋 Queued modifier: "${word}" (waiting for base color)`);
        continue;
      }
      
      // ✅ Check if it's an actual color
      if (isColor(word)) {
        baseColors.push(word);
        foundColor = true;
        console.log(`   ✅ Found base color: "${word}"`);
        
        // Check if next word is also a color (for compound colors like "bebe mavisi")
        if (i + 1 < words.length && isColor(words[i + 1])) {
          baseColors.push(words[i + 1]);
          console.log(`   ✅ Found compound color part: "${words[i + 1]}"`);
          i++;
        }
        
        // We found color(s), stop looking
        break;
      }
    }
    
    // ✅ CRITICAL: Only return if we found at least one TRUE color
    if (baseColors.length === 0) {
      console.log('   ❌ No actual color found in URL (only modifiers or non-colors)');
      return null;
    }
    
    // Combine modifiers + base colors
    const colorParts = [...modifiers, ...baseColors];
    
    // Capitalize and join
    const colorName = colorParts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    console.log(`   ✅ EXTRACTED COLOR: "${colorName}"`);
    return colorName;
    
  } catch (error) {
    console.log(`   ❌ Error extracting color: ${error.message}`);
    return null;
  }
}

/**
 * Extract color from product title
 * Example: "NIKE Swoosh Erkek Mavi Spor Ayakkabı" → "Mavi"
 */
export function extractColorFromTitle(title: string): string | null {
  try {
    console.log('🎨 COLOR EXTRACTION: Analyzing title for color...');
    console.log(`   Title: ${title}`);
    
    const words = title.toLowerCase().split(/\s+/);
    const modifiers: string[] = [];
    const baseColors: string[] = [];
    let foundColor = false;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Skip non-color words
      if (isNonColor(word)) {
        // If we already found a color, stop here
        if (foundColor) break;
        continue;
      }
      
      // ✅ Queue modifiers but don't add to result yet
      if (isColorModifier(word)) {
        modifiers.push(word);
        continue;
      }
      
      // ✅ Check if it's an actual color
      if (isColor(word)) {
        baseColors.push(word);
        foundColor = true;
        
        // Check if next word is also a color
        if (i + 1 < words.length && isColor(words[i + 1])) {
          baseColors.push(words[i + 1]);
          i++;
        }
        
        // Found color, stop
        break;
      }
      
      // If we already queued modifiers but found no color, clear modifiers
      if (modifiers.length > 0 && !foundColor) {
        modifiers.length = 0;
      }
    }
    
    // ✅ CRITICAL: Only return if we found at least one TRUE color
    if (baseColors.length === 0) {
      console.log('   ❌ No actual color found in title (only modifiers or non-colors)');
      return null;
    }
    
    // Combine modifiers + base colors
    const colorParts = [...modifiers, ...baseColors];
    
    // Capitalize and join
    const colorName = colorParts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    console.log(`   ✅ EXTRACTED COLOR: "${colorName}"`);
    return colorName;
    
  } catch (error) {
    console.log(`   ❌ Error extracting color: ${error.message}`);
    return null;
  }
}

/**
 * Clean up color name from HTML attributes
 * Handles various formats from DOM elements
 */
export function cleanColorName(rawName: string): string | null {
  if (!rawName || rawName === 'null' || rawName === 'undefined') {
    return null;
  }
  
  const cleaned = rawName.trim();
  
  // Remove common prefixes
  const withoutPrefix = cleaned
    .replace(/^renk:\s*/i, '')
    .replace(/^color:\s*/i, '')
    .trim();
  
  // ✅ CRITICAL: Must have at least one TRUE color (not just modifier)
  const words = withoutPrefix.toLowerCase().split(/\s+/);
  const hasActualColor = words.some(word => isColor(word));
  
  if (!hasActualColor) {
    // Reject strings with only modifiers like "Açık", "Koyu"
    return null;
  }
  
  return withoutPrefix;
}

/**
 * Get hex color code from Turkish color name
 */
export function getColorCode(colorName: string): string {
  const normalized = colorName.toLowerCase().trim();
  
  const colorMap: { [key: string]: string } = {
    'siyah': '#000000',
    'beyaz': '#FFFFFF',
    'kırmızı': '#FF0000',
    'mavi': '#0000FF',
    'yeşil': '#008000',
    'sarı': '#FFFF00',
    'turuncu': '#FFA500',
    'mor': '#800080',
    'pembe': '#FFC0CB',
    'gri': '#808080',
    'kahverengi': '#A52A2A',
    'lacivert': '#000080',
    'bordo': '#800020',
    'haki': '#806B2A',
    'bej': '#F5F5DC',
    'krem': '#FFFDD0',
    'lila': '#C8A2C8',
    'turkuaz': '#40E0D0',
    'vizon': '#C8B560',
    'füme': '#696969',
    'ekru': '#F5F5DC',
    'antrasit': '#293133',
    'pudra': '#FFB6C1',
    'mürdüm': '#8B008B',
    'indigo': '#4B0082'
  };
  
  // Try exact match first
  if (colorMap[normalized]) {
    return colorMap[normalized];
  }
  
  // Try finding base color in compound names (e.g., "Açık Mavi" → look for "mavi")
  for (const [color, code] of Object.entries(colorMap)) {
    if (normalized.includes(color)) {
      return code;
    }
  }
  
  // Default gray
  return '#999999';
}
