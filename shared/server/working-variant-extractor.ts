import * as cheerio from 'cheerio';

interface VariantData {
  colors: string[];
  sizes: string[];
  stockMap: Record<string, boolean>;
}

export function extractWorkingVariants(html: string): VariantData {
  console.log('🎨 Starting working variant extraction...');
  
  const colors: string[] = [];
  const sizes: string[] = [];
  const stockMap: Record<string, boolean> = {};
  
  // Define Turkish color mapping
  const colorMappings = {
    'siyah': 'Siyah',
    'beyaz': 'Beyaz', 
    'mavi': 'Mavi',
    'kırmızı': 'Kırmızı',
    'kirmizi': 'Kırmızı',
    'yeşil': 'Yeşil',
    'yesil': 'Yeşil',
    'sarı': 'Sarı',
    'sari': 'Sarı',
    'mor': 'Mor',
    'pembe': 'Pembe',
    'turuncu': 'Turuncu',
    'gri': 'Gri',
    'kahverengi': 'Kahverengi',
    'lacivert': 'Lacivert',
    'bordo': 'Bordo'
  };
  
  // Extract colors from HTML content
  const htmlLower = html.toLowerCase();
  Object.entries(colorMappings).forEach(([key, value]) => {
    if (htmlLower.includes(key) && !colors.includes(value)) {
      colors.push(value);
    }
  });
  
  // ❌ FAKE SIZE EXTRACTION DISABLED
  console.log('🚫 Hardcoded size pattern extraction disabled to prevent fake variants');
  
  /* DISABLED FAKE SIZE EXTRACTION:
  // Extract sizes - look for common clothing sizes
  const sizePatterns = [
    'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL',
    '34', '36', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'
  ];
  
  sizePatterns.forEach(size => {
    // Look for sizes in various HTML contexts
    const patterns = [
      `"${size}"`,
      `'${size}'`,
      `>${size}<`,
      `size="${size}"`,
      `beden="${size}"`,
      `numara="${size}"`
    ];
    
    if (patterns.some(pattern => html.includes(pattern)) && !sizes.includes(size)) {
      sizes.push(size);
    }
  });
  */
  
  // If we found colors but no sizes, add a default size
  if (colors.length > 0 && sizes.length === 0) {
    sizes.push('Tek Beden');
  }
  
  // If we found sizes but no colors, add a default color
  if (sizes.length > 0 && colors.length === 0) {
    colors.push('Standart');
  }
  
  // Create stock map
  if (colors.length > 0 && sizes.length > 0) {
    colors.forEach(color => {
      sizes.forEach(size => {
        stockMap[`${color}-${size}`] = true;
      });
    });
  } else if (colors.length > 0) {
    colors.forEach(color => {
      stockMap[color] = true;
    });
  } else if (sizes.length > 0) {
    sizes.forEach(size => {
      stockMap[size] = true;
    });
  }
  
  console.log(`🎨 Working extraction results:`);
  console.log(`  Colors (${colors.length}):`, colors);
  console.log(`  Sizes (${sizes.length}):`, sizes);
  console.log(`  Stock combinations:`, Object.keys(stockMap).length);
  
  return { colors, sizes, stockMap };
}