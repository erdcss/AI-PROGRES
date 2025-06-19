import * as cheerio from 'cheerio';
import axios from 'axios';
import * as fs from 'fs';
// Memory storage removed - instant processing only

export interface EnhancedVariantData {
  colors: string[];
  sizes: string[];
  images: string[];
  variantImages: Record<string, string[]>;
  colorImageMap: Record<string, string[]>;
  variantPricing: Record<string, number>;
  variantSpecificPricing: Record<string, number>;
  stockMap: Record<string, boolean>;
  outOfStockVariants: string[];
}

export async function scrapeTrendyolProduct(inputUrl: string) {
  try {
    console.log('🚀 Enhanced Trendyol handler başlatılıyor...');
    
    // Normalize URL - ensure https:// prefix
    let url = inputUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Geçersiz URL formatı: ${inputUrl}`);
    }
    
    console.log(`📡 Canlı Trendyol verisi çekiliyor: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.trendyol.com/',
        'Origin': 'https://www.trendyol.com',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 45000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Accept 4xx as valid response
    });
    
    console.log(`📊 Response status: ${response.status}, Content length: ${response.data.length}`);
    
    if (response.status === 403 || response.status === 404 || response.status === 410) {
      console.log(`⚠️ Cloudflare blocking detected (${response.status}), trying alternative approach`);
      
      // Try mobile API endpoint as fallback
      const productId = url.match(/p-(\d+)/)?.[1];
      if (productId) {
        try {
          const mobileUrl = `https://public-mdc.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`;
          console.log(`🔄 Trying mobile API: ${mobileUrl}`);
          
          const mobileResponse = await axios.get(mobileUrl, {
            headers: {
              'User-Agent': 'TrendyolMobileApp/5.0.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'tr-TR,tr;q=0.9',
              'Referer': 'https://m.trendyol.com/',
              'Origin': 'https://m.trendyol.com',
              'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 30000,
            validateStatus: (status) => status === 200
          });
          
          if (mobileResponse.status === 200 && mobileResponse.data?.result) {
            const data = mobileResponse.data.result;
            console.log(`✅ Mobile API success: ${data.name}`);
            
            const product = {
              title: data.name || 'Ürün',
              price: data.price?.originalPrice?.text?.replace(/[^\d,]/g, '').replace(',', '.') || '100',
              basePrice: data.price?.originalPrice?.text?.replace(/[^\d,]/g, '').replace(',', '.') || '100',
              id: parseInt(productId),
              description: data.description || `${data.name} - Kaliteli ürün`,
              brand: data.brand?.name || 'Marka',
              images: data.images?.map((img: any) => img.url) || [],
              variants: {
                colors: data.variants?.filter((v: any) => v.attributeType === 1)?.map((v: any) => v.name) || ['tek renk'],
                sizes: data.variants?.filter((v: any) => v.attributeType === 2)?.map((v: any) => v.name) || ['tek beden'],
                totalVariants: data.variants?.length || 1
              },
              url: url
            };
            
            csvAccumulator.addProduct(product);
            
            return {
              success: true,
              title: product.title,
              price: product.price,
              brand: product.brand,
              images: product.images.length,
              variants: product.variants.totalVariants,
              id: product.id,
              authenticVariants: product.variants.totalVariants,
              message: "Ürün başarıyla çekildi ve CSV koleksiyonuna eklendi"
            };
          }
        } catch (mobileError) {
          console.log(`❌ Mobile API failed: ${mobileError.message}`);
        }
      }
      
      throw new Error(`Trendyol erişimi engellendi (${response.status}). Lütfen farklı bir ürün URL'si deneyin.`);
    }

    const htmlContent = response.data;
    const $ = cheerio.load(htmlContent);
    
    // Extract product ID early for multi-variant detection
    const productIdMatch = url.match(/p-(\d+)/);
    const productId = productIdMatch ? parseInt(productIdMatch[1]) : Math.floor(Math.random() * 1000000);

    // Extract basic product info
    const title = $('h1').first().text().trim() || 
      $('h1.pr-new-br').text().trim() ||
      $('h1[data-testid="product-name"]').text().trim() ||
      $('h1.product-name').text().trim() ||
      'Ürün Başlığı Bulunamadı';

    // Extract price
    const priceElement = $('.prc-dsc').first().text().trim() ||
      $('.prc-org').first().text().trim() ||
      $('[data-testid="price"]').first().text().trim() ||
      $('span.price').first().text().trim();
      
    const priceMatch = priceElement.match(/[\d.,]+/);
    const price = priceMatch ? priceMatch[0].replace(',', '.') : '0';

    // Extract brand
    const brand = $('a[data-fragment-name="Breadcrumb"] span').last().text().trim() ||
      $('span.product-brand').text().trim() ||
      title.split(' ')[0] ||
      'Genel Markalar';

    console.log(`🔍 Ürün bilgileri: ${title} - ${brand} - ${price} TL`);
    
    // Use enhanced multi-variant extraction system
    console.log('🔍 Using enhanced multi-variant extraction system...');
    const { extractMultiVariants } = await import('./multi-variant-extractor');
    const multiVariantData = await extractMultiVariants(url);
    
    console.log(`🔍 Multi-variant results: ${multiVariantData.colors.length} colors, ${multiVariantData.sizes.length} sizes`);
    console.log(`🎨 Colors found: ${multiVariantData.colors.join(', ')}`);
    console.log(`📏 Sizes found: ${multiVariantData.sizes.join(', ')}`);
    console.log(`💰 Pricing data: ${Object.keys(multiVariantData.pricing).length} prices`);
    
    // Stock status reporting
    if (multiVariantData.outOfStockSizes && multiVariantData.outOfStockSizes.length > 0) {
      console.log(`⚠️ STOK UYARISI: ${multiVariantData.outOfStockSizes.join(', ')} bedenler stokta yok`);
    }
    if (multiVariantData.availableSizes && multiVariantData.availableSizes.length > 0) {
      console.log(`✅ Mevcut bedenler: ${multiVariantData.availableSizes.join(', ')}`);
    }
    
    // Extract ALL product images including color variants
    const allProductImages: string[] = [];
    
    // Method 1: Deep script data extraction
    const scriptMatches = [
      ...htmlContent.matchAll(/"images":\s*\[([^\]]*)\]/g),
      ...htmlContent.matchAll(/"allImages":\s*\[([^\]]*)\]/g),
      ...htmlContent.matchAll(/"gallery":\s*\[([^\]]*)\]/g),
      ...htmlContent.matchAll(/"variantImages":\s*\[([^\]]*)\]/g),
      ...htmlContent.matchAll(/"colorImages":\s*\{([^}]*)\}/g)
    ];
    
    scriptMatches.forEach(match => {
      try {
        let content = match[1];
        // Handle both array and object formats
        if (content.includes('"')) {
          const urls = content.match(/"[^"]*prod\/QC[^"]*"/g) || [];
          urls.forEach(url => {
            const cleanUrl = url.replace(/"/g, '');
            if (cleanUrl.includes('cdn.dsmcdn.com')) {
              const highRes = cleanUrl.replace(/\/\d+\/\d+\//, '/1200/1800/');
              if (!allProductImages.includes(highRes)) {
                allProductImages.push(highRes);
              }
            }
          });
        }
      } catch (e) {}
    });
    
    // Method 2: Product state comprehensive extraction
    const productDetailMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productDetailMatch) {
      try {
        const productState = JSON.parse(productDetailMatch[1]);
        
        // Extract from multiple image sources
        const imageSources = [
          productState.product?.images,
          productState.product?.allImages,
          productState.product?.gallery,
          productState.product?.variants?.map((v: any) => v.images).flat(),
          Object.values(productState.product?.colorImages || {}),
          Object.values(productState.product?.variantImages || {})
        ].flat().filter(Boolean);
        
        imageSources.forEach((img: any) => {
          if (typeof img === 'string' && img.includes('prod/QC')) {
            const highRes = img.replace(/\/\d+\/\d+\//, '/1200/1800/');
            if (!allProductImages.includes(highRes)) {
              allProductImages.push(highRes);
            }
          }
        });
      } catch (e) {}
    }
    
    // Method 3: Enhanced DOM extraction with all possible selectors
    const comprehensiveSelectors = [
      'img[src*="prod/QC"]',
      'img[data-src*="prod/QC"]',
      'img[data-original*="prod/QC"]',
      '.variant-image img',
      '.color-image img',
      '.product-gallery img',
      '.gallery img',
      '.image-gallery img',
      '.product-images img',
      '.slider img',
      '.carousel img',
      '[data-color] img',
      '[data-variant] img',
      '.thumb img',
      '.thumbnail img'
    ];
    
    comprehensiveSelectors.forEach(selector => {
      $(selector).each((i, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original') || $(img).attr('data-lazy');
        if (src && src.includes('prod/QC') && src.includes('cdn.dsmcdn.com')) {
          const variants = [
            src.replace(/\/\d+\/\d+\//, '/1200/1800/'),
            src.replace(/\/\d+\/\d+\//, '/800/1200/'),
            src.replace(/\/\d+\/\d+\//, '/600/900/'),
            src
          ];
          
          variants.forEach(variant => {
            if (!allProductImages.includes(variant)) {
              allProductImages.push(variant);
            }
          });
        }
      });
    });
    
    // Method 4: Extract images from JSON-LD and microdata
    const jsonLdMatches = htmlContent.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gs);
    if (jsonLdMatches) {
      jsonLdMatches.forEach(match => {
        try {
          const jsonData = JSON.parse(match.replace(/<script[^>]*>/, '').replace(/<\/script>/, ''));
          if (jsonData.image) {
            const images = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
            images.forEach((img: string) => {
              if (img && img.includes('prod/QC')) {
                const highRes = img.replace(/\/\d+\/\d+\//, '/1200/1800/');
                if (!allProductImages.includes(highRes)) {
                  allProductImages.push(highRes);
                }
              }
            });
          }
        } catch (e) {}
      });
    }
    
    // Method 5: Extract from all possible window state variables and data structures
    const windowStateMatches = [
      ...htmlContent.matchAll(/window\.__[^=]*=\s*({[^;]*prod\/QC[^;]*});/g),
      ...htmlContent.matchAll(/"imageUrls":\s*\[([^\]]*prod\/QC[^\]]*)\]/g),
      ...htmlContent.matchAll(/"galleryImages":\s*\[([^\]]*prod\/QC[^\]]*)\]/g),
      ...htmlContent.matchAll(/"allImages":\s*\[([^\]]*prod\/QC[^\]]*)\]/g),
      ...htmlContent.matchAll(/"variantImages":\s*{([^}]*prod\/QC[^}]*)}/g),
      ...htmlContent.matchAll(/"colorImages":\s*{([^}]*prod\/QC[^}]*)}/g)
    ];
    
    windowStateMatches.forEach(match => {
      try {
        const content = match[1] || match[0];
        const imageUrls = content.match(/"[^"]*prod\/QC[^"]*"/g) || [];
        imageUrls.forEach(url => {
          const cleanUrl = url.replace(/"/g, '');
          if (cleanUrl.includes('cdn.dsmcdn.com')) {
            // Create multiple resolution variants
            const resolutions = ['/1200/1800/', '/800/1200/', '/600/900/', '/400/600/'];
            resolutions.forEach(res => {
              const variant = cleanUrl.replace(/\/\d+\/\d+\//, res);
              if (!allProductImages.includes(variant)) {
                allProductImages.push(variant);
              }
            });
          }
        });
      } catch (e) {}
    });
    
    // Method 6: Extract color-specific images from merchant data
    const colorImageMatches = htmlContent.matchAll(/"otherMerchants":\s*\[([^\]]*)\]/g);
    for (const match of colorImageMatches) {
      try {
        const merchantData = match[1];
        const imageUrls = merchantData.match(/"[^"]*prod\/QC[^"]*"/g) || [];
        imageUrls.forEach(url => {
          const cleanUrl = url.replace(/"/g, '');
          if (cleanUrl.includes('cdn.dsmcdn.com')) {
            const highRes = cleanUrl.replace(/\/\d+\/\d+\//, '/1200/1800/');
            if (!allProductImages.includes(highRes)) {
              allProductImages.push(highRes);
            }
          }
        });
      } catch (e) {}
    }
    
    const cleanImages = Array.from(new Set(allProductImages));
    console.log(`🖼️ Comprehensive extraction: ${cleanImages.length} total images (all variants included)`);

    const variantData = {
      colors: multiVariantData.colors,
      sizes: multiVariantData.sizes,
      images: Array.from(new Set([
        ...Object.values(multiVariantData.images).flat(),
        ...cleanImages
      ])).slice(0, 25),
      pricing: multiVariantData.pricing
    };

    // Enhanced product feature extraction
    const productDescription = extractDetailedProductFeatures($, htmlContent);
    console.log(`📝 Açıklama uzunluğu: ${productDescription.length} karakter`);

    // Combine images from variants and original extraction
    const allImages = Array.from(new Set([
      ...Object.values(multiVariantData.images).flat(),
      ...cleanImages
    ])).filter(img => img.startsWith('http')).slice(0, 25);
    console.log(`🎯 ${allImages.length} görsel çıkarıldı`);
    
    const colorVariants = multiVariantData.colors;
    const sizeVariants = multiVariantData.sizes;
    const colorCount = colorVariants.length;
    const sizeCount = sizeVariants.length;
    const imageCount = allImages.length;
    
    console.log(`✅ Otantik çıkarım: ${colorCount} renk, ${sizeCount} beden, ${imageCount} görsel`);
    
    // Ürünü CSV koleksiyonuna ekle
    console.log('🔄 Ürün CSV koleksiyonuna ekleniyor...');
    console.log('📊 Gönderilen ürün verisi:', {
      title: title,
      description: productDescription,
      brand: brand,
      images: cleanImages.length
    });
    
    const productData = {
      title: title,
      price: price,
      basePrice: price,
      id: productId,
      description: productDescription,
      brand: brand,
      images: allImages,
      variants: {
        colors: colorVariants,
        sizes: sizeVariants,
        totalVariants: Math.max(colorVariants.length * sizeVariants.length, 1)
      },
      url: url
    };
    
    // Generate instant CSV and preview
    const { instantCSVGenerator } = await import('./instant-csv-generator-fixed');
    const csvResult = await instantCSVGenerator.generateInstantCSV(productData);
    
    // Generate CSV preview data for the interface
    const csvPreview = await generateCSVPreview(csvResult.csvPath);
    
    console.log(`✅ Ürün anlık olarak işlendi: ${productData.title}`);
    
    return {
      success: true,
      ...productData,
      csvGenerated: csvResult.success,
      csvPreview: csvPreview,
      instantMode: true,
      message: "Ürün verisi anlık olarak çekildi ve CSV oluşturuldu"
    };

  } catch (error) {
    console.log("❌ Enhanced Trendyol handler hatası:", error);
    throw error;
  }
}

// CSV preview generator function
async function generateCSVPreview(csvPath?: string) {
  if (!csvPath || !fs.existsSync(csvPath)) {
    return null;
  }
  
  try {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return null;
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const rows = lines.slice(1, 6).map(line => { // Show first 5 rows
      return line.split(',').map(cell => cell.replace(/"/g, '').trim());
    });
    
    return {
      headers: headers,
      rows: rows,
      totalRows: lines.length - 1, // Exclude header
      filename: 'shopify-urunler.csv',
      shopifyReady: true
    };
  } catch (error) {
    console.error('CSV preview generation error:', error);
    return null;
  }
}

function extractDetailedProductFeatures($: any, htmlContent: string): string {
  const features: string[] = [];
  
  // Comprehensive feature extraction with detailed patterns
  const featurePatterns = [
    // Material and fabric with percentages
    /(?:Malzeme|Material|Kumaş|Fabric|Composition|İçerik)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Pamuk|Cotton|Polyester|Elastan|Spandex|Viscose|Modal)\s*[%]\s*\d+/gi,
    
    // Care instructions
    /(?:Bakım|Care|Yıkama|Washing)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:\d+)°C'de\s*yıkanabilir/gi,
    
    // Product features and details
    /(?:Özellik|Feature|Detay|Detail)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Regular|Slim|Oversize|Comfort)\s*(?:Fit|Kesim)/gi,
    
    // Size and fit information
    /(?:Beden|Size|Ölçü|Measurement)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Model|Fit|Kalıp|Cut)[^:]*:\s*([^,\n\r]+)/gi,
    
    // Design and style details
    /(?:Desen|Pattern|Baskı|Print)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Yaka|Collar|Neck)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Kol|Sleeve|Arm)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Cep|Pocket)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Kapüşon|Hood)[^:]*:\s*([^,\n\r]+)/gi,
    
    // Brand and seller information
    /(?:Marka|Brand)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Satıcı|Seller|Üretici|Manufacturer)[^:]*:\s*([^,\n\r]+)/gi,
    
    // Season and usage
    /(?:Sezon|Season|Mevsim)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Kullanım|Usage|Stil|Style)[^:]*:\s*([^,\n\r]+)/gi,
    
    // Quality and certifications
    /(?:Kalite|Quality|Sertifika|Certificate)[^:]*:\s*([^,\n\r]+)/gi,
    /(?:Organik|Organic|Doğal|Natural|Sürdürülebilir|Sustainable)/gi
  ];

  // Extract features from HTML content
  featurePatterns.forEach(pattern => {
    const matches = htmlContent.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleanMatch = match.replace(/['"]/g, '').trim();
        if (cleanMatch.length > 5 && cleanMatch.length < 150 && !features.includes(cleanMatch)) {
          features.push(cleanMatch);
          console.log(`🧵 Ürün Özelliği: ${cleanMatch}`);
        }
      });
    }
  });

  // Extract from DOM elements with specific selectors
  const featureSelectors = [
    '.detail-desc-list li',
    '.product-detail-info li', 
    '.product-features li',
    '.specs-list li',
    '[data-feature]',
    '.attribute-list li',
    '.product-attributes li',
    '.feature-list li'
  ];

  featureSelectors.forEach(selector => {
    $(selector).each((i: number, element: any) => {
      const text = $(element).text().trim();
      if (text.length > 5 && text.length < 150 && !features.includes(text)) {
        features.push(text);
        console.log(`🧵 DOM Özelliği: ${text}`);
      }
    });
  });

  console.log(`✅ ${features.length} detaylı özellik toplandı`);
  
  const baseDescription = features.length > 0 ? features.join(', ') : 'Kaliteli ürün';
  const enhancedDescription = `Ürün Özellikleri: ${baseDescription}. Kaliteli malzeme ile üretilmiştir. Günlük kullanım için ideal. Rahat kesim ve şık tasarım. Uzun ömürlü kullanım için tasarlanmıştır`;
  
  return enhancedDescription;
}

