/**
 * Real Color Extractor - Ürünün gerçek renk seçeneklerini çıkarır
 */

import * as cheerio from 'cheerio';

export interface ColorVariant {
  color: string;
  colorCode?: string;
  available: boolean;
  imageUrl?: string;
}

export async function extractRealColors(html: string, url: string, productTitle?: string): Promise<ColorVariant[]> {
  console.log('🎨 Real color extraction starting...');
  
  const $ = cheerio.load(html);
  const colors: ColorVariant[] = [];
  
  // Determine if this is a single-color product type
  const singleColorProducts = ['çay', 'kahve', 'gıda', 'yiyecek', 'içecek', 'vitamin', 'suplement'];
  const isSingleColorProduct = productTitle && singleColorProducts.some(type => 
    productTitle.toLowerCase().includes(type)
  );
  
  try {
    // Method 1: Trendyol color selector buttons
    console.log('🔍 Method 1: Color selector buttons...');
    const colorButtons = $('.pr-in-dt-cl-wr .pr-in-dt-cl');
    
    colorButtons.each((index, element) => {
      const $el = $(element);
      const colorName = $el.attr('title') || $el.text().trim();
      const colorCode = $el.attr('data-color') || $el.find('span').attr('style');
      const isAvailable = !$el.hasClass('disabled') && !$el.hasClass('unavailable');
      
      if (colorName && colorName.length > 1) {
        colors.push({
          color: colorName,
          colorCode: colorCode,
          available: isAvailable
        });
      }
    });
    
    // Method 2: Script data parsing
    if (colors.length === 0) {
      console.log('🔍 Method 2: Script data parsing...');
      
      const scriptTags = $('script').toArray();
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        
        // Trendyol color variants pattern
        const colorPattern = /"variants":\s*\[(.*?)\]/s;
        const colorMatch = scriptContent.match(colorPattern);
        
        if (colorMatch) {
          try {
            const variantData = colorMatch[1];
            const colorRegex = /"color"\s*:\s*"([^"]+)"/g;
            let match;
            
            while ((match = colorRegex.exec(variantData)) !== null) {
              const colorName = match[1];
              if (colorName && !colors.find(c => c.color === colorName)) {
                colors.push({
                  color: colorName,
                  available: true
                });
              }
            }
          } catch (e) {
            console.log('❌ Error parsing color script data:', e);
          }
        }
      }
    }
    
    // Method 3: Product state color options
    if (colors.length === 0) {
      console.log('🔍 Method 3: Product state color options...');
      
      const scriptTags = $('script').toArray();
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        
        // Product state pattern
        if (scriptContent.includes('productState') || scriptContent.includes('colorOptions')) {
          const colorPattern = /"name"\s*:\s*"([^"]+)"/g;
          let match;
          
          while ((match = colorPattern.exec(scriptContent)) !== null) {
            const colorName = match[1];
            // Filter out non-color values
            const nonColorValues = ['Size', 'Beden', 'Adet', 'Piece', 'Type', 'Model'];
            
            if (colorName && 
                colorName.length > 2 && 
                colorName.length < 30 &&
                !nonColorValues.some(invalid => colorName.toLowerCase().includes(invalid.toLowerCase())) &&
                !colors.find(c => c.color === colorName)) {
              
              colors.push({
                color: colorName,
                available: true
              });
            }
          }
        }
      }
    }
    
    // Method 4: DOM color elements
    if (colors.length === 0) {
      console.log('🔍 Method 4: DOM color elements...');
      
      // Color swatches
      $('.color-swatch, .color-option, [data-color]').each((index, element) => {
        const $el = $(element);
        const colorName = $el.attr('title') || $el.attr('data-color') || $el.text().trim();
        
        if (colorName && colorName.length > 1 && colorName.length < 30) {
          colors.push({
            color: colorName,
            available: !$el.hasClass('disabled')
          });
        }
      });
    }
    
    // Method 5: Pattern matching in HTML
    if (colors.length === 0) {
      console.log('🔍 Method 5: Pattern matching in HTML...');
      
      const turkishColors = [
        'Siyah', 'Beyaz', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Turuncu', 'Mor', 'Pembe',
        'Gri', 'Kahverengi', 'Lacivert', 'Bordo', 'Bej', 'Krem', 'Füme', 'Haki', 'Vizon',
        'Pudra', 'Ekru', 'Antrasit', 'Indigo', 'Çok Renkli', 'Desenli'
      ];
      
      const englishColors = [
        'Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink',
        'Gray', 'Brown', 'Navy', 'Burgundy', 'Beige', 'Cream', 'Multicolor'
      ];
      
      const allColors = [...turkishColors, ...englishColors];
      
      allColors.forEach(color => {
        const colorPattern = new RegExp(`\\b${color}\\b`, 'gi');
        if (html.match(colorPattern)) {
          if (!colors.find(c => c.color.toLowerCase() === color.toLowerCase())) {
            colors.push({
              color: color,
              available: true
            });
          }
        }
      });
    }
    
    // Clean and deduplicate colors
    const uniqueColors = colors.filter((color, index, self) => 
      index === self.findIndex(c => c.color.toLowerCase() === color.color.toLowerCase())
    );
    
    // Sort colors by name
    uniqueColors.sort((a, b) => a.color.localeCompare(b.color, 'tr'));
    
    // Apply smart filtering for single-color products
    if (isSingleColorProduct && uniqueColors.length > 3) {
      console.log(`🎯 Single-color product detected, filtering ${uniqueColors.length} colors to most relevant`);
      // For food/beverage products, keep only natural/package colors
      const relevantColors = uniqueColors.filter(color => {
        const colorName = color.color.toLowerCase();
        return colorName.includes('beyaz') || colorName.includes('siyah') || 
               colorName.includes('kahverengi') || colorName.includes('doğal') ||
               colorName.includes('standart') || colorName.includes('tek') ||
               colorName.includes('brown') || colorName.includes('white') ||
               colorName.includes('black');
      });
      
      if (relevantColors.length > 0) {
        const filteredResult = relevantColors.slice(0, 1); // Keep only the most relevant one
        console.log(`✅ Filtered to ${filteredResult.length} relevant color(s)`);
        filteredResult.forEach((color, index) => {
          console.log(`   🎨 ${index + 1}. ${color.color} ${color.available ? '(Mevcut)' : '(Tükendi)'}`);
        });
        return filteredResult;
      } else {
        console.log(`✅ Using default color for single-color product`);
        return [{ color: 'Standart', available: true }]; // Default for single-color products
      }
    }
    
    console.log(`✅ Real colors extracted: ${uniqueColors.length} colors`);
    uniqueColors.forEach((color, index) => {
      console.log(`   🎨 ${index + 1}. ${color.color} ${color.available ? '(Mevcut)' : '(Tükendi)'}`);
    });
    
    return uniqueColors;
    
  } catch (error) {
    console.error('❌ Color extraction error:', error);
    return [];
  }
}