/**
 * Advanced Tag Generator
 * Generates relevant tags for products based on content analysis
 */

import * as cheerio from 'cheerio';

export async function generateAdvancedTags($: cheerio.CheerioAPI, htmlContent: string): Promise<string[]> {
  console.log('🏷️ Generating advanced tags...');
  
  try {
    const tags: string[] = [];
    
    // Extract basic product information for tag generation
    const title = $('h1, .product-title, [data-testid="product-title"]').first().text().trim().toLowerCase();
    const category = $('.breadcrumb, .category, .product-category').text().toLowerCase();
    const description = $('.product-description, .description').text().toLowerCase();
    
    // Category-based tags
    const categoryKeywords = [
      'elektronik', 'giyim', 'ayakkabı', 'çanta', 'aksesuar', 'kozmetik', 'ev', 'bahçe', 
      'spor', 'kitap', 'oyuncak', 'bebek', 'petshop', 'oto', 'yapı', 'market'
    ];
    
    categoryKeywords.forEach(keyword => {
      if (title.includes(keyword) || category.includes(keyword) || description.includes(keyword)) {
        tags.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
      }
    });
    
    // Material-based tags
    const materials = [
      'pamuk', 'polyester', 'denim', 'ipek', 'yün', 'deri', 'süet', 'kanvas',
      'altın', 'gümüş', 'çelik', 'titanyum', 'plastik', 'cam', 'seramik', 'ahşap'
    ];
    
    materials.forEach(material => {
      if (title.includes(material) || description.includes(material)) {
        tags.push(material.charAt(0).toUpperCase() + material.slice(1));
      }
    });
    
    // Color-based tags
    const colors = [
      'siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'mor', 'pembe',
      'gri', 'kahve', 'turuncu', 'lacivert', 'krem', 'bej', 'bordo'
    ];
    
    colors.forEach(color => {
      if (title.includes(color) || description.includes(color)) {
        tags.push(color.charAt(0).toUpperCase() + color.slice(1));
      }
    });
    
    // Brand extraction for tags
    const brandElements = $('.brand, .product-brand, [data-testid="brand"]');
    if (brandElements.length > 0) {
      const brand = brandElements.first().text().trim();
      if (brand && brand.length > 1 && brand.length < 30) {
        tags.push(brand);
      }
    }
    
    // Size-based tags
    const sizeKeywords = ['büyük', 'küçük', 'orta', 'xl', 'xxl', 'mini', 'jumbo'];
    sizeKeywords.forEach(size => {
      if (title.includes(size) || description.includes(size)) {
        tags.push(size.charAt(0).toUpperCase() + size.slice(1));
      }
    });
    
    // Season-based tags
    const seasons = ['yaz', 'kış', 'sonbahar', 'ilkbahar', 'mevsim'];
    seasons.forEach(season => {
      if (title.includes(season) || description.includes(season)) {
        tags.push(season.charAt(0).toUpperCase() + season.slice(1));
      }
    });
    
    // Generic quality tags
    const qualityTerms = ['premium', 'kaliteli', 'lüks', 'ekonomik', 'özel', 'limited'];
    qualityTerms.forEach(term => {
      if (title.includes(term) || description.includes(term)) {
        tags.push(term.charAt(0).toUpperCase() + term.slice(1));
      }
    });
    
    // ❌ REMOVED: Trendyol tag is no longer added
    // tags.push('Trendyol');
    
    // Remove duplicates, filter out 'trendyol', and limit to reasonable number
    const uniqueTags = [...new Set(tags)]
      .filter(tag => tag.toLowerCase() !== 'trendyol' && tag.toLowerCase() !== '#trendyol');
    const finalTags = uniqueTags.slice(0, 10); // Limit to 10 tags
    
    console.log(`🏷️ Generated ${finalTags.length} tags (filtered out #trendyol): [${finalTags.join(', ')}]`);
    return finalTags;
    
  } catch (error: any) {
    console.log(`❌ Tag generation failed: ${error?.message || 'Unknown error'}`);
    return []; // Return empty array instead of 'Trendyol' tag
  }
}