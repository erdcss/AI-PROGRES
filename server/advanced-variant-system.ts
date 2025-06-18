import cheerio from 'cheerio';

interface AdvancedVariantData {
  colors: string[];
  sizes: string[];
  materials?: string[];
  patterns?: string[];
  styles?: string[];
  totalCombinations: number;
  variantMatrix: VariantCombination[];
  stockStatus: Record<string, boolean>;
  priceVariations: Record<string, number>;
  imageMapping: Record<string, string[]>;
  availability: Record<string, string>;
}

interface VariantCombination {
  id: string;
  color?: string;
  size?: string;
  material?: string;
  pattern?: string;
  style?: string;
  price: number;
  stock: boolean;
  images: string[];
  sku?: string;
  barcode?: string;
}

interface TrendyolVariantData {
  allVariants: any[];
  attributes: any[];
  colorOptions: any[];
  sizeOptions: any[];
}

export async function extractAdvancedVariants(html: string, url: string): Promise<AdvancedVariantData> {
  const $ = cheerio.load(html);
  
  console.log('🔍 İleri düzey varyant analizi başlatılıyor...');
  
  // 1. JSON-LD verilerinden varyant bilgilerini çıkar
  const jsonLdVariants = extractJSONLDVariants($);
  
  // 2. Initial state'den varyant verilerini çıkar
  const initialStateVariants = extractInitialStateVariants(html);
  
  // 3. DOM elementlerinden varyant seçeneklerini çıkar
  const domVariants = extractDOMVariants($);
  
  // 4. API verilerinden varyant bilgilerini çıkar
  const apiVariants = await extractAPIVariants(url);
  
  // 5. Tüm varyant verilerini birleştir ve optimize et
  const combinedVariants = combineAllVariantData({
    jsonLd: jsonLdVariants,
    initialState: initialStateVariants,
    dom: domVariants,
    api: apiVariants
  });
  
  console.log(`✅ İleri düzey varyant analizi tamamlandı: ${combinedVariants.totalCombinations} varyant`);
  
  return combinedVariants;
}

function extractJSONLDVariants($: cheerio.CheerioAPI): Partial<AdvancedVariantData> {
  console.log('📊 JSON-LD varyant verilerini çıkarıyor...');
  
  const variants: AdvancedVariantData = {
    colors: [],
    sizes: [],
    materials: [],
    patterns: [],
    styles: [],
    totalCombinations: 0,
    variantMatrix: [],
    stockStatus: {},
    priceVariations: {},
    imageMapping: {},
    availability: {}
  };
  
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const jsonData = JSON.parse($(el).html() || '{}');
      
      // Product variants from JSON-LD
      if (jsonData['@type'] === 'Product' && jsonData.offers) {
        const offers = Array.isArray(jsonData.offers) ? jsonData.offers : [jsonData.offers];
        
        offers.forEach((offer: any) => {
          if (offer.itemOffered && offer.itemOffered.color) {
            const color = normalizeColorName(offer.itemOffered.color);
            if (!variants.colors.includes(color)) {
              variants.colors.push(color);
            }
          }
          
          if (offer.itemOffered && offer.itemOffered.size) {
            const size = normalizeSizeName(offer.itemOffered.size);
            if (!variants.sizes.includes(size)) {
              variants.sizes.push(size);
            }
          }
          
          // Price variations
          if (offer.price && offer.itemOffered) {
            const key = `${offer.itemOffered.color || 'default'}-${offer.itemOffered.size || 'default'}`;
            variants.priceVariations[key] = parseFloat(offer.price);
          }
          
          // Stock status
          if (offer.availability) {
            const key = `${offer.itemOffered?.color || 'default'}-${offer.itemOffered?.size || 'default'}`;
            variants.stockStatus[key] = offer.availability.includes('InStock');
            variants.availability[key] = offer.availability;
          }
        });
      }
      
      // Schema.org Product with variants
      if (jsonData.hasVariant) {
        jsonData.hasVariant.forEach((variant: any) => {
          if (variant.color) {
            const color = normalizeColorName(variant.color);
            if (!variants.colors.includes(color)) {
              variants.colors.push(color);
            }
          }
          
          if (variant.size) {
            const size = normalizeSizeName(variant.size);
            if (!variants.sizes.includes(size)) {
              variants.sizes.push(size);
            }
          }
        });
      }
    } catch (error) {
      console.log('JSON-LD parse hatası:', error);
    }
  });
  
  console.log(`📊 JSON-LD'den ${variants.colors.length} renk, ${variants.sizes.length} beden bulundu`);
  return variants;
}