function extractFeaturesFromJSON(htmlContent: string): string[] {
  const features: string[] = [];
  
  try {
    // Pattern 1: attributes array
    const attributePattern = /"attributes":\s*\[(.*?)\]/;
    const attributeMatch = htmlContent.match(attributePattern);
    
    if (attributeMatch) {
      const attributeText = attributeMatch[1];
      const jsonAttributes = attributeText.match(/"name":"([^"]+)","value":"([^"]+)"/g);
      
      if (jsonAttributes) {
        jsonAttributes.slice(0, 8).forEach(attr => {
          const nameMatch = attr.match(/"name":"([^"]+)"/);
          const valueMatch = attr.match(/"value":"([^"]+)"/);
          
          if (nameMatch && valueMatch) {
            const name = nameMatch[1];
            const value = valueMatch[1];
            if (name && value && name.length > 1 && value.length > 1) {
              features.push(`${name}: ${value}`);
              console.log(`🔗 JSON özellik: ${name}: ${value}`);
            }
          }
        });
      }
    }
  } catch (e) {
    console.log('⚠️ JSON özellik çıkarma hatası:', e);
  }
  
  return features;
}
  
  features.push(...qualityInfo);
  
  const result = features.join('. ').substring(0, 1000);
  console.log(`📋 Final açıklama: ${result.length} karakter`);
  
  return result;
}

