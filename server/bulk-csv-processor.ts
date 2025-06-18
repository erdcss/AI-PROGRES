import { scrapeTrendyolProduct } from './enhanced-trendyol-handler';
import { generateVariantSpecificCSV } from './variant-specific-csv-generator';
import fs from 'fs';
import path from 'path';

interface BulkProcessingResult {
  success: boolean;
  totalProcessed: number;
  totalVariants: number;
  csvPath?: string;
  filename?: string;
  results: Array<{
    url: string;
    success: boolean;
    title?: string;
    variants?: number;
    error?: string;
  }>;
}

export async function processBulkProducts(urls: string[]): Promise<BulkProcessingResult> {
  console.log(`🚀 Toplu işleme başlatılıyor: ${urls.length} ürün`);
  
  const results = [];
  const successfulProducts = [];
  let totalVariants = 0;
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`📦 İşleniyor (${i + 1}/${urls.length}): ${url}`);
    
    try {
      // Normalize URL
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      
      const productData = await scrapeTrendyolProduct(normalizedUrl);
      
      if (productData && productData.variants.totalVariants > 0) {
        successfulProducts.push(productData);
        totalVariants += productData.variants.totalVariants;
        
        results.push({
          url: normalizedUrl,
          success: true,
          title: productData.title,
          variants: productData.variants.totalVariants
        });
        
        console.log(`✅ Başarılı: ${productData.title} (${productData.variants.totalVariants} varyant)`);
      } else {
        results.push({
          url: normalizedUrl,
          success: false,
          error: 'Varyant bulunamadı'
        });
        console.log(`❌ Başarısız: ${url} - Varyant bulunamadı`);
      }
      
      // Respectful delay between requests
      if (i < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error: any) {
      results.push({
        url,
        success: false,
        error: error.message
      });
      console.log(`❌ Hata: ${url} - ${error.message}`);
    }
  }
  
  // Generate CSV if we have successful products
  if (successfulProducts.length > 0) {
    try {
      console.log(`📝 ${successfulProducts.length} ürün için CSV oluşturuluyor...`);
      
      const csvResult = await generateVariantSpecificCSV(successfulProducts as any);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `toplu-urunler-${timestamp}.csv`;
      
      // Copy to final location
      const finalPath = path.join('./temp', filename);
      fs.copyFileSync(csvResult.csvPath, finalPath);
      
      console.log(`✅ Toplu CSV oluşturuldu: ${filename}`);
      
      return {
        success: true,
        totalProcessed: successfulProducts.length,
        totalVariants,
        csvPath: finalPath,
        filename,
        results
      };
      
    } catch (error: any) {
      console.error('CSV oluşturma hatası:', error);
      return {
        success: false,
        totalProcessed: successfulProducts.length,
        totalVariants,
        results
      };
    }
  } else {
    return {
      success: false,
      totalProcessed: 0,
      totalVariants: 0,
      results
    };
  }
}

export async function processProductListToCSV(urls: string[]) {
  return await processBulkProducts(urls);
}