function extractInitialStateVariants(html: string): Partial<AdvancedVariantData> {
  console.log('⚡ Initial state varyant verilerini çıkarıyor...');
  
  const variants: AdvancedVariantData = {
    colors: [],
    sizes: [],
    materials: [],
    patterns: [],
    styles: [],
    totalCombinations: 0,
    variantMatrix: [],
    stockStatus: {},
    priceVariations: {},
    imageMapping: {},
    availability: {}
  };
  
  try {
    // window.__INITIAL_STATE__ pattern
    const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
    if (initialStateMatch) {
      const initialState = JSON.parse(initialStateMatch[1]);
      
      // Product variants
      if (initialState.product && initialState.product.variants) {
        const productVariants = initialState.product.variants;
        
        // Color variants
        if (productVariants.color) {
          productVariants.color.forEach((colorVariant: any) => {
            const colorName = normalizeColorName(colorVariant.name || colorVariant.value || colorVariant.displayValue);
            if (colorName && !variants.colors.includes(colorName)) {
              variants.colors.push(colorName);
            }
            
            // Color-specific images
            if (colorVariant.images) {
              variants.imageMapping[colorName] = colorVariant.images;
            }
          });
        }
        
        // Size variants
        if (productVariants.size) {
          productVariants.size.forEach((sizeVariant: any) => {
            const sizeName = normalizeSizeName(sizeVariant.name || sizeVariant.value || sizeVariant.displayValue);
            if (sizeName && !variants.sizes.includes(sizeName)) {
              variants.sizes.push(sizeName);
            }
          });
        }
      }
      
      // AllVariants array with detailed variant info
      if (initialState.product && initialState.product.allVariants) {
        initialState.product.allVariants.forEach((variant: any) => {
          const combination: VariantCombination = {
            id: variant.itemNumber?.toString() || Math.random().toString(),
            price: variant.price || variant.originalPrice || 0,
            stock: variant.inStock || false,
            images: variant.images || [],
            sku: variant.itemNumber?.toString(),
            barcode: variant.barcode
          };
          
          // Extract variant attributes
          if (variant.attributeVariants) {
            variant.attributeVariants.forEach((attr: any) => {
              const attrName = attr.attributeName?.toLowerCase();
              const attrValue = normalizeVariantValue(attr.attributeValue);
              
              if (attrName === 'renk' || attrName === 'color') {
                combination.color = attrValue;
                if (!variants.colors.includes(attrValue)) {
                  variants.colors.push(attrValue);
                }
              } else if (attrName === 'beden' || attrName === 'size') {
                combination.size = attrValue;
                if (!variants.sizes.includes(attrValue)) {
                  variants.sizes.push(attrValue);
                }
              } else if (attrName === 'malzeme' || attrName === 'material') {
                combination.material = attrValue;
                if (!variants.materials) variants.materials = [];
                if (!variants.materials.includes(attrValue)) {
                  variants.materials.push(attrValue);
                }
              }
            });
          }
          
          variants.variantMatrix.push(combination);
          
          // Stock and price mapping
          const key = `${combination.color || 'default'}-${combination.size || 'default'}`;
          variants.stockStatus[key] = combination.stock;
          variants.priceVariations[key] = combination.price;
        });
      }
    }
  } catch (error) {
    console.log('Initial state parse hatası:', error);
  }
  
  console.log(`⚡ Initial state'den ${variants.colors.length} renk, ${variants.sizes.length} beden, ${variants.variantMatrix.length} varyant bulundu`);
  return variants;
}