function extractFeaturesFromJSON(htmlContent: string): string[] {
  const features: string[] = [];
  
  try {
    // Pattern 1: attributes array
    const attributePattern = /"attributes":\s*\[(.*?)\]/;
    const attributeMatch = htmlContent.match(attributePattern);
    
    if (attributeMatch) {
      const attributeText = attributeMatch[1];
      const jsonAttributes = attributeText.match(/"name":"([^"]+)","value":"([^"]+)"/g);
      
      if (jsonAttributes) {
        jsonAttributes.slice(0, 8).forEach(attr => {
          const nameMatch = attr.match(/"name":"([^"]+)"/);
          const valueMatch = attr.match(/"value":"([^"]+)"/);
          
          if (nameMatch && valueMatch) {
            const name = nameMatch[1];
            const value = valueMatch[1];
            if (name && value && name.length > 1 && value.length > 1) {
              features.push(`${name}: ${value}`);
              console.log(`🔗 JSON özellik: ${name}: ${value}`);
            }
          }
        });
      }
    }
    
    // Pattern 2: productDetail attributes
    const detailPattern = /"productDetail"[^}]*"attributes":\s*\[(.*?)\]/;
    const detailMatch = htmlContent.match(detailPattern);
    
    if (detailMatch && features.length < 10) {
      const detailText = detailMatch[1];
      const detailAttributes = detailText.match(/"name":"([^"]+)","value":"([^"]+)"/g);
      
      if (detailAttributes) {
        detailAttributes.slice(0, 6).forEach(attr => {
          const nameMatch = attr.match(/"name":"([^"]+)"/);
          const valueMatch = attr.match(/"value":"([^"]+)"/);
          
          if (nameMatch && valueMatch) {
            const name = nameMatch[1];
            const value = valueMatch[1];
            if (!features.some(f => f.includes(name))) {
              features.push(`${name}: ${value}`);
              console.log(`📊 Detail özellik: ${name}: ${value}`);
            }
          }
        });
      }
    }
  } catch (e) {
    console.log('JSON parsing error:', e);
  }
  
  return features;
}

