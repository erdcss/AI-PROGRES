/**
 * Enhanced color filtering system for cosmetic products
 * Specifically optimized for L'Oreal and similar beauty brands
 */

export interface ColorFilter {
  isValidColor(color: string): boolean;
  filterMainColors(colors: string[]): string[];
  getColorPriority(color: string): number;
}

export class CosmeticColorFilter implements ColorFilter {
  private readonly mainColorPatterns = [
    // L'Oreal Glotion specific main shades (all variants)
    /^(901|902|903|904|905)[-\s]*(fair|medium|deep|light|rich)[-\s]*glow$/i,
    /^(fair|medium|deep|light|rich)[-\s]*glow$/i,
    
    // Individual L'Oreal product codes (exact patterns from logs)
    /^901[-\s]*fair[-\s]*glow$/i,
    /^902[-\s]*light[-\s]*glow$/i,
    /^903[-\s]*medium[-\s]*glow$/i,
    /^904[-\s]*deep[-\s]*glow$/i,
    /^905[-\s]*rich[-\s]*glow$/i,
    
    // L'Oreal specific patterns with different formatting
    /^901\s*-\s*Fair\s*Glow$/i,
    /^902\s*-\s*Light\s*Glow$/i,
    /^903\s*-\s*Medium\s*Glow$/i,
    /^904\s*-\s*Deep\s*Glow$/i,
    
    // Maybelline Super Lock Brow Glue specific shades
    /^şeffaf$/i,
    /^seffaf$/i, // Alternative spelling without ş
    /^transparent$/i,
    /^clear$/i,
    /^taupe$/i,
    /^medium\s*brown$/i,
    /^medium-brown$/i,
    /^deep\s*brown$/i,
    /^deep-brown$/i,
    /^koyu\s*kahverengi$/i,
    /^kahverengi$/i, // Just brown
    
    // REMOVED: Generic color names like "bej" to prevent fake color detection
    // Only specific product-based colors are now allowed
    
    // Very specific cosmetic color patterns
    /^(fair|medium|deep|light)$/i
  ];

  private readonly excludePatterns = [
    // Exclude technical/code-related strings
    /^(rgb|rgba|hsl|hsla)/i,
    /^(color|renk)$/i,
    /^(variant|varyant)$/i,
    /^\d+px$/i,
    /^(true|false)$/i,
    /^(null|undefined)$/i,
    // Exclude very long strings (likely not color names)
    /.{20,}/,
    // Exclude obvious non-colors (be more selective)
    /^(gray|grey|gri)$/i, // Generic grays
    /^light$/i // Too generic
  ];

  isValidColor(color: string): boolean {
    if (!color || color.trim().length === 0) return false;
    
    const trimmedColor = color.trim();
    
    // Check exclude patterns first
    const isExcluded = this.excludePatterns.some(pattern => pattern.test(trimmedColor));
    if (isExcluded) {
      console.log(`🚫 Color "${trimmedColor}" excluded by pattern`);
      return false;
    }

    // Check main color patterns
    const isValid = this.mainColorPatterns.some(pattern => pattern.test(trimmedColor));
    if (!isValid) {
      console.log(`❌ Color "${trimmedColor}" doesn't match any main pattern`);
    }
    return isValid;
  }

  getColorPriority(color: string): number {
    // Higher priority for L'Oreal main product colors (exact patterns)
    if (/^(901|902|903|904|905)[-\s]*(fair|medium|deep|light|rich)[-\s]*glow$/i.test(color)) {
      return 10;
    }
    if (/^(fair|medium|deep|light|rich)[-\s]*glow$/i.test(color)) {
      return 9;
    }
    // Maybelline colors high priority
    if (/^(şeffaf|seffaf|transparent|clear|taupe|medium\s*brown|medium-brown|deep\s*brown|deep-brown)$/i.test(color)) {
      return 8;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return 5;
    }
    return 1;
  }

