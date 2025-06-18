/**
 * Clean Trendyol Product Handler
 * Handles all Trendyol URLs with proper variant extraction and CSV generation
 */

import * as cheerio from 'cheerio';

interface Product {
  id: number;
  url: string;
  title: string;
  brand: string | null;
  price: string | null;
  basePrice: string | null;
  description: string;
  images: string[];
  video: string | null;
  variants: unknown;
  attributes: Record<string, string>;
  categories: string[] | null;
  category: string | null;
  subcategory: string | null;
  productType: string | null;
  tags: string[];
  vendor: string | null;
}

export async function handleTrendyolProduct(url: string, productId: string) {
  try {
    console.log('🚀 Clean Trendyol handler başlatılıyor...');
    
    // Fetch product page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const htmlContent = await response.text();
    const $ = cheerio.load(htmlContent);

    // Basic product info extraction
    const titleElement = $('h1').first();
    const title = titleElement.text().trim() || 'Ürün Başlığı Bulunamadı';
    
    const priceMatch = htmlContent.match(/"value":"([^"]+)","currency":"TL"/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 599.99;
    
    const brandMatch = htmlContent.match(/"brand":\{"name":"([^"]+)"/);
    const brand = brandMatch ? brandMatch[1] : 'Marka Bilinmiyor';

    // Image extraction
    let images: string[] = [];
    const imagePattern = /https:\/\/cdn\.dsmcdn\.com\/[^"'\s,}]+\/prod\/(?:QC|PIM)\/[^"'\s,}]+\.(jpg|jpeg|png|webp)/gi;
    const imageMatches = htmlContent.match(imagePattern) || [];
    
    images = [...new Set(imageMatches)]
      .map(url => optimizeImageUrl(url))
      .filter((url): url is string => url !== null)
      .slice(0, 10);

    console.log(`🖼️ ${images.length} görsel çıkarıldı`);

    // Clean variant extraction
    const { extractCleanVariants } = await import('./clean-variant-system');
    const cleanData = extractCleanVariants(htmlContent, productId);
    
    const colors = cleanData.colors;
    const sizes = cleanData.sizes;
    const extractedVariantImages = cleanData.variantImages;
    const colorImageMap = cleanData.colorImageMap;
    const variantPricing = cleanData.variantPricing;
    const variantSpecificPricing = cleanData.variantSpecificPricing;
    const stockMap = cleanData.stockMap;
    
    // Add clean images to main image array
    images.push(...cleanData.images);
    images = Array.from(new Set(images)).slice(0, 12);

    console.log(`🎨 ${colors.length} renk: ${colors.length > 0 ? colors.join(', ') : 'Hiç renk seçeneği yok'}`);
    console.log(`📏 ${sizes.length} beden: ${sizes.length > 0 ? sizes.join(', ') : 'Hiç beden seçeneği yok'}`);
    
    // Ensure at least default size if none found
    if (sizes.length === 0) {
      sizes.push('Default');
      console.log('📏 Varsayılan beden eklendi');
    }

    // Generate variant combinations
    const allVariants: any[] = [];
    
    if (colors.length > 0 && sizes.length > 0) {
      // Color-size combinations
      colors.forEach(color => {
        sizes.forEach(size => {
          const variantKey = `${color.toLowerCase()}-${size}`;
          const isInStock = stockMap[variantKey] !== false;
          
          const colorImages = colorImageMap[color] || images.slice(0, 3);
          
          let finalPrice = price;
          if (variantSpecificPricing[color]) {
            finalPrice = variantSpecificPricing[color];
          } else if (variantPricing[color]) {
            finalPrice = variantPricing[color];
          }
          
          if (variantPricing[size]) {
            finalPrice = variantPricing[size];
          }

          // Large size price increase
          if (['XL', '2XL', '3XL', '4XL'].includes(size)) {
            finalPrice = finalPrice * 1.10;
          }

          allVariants.push({
            color,
            size,
            price: finalPrice,
            shopifyPrice: (finalPrice * 1.10).toFixed(2),
            images: colorImages,
            inStock: isInStock,
            sku: `${productId}-${color.toLowerCase()}-${size.toLowerCase()}`,
            title: `${title} - ${color} - ${size}`,
            variantKey
          });
        });
      });
    } else if (colors.length > 0) {
      // Only colors
      colors.forEach(color => {
        const colorImages = colorImageMap[color] || images.slice(0, 3);
        let finalPrice = variantSpecificPricing[color] || variantPricing[color] || price;
        
        allVariants.push({
          color,
          size: 'Default',
          price: finalPrice,
          shopifyPrice: (finalPrice * 1.10).toFixed(2),
          images: colorImages,
          inStock: true,
          sku: `${productId}-${color.toLowerCase()}-default`,
          title: `${title} - ${color}`,
          variantKey: color.toLowerCase()
        });
      });
    } else {
      // Default product
      allVariants.push({
        color: 'Default',
        size: 'Default',
        price: price,
        shopifyPrice: (price * 1.10).toFixed(2),
        images: images.slice(0, 3),
        inStock: true,
        sku: `${productId}-default`,
        title: title,
        variantKey: 'default'
      });
    }

    console.log(`🔄 ${allVariants.length} varyant kombinasyonu oluşturuldu`);

    // Product data for CSV generation
    const productData: Product = {
      id: parseInt(productId),
      url,
      title,
      brand,
      price: price.toString(),
      basePrice: price.toString(),
      description: createShopifyDescription(title, brand, {}, []),
      images,
      video: null,
      variants: allVariants,
      attributes: {},
      categories: ['Moda', 'Giyim'],
      category: 'Moda',
      subcategory: 'Giyim',
      productType: 'Giyim',
      tags: generateAdvancedTags(title, brand, [], {}, colors, sizes),
      vendor: brand
    };

    // Generate CSV
    const { generateVariantSpecificCSV } = await import('./variant-specific-csv-generator');
    const result = await generateVariantSpecificCSV(productData, allVariants);

    const finalInStockCount = Object.values(stockMap).filter(Boolean).length;
    
    console.log(`✅ Temiz çıkarım tamamlandı: ${colors.length} renk, ${sizes.length} beden, ${allVariants.length} varyant`);

    return {
      url,
      message: "Temiz ürün verisi başarıyla çıkarıldı",
      title,
      brand,
      price: `${(price * 1.10).toFixed(2)} TL`,
      description: createShopifyDescription(title, brand, {}, []),
      images,
      variants: {
        colors: colors.length > 0 ? colors : [],
        sizes: sizes.length > 0 ? sizes : [],
        variantImages: extractedVariantImages,
        pricing: variantPricing,
        allVariants: allVariants,
        totalVariants: allVariants.length
      },
      attributes: productData.attributes,
      categories: ['Moda', 'Giyim'],
      category: 'Moda',
      subcategory: 'Giyim',
      tags: productData.tags,
      preview: {
        csvPath: result.csvPath,
        filename: result.filename,
        shopifyReady: true,
        totalRows: result.totalRows || allVariants.length,
        inStockVariants: finalInStockCount,
        message: `${allVariants.length} varyant Shopify formatında hazırlandı`
      }
    };

  } catch (error) {
    console.log(`❌ Clean Trendyol handler hatası:`, error);
    throw error;
  }
}

function optimizeImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  if (!url.includes('cdn.dsmcdn.com')) return null;
  if (!(url.includes('/prod/QC/') || url.includes('/prod/PIM/'))) return null;
  
  let cleanUrl = url.replace(/[{}]/g, '');
  
  if (!cleanUrl.includes('_org_zoom.jpg')) {
    cleanUrl = cleanUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '_org_zoom.jpg');
  }
  
  if (!cleanUrl.startsWith('https:')) {
    cleanUrl = cleanUrl.startsWith('//') ? 'https:' + cleanUrl : 'https://' + cleanUrl;
  }
  
  return cleanUrl;
}

function generateAdvancedTags(
  title: string, 
  brand: string, 
  categories: string[], 
  attributes: Record<string, string>, 
  colors: string[], 
  sizes: string[]
): string[] {
  const tags = new Set<string>();
  
  // Brand tag
  if (brand && brand !== 'Marka Bilinmiyor') {
    tags.add(brand);
  }
  
  // Title words as tags
  const titleWords = title.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  titleWords.forEach(word => {
    if (!['için', 'ile', 'dan', 'den', 'the', 'and', 'with'].includes(word)) {
      tags.add(word);
    }
  });
  
  // Color tags
  colors.forEach(color => {
    if (color && color !== 'Default') {
      tags.add(color.toLowerCase());
    }
  });
  
  // Size tags
  sizes.forEach(size => {
    if (size && size !== 'Default') {
      tags.add(size.toLowerCase());
    }
  });
  
  // Categories as tags
  categories.forEach(cat => tags.add(cat.toLowerCase()));
  
  return Array.from(tags).slice(0, 20);
}

function createShopifyDescription(
  title: string, 
  brand: string, 
  attributes: Record<string, string>, 
  categories: string[]
): string {
  let description = `<h2>${title}</h2>\n\n`;
  
  if (brand && brand !== 'Marka Bilinmiyor') {
    description += `<p><strong>Marka:</strong> ${brand}</p>\n`;
  }
  
  description += `<p>Yüksek kaliteli ${title.toLowerCase()}, modern tasarım ve konforlu kullanım için ideal.</p>\n\n`;
  
  if (Object.keys(attributes).length > 0) {
    description += `<h3>Ürün Özellikleri:</h3>\n<ul>\n`;
    Object.entries(attributes).forEach(([key, value]) => {
      description += `<li><strong>${key}:</strong> ${value}</li>\n`;
    });
    description += `</ul>\n\n`;
  }
  
  description += `<p>Güvenli alışveriş, hızlı kargo ve müşteri memnuniyeti garantisi ile sunulmaktadır.</p>`;
  
  return description;
}