function extractEnhancedVariants(htmlContent: string, productId: string): EnhancedVariantData {
  const $ = cheerio.load(htmlContent);
  
  const colors: string[] = [];
  const sizes: string[] = [];
  const images: string[] = [];
  const variantImages: Record<string, string[]> = {};
  const colorImageMap: Record<string, string[]> = {};
  const variantPricing: Record<string, number> = {};
  const variantSpecificPricing: Record<string, number> = {};
  const stockMap: Record<string, boolean> = {};

  console.log('🔍 Enhanced varyant çıkarma sistemi başlatılıyor...');

  // 1. Enhanced image extraction
  extractImages(htmlContent, images);
  
  // 2. Script-based variant extraction
  extractFromScripts(htmlContent, colors, sizes, variantImages, colorImageMap, variantPricing, variantSpecificPricing);
  
  // 3. HTML element extraction
  extractFromHTML($, colors, sizes);
  
  // 4. Stock information extraction
  extractStock(htmlContent, stockMap, colors, sizes);
  
  // 5. Apply authentic variant detection
  const extractedVariants = getExtractedVariants(htmlContent);
  
  // Only use authentic colors if we detect real color variants
  const authenticColorsSet = new Set();
  const authenticSizesSet = new Set();
  
  if (extractedVariants.length > 0) {
    extractedVariants.filter(v => v.color).forEach(v => authenticColorsSet.add(v.color));
    extractedVariants.filter(v => v.size).forEach(v => authenticSizesSet.add(v.size));
  }
  
  const authenticColors = Array.from(authenticColorsSet);
  const authenticSizes = authenticSizesSet.size > 0 ? Array.from(authenticSizesSet) : sizes;
    
  // Use authentic colors if found, otherwise default to single color
  const finalColors = authenticColors.length > 1 ? authenticColors : ['tek renk'];
  const finalSizes = authenticSizes.length > 0 ? authenticSizes : sizes;
  
  // Override with authentic detection
  const finalResult = validateAndClean(
    finalColors as string[], 
    finalSizes as string[], 
    images, 
    variantImages, 
    colorImageMap, 
    variantPricing, 
    variantSpecificPricing, 
    stockMap
  );
  
  console.log(`✅ Otantik çıkarım: ${finalResult.colors.length} renk, ${finalResult.sizes.length} beden, ${finalResult.images.length} görsel`);
  
  return finalResult;
}

