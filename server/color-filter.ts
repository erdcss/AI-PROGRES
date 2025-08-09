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
    // L'Oreal Glotion specific main shades (exact matches)
    /^(901|902|903|904|905)\s*-?\s*(fair|medium|deep|light)?\s*glow$/i,
    /^light-glow$/i,
    
    // Main Trendyol color names (limited list)
    /^(bej|beyaz|siyah|mavi|kırmızı|yeşil)$/i,
    
    // Common English color names (limited list)  
    /^(beige|white|black|blue|red|green)$/i,
    
    // Hex colors (but exclude green hex codes which are noise)
    /^#(?!0[48][9AB])[0-9A-Fa-f]{6}$/,
    
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
    // Exclude obvious non-colors
    /^(orange|turuncu|gray|grey|gri)$/i, // These create too much noise
    /^light$/i, // Too generic
    /^(light-gray)$/i // Secondary colors that are noise
  ];

  isValidColor(color: string): boolean {
    if (!color || color.trim().length === 0) return false;
    
    const trimmedColor = color.trim();
    
    // Check exclude patterns first
    if (this.excludePatterns.some(pattern => pattern.test(trimmedColor))) {
      return false;
    }

    // Check main color patterns
    return this.mainColorPatterns.some(pattern => pattern.test(trimmedColor));
  }

  getColorPriority(color: string): number {
    // Higher priority for main product colors
    if (/^(901|902|903|904|905)\s*-?\s*(fair|medium|deep|light)?\s*glow$/i.test(color)) {
      return 10;
    }
    if (/^light-glow$/i.test(color)) {
      return 9;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return 5;
    }
    if (/^(bej|turuncu|mavi|siyah|beyaz)$/i.test(color)) {
      return 8;
    }
    return 1;
  }

  filterMainColors(colors: string[]): string[] {
    // Filter valid colors
    const validColors = colors.filter(color => this.isValidColor(color));
    
    // Remove duplicates and similar colors
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

export const colorFilter = new CosmeticColorFilter();