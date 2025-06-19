import { generateShopifyCSV } from "./shopify-export-fixed";
import path from "path";
import fs from "fs";

export interface InstantProduct {
  title: string;
  brand: string;
  price: string;
  description: string;
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
  };
  attributes?: Record<string, string>;
  categories?: string[];
  stockMap?: Record<string, boolean>;
}

class InstantCSVGenerator {
  async generateInstantCSV(productData: InstantProduct): Promise<{ success: boolean; message: string; csvPath?: string }> {
    try {
      console.log(`📝 Instant CSV generation starting for: ${productData.title}`);
      
      // Convert to Product format expected by generateShopifyCSV
      const product = {
        title: productData.title,
        brand: productData.brand,
        price: productData.price,
        description: productData.description,
        images: productData.images,
        category: productData.categories?.join(' > ') || 'Giyim',
        categories: productData.categories || ['Giyim']
      };

      // Create variants object
      const variants = {
        sizes: productData.variants.sizes || [],
        colors: productData.variants.colors || [],
        stockMap: productData.stockMap || {}
      };

      // Set output path to workspace root with correct filename
      const outputPath = path.join('/home/runner/workspace', 'shopify-urunler.csv');
      
      console.log(`📁 CSV will be created at: ${outputPath}`);
      
      // Generate CSV using existing function
      const result = await generateShopifyCSV(product, variants, outputPath);
      
      // Copy to expected filename if different
      if (result.csvPath !== outputPath) {
        if (fs.existsSync(result.csvPath)) {
          fs.copyFileSync(result.csvPath, outputPath);
          console.log(`📋 CSV copied to final location: ${outputPath}`);
        }
      }
      
      // Verify file exists
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`✅ CSV created successfully: ${outputPath} (${stats.size} bytes)`);
        return {
          success: true,
          message: `CSV oluşturuldu: ${result.totalRows} satır`,
          csvPath: outputPath
        };
      } else {
        console.log(`❌ CSV file not found at expected location: ${outputPath}`);
        return {
          success: false,
          message: "CSV dosyası oluşturulamadı"
        };
      }
      
    } catch (error) {
      console.error('❌ Instant CSV generation error:', error);
      return {
        success: false,
        message: `CSV oluşturma hatası: ${error.message}`
      };
    }
  }
}

export const instantCSVGenerator = new InstantCSVGenerator();