function extractImages(htmlContent: string, images: string[]): void {
  try {
    // Pattern 1: JSON arrays with image data
    const jsonImagePattern = /\[((?:[^[\]]*\[[^[\]]*\][^[\]]*)*[^[\]]*)\]/g;
    let match;

    while ((match = jsonImagePattern.exec(htmlContent)) !== null) {
      if (match[1].includes('.jpg') || match[1].includes('.jpeg') || match[1].includes('.png') || match[1].includes('.webp')) {
        const fullUrlMatches = match[1].match(/https:\/\/cdn\.dsmcdn\.com\/[^"',\s}]+\.(jpg|jpeg|png|webp)/gi) || [];
        const relativePathMatches = match[1].match(/"([^"]*\/(?:QC|PIM)\/[^"]*\.(jpg|jpeg|png|webp))"/gi) || [];
        
        fullUrlMatches.forEach(url => {
          const optimizedUrl = optimizeImageUrl(url);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        });
        
        relativePathMatches.forEach(matchItem => {
          const relativePath = matchItem.replace(/"/g, '');
          if (relativePath.startsWith('/')) {
            const fullUrl = `https://cdn.dsmcdn.com${relativePath}`;
            const optimizedUrl = optimizeImageUrl(fullUrl);
            if (optimizedUrl && !images.includes(optimizedUrl)) {
              images.push(optimizedUrl);
            }
          }
        });
      }
    }
    
    // Pattern 2: Direct URL matches
    const directUrlPattern = /https:\/\/cdn\.dsmcdn\.com\/[^"'\s,}]+\/prod\/(?:QC|PIM)\/[^"'\s,}]+\.(jpg|jpeg|png|webp)/gi;
    const directMatches = htmlContent.match(directUrlPattern) || [];
    directMatches.forEach(url => {
      const optimizedUrl = optimizeImageUrl(url);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    });
    
    // Pattern 3: Enhanced relative path detection
    const relativeImagePattern = /['"]\/(ty\d+\/[^'"]*\/(?:QC|PIM)\/[^'"]*\.(jpg|jpeg|png|webp))['"]/gi;
    let relativeMatch;
    while ((relativeMatch = relativeImagePattern.exec(htmlContent)) !== null) {
      const fullUrl = `https://cdn.dsmcdn.com/${relativeMatch[1]}`;
      const optimizedUrl = optimizeImageUrl(fullUrl);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    }
    
    // Pattern 4: HAKKE-style products
    const aggressiveImagePattern = /\/ty\d+\/[^"'\s,}]*\/(?:QC|PIM)\/[^"'\s,}]*\.(jpg|jpeg|png|webp)/gi;
    const aggressiveMatches = htmlContent.match(aggressiveImagePattern) || [];
    aggressiveMatches.forEach(imagePath => {
      const fullUrl = imagePath.startsWith('/') 
        ? `https://cdn.dsmcdn.com${imagePath}`
        : `https://cdn.dsmcdn.com/${imagePath}`;
      const optimizedUrl = optimizeImageUrl(fullUrl);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    });
    
  } catch (error) {
    console.log("Görsel çıkarma hatası:", error);
  }
}

function extractFromScripts(
  htmlContent: string,
  colors: string[],
  sizes: string[],
  variantImages: Record<string, string[]>,
  colorImageMap: Record<string, string[]>,
  variantPricing: Record<string, number>,
  variantSpecificPricing: Record<string, number>
): void {
  try {
    // Extract from window.__PRODUCT_DETAIL_APP_INITIAL_STATE__
    const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s;
    const initialStateMatch = htmlContent.match(initialStatePattern);

    if (initialStateMatch) {
      try {
        const initialState = JSON.parse(initialStateMatch[1]);
        console.log("🔍 Initial state bulundu, varyantlar çıkarılıyor...");
        
        // Extract colors and sizes from attributes
        if (initialState.product?.attributes?.length) {
          initialState.product.attributes.forEach((attr: any) => {
            if (attr.key?.name === 'Renk' && attr.value?.name) {
              const colorName = attr.value.name.toLowerCase();
              if (!colors.includes(colorName)) {
                colors.push(colorName);
                console.log(`🎨 Renk tespit edildi: ${colorName}`);
              }
            }
            if (attr.key?.name === 'Beden' && attr.value?.name) {
              const sizeName = attr.value.name;
              if (!sizes.includes(sizeName)) {
                sizes.push(sizeName);
                console.log(`📏 Beden tespit edildi: ${sizeName}`);
              }
            }
          });
        }

        // Extract from variants array
        if (initialState.product?.variants?.length) {
          initialState.product.variants.forEach((variant: any) => {
            if (variant.attributeType === 1 && variant.name) { // Color variants
              const colorName = variant.name.toLowerCase();
              if (!colors.includes(colorName)) {
                colors.push(colorName);
                console.log(`🎨 Varyant rengi: ${colorName}`);
              }
              
              // Extract variant images
              if (variant.images?.length) {
                colorImageMap[colorName] = variant.images.map((img: any) => 
                  optimizeImageUrl(img.url)).filter(Boolean);
              }
              
              // Extract variant pricing
              if (variant.price?.originalPrice) {
                variantSpecificPricing[colorName] = variant.price.originalPrice.value;
              }
            }
            
            if (variant.attributeType === 2 && variant.name) { // Size variants
              const sizeName = variant.name;
              if (!sizes.includes(sizeName)) {
                sizes.push(sizeName);
                console.log(`📏 Varyant bedeni: ${sizeName}`);
              }
            }
          });
        }

        // Extract from allVariants for detailed info
        if (initialState.product?.allVariants?.length) {
          console.log(`📊 ${initialState.product.allVariants.length} adet allVariant bulundu`);
          
          // Debug: Log the structure of the first variant
          console.log("🔍 İlk variant yapısı:", JSON.stringify(initialState.product.allVariants[0], null, 2));
          
          initialState.product.allVariants.forEach((variant: any, index: number) => {
            // Extract from direct properties
            if (variant.attributeName1) {
              const colorName = variant.attributeName1.toLowerCase();
              if (isValidColor(colorName) && !colors.includes(colorName)) {
                colors.push(colorName);
                console.log(`🎨 AllVariant attributeName1: ${colorName}`);
              }
            }
            
            if (variant.attributeName2) {
              const sizeName = variant.attributeName2;
              if (isValidSize(sizeName) && !sizes.includes(sizeName)) {
                sizes.push(sizeName);
                console.log(`📏 AllVariant attributeName2: ${sizeName}`);
              }
            }
            
            // Extract from attributes array
            if (variant.attributes?.length) {
              variant.attributes.forEach((attr: any) => {
                if (attr.key?.name === 'Renk' && attr.value?.name) {
                  const colorName = attr.value.name.toLowerCase();
                  if (!colors.includes(colorName)) {
                    colors.push(colorName);
                    console.log(`🎨 AllVariant rengi: ${colorName}`);
                  }
                }
                if (attr.key?.name === 'Beden' && attr.value?.name) {
                  const sizeName = attr.value.name;
                  if (!sizes.includes(sizeName)) {
                    sizes.push(sizeName);
                    console.log(`📏 AllVariant bedeni: ${sizeName}`);
                  }
                }
              });
            }
            
            // Look for any size-like properties
            Object.keys(variant).forEach(key => {
              if (key.toLowerCase().includes('size') || key.toLowerCase().includes('beden')) {
                const value = variant[key];
                if (typeof value === 'string' && isValidSize(value) && !sizes.includes(value)) {
                  sizes.push(value);
                  console.log(`📏 AllVariant ${key}: ${value}`);
                }
              }
            });
          });
        }
      } catch (parseError) {
        console.log("Initial state parsing error:", parseError);
      }
    }

    // Enhanced pattern matching for variants
    const variantPatterns = [
      /"attributeType":1[^}]*"name":"([^"]+)"/g,  // Color patterns
      /"attributeType":2[^}]*"name":"([^"]+)"/g,  // Size patterns
      /"Renk"[^}]*"name":"([^"]+)"/g,             // Turkish color
      /"Beden"[^}]*"name":"([^"]+)"/g,            // Turkish size
      /"Color"[^}]*"name":"([^"]+)"/g,            // English color
      /"Size"[^}]*"name":"([^"]+)"/g,             // English size
      /"size":"([^"]+)"/g,                        // Simple size
      /"color":"([^"]+)"/g,                       // Simple color
      /"attributeName2":"([^"]+)"/g,              // Attribute name 2 (usually size)
      /"attributeName1":"([^"]+)"/g               // Attribute name 1 (usually color)
    ];

    variantPatterns.forEach((pattern, index) => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const value = match[1];
        if (index < 5 || index === 7 || index === 9) { // Color patterns
          if (isValidColor(value) && !colors.includes(value.toLowerCase())) {
            colors.push(value.toLowerCase());
            console.log(`🎨 Pattern renk: ${value}`);
          }
        } else { // Size patterns
          if (isValidSize(value) && !sizes.includes(value)) {
            sizes.push(value);
            console.log(`📏 Pattern beden: ${value}`);
          }
        }
      }
    });

    // Additional fallback patterns for sizes
    const sizePatterns = [
      /['"](XS|S|M|L|XL|XXL|XXXL)['"]/g,
      /['"](36|38|40|42|44|46|48|50|52)['"]/g,
      /['"](TEK|STANDART|UNIVERSAL)['"]/g,
      /"value":"([SMLX]{1,4})"/g,
      /"text":"([SMLX]{1,4})"/g
    ];

    sizePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const value = match[1];
        if (isValidSize(value) && !sizes.includes(value)) {
          sizes.push(value);
          console.log(`📏 Fallback pattern beden: ${value}`);
        }
      }
    });

    // Additional script extraction patterns
    const scriptTags = htmlContent.match(/<script[^>]*>(.*?)<\/script>/gis) || [];
    scriptTags.forEach(scriptContent => {
      extractJSONObjects(scriptContent).forEach(obj => {
        // Extract colors
        if (obj.attributes || obj.variants) {
          const attrs = obj.attributes || obj.variants;
          if (Array.isArray(attrs)) {
            attrs.forEach((attr: any) => {
              if (attr.attributeType === 1 && attr.name) {
                const colorName = attr.name.toLowerCase();
                if (!colors.includes(colorName)) {
                  colors.push(colorName);
                }
              }
              if (attr.attributeType === 2 && attr.name) {
                const sizeName = attr.name;
                if (!sizes.includes(sizeName)) {
                  sizes.push(sizeName);
                }
              }
            });
          }
        }
        
        // Extract pricing
        if (obj.price?.originalPrice?.value) {
          const price = obj.price.originalPrice.value;
          if (obj.name) {
            variantPricing[obj.name.toLowerCase()] = price;
          }
        }
      });
    });

  } catch (error) {
    console.log("Script extraction error:", error);
  }
}

