import { scrapeTrendyolProduct } from './enhanced-trendyol-handler';
import { generateVariantSpecificCSV } from './variant-specific-csv-generator';
import fs from 'fs';
import path from 'path';

interface AutoCSVOptions {
  urls: string[];
  outputFilename?: string;
  batchSize?: number;
}

interface ProcessedProduct {
  url: string;
  title: string;
  success: boolean;
  variants: number;
  error?: string;
}

export async function generateAutoCSV(options: AutoCSVOptions) {
  const { urls, outputFilename, batchSize = 5 } = options;
  const results: ProcessedProduct[] = [];
  const allProducts: any[] = [];
  
  console.log(`🚀 Otomatik CSV oluşturma başlatılıyor: ${urls.length} ürün`);
  
  // Process URLs in batches to avoid overwhelming the server
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    console.log(`📦 Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(urls.length/batchSize)} işleniyor...`);
    
    const batchPromises = batch.map(async (url, index) => {
      try {
        console.log(`🔍 İşleniyor: ${url}`);
        const productData = await scrapeTrendyolProduct(url);
        
        if (productData && productData.variants.totalVariants > 0) {
          allProducts.push(productData);
          results.push({
            url,
            title: productData.title,
            success: true,
            variants: productData.variants.totalVariants
          });
          console.log(`✅ Başarılı: ${productData.title} (${productData.variants.totalVariants} varyant)`);
        } else {
          results.push({
            url,
            title: 'Bilinmiyor',
            success: false,
            variants: 0,
            error: 'Varyant bulunamadı'
          });
          console.log(`❌ Başarısız: ${url} - Varyant bulunamadı`);
        }
        
        // Add delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        results.push({
          url,
          title: 'Hata',
          success: false,
          variants: 0,
          error: error.message
        });
        console.log(`❌ Hata: ${url} - ${error.message}`);
      }
    });
    
    await Promise.all(batchPromises);
  }
  
  // Generate combined CSV if we have products
  if (allProducts.length > 0) {
    console.log(`📝 ${allProducts.length} ürün için CSV oluşturuluyor...`);
    
    const csvResult = await generateVariantSpecificCSV(allProducts);
    const finalFilename = outputFilename || `auto-shopify-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    
    // Copy to final location with custom name
    const finalPath = path.join('./temp', finalFilename);
    fs.copyFileSync(csvResult.csvPath, finalPath);
    
    console.log(`✅ Otomatik CSV tamamlandı: ${finalFilename}`);
    
    return {
      success: true,
      filename: finalFilename,
      csvPath: finalPath,
      totalProducts: allProducts.length,
      totalVariants: allProducts.reduce((sum, p) => sum + p.variants.totalVariants, 0),
      totalRows: csvResult.totalRows,
      results,
      summary: {
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalUrls: urls.length
      }
    };
  } else {
    return {
      success: false,
      error: 'Hiçbir ürün başarıyla işlenemedi',
      results,
      summary: {
        successful: 0,
        failed: results.length,
        totalUrls: urls.length
      }
    };
  }
}

export async function processProductList(productUrls: string[], options?: {
  filename?: string;
  batchSize?: number;
}) {
  return await generateAutoCSV({
    urls: productUrls,
    outputFilename: options?.filename,
    batchSize: options?.batchSize
  });
}