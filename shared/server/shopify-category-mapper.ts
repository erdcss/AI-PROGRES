/**
 * Shopify Category Mapper - Maps Turkish product types to valid Shopify categories
 * Based on Shopify Product Taxonomy: https://help.shopify.com/manual/products/details/product-type#product-category-and-product-types
 */

export interface CategoryMapping {
  [key: string]: string;
}

// Valid Shopify categories for clothing items
export const shopifyCategoryMap: CategoryMapping = {
  // Women's Clothing
  'kadın bluz': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'kadın gömlek': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'kadın tişört': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'bluz': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'gömlek': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'tişört': 'Apparel & Accessories > Clothing > Shirts & Tops',
  
  // Dresses
  'kadın elbise': 'Apparel & Accessories > Clothing > Dresses',
  'elbise': 'Apparel & Accessories > Clothing > Dresses',
  
  // Outerwear
  'kadın ceket': 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
  'kadın blazer': 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
  'kadın mont': 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
  'ceket': 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
  'blazer': 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
  'mont': 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
  
  // Pants
  'kadın pantolon': 'Apparel & Accessories > Clothing > Pants',
  'kadın jean': 'Apparel & Accessories > Clothing > Pants',
  'pantolon': 'Apparel & Accessories > Clothing > Pants',
  'jean': 'Apparel & Accessories > Clothing > Pants',
  'kot': 'Apparel & Accessories > Clothing > Pants',
  
  // Skirts
  'kadın etek': 'Apparel & Accessories > Clothing > Skirts',
  'etek': 'Apparel & Accessories > Clothing > Skirts',
  
  // Sweaters
  'kadın kazak': 'Apparel & Accessories > Clothing > Sweaters',
  'kadın hırka': 'Apparel & Accessories > Clothing > Sweaters',
  'kazak': 'Apparel & Accessories > Clothing > Sweaters',
  'hırka': 'Apparel & Accessories > Clothing > Sweaters',
  
  // Men's Clothing
  'erkek gömlek': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'erkek tişört': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'erkek ceket': 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
  'erkek pantolon': 'Apparel & Accessories > Clothing > Pants',
  'erkek jean': 'Apparel & Accessories > Clothing > Pants',
  
  // Accessories
  'çanta': 'Apparel & Accessories > Bags',
  'ayakkabı': 'Apparel & Accessories > Shoes',
  'bot': 'Apparel & Accessories > Shoes',
  'sneaker': 'Apparel & Accessories > Shoes',
  
  // Default categories
  'giyim': 'Apparel & Accessories',
  'default': 'Apparel & Accessories'
};

export function mapToShopifyCategory(productTitle: string, productBrand: string, detectedCategory?: string): string {
  const titleLower = productTitle.toLowerCase();
  const brandLower = productBrand.toLowerCase();
  const categoryLower = detectedCategory?.toLowerCase() || '';
  
  // Combine all text for analysis
  const allText = `${titleLower} ${brandLower} ${categoryLower}`;
  
  console.log(`🏷️ Shopify kategori eşleme: "${allText}"`);
  
  // Check for exact matches first
  for (const [key, shopifyCategory] of Object.entries(shopifyCategoryMap)) {
    if (allText.includes(key.toLowerCase())) {
      console.log(`  ✅ Eşleşme bulundu: "${key}" → "${shopifyCategory}"`);
      return shopifyCategory;
    }
  }
  
  // Pattern-based detection
  if (titleLower.includes('bluz') || titleLower.includes('gömlek') || titleLower.includes('tişört')) {
    return 'Apparel & Accessories > Clothing > Shirts & Tops';
  }
  
  if (titleLower.includes('elbise')) {
    return 'Apparel & Accessories > Clothing > Dresses';
  }
  
  if (titleLower.includes('ceket') || titleLower.includes('blazer') || titleLower.includes('mont')) {
    return 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets';
  }
  
  if (titleLower.includes('pantolon') || titleLower.includes('jean') || titleLower.includes('kot')) {
    return 'Apparel & Accessories > Clothing > Pants';
  }
  
  if (titleLower.includes('etek')) {
    return 'Apparel & Accessories > Clothing > Skirts';
  }
  
  if (titleLower.includes('kazak') || titleLower.includes('hırka')) {
    return 'Apparel & Accessories > Clothing > Sweaters';
  }
  
  if (titleLower.includes('ayakkabı') || titleLower.includes('bot') || titleLower.includes('sneaker')) {
    return 'Apparel & Accessories > Shoes';
  }
  
  if (titleLower.includes('çanta')) {
    return 'Apparel & Accessories > Bags';
  }
  
  // Default to general apparel category
  console.log(`  ⚠️ Spesifik kategori bulunamadı, varsayılan kullanılıyor`);
  return 'Apparel & Accessories';
}