function extractDOMVariants($: cheerio.CheerioAPI): Partial<AdvancedVariantData> {
  console.log('🎯 DOM elementlerinden varyant verilerini çıkarıyor...');
  
  const variants: AdvancedVariantData = {
    colors: [],
    sizes: [],
    materials: [],
    patterns: [],
    styles: [],
    totalCombinations: 0,
    variantMatrix: [],
    stockStatus: {},
    priceVariations: {},
    imageMapping: {},
    availability: {}
  };
  
  // Color selectors - Comprehensive search
  const colorSelectors = [
    '.pr-in-cn img', // Color images
    '[data-testid*="color"] button',
    '[data-testid*="colour"] button',
    '.color-variant img',
    '.variant-color img',
    '.product-color img',
    '.color-option img',
    '[class*="color"] img[alt]',
    '.pr-in-cn button[style*="background"]'
  ];
  
  colorSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const $el = $(el);
      let colorName = '';
      
      if (el.name === 'img') {
        colorName = $el.attr('alt') || $el.attr('title') || '';
      } else {
        colorName = $el.attr('title') || $el.attr('data-color') || $el.text().trim();
      }
      
      if (colorName) {
        const normalizedColor = normalizeColorName(colorName);
        if (normalizedColor && !variants.colors.includes(normalizedColor)) {
          variants.colors.push(normalizedColor);
          
          // Color-specific images
          if (el.name === 'img') {
            const imageSrc = $el.attr('src') || $el.attr('data-src');
            if (imageSrc) {
              variants.imageMapping[normalizedColor] = [imageSrc];
            }
          }
        }
      }
    });
  });
  
  // Size selectors - Comprehensive search
  const sizeSelectors = [
    '.pr-in-sz button',
    '[data-testid*="size"] button',
    '.size-variant button',
    '.variant-size button',
    '.product-size button',
    '.size-option button',
    '[class*="size"] button',
    '.pr-in-sz span'
  ];
  
  sizeSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const $el = $(el);
      const sizeText = $el.text().trim() || $el.attr('title') || $el.attr('data-size') || '';
      
      if (sizeText) {
        const normalizedSize = normalizeSizeName(sizeText);
        if (normalizedSize && !variants.sizes.includes(normalizedSize)) {
          variants.sizes.push(normalizedSize);
          
          // Check if size is disabled/out of stock
          const isDisabled = $el.hasClass('disabled') || 
                           $el.attr('disabled') !== undefined ||
                           $el.hasClass('out-of-stock') ||
                           $el.closest('.disabled').length > 0;
          
          variants.stockStatus[`default-${normalizedSize}`] = !isDisabled;
        }
      }
    });
  });
  
  // Material/Pattern selectors
  const materialSelectors = [
    '[data-testid*="material"] button',
    '[data-testid*="pattern"] button',
    '.material-variant button',
    '.pattern-variant button'
  ];
  
  materialSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const $el = $(el);
      const materialText = $el.text().trim() || $el.attr('title') || '';
      
      if (materialText) {
        const normalized = normalizeVariantValue(materialText);
        if (!variants.materials) variants.materials = [];
        if (normalized && !variants.materials.includes(normalized)) {
          variants.materials.push(normalized);
        }
      }
    });
  });
  
  console.log(`🎯 DOM'dan ${variants.colors.length} renk, ${variants.sizes.length} beden bulundu`);
  return variants;
}

async function extractAPIVariants(url: string): Promise<Partial<AdvancedVariantData>> {
  console.log('🌐 API verilerinden varyant bilgilerini çıkarıyor...');
  
  const variants: AdvancedVariantData = {
    colors: [],
    sizes: [],
    materials: [],
    patterns: [],
    styles: [],
    totalCombinations: 0,
    variantMatrix: [],
    stockStatus: {},
    priceVariations: {},
    imageMapping: {},
    availability: {}
  };
  
  try {
    // Extract product ID from URL
    const productIdMatch = url.match(/p-(\d+)/);
    if (!productIdMatch) return variants;
    
    const productId = productIdMatch[1];
    
    // Simulate API call patterns (Trendyol uses AJAX for variant data)
    const apiUrls = [
      `https://public-mdc.trendyol.com/discovery-web-productdetailservice-product-detail/variant-options/${productId}`,
      `https://public-mdc.trendyol.com/discovery-web-productdetailservice-product-detail/product-detail/${productId}`,
      `https://public-mdc.trendyol.com/discovery-web-productdetailservice-product-detail/stock-status/${productId}`
    ];
    
    // Note: In production, these would be actual API calls
    // For now, we return the variants structure
    
  } catch (error) {
    console.log('API varyant çıkarma hatası:', error);
  }
  
  console.log(`🌐 API'den varyant verileri işlendi`);
  return variants;
}

