/**
 * Centralized clothing keywords list for fake size prevention system
 * Used across all layers: scraper, routes, and CSV generator
 * 
 * IMPORTANT: Do NOT include generic words like "set", "kombin", "paket"
 * These can appear in perfume/cosmetic products and cause false positives
 */

export const CLOTHING_KEYWORDS = [
  // T-shirts and tops
  'tişört', 't-shirt', 'tshirt', 'gömlek', 'bluz', 'atlet', 'body',
  
  // Pants and bottoms
  'pantolon', 'etek', 'şort', 'tayt', 'jean', 'kot', 'denim',
  
  // Dresses
  'elbise', 'tulum',
  
  // Outerwear
  'kazak', 'mont', 'ceket', 'hırka', 'yelek', 'sweatshirt', 'hoodie', 'polar',
  'trençkot', 'kaban', 'palto', 'eşofman', 'kap', 'parka',
  
  // Footwear
  'ayakkabı', 'çizme', 'bot', 'sneaker', 'terlik', 'sandalet', 'topuklu',
  'loafer', 'mokasen', 'babet', 'spor ayakkabı',
  
  // Underwear and sleepwear
  'iç giyim', 'pijama', 'mayo', 'bikini', 'külot', 'sütyen', 'boxer',
  
  // Accessories that have sizes
  'kemer', 'eldiven', 'şapka', 'bere', 'atkı'
];

/**
 * Fake clothing size codes to filter out from non-clothing products
 * These are standard clothing size abbreviations that should NOT appear
 * on products like perfumes, cosmetics, electronics, etc.
 */
export const FAKE_CLOTHING_SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl'];

/**
 * Check if a product title indicates it's a clothing item
 */
export function isClothingProduct(title: string): boolean {
  const titleLower = (title || '').toLowerCase();
  return CLOTHING_KEYWORDS.some(kw => titleLower.includes(kw));
}