function extractFromHTML($: cheerio.CheerioAPI, colors: string[], sizes: string[]): void {
  console.log("🔍 HTML elementlerinden varyant çıkarma...");
  
  // Extract colors from color selectors
  $('.color-variants .color-variant').each((_, elem) => {
    const colorName = $(elem).attr('title') || $(elem).attr('data-color') || '';
    if (colorName && !colors.includes(colorName.toLowerCase())) {
      colors.push(colorName.toLowerCase());
      console.log(`🎨 HTML renk: ${colorName}`);
    }
  });

  // Extract sizes from size selectors
  $('.size-variants .size-variant').each((_, elem) => {
    const sizeName = $(elem).text().trim();
    if (sizeName && !sizes.includes(sizeName)) {
      sizes.push(sizeName);
      console.log(`📏 HTML beden: ${sizeName}`);
    }
  });

  // Enhanced size selectors for HAKKE-style products
  const sizeSelectors = [
    '.size-variants button',
    '[data-testid="size-variant"]',
    '.size-selector button',
    '.product-size-options button',
    '.size-list button',
    '.size-option',
    '[class*="size"] button',
    '[class*="Size"] button',
    '.variant-size',
    '.product-variant-size'
  ];

  sizeSelectors.forEach(selector => {
    $(selector).each((_, elem) => {
      const sizeName = $(elem).text().trim();
      if (sizeName && isValidSize(sizeName) && !sizes.includes(sizeName)) {
        sizes.push(sizeName);
        console.log(`📏 HTML beden (${selector}): ${sizeName}`);
      }
    });
  });

  // Enhanced color selectors
  const colorSelectors = [
    '[data-testid="color-variant"]',
    '.color-option',
    '.product-color-options button',
    '[class*="color"] button',
    '[class*="Color"] button',
    '.variant-color'
  ];

  colorSelectors.forEach(selector => {
    $(selector).each((_, elem) => {
      const colorName = $(elem).attr('title') || $(elem).attr('data-color') || $(elem).text().trim();
      if (colorName && isValidColor(colorName) && !colors.includes(colorName.toLowerCase())) {
        colors.push(colorName.toLowerCase());
        console.log(`🎨 HTML renk (${selector}): ${colorName}`);
      }
    });
  });

  // Look for any button or span that might contain size info
  $('button, span, div').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length <= 10 && isValidSize(text) && !sizes.includes(text)) {
      // Check if this element seems to be in a size context
      const classes = $(elem).attr('class') || '';
      const parent = $(elem).parent();
      const parentClasses = parent.attr('class') || '';
      
      if (classes.toLowerCase().includes('size') || 
          classes.toLowerCase().includes('beden') ||
          parentClasses.toLowerCase().includes('size') ||
          parentClasses.toLowerCase().includes('beden')) {
        sizes.push(text);
        console.log(`📏 HTML context beden: ${text}`);
      }
    }
  });
}

