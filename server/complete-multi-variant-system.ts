import { discoverMultiVariantURLs, type MultiVariantDiscovery, type VariantURL } from './multi-variant-url-detector';
import { extractComprehensiveImages } from './comprehensive-image-system';

export interface CompleteVariantData {
  url: string;
  color: string;
  productId: string;
  isMain: boolean;
  images: {
    allImages: any[];
    imageGroups: any[];
    statistics: any;
  };
  imageCount: number;
  processing: {
    success: boolean;
    duration: number;
    error?: string;
  };
}

export interface CompleteMultiVariantResult {
  discovery: MultiVariantDiscovery;
  variantData: CompleteVariantData[];
  summary: {
    totalVariants: number;
    successfulExtractions: number;
    failedExtractions: number;
    totalImages: number;
    totalGroups: number;
    totalProcessingTime: number;
    colorsFound: string[];
  };
}

/**
 * Complete multi-variant processing system
 * Discovers all variant URLs and extracts comprehensive images for each
 */
export async function processCompleteMultiVariant(mainUrl: string): Promise<CompleteMultiVariantResult> {
  const startTime = Date.now();
  console.log('🚀 Complete Multi-Variant System başlıyor...');
  console.log('📍 Ana URL:', mainUrl);
  
  try {
    // Step 1: Discover all variant URLs
    console.log('\n🔍 Step 1: Multi-variant URL discovery...');
    const discovery = await discoverMultiVariantURLs(mainUrl);
    console.log(`✅ ${discovery.totalVariants} varyant URL'i keşfedildi`);
    
    // Step 2: Process each variant to extract comprehensive images
    console.log('\n📸 Step 2: Comprehensive image extraction for each variant...');
    const variantData: CompleteVariantData[] = [];
    
    let successCount = 0;
    let failCount = 0;
    let totalImages = 0;
    let totalGroups = 0;
    
    for (const variant of discovery.allVariants) {
      console.log(`\n🎨 Processing variant: ${variant.color} (${variant.url})`);
      const variantStartTime = Date.now();
      
      try {
        // Extract comprehensive images for this variant
        const images = await extractComprehensiveImages(variant.url);
        const processingTime = Date.now() - variantStartTime;
        
        const variantResult: CompleteVariantData = {
          url: variant.url,
          color: variant.color,
          productId: variant.productId,
          isMain: variant.isMain,
          images,
          imageCount: images.allImages.length,
          processing: {
            success: true,
            duration: processingTime
          }
        };
        
        variantData.push(variantResult);
        successCount++;
        totalImages += images.allImages.length;
        totalGroups += images.imageGroups.length;
        
        console.log(`✅ ${variant.color}: ${images.allImages.length} görsel, ${processingTime}ms`);
        
      } catch (error) {
        console.error(`❌ ${variant.color} variant error:`, error);
        
        const failedResult: CompleteVariantData = {
          url: variant.url,
          color: variant.color,
          productId: variant.productId,
          isMain: variant.isMain,
          images: {
            allImages: [],
            imageGroups: [],
            statistics: {
              totalImages: 0,
              totalGroups: 0,
              qualityDistribution: { high: 0, medium: 0, low: 0 },
              typeDistribution: { main: 0, colorVariant: 0, detail: 0, angle: 0 }
            }
          },
          imageCount: 0,
          processing: {
            success: false,
            duration: Date.now() - variantStartTime,
            error: (error as Error).message
          }
        };
        
        variantData.push(failedResult);
        failCount++;
      }
    }
    
    const totalProcessingTime = Date.now() - startTime;
    
    const result: CompleteMultiVariantResult = {
      discovery,
      variantData,
      summary: {
        totalVariants: discovery.totalVariants,
        successfulExtractions: successCount,
        failedExtractions: failCount,
        totalImages,
        totalGroups,
        totalProcessingTime,
        colorsFound: discovery.detectedColors
      }
    };
    
    console.log('\n🎉 Complete Multi-Variant System tamamlandı!');
    console.log('📊 Özet:');
    console.log(`  🎨 Toplam varyant: ${result.summary.totalVariants}`);
    console.log(`  ✅ Başarılı çıkarım: ${result.summary.successfulExtractions}`);
    console.log(`  ❌ Başarısız çıkarım: ${result.summary.failedExtractions}`);
    console.log(`  📸 Toplam görsel: ${result.summary.totalImages}`);
    console.log(`  🎯 Toplam grup: ${result.summary.totalGroups}`);
    console.log(`  ⏱️ Toplam süre: ${result.summary.totalProcessingTime}ms`);
    console.log(`  🌈 Bulunan renkler: ${result.summary.colorsFound.join(', ')}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Complete Multi-Variant System hatası:', error);
    throw error;
  }
}

/**
 * Generate comprehensive CSV for all variants
 */
export function generateMultiVariantCSV(result: CompleteMultiVariantResult): string {
  const headers = [
    'Variant Color',
    'Variant URL', 
    'Product ID',
    'Is Main',
    'Position',
    'Image URL',
    'Group ID',
    'Image ID',
    'Type',
    'Quality',
    'Description',
    'Alt Text',
    'Group Size',
    'Is Main Image',
    'Processing Success',
    'Processing Duration (ms)',
    'Error Message'
  ];
  
  const rows: string[][] = [];
  
  for (const variant of result.variantData) {
    if (variant.processing.success && variant.images.allImages.length > 0) {
      // Add rows for each image in this variant
      variant.images.allImages.forEach((image: any, index: number) => {
        rows.push([
          variant.color,
          variant.url,
          variant.productId,
          variant.isMain.toString(),
          (index + 1).toString(),
          image.url,
          image.groupId,
          image.imageId,
          image.type,
          image.quality,
          image.description,
          image.altText,
          image.groupSize.toString(),
          image.isMainImage,
          'true',
          variant.processing.duration.toString(),
          ''
        ]);
      });
    } else {
      // Add a row for failed variants
      rows.push([
        variant.color,
        variant.url,
        variant.productId,
        variant.isMain.toString(),
        '0',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '0',
        'false',
        'false',
        variant.processing.duration.toString(),
        variant.processing.error || ''
      ]);
    }
  }
  
  // Convert to CSV format
  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  return csvContent;
}

/**
 * Generate summary report for multi-variant processing
 */
export function generateMultiVariantSummary(result: CompleteMultiVariantResult): string {
  const summary = result.summary;
  const discovery = result.discovery;
  
  let report = `MULTI-VARIANT PROCESSING SUMMARY\n`;
  report += `================================\n\n`;
  
  report += `Base Product Information:\n`;
  report += `- Brand: ${discovery.baseProductInfo.brand}\n`;
  report += `- Base Title: ${discovery.baseProductInfo.baseTitle}\n`;
  report += `- Merchant ID: ${discovery.baseProductInfo.merchantId}\n`;
  report += `- Boutique ID: ${discovery.baseProductInfo.boutiqueId}\n\n`;
  
  report += `Discovery Results:\n`;
  report += `- Total Variants Found: ${summary.totalVariants}\n`;
  report += `- Colors Detected: ${summary.colorsFound.join(', ')}\n\n`;
  
  report += `Processing Results:\n`;
  report += `- Successful Extractions: ${summary.successfulExtractions}\n`;
  report += `- Failed Extractions: ${summary.failedExtractions}\n`;
  report += `- Success Rate: ${((summary.successfulExtractions / summary.totalVariants) * 100).toFixed(1)}%\n\n`;
  
  report += `Image Statistics:\n`;
  report += `- Total Images Extracted: ${summary.totalImages}\n`;
  report += `- Total Image Groups: ${summary.totalGroups}\n`;
  report += `- Average Images per Variant: ${(summary.totalImages / summary.successfulExtractions).toFixed(1)}\n\n`;
  
  report += `Performance:\n`;
  report += `- Total Processing Time: ${summary.totalProcessingTime}ms\n`;
  report += `- Average Time per Variant: ${(summary.totalProcessingTime / summary.totalVariants).toFixed(1)}ms\n\n`;
  
  report += `Detailed Variant Results:\n`;
  report += `=========================\n`;
  
  result.variantData.forEach((variant, index) => {
    report += `\nVariant ${index + 1}: ${variant.color}\n`;
    report += `- URL: ${variant.url}\n`;
    report += `- Product ID: ${variant.productId}\n`;
    report += `- Is Main: ${variant.isMain ? 'Yes' : 'No'}\n`;
    report += `- Processing: ${variant.processing.success ? 'Success' : 'Failed'}\n`;
    report += `- Duration: ${variant.processing.duration}ms\n`;
    report += `- Images Found: ${variant.imageCount}\n`;
    
    if (variant.processing.error) {
      report += `- Error: ${variant.processing.error}\n`;
    }
    
    if (variant.processing.success && variant.images.imageGroups.length > 0) {
      report += `- Image Groups: ${variant.images.imageGroups.length}\n`;
      variant.images.imageGroups.forEach((group, groupIndex) => {
        report += `  Group ${groupIndex + 1}: ${group.colorVariant} (${group.images.length} images)\n`;
      });
    }
  });
  
  return report;
}