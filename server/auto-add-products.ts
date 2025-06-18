import { scrapeTrendyolProduct } from './enhanced-trendyol-handler';
import { generateVariantSpecificCSV } from './variant-specific-csv-generator';
import fs from 'fs';
import path from 'path';

interface AutoAddProductsState {
  products: any[];
  isProcessing: boolean;
  lastUpdated: Date;
  totalProcessed: number;
  errors: string[];
}

// In-memory state for auto-add functionality
let autoAddState: AutoAddProductsState = {
  products: [],
  isProcessing: false,
  lastUpdated: new Date(),
  totalProcessed: 0,
  errors: []
};

export function clearAutoProducts(): void {
  autoAddState.products = [];
  autoAddState.totalProcessed = 0;
  autoAddState.errors = [];
  autoAddState.lastUpdated = new Date();
  console.log('🗑️ Otomatik ürün listesi temizlendi');
}

export async function addProductToAutoCSV(url: string) {
  console.log(`🔄 Otomatik ürün ekleme: ${url}`);
  
  try {
    // Normalize URL - ensure https:// prefix
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    // Validate URL format
    try {
      new URL(normalizedUrl);
    } catch (error) {
      throw new Error(`Geçersiz URL formatı: ${url}`);
    }
    
    // Check if product already exists
    const existingProduct = autoAddState.products.find(p => p.url === normalizedUrl);
    if (existingProduct) {
      console.log(`⚠️ Ürün zaten mevcut: ${normalizedUrl}`);
      return {
        success: false,
        message: 'Ürün zaten listeye ekli',
        totalProducts: autoAddState.products.length
      };
    }
    
    // Scrape product data
    const productData = await scrapeTrendyolProduct(normalizedUrl);
    
    if (productData && productData.variants.totalVariants > 0) {
      // Add to products list
      autoAddState.products.push(productData);
      autoAddState.lastUpdated = new Date();
      autoAddState.totalProcessed++;
      
      console.log(`✅ Ürün eklendi: ${productData.title} (${productData.variants.totalVariants} varyant)`);
      
      // Auto-generate CSV after each addition
      await generateAutoCSV();
      
      return {
        success: true,
        message: `Ürün başarıyla eklendi: ${productData.title}`,
        product: {
          title: productData.title,
          variants: productData.variants.totalVariants,
          colors: productData.variants.colors.length,
          sizes: productData.variants.sizes.length
        },
        totalProducts: autoAddState.products.length,
        csvGenerated: true
      };
    } else {
      const error = 'Ürün verisi çekilemedi veya varyant bulunamadı';
      autoAddState.errors.push(`${url}: ${error}`);
      
      return {
        success: false,
        message: error,
        totalProducts: autoAddState.products.length
      };
    }
    
  } catch (error: any) {
    console.error('Otomatik ürün ekleme hatası:', error);
    autoAddState.errors.push(`${url}: ${error.message}`);
    
    return {
      success: false,
      message: `Ürün ekleme hatası: ${error.message}`,
      totalProducts: autoAddState.products.length
    };
  }
}

export async function generateAutoCSV() {
  if (autoAddState.products.length === 0) {
    return {
      success: false,
      message: 'Henüz eklenen ürün yok'
    };
  }
  
  try {
    console.log(`📝 ${autoAddState.products.length} ürün için otomatik CSV oluşturuluyor...`);
    
    const { generateShopifyCSV } = await import('./shopify-csv-generator');
    const filename = await generateShopifyCSV(autoAddState.products as any);
    
    console.log(`✅ Shopify CSV oluşturuldu: ${filename}`);
    
    const totalVariants = autoAddState.products.reduce((sum: number, product: any) => 
      sum + (product.variants?.totalVariants || 1), 0);
    
    return {
      success: true,
      message: `${autoAddState.products.length} ürün Shopify CSV'ye aktarıldı`,
      filename,
      totalProducts: autoAddState.products.length,
      totalVariants
    };
    
  } catch (error: any) {
    console.error('Otomatik CSV oluşturma hatası:', error);
    return {
      success: false,
      message: `CSV oluşturma hatası: ${error.message}`
    };
  }
}

export function getAutoAddState() {
  return {
    ...autoAddState,
    hasProducts: autoAddState.products.length > 0,
    totalVariants: autoAddState.products.reduce((sum, p) => sum + p.variants.totalVariants, 0),
    productSummary: autoAddState.products.map(p => ({
      title: p.title,
      url: p.url,
      variants: p.variants.totalVariants,
      colors: p.variants.colors.length,
      sizes: p.variants.sizes.length
    }))
  };
}

export function clearAutoAddProducts() {
  const previousCount = autoAddState.products.length;
  autoAddState = {
    products: [],
    isProcessing: false,
    lastUpdated: new Date(),
    totalProcessed: 0,
    errors: []
  };
  
  console.log(`🗑️ ${previousCount} ürün temizlendi`);
  
  return {
    success: true,
    message: `${previousCount} ürün listeden temizlendi`,
    clearedCount: previousCount
  };
}

export async function processUrlBatch(urls: string[]) {
  autoAddState.isProcessing = true;
  const results = [];
  
  try {
    for (const url of urls) {
      const result = await addProductToAutoCSV(url);
      results.push({ url, ...result });
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return {
      success: true,
      results,
      totalProcessed: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length,
      csvGenerated: results.some(r => r.success)
    };
    
  } finally {
    autoAddState.isProcessing = false;
  }
}