function extractStock(htmlContent: string, stockMap: Record<string, boolean>, colors: string[], sizes: string[]): void {
  try {
    console.log("📦 Stok bilgisi çıkarılıyor...");
    
    // Extract from window.__PRODUCT_DETAIL_APP_INITIAL_STATE__
    const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s;
    const initialStateMatch = htmlContent.match(initialStatePattern);

    if (initialStateMatch) {
      try {
        const initialState = JSON.parse(initialStateMatch[1]);
        
        if (initialState.product?.allVariants?.length) {
          console.log(`📊 ${initialState.product.allVariants.length} varyant stok bilgisi kontrol ediliyor`);
          
          initialState.product.allVariants.forEach((variant: any) => {
            let colorName = '';
            let sizeName = '';
            
            // Extract color and size from attributes
            if (variant.attributes?.length) {
              variant.attributes.forEach((attr: any) => {
                if (attr.key?.name === 'Renk' && attr.value?.name) {
                  colorName = attr.value.name.toLowerCase();
                }
                if (attr.key?.name === 'Beden' && attr.value?.name) {
                  sizeName = attr.value.name;
                }
              });
            }
            
            // Fallback to attributeName1/attributeName2
            if (!colorName && variant.attributeName1) {
              colorName = variant.attributeName1.toLowerCase();
            }
            if (!sizeName && variant.attributeName2) {
              sizeName = variant.attributeName2;
            }
            
            if (colorName && sizeName) {
              const key = `${colorName}-${sizeName}`;
              const inStock = variant.inStock === true || variant.hasStock === true;
              stockMap[key] = inStock;
              
              console.log(`📦 ${key}: ${inStock ? 'Stokta' : 'Stokta yok'}`);
            }
          });
        }
      } catch (parseError) {
        console.log("Stock parsing error:", parseError);
      }
    }

    // Extract stock information from JSON patterns
    const stockPatterns = [
      /"allVariants":\s*\[(.*?)\]/s,
      /"variants":\s*\[(.*?)\]/s,
      /"productVariants":\s*\[(.*?)\]/s
    ];

    stockPatterns.forEach(pattern => {
      const match = htmlContent.match(pattern);
      if (match) {
        try {
          const variantsStr = `[${match[1]}]`;
          const variants = JSON.parse(variantsStr);

          variants.forEach((variant: any) => {
            if (variant.attributeName1 && variant.attributeName2) {
              const color = variant.attributeName1.toLowerCase();
              const size = variant.attributeName2;
              const key = `${color}-${size}`;
              
              // Set stock status
              const inStock = variant.inStock === true || variant.hasStock === true;
              stockMap[key] = inStock;
            }
          });
        } catch (parseError) {
          // Skip invalid JSON
        }
      }
    });

    // Clean up invalid sizes
    const cleanedSizes = sizes.filter(size => {
      const cleaned = size.replace(/^Beden:?/, '').trim();
      return cleaned.length > 0 && cleaned !== 'SML' && isValidSize(cleaned);
    });
    
    // If no valid sizes found, add defaults for clothing
    if (cleanedSizes.length === 0 && colors.length > 0) {
      cleanedSizes.push(...['S', 'M', 'L', 'XL']);
    }
    
    sizes.length = 0;
    sizes.push(...cleanedSizes);

    // Fallback: assume all combinations are in stock if no data found
    if (Object.keys(stockMap).length === 0 && colors.length > 0 && sizes.length > 0) {
      console.log("⚠️ Stok bilgisi bulunamadı, tüm varyantlar stokta varsayılıyor");
      colors.forEach(color => {
        sizes.forEach(size => {
          const key = `${color}-${size}`;
          stockMap[key] = true;
        });
      });
    }

    console.log(`📦 Toplam ${Object.keys(stockMap).length} varyant stok bilgisi çıkarıldı`);

  } catch (error) {
    console.log("Stock extraction error:", error);
  }
}

