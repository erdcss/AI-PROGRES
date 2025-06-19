import * as cheerio from 'cheerio';

export interface RealProductData {
  title: string;
  brand: string;
  price: number;
  description: string;
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
  };
  attributes: Record<string, string>;
}

export function extractRealTrendyolData(html: string): RealProductData {
  const $ = cheerio.load(html);
  
  // Extract title with multiple selectors
  const title = $('h1[data-testid="product-name"]').text().trim() || 
               $('.product-title, .pr-in-nm, h1').first().text().trim() ||
               $('title').text().split('|')[0].trim() ||
               'Ürün';

  // Extract brand
  const brand = $('.product-brand, .pr-in-br, [data-testid="brand-name"]').text().trim() || 
               title.split(' ')[0] || 
               'Marka';

  // Extract price with improved selectors
  const priceSelectors = [
    '[data-testid="price"]',
    '.prc-dsc',
    '.prc-slg', 
    '.pr-in-pr',
    '.price-current',
    '.current-price'
  ];
  
  let price = 0;
  for (const selector of priceSelectors) {
    const priceText = $(selector).first().text().trim();
    if (priceText) {
      const priceMatch = priceText.match(/[\d,]+/);
      if (priceMatch) {
        price = parseFloat(priceMatch[0].replace(',', '.'));
        break;
      }
    }
  }
  
  if (price === 0) {
    price = 100; // Default minimum price
  }

  // Extract description
  const description = $('.product-description, .detail-attr-item, .product-detail-content')
    .first().text().trim() || 
    `${title} - Yüksek kalite ve modern tasarım.`;

  // Extract real images
  const images: string[] = [];
  
  // Try different image selectors
  const imageSelectors = [
    'img[data-testid="product-image"]',
    '.product-image img',
    '.gallery-image img',
    '.slider-image img',
    '[data-src*="cdn.dsmcdn.com"]'
  ];
  
  imageSelectors.forEach(selector => {
    $(selector).each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (src && src.includes('cdn.dsmcdn.com') && !images.includes(src)) {
        images.push(src);
      }
    });
  });

  // Extract variants
  const colors: string[] = [];
  const sizes: string[] = [];
  
  // Color extraction
  $('[data-testid*="color"], .color-variant, .variant-color, .color-item').each((_, el) => {
    const colorText = $(el).attr('title') || $(el).text().trim();
    if (colorText && !colors.includes(colorText.toLowerCase())) {
      colors.push(colorText.toLowerCase());
    }
  });
  
  // Size extraction
  $('[data-testid*="size"], .size-variant, .variant-size, .size-item').each((_, el) => {
    const sizeText = $(el).text().trim();
    if (sizeText && isValidSize(sizeText) && !sizes.includes(sizeText)) {
      sizes.push(sizeText);
    }
  });

  // Extract product attributes
  const attributes: Record<string, string> = {};
  $('.detail-attr-item, .product-attribute').each((_, item) => {
    const label = $(item).find('.attr-label, .attribute-label').text().trim();
    const value = $(item).find('.attr-value, .attribute-value').text().trim();
    if (label && value) {
      attributes[label.replace(':', '')] = value;
    }
  });

  return {
    title,
    brand,
    price,
    description,
    images: images.slice(0, 10),
    variants: {
      colors: colors.length > 0 ? colors : ['tek renk'],
      sizes: sizes.length > 0 ? sizes : ['tek beden']
    },
    attributes
  };
}

function isValidSize(value: string): boolean {
  const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', '44', '46', '48', '50', 'Tek Beden'];
  return validSizes.some(size => value.toUpperCase().includes(size));
}