  filterMainColors(colors: string[]): string[] {
    console.log(`🔍 Color filter input: [${colors.join(', ')}]`);
    
    // SPECIAL HANDLING: For raw Maybelline colors, detect them before validation
    const maybellineRawColors = colors.filter(color => 
      /^(şeffaf|seffaf|transparent|clear|taupe|medium\s*brown|medium-brown|deep\s*brown|deep-brown|koyu\s*kahverengi|kahverengi)$/i.test(color)
    );
    console.log(`🎨 Raw Maybelline colors detected: [${maybellineRawColors.join(', ')}]`);
    
    if (maybellineRawColors.length >= 2) {
      console.log(`🎨 Found ${maybellineRawColors.length} raw Maybelline colors - prioritizing them`);
      
      // Sort Maybelline colors in the specific order requested and normalize names
      const normalizedMaybelline = maybellineRawColors.map(color => {
        if (/^(şeffaf|seffaf|transparent|clear)$/i.test(color)) return 'şeffaf';
        if (/^taupe$/i.test(color)) return 'taupe';
        if (/^(medium\s*brown|medium-brown)$/i.test(color)) return 'medium brown';
        if (/^(deep\s*brown|deep-brown|koyu\s*kahverengi|kahverengi)$/i.test(color)) return 'deep brown';
        return color;
      });
      
      const sortedMaybelline = [...new Set(normalizedMaybelline)].sort((a, b) => {
        const order = ['şeffaf', 'taupe', 'medium brown', 'deep brown'];
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        return aIndex - bIndex;
      });
      
      return sortedMaybelline.slice(0, 4); // Return up to 4 main variants
    }
    
    // Filter valid colors using regular validation
    const validColors = colors.filter(color => this.isValidColor(color));
    console.log(`✅ Valid colors after filtering: [${validColors.join(', ')}]`);
    
    // For L'Oreal products, specifically look for the 4 main glow variants
    const lOrealMainVariants = validColors.filter(color => 
      /^(901|902|903|904)\s*-?\s*(fair|medium|deep|light)?\s*glow$/i.test(color) ||
      /^light-glow$/i.test(color)
    );
    console.log(`🎨 L'Oreal variants detected: [${lOrealMainVariants.join(', ')}]`);

    // For Maybelline Super Lock Brow Glue, look for the 4 main brown shades
    const maybellineMainVariants = validColors.filter(color => 
      /^(şeffaf|seffaf|transparent|clear|taupe|medium\s*brown|medium-brown|deep\s*brown|deep-brown|koyu\s*kahverengi|kahverengi)$/i.test(color)
    );
    console.log(`🎨 Maybelline variants detected: [${maybellineMainVariants.join(', ')}]`);

    // If we found L'Oreal main variants, prioritize them
    if (lOrealMainVariants.length >= 1) {
      console.log(`🎨 Found ${lOrealMainVariants.length} L'Oreal main variants:`, lOrealMainVariants);
      return lOrealMainVariants.slice(0, 4); // Return up to 4 main variants
    }
    
    // If we found Maybelline main variants, prioritize them in correct order
    if (maybellineMainVariants.length >= 1) {
      console.log(`🎨 Found ${maybellineMainVariants.length} Maybelline main variants:`, maybellineMainVariants);
      
      // Sort Maybelline colors in the specific order requested
      const sortedMaybelline = maybellineMainVariants.sort((a, b) => {
        const order = ['şeffaf', 'seffaf', 'transparent', 'clear', 'taupe', 'medium brown', 'medium-brown', 'deep brown', 'deep-brown', 'koyu kahverengi'];
        const aIndex = order.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(a));
        const bIndex = order.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(b));
        return aIndex - bIndex;
      });
      
      return sortedMaybelline.slice(0, 4); // Return up to 4 main variants
    }
    
    // Otherwise, use regular filtering
    const uniqueColors = new Map<string, string>();
    
    validColors.forEach(color => {
      const normalizedColor = color.toLowerCase().replace(/[^a-z0-9\-]/g, '');
      
      // If we already have this normalized color, keep the one with higher priority
      if (uniqueColors.has(normalizedColor)) {
        const existing = uniqueColors.get(normalizedColor)!;
        if (this.getColorPriority(color) > this.getColorPriority(existing)) {
          uniqueColors.set(normalizedColor, color);
        }
      } else {
        uniqueColors.set(normalizedColor, color);
      }
    });

    // Return sorted by priority (highest first)
    return Array.from(uniqueColors.values())
      .sort((a, b) => this.getColorPriority(b) - this.getColorPriority(a))
      .slice(0, 8); // Limit to maximum 8 colors
  }
}

// Renk isimlerini Türkçe karşılıkları ile döndürür
export function getColorName(color: string): string {
  const lOrealColorMap: { [key: string]: string } = {
    '901-fair-glow': '901 - Fair Glow (Açık Ten)',
    '902-light-glow': '902 - Light Glow (Orta Açık Ten)', 
    '903-medium-glow': '903 - Medium Glow (Orta Ten)',
    '904-deep-glow': '904 - Deep Glow (Koyu Ten)',
    '905-rich-glow': '905 - Rich Glow (Çok Koyu Ten)',
    'fair-glow': 'Fair Glow (Açık Ten)',
    'light-glow': 'Light Glow (Orta Açık Ten)',
    'medium-glow': 'Medium Glow (Orta Ten)',
    'deep-glow': 'Deep Glow (Koyu Ten)',
    'rich-glow': 'Rich Glow (Çok Koyu Ten)',
    'fair': 'Fair (Açık Ten)',
    'light': 'Light (Orta Açık)',
    'medium': 'Medium (Orta)',
    'deep': 'Deep (Koyu)',
    'golden': 'Altın Rengi',
    'gold': 'Altın Rengi',
    'rose': 'Gül Rengi',
    'nude': 'Nude (Ten Rengi)',
    'coral': 'Mercan Rengi',
    'berry': 'Böğürtlen Rengi',
    'pink': 'Pembe',
    'peach': 'Şeftali Rengi',
    'bronze': 'Bronz',
    'honey': 'Bal Rengi',
    'caramel': 'Karamel',
    'vanilla': 'Vanilya',
    'porcelain': 'Porselen',
    'ivory': 'Fildişi',
    'beige': 'Bej',
    'sand': 'Kum Rengi',
    'warm': 'Sıcak Ton',
    'cool': 'Soğuk Ton',
    'neutral': 'Nötr Ton',
    'transparent': 'Şeffaf',
    'clear': 'Şeffaf',
    'şeffaf': 'Şeffaf',
    'taupe': 'Taupe (Gri-Kahve)',
    'medium-brown': 'Orta Kahve',
    'deep-brown': 'Koyu Kahve',
    'kahverengi': 'Kahverengi'
  };

  const normalizedColor = color.toLowerCase().replace(/[-\s]+/g, '-');
  const colorName = lOrealColorMap[normalizedColor];
  
  if (colorName) {
    console.log(`🎨 Color mapping: "${color}" -> "${colorName}"`);
    return colorName;
  }
  
  return color; // Return original if no mapping found
}

export const colorFilter = new CosmeticColorFilter();