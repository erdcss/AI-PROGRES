import * as cheerio from 'cheerio';
// Import fetchWithRetry from a working source
async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Fetch failed after retries');
}
// ✅ TEK RENK TESPIT FONKSİYONU: Her URL sadece kendi rengini tespit eder
function detectColorFromUrl(url: string, htmlContent: string, $: any): string {
  console.log(`🔍 TEK RENK tespiti başlatılıyor URL: ${url}`);
  
  // URL'den SADECE bu URL'ye ait renk tespiti
  const urlColorPatterns = [
    // L'Oreal pattern: "901-fair-glow", "902-light-glow" (sadece bu URL'nin rengi)
    /-(\d{3})-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)-glow/g,
    /-(\d{3})-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)/g,
    // Maybelline pattern: "taupe", "koyu-kahverengi" (sadece bu URL'nin rengi)
    /-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)-p-\d+/g,
    /\/([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)-p-/g,
    // Bu URL'ye özel renk pattern'leri
    /renk-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)/gi,
    /color-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)/gi
  ];

  // URL'den renk çıkarmayı dene
  for (const pattern of urlColorPatterns) {
    pattern.lastIndex = 0; // Reset regex state
    const match = pattern.exec(url);
    if (match) {
      let colorName = '';
      
      // L'Oreal sayı + isim formatı (901-fair-glow)
      if (match[1] && match[2] && /^\d{3}$/.test(match[1])) {
        const number = match[1];
        const name = match[2];
        colorName = `${number} ${name.split('-').map(part => {
          if (part === 'fair') return 'Fair';
          if (part === 'light') return 'Light';
          if (part === 'medium') return 'Medium';
          if (part === 'glow') return 'Glow';
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }).join(' ')}`;
      }
      // Tek kelime (taupe, koyu-kahverengi)
      else if (match[1]) {
        colorName = match[1];
        
        // Özel renk isimlerini temizle
        if (colorName.includes('-')) {
          colorName = colorName.split('-').map(part => {
            // Türkçe karakterler ve renk adları için özel işlem
            if (part === 'koyu') return 'Koyu';
            if (part === 'kahverengi') return 'Kahverengi';
            if (part === 'taupe') return 'Taupe';
            if (part === 'fair') return 'Fair';
            if (part === 'light') return 'Light';
            if (part === 'medium') return 'Medium';
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
          }).join(' ');
        } else {
          colorName = colorName.charAt(0).toUpperCase() + colorName.slice(1).toLowerCase();
        }
      }
      
      if (colorName && colorName.length > 1) {
        console.log(`✅ URL'den renk tespit edildi: ${colorName}`);
        return colorName;
      }
    }
  }

  // HTML içeriğinden renk tespiti
  const htmlColorPatterns = [
    /"selectedVariantName"\s*:\s*"([^"]+)"/g,
    /"variantName"\s*:\s*"([^"]+)"/g,
    /"colorName"\s*:\s*"([^"]+)"/g,
    /data-variant-name="([^"]+)"/g,
    /"allVariants".*?"colorName":\s*"([^"]+)"/g
  ];

  for (const pattern of htmlColorPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(htmlContent);
    if (match && match[1] && match[1].length < 50) {
      console.log(`✅ HTML'den renk tespit edildi: ${match[1].trim()}`);
      return match[1].trim();
    }
  }

  // Title'dan renk çıkarma
  const titleElement = $('h1.pr-new-br, h1[data-testid="pdp-product-name"], h1.product-name');
  if (titleElement.length > 0) {
    const title = titleElement.text().trim();
    console.log(`🔍 Title: ${title}`);
    
    // Title'dan renk pattern'leri
    const titleColorPatterns = [
      /\b(Taupe|Fair|Koyu Kahverengi|Kahverengi|Siyah|Kırmızı|Mavi|Yeşil|Pembe|Mor|Turuncu|Sarı|Beyaz|Gri)\b/gi,
      /-\s*([A-ZĞÜŞİÖÇ][a-zğüşıöç\s]+)\s*$/g,
      /\s([0-9]{2,3}\s[A-Za-zğüşıöçĞÜŞİÖÇ]+)\s/g
    ];
    
    for (const pattern of titleColorPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(title);
      if (match && match[1]) {
        console.log(`✅ Title'dan renk tespit edildi: ${match[1].trim()}`);
        return match[1].trim();
      }
    }
  }

  // Fallback: URL'den son kelimeyi al
  const urlParts = url.split('/').pop()?.split('-') || [];
  for (let i = urlParts.length - 1; i >= 0; i--) {
    const part = urlParts[i];
    if (part && part !== 'p' && !/^\d+$/.test(part) && part.length > 2 && part.length < 20) {
      const colorName = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      console.log(`⚡ Fallback'den renk tespit edildi: ${colorName}`);
      return colorName;
    }
  }

  // En son fallback: rastgele renk ID
  const randomColor = `Color-${Date.now().toString().slice(-4)}`;
  console.log(`🎲 Rastgele renk oluşturuldu: ${randomColor}`);
  return randomColor;
}