function validateAndClean(
  colors: string[],
  sizes: string[],
  images: string[],
  variantImages: Record<string, string[]>,
  colorImageMap: Record<string, string[]>,
  variantPricing: Record<string, number>,
  variantSpecificPricing: Record<string, number>,
  stockMap: Record<string, boolean>
): EnhancedVariantData {
  // Clean and validate colors
  const cleanColors = colors
    .filter(color => isValidColor(color))
    .map(color => color.toLowerCase().trim())
    .filter((color, index, arr) => arr.indexOf(color) === index);

  // Clean and validate sizes
  const cleanSizes = sizes
    .filter(size => isValidSize(size))
    .map(size => size.trim())
    .filter((size, index, arr) => arr.indexOf(size) === index);

  // Track out of stock variants
  const outOfStockVariants: string[] = [];
  Object.keys(stockMap).forEach(variantKey => {
    if (!stockMap[variantKey]) {
      outOfStockVariants.push(variantKey);
    }
  });

  // Remove duplicate images
  const cleanImages = images.filter((img, index, arr) => arr.indexOf(img) === index);

  return {
    colors: cleanColors,
    sizes: cleanSizes,
    images: cleanImages,
    variantImages,
    colorImageMap,
    variantPricing,
    variantSpecificPricing,
    stockMap,
    outOfStockVariants,
    totalVariants: cleanColors.length * cleanSizes.length
  };
}

function isValidColor(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.toLowerCase().trim();
  
  // Turkish color names and common patterns
  const validColors = [
    'siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'mor', 'pembe',
    'lacivert', 'gri', 'kahverengi', 'turuncu', 'bordo', 'bej', 'krem',
    'ekru', 'haki', 'koyu', 'açık', 'petrol', 'mint', 'fuşya', 'lila',
    'somon', 'çok-renkli', 'desenli', 'karışık'
  ];
  
  // Check for valid color patterns
  if (validColors.some(color => cleaned.includes(color))) return true;
  if (cleaned.match(/^#[0-9a-f]{6}$/i)) return true; // Hex colors
  if (cleaned.length >= 3 && cleaned.length <= 20) return true; // Reasonable length
  
  return false;
}

function getExtractedVariants(htmlContent: string): any[] {
  try {
    const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s;
    const initialStateMatch = htmlContent.match(initialStatePattern);
    
    if (initialStateMatch) {
      const initialState = JSON.parse(initialStateMatch[1]);
      const allVariants = initialState.product?.allVariants || [];
      
      // Check if product actually has color variants by examining variant structure
      const hasColorVariants = allVariants.some((v: any) => 
        v.attributeName1 && v.attributeName1.toLowerCase().includes('renk')
      );
      
      return allVariants.map((variant: any) => ({
        color: hasColorVariants ? (variant.attributeName1 || null) : null,
        size: variant.value || variant.attributeName2 || '',
        value: variant.value || '',
        inStock: variant.inStock !== false
      }));
    }
  } catch (error) {
    console.log('Variant extraction error:', error);
  }
  
  return [];
}

function isValidSize(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim();
  
  // Size patterns - more comprehensive
  const sizePatterns = [
    /^(XS|S|M|L|XL|XXL|XXXL)$/i,
    /^\d{1,3}$/,
    /^\d{1,3}-\d{1,3}$/,
    /^[0-9]+[.,]?[0-9]*$/,
    /^(TEK|STANDART|UNIVERSAL|ONE SIZE|FREE SIZE)$/i,
    /^(34|36|38|40|42|44|46|48|50|52|54|56)$/,
    /^[0-9]{1,2}[A-Z]*$/,
    /^[A-Z]{1,4}$/
  ];
  
  // Also accept single letters/numbers that could be sizes
  if (cleaned.length === 1 && /[SMLX0-9]/.test(cleaned)) return true;
  
  return sizePatterns.some(pattern => pattern.test(cleaned)) || 
         (cleaned.length >= 1 && cleaned.length <= 15);
}

function extractJSONObjects(jsonString: string): any[] {
  const objects: any[] = [];
  
  try {
    // Find JSON-like patterns
    const jsonPattern = /{[^{}]*}/g;
    let match;
    
    while ((match = jsonPattern.exec(jsonString)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        objects.push(obj);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  } catch (error) {
    // Skip parsing errors
  }
  
  return objects;
}

function optimizeImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Clean URL and ensure CDN domain
  let finalUrl = url.trim();
  if (finalUrl.startsWith('//')) {
    finalUrl = 'https:' + finalUrl;
  }
  if (finalUrl.startsWith('/') && !finalUrl.startsWith('//')) {
    finalUrl = 'https://cdn.dsmcdn.com' + finalUrl;
  }
  
  // Only Trendyol CDN
  if (!finalUrl.includes('cdn.dsmcdn.com')) return null;
  
  // Only product images
  if (!(finalUrl.includes('/QC/') || finalUrl.includes('/PIM/') || finalUrl.includes('/prod/'))) return null;
  
  // Clean URL
  finalUrl = finalUrl.replace(/[{}]/g, '');
  
  // High quality
  if (!finalUrl.includes('_org_zoom.jpg')) {
    finalUrl = finalUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '_org_zoom.jpg');
  }
  
  // HTTPS
  if (!finalUrl.startsWith('https:')) {
    finalUrl = finalUrl.startsWith('//') ? 'https:' + finalUrl : 'https://' + finalUrl;
  }
  
  // Fix org_zoom to full resolution
  finalUrl = finalUrl.replace('org_zoom', 'org');
  
  return finalUrl;
}