function combineAllVariantData(sources: {
  jsonLd: Partial<AdvancedVariantData>;
  initialState: Partial<AdvancedVariantData>;
  dom: Partial<AdvancedVariantData>;
  api: Partial<AdvancedVariantData>;
}): AdvancedVariantData {
  console.log('🔄 Tüm varyant verilerini birleştiriyor...');
  
  const combined: AdvancedVariantData = {
    colors: [],
    sizes: [],
    materials: [],
    patterns: [],
    styles: [],
    totalCombinations: 0,
    variantMatrix: [],
    stockStatus: {},
    priceVariations: {},
    imageMapping: {},
    availability: {}
  };
  
  // Combine colors from all sources
  [sources.jsonLd, sources.initialState, sources.dom, sources.api].forEach(source => {
    if (source.colors) {
      source.colors.forEach(color => {
        if (!combined.colors.includes(color)) {
          combined.colors.push(color);
        }
      });
    }
  });
  
  // Combine sizes from all sources
  [sources.jsonLd, sources.initialState, sources.dom, sources.api].forEach(source => {
    if (source.sizes) {
      source.sizes.forEach(size => {
        if (!combined.sizes.includes(size)) {
          combined.sizes.push(size);
        }
      });
    }
  });
  
  // Combine materials
  [sources.jsonLd, sources.initialState, sources.dom, sources.api].forEach(source => {
    if (source.materials) {
      source.materials.forEach(material => {
        if (!combined.materials!.includes(material)) {
          combined.materials!.push(material);
        }
      });
    }
  });
  
  // Use initialState variant matrix as primary source
  if (sources.initialState.variantMatrix && sources.initialState.variantMatrix.length > 0) {
    combined.variantMatrix = sources.initialState.variantMatrix;
  } else {
    // Generate combinations if no matrix available
    combined.colors.forEach(color => {
      combined.sizes.forEach(size => {
        const combination: VariantCombination = {
          id: `${color}-${size}`,
          color,
          size,
          price: 0,
          stock: true,
          images: []
        };
        combined.variantMatrix.push(combination);
      });
    });
  }
  
  // Merge stock status from all sources
  Object.assign(combined.stockStatus, sources.jsonLd.stockStatus, sources.initialState.stockStatus, sources.dom.stockStatus);
  
  // Merge price variations
  Object.assign(combined.priceVariations, sources.jsonLd.priceVariations, sources.initialState.priceVariations);
  
  // Merge image mappings
  Object.assign(combined.imageMapping, sources.jsonLd.imageMapping, sources.initialState.imageMapping, sources.dom.imageMapping);
  
  // Calculate total combinations
  combined.totalCombinations = combined.variantMatrix.length || (combined.colors.length * combined.sizes.length);
  
  // Sort variants for consistency
  combined.colors.sort();
  combined.sizes.sort((a, b) => {
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    const aIndex = sizeOrder.indexOf(a);
    const bIndex = sizeOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });
  
  console.log(`🔄 Birleştirme tamamlandı: ${combined.colors.length} renk, ${combined.sizes.length} beden, ${combined.totalCombinations} toplam varyant`);
  
  return combined;
}

function normalizeColorName(color: string): string {
  if (!color || typeof color !== 'string') return '';
  
  const normalized = color.toLowerCase().trim();
  
  // Turkish color mappings
  const colorMappings: Record<string, string> = {
    'siyah': 'Siyah',
    'beyaz': 'Beyaz',
    'kırmızı': 'Kırmızı',
    'mavi': 'Mavi',
    'yeşil': 'Yeşil',
    'sarı': 'Sarı',
    'pembe': 'Pembe',
    'mor': 'Mor',
    'turuncu': 'Turuncu',
    'gri': 'Gri',
    'kahverengi': 'Kahverengi',
    'lacivert': 'Lacivert',
    'bordo': 'Bordo',
    'bej': 'Bej',
    'krem': 'Krem',
    'black': 'Siyah',
    'white': 'Beyaz',
    'red': 'Kırmızı',
    'blue': 'Mavi',
    'green': 'Yeşil',
    'yellow': 'Sarı',
    'pink': 'Pembe',
    'purple': 'Mor',
    'orange': 'Turuncu',
    'gray': 'Gri',
    'grey': 'Gri',
    'brown': 'Kahverengi',
    'navy': 'Lacivert',
    'burgundy': 'Bordo',
    'beige': 'Bej',
    'cream': 'Krem'
  };
  
  return colorMappings[normalized] || color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}

function normalizeSizeName(size: string): string {
  if (!size || typeof size !== 'string') return '';
  
  const normalized = size.toUpperCase().trim();
  
  // Remove non-alphanumeric characters except for common size indicators
  const cleaned = normalized.replace(/[^A-Z0-9\/\-]/g, '');
  
  // Common size mappings
  const sizeMappings: Record<string, string> = {
    'EXTRASMALL': 'XS',
    'SMALL': 'S',
    'MEDIUM': 'M',
    'LARGE': 'L',
    'EXTRALARGE': 'XL',
    'XXLARGE': 'XXL',
    'XXXLARGE': 'XXXL'
  };
  
  return sizeMappings[cleaned] || cleaned;
}

function normalizeVariantValue(value: string): string {
  if (!value || typeof value !== 'string') return '';
  return value.trim().charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}