// Helper functions for extracting product data
function extractSizesFromContent($: any, htmlContent: string): string[] {
  const sizes = new Set<string>();
  
  // Extract from size selectors
  $('.sp-itm, .size-variant-item, [data-size]').each((_: any, elem: any) => {
    const sizeText = $(elem).text().trim();
    if (sizeText && sizeText.length > 0 && sizeText.length < 10) {
      sizes.add(sizeText);
    }
  });
  
  // Extract from JavaScript
  const sizePatterns = [
    /size["\']?\s*:\s*["\']([^"']+)["\']/gi,
    /beden["\']?\s*:\s*["\']([^"']+)["\']/gi,
    /"slicingAttributeName":"Beden".*?"slicingAttributeValues":\["([^"]+)"\]/gi
  ];
  
  sizePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const size = match[1].trim();
      if (size && size.length > 0 && size.length < 10) {
        sizes.add(size);
      }
    }
  });
  
  return Array.from(sizes);
}

function extractFeaturesFromContent($: any, htmlContent: string): Array<{ key: string; value: string }> {
  const features: Array<{ key: string; value: string }> = [];
  
  // Extract from product details section
  $('.product-detail-feature li, .detail-feature-item').each((_: any, elem: any) => {
    const text = $(elem).text().trim();
    if (text.includes(':')) {
      const [key, value] = text.split(':', 2);
      features.push({
        key: key.trim(),
        value: value.trim()
      });
    }
  });
  
  return features;
}

function generateTags(title: string, description: string, colors: string[]): string[] {
  const tags = new Set<string>();
  
  // Add color-based tags
  colors.forEach(color => {
    tags.add(color);
  });
  
  // Add common cosmetic tags
  if (title.toLowerCase().includes('ruj') || title.toLowerCase().includes('lipstick')) {
    tags.add('ruj');
    tags.add('dudak');
  }
  
  if (title.toLowerCase().includes('fondöten') || title.toLowerCase().includes('foundation')) {
    tags.add('fondöten');
    tags.add('makyaj');
  }
  
  return Array.from(tags);
}

function extractBrandFromUrl(url: string): string {
  const urlMatch = url.match(/trendyol\.com\/([^\/]+)\//);
  if (urlMatch) {
    const brand = urlMatch[1]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('-');
    return brand;
  }
  return 'Brand';
}

function extractCategoryFromTitle(title: string): string {
  if (!title) return 'Genel';
  
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('gömlek') || lowerTitle.includes('shirt')) return 'Gömlek';
  if (lowerTitle.includes('elbise') || lowerTitle.includes('dress')) return 'Elbise';
  if (lowerTitle.includes('pantolon') || lowerTitle.includes('pants')) return 'Pantolon';
  if (lowerTitle.includes('ceket') || lowerTitle.includes('jacket')) return 'Ceket';
  if (lowerTitle.includes('ayakkabı') || lowerTitle.includes('shoe')) return 'Ayakkabı';
  if (lowerTitle.includes('çanta') || lowerTitle.includes('bag')) return 'Çanta';
  if (lowerTitle.includes('kozmetik') || lowerTitle.includes('makeup')) return 'Kozmetik';
  if (lowerTitle.includes('telefon') || lowerTitle.includes('phone')) return 'Elektronik';
  if (lowerTitle.includes('ev') || lowerTitle.includes('home')) return 'Ev & Yaşam';
  
  return 'Giyim';
}

function generateProductDescription(title: string, brand: string, features: Array<{key: string, value: string}>): string {
  let description = `<h2>${title}</h2>`;
  
  if (brand) {
    description += `<p><strong>Marka:</strong> ${brand}</p>`;
  }
  
  if (features && features.length > 0) {
    description += '<h3>Ürün Özellikleri</h3><ul>';
    features.forEach(feature => {
      description += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    description += '</ul>';
  }
  
  return description;
}

interface MultiUrlScrapeRequest {
  urls: Array<{
    url: string;
  }>;
  mode: 'multi-url';
}

interface CombinedProduct {
  id: string;
  title: string;
  brand: string;
  price: any;
  description: string;
  category: string;
  images: Array<{ url: string; alt?: string; colorName?: string }>;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features: Array<{ key: string; value: string }>;
  tags: string[];
}

export async function scrapeMultipleUrls(request: MultiUrlScrapeRequest): Promise<CombinedProduct> {
  console.log(`🎨 Multi-URL scraping started for ${request.urls.length} color variants`);
  
  const results = [];
  const combinedImages: Array<{ url: string; alt?: string; colorName?: string }> = [];
  const allSizes = new Set<string>(); // Tüm URL'lerden gelen bedenler birleştirilecek
  const combinedColors = new Set<string>();
  const allVariants: Array<{
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
  }> = [];
  
  let mainProduct: any = null; // İlk URL'den alınacak ortak bilgiler
  let allFeatures: Array<{ key: string; value: string }> = []; // Ürün özellikleri
  let firstUrlTitle: string = ''; // SADECE ilk URL'den title alınacak ve korunacak
  
  for (const { url } of request.urls) {
    try {
      console.log(`🎯 Scraping color variant from ${url}`);
      
      const response = await fetchWithRetry(url);
      const $ = cheerio.load(response);
      const htmlContent = response;
      
      // ✅ TEK RENK POLİTİKASI: Her URL sadece kendi rengini taşıyacak
      const detectedColor = detectColorFromUrl(url, htmlContent, $);
      console.log(`🎯 URL'e özel tek renk tespiti: ${detectedColor}`);
      
      // Bu URL'nin TEK rengini belirle - diğer renk seçeneklerini görmezden gel
      let finalColor = 'unknown-color';
      if (detectedColor && detectedColor.trim() !== '' && detectedColor !== 'Renk Tespit Edilmedi') {
        finalColor = detectedColor;
        console.log(`✅ URL'nin tek rengi belirlendi: ${finalColor}`);
      } else {
        // URL'den manuel renk çıkarımı
        const urlParts = url.toLowerCase().split(/[-_]/);
        for (const part of urlParts) {
          if (part.match(/^(fair|light|medium|deep|glow|901|902|903|904|şeffaf|taupe|kahve)$/)) {
            finalColor = part;
            console.log(`🎯 URL'den manuel renk çıkarımı: ${finalColor}`);
            break;
          }
        }
      }
      
      console.log(`🔒 FINAL: Bu URL'nin tek rengi → ${finalColor}`);
      
      // Extract complete product info using scenario-based scraper for first URL
      if (!mainProduct) {
        console.log(`🎯 Getting complete product data from FIRST URL ONLY using scenario-based scraper`);
        
        try {
          const { scenarioBasedScrape } = await import('./scenario-based-scraper');
          const scenarioResult = await scenarioBasedScrape(url);
          
          if (scenarioResult.success) {
            console.log(`✅ Scenario-based data extraction successful from FIRST URL`);
            
            // ✅ SADECE İLK URL'DEN TITLE AL - Diğer URL'lerin title'larını kullanma
            const title = scenarioResult.title;
            firstUrlTitle = title; // İlk URL'den title'ı kaydet
            console.log(`🔒 FIRST URL TITLE STORED: ${firstUrlTitle}`);
            
            const brand = scenarioResult.brand;
            const description = scenarioResult.features && scenarioResult.features.length > 0 
              ? scenarioResult.features.map(f => `${f.key}: ${f.value}`).join('. ') 
              : '';
            
            // Store all features for later use
            allFeatures = scenarioResult.features || [];
            
            // Create mainProduct from scenario data - USE FIRST URL TITLE ONLY
            mainProduct = {
              id: url.split('-p-')[1]?.split('?')[0] || Date.now().toString(),
              title: firstUrlTitle, // ✅ SADECE İLK URL'DEN ALINAN TITLE KULLAN
              brand: brand,
              description: description,
              price: scenarioResult.price,
              category: extractCategoryFromTitle(firstUrlTitle)
            };
            
            console.log(`📋 Extracted ${allFeatures.length} features from scenario-based scraper`);
            console.log(`✅ Main product created with FIRST URL TITLE: ${firstUrlTitle} - ${brand}`);
            
            // Add images from scenario-based result to combinedImages
            if (scenarioResult.images && scenarioResult.images.length > 0) {
              scenarioResult.images.forEach(imageUrl => {
                combinedImages.push({
                  url: imageUrl,
                  alt: `${firstUrlTitle} - ${finalColor}`, // ✅ SADECE İLK URL TİTLE KULLAN
                  colorName: finalColor
                });
              });
              console.log(`📸 Added ${scenarioResult.images.length} images from scenario-based scraper`);
            }
          } else {
            console.log(`⚠️ Scenario-based extraction failed, using basic extraction from FIRST URL`);
            // Fallback to basic extraction - ONLY from first URL
            const titleElement = $('h1.pr-new-br[data-testid="product-detail-name"], h1');
            const title = titleElement.text().trim() || 'Product';
            firstUrlTitle = title; // ✅ İLK URL'DEN TITLE KAYDET
            console.log(`🔒 FALLBACK: First URL title stored: ${firstUrlTitle}`);
            
            const brandElement = $('a[data-testid="product-detail-brand"]');
            const brand = brandElement.text().trim() || extractBrandFromUrl(url);
            
            const descriptionElement = $('.product-detail-description, .detail-desc-text');
            const description = descriptionElement.text().trim();
            
            // Create fallback mainProduct - USE FIRST URL TITLE ONLY
            mainProduct = {
              id: url.split('-p-')[1]?.split('?')[0] || Date.now().toString(),
              title: firstUrlTitle, // ✅ SADECE İLK URL TİTLE KULLAN
              brand: brand,
              description: description,
              price: { profitFormatted: '0 TL', value: 0, withProfit: 0 },
              category: extractCategoryFromTitle(firstUrlTitle)
            };
            
            console.log(`⚠️ Created fallback main product with FIRST URL TITLE: ${firstUrlTitle} - ${brand}`);
          }
        } catch (error) {
          console.error(`❌ Error during scenario-based extraction from FIRST URL:`, error);
          // Create minimal fallback - ONLY use first URL data
          const title = $('h1').first().text().trim() || 'Product';
          firstUrlTitle = title; // ✅ İLK URL'DEN TITLE KAYDET
          console.log(`🔒 ERROR FALLBACK: First URL title stored: ${firstUrlTitle}`);
          
          const brand = extractBrandFromUrl(url);
          mainProduct = {
            id: url.split('-p-')[1]?.split('?')[0] || Date.now().toString(),
            title: firstUrlTitle, // ✅ SADECE İLK URL TİTLE KULLAN
            brand: brand,
            description: '',
            price: { profitFormatted: '0 TL', value: 0, withProfit: 0 },
            category: 'Genel'
          };
          console.log(`🔒 ERROR FALLBACK created with FIRST URL TITLE: ${firstUrlTitle}`);
        }
      }
      
      // Extract images for this color - ALWAYS run, even if scenario-based already added some
      const colorImages: string[] = [];
      
      // Primary image
      const mainImageElement = $('.product-detail-picture img, [data-testid="product-detail-main-image"] img');
      if (mainImageElement.length > 0) {
        const mainImageSrc = mainImageElement.attr('src');
        if (mainImageSrc) {
          const cleanImageUrl = mainImageSrc.replace(/\/ty\d+\//, '/ty1200/').replace(/_crop\.jpg$/, '_org_zoom.jpg');
          colorImages.push(cleanImageUrl);
          console.log(`📸 Cheerio: Added primary image: ${cleanImageUrl}`);
        }
      }
      
      // Additional images from gallery
      $('.product-slide-list img, .product-detail-gallery img').each((_, img) => {
        const imageSrc = $(img).attr('src') || $(img).attr('data-src');
        if (imageSrc && !imageSrc.includes('video-placeholder')) {
          const cleanImageUrl = imageSrc.replace(/\/ty\d+\//, '/ty1200/').replace(/_crop\.jpg$/, '_org_zoom.jpg');
          if (!colorImages.includes(cleanImageUrl)) {
            colorImages.push(cleanImageUrl);
            console.log(`📸 Cheerio: Added gallery image: ${cleanImageUrl}`);
          }
        }
      });
      
      console.log(`📸 Cheerio extraction found ${colorImages.length} images for ${finalColor}`);
      
      // ✅ SADECE bu URL'nin rengini kaydet - İLK URL TİTLE KULLAN
      colorImages.forEach(imageUrl => {
        // Check if already exists to avoid duplicates
        const alreadyExists = combinedImages.some(img => img.url === imageUrl);
        if (!alreadyExists) {
          combinedImages.push({
            url: imageUrl,
            alt: `${firstUrlTitle || mainProduct.title} - ${finalColor}`, // ✅ İLK URL TİTLE ÖNCELİK VER
            colorName: finalColor // Bu URL'nin SADECE kendi rengi
          });
          console.log(`📸 Added unique image to combinedImages: ${imageUrl}`);
        } else {
          console.log(`📸 Skipped duplicate image: ${imageUrl}`);
        }
      });
      
      // Bu URL'nin bedenlerini çıkar (ortak beden havuzu)
      const sizes = extractSizesFromContent($, htmlContent);
      sizes.forEach(size => allSizes.add(size));
      
      // ✅ SADECE bu URL'nin rengini renk havuzuna ekle
      combinedColors.add(finalColor);
      console.log(`📝 Renk havuzuna eklendi: ${finalColor}`);
      
      console.log(`✅ Successfully scraped ${finalColor}: ${colorImages.length} images, ${sizes.length} sizes`);
      
    } catch (error) {
      console.error(`❌ Failed to scrape color from ${url}:`, error);
      // Continue with other colors
    }
  }
  
  if (!mainProduct) {
    throw new Error('Failed to extract main product information from any URL');
  }
  
  // Features are already extracted in allFeatures from scenario-based scraper
  const features = allFeatures;
  
  // Generate tags - İLK URL TİTLE KULLAN
  const tags = generateTags(firstUrlTitle || mainProduct.title, mainProduct.description, Array.from(combinedColors));
  
  // Create final variants: Her renk için tüm bedenleri oluştur
  const finalSizes = Array.from(allSizes);
  const finalColors = Array.from(combinedColors);
  
  // Eğer hiç beden bulunamazsa, default olarak "Standart" ekle
  if (finalSizes.length === 0) {
    finalSizes.push('Standart');
  }
  
  // Her renk-beden kombinasyonu için varyant oluştur
  finalColors.forEach(color => {
    finalSizes.forEach(size => {
      allVariants.push({
        color: color,
        colorCode: color.toLowerCase(),
        size: size,
        inStock: true // URL erişilebilir olduğu için stokta varsay
      });
    });
  });
  
  const result: CombinedProduct = {
    ...mainProduct,
    title: firstUrlTitle || mainProduct.title, // ✅ FINAL: İLK URL TİTLE KULLANILDIĞINDAN EMİN OL
    images: combinedImages,
    variants: {
      colors: finalColors,
      sizes: finalSizes,
      allVariants: allVariants
    },
    features: features,
    tags: tags
  };
  
  console.log(`📸 FINAL COMBINED IMAGES COUNT: ${combinedImages.length}`);
  console.log(`📸 Sample images (first 3):`, combinedImages.slice(0, 3).map(img => img.url));
  console.log(`🎨 Multi-URL scraping completed: ${result.variants.colors.length} colors, ${result.variants.allVariants.length} variants, ${result.images.length} images`);
  
  return result;
}