// Instant CSV Generator - Working Version with Real Variants
import * as fs from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

class InstantCSVGenerator {
  async generateInstantCSV(product: any): Promise<{ success: boolean; message: string; csvPath?: string }> {
    try {
      const outputPath = join(tmpdir(), `shopify-${Date.now()}.csv`);
      
      // Calculate pricing with 15% profit margin
      const originalPrice = typeof product.price === 'object' ? product.price.original : parseFloat(product.price) || 100;
      const priceWithProfit = (originalPrice * 1.15).toFixed(2);
      
      console.log(`💰 Price calculation: ${originalPrice} → ${priceWithProfit} (15% margin)`);
      
      // Extract real variants
      const variants = product.variants || {};
      let realColors = [];
      let realSizes = [];
      
      if (Array.isArray(variants.colors)) {
        realColors = variants.colors.filter(c => 
          c && typeof c === 'string' && !c.toLowerCase().includes('varsayılan') && !c.toLowerCase().includes('default')
        );
      }
      
      if (Array.isArray(variants.sizes)) {
        realSizes = variants.sizes.filter(s => 
          s && typeof s === 'string' && !s.toLowerCase().includes('standart') && !s.toLowerCase().includes('standard')
        );
      }
      
      console.log(`🎨 Real colors found:`, realColors);
      console.log(`📏 Real sizes found:`, realSizes);
      
      const hasColorVariants = realColors.length > 1;
      const hasSizeVariants = realSizes.length > 1;
      
      // Generate handle
      const handle = product.title.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
      const brand = product.brand || 'TurMarkt';
      
      // CSV Headers
      const csvHeaders = [
        'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published',
        'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
        'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
        'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
        'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position',
        'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
        'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN', 'Google Shopping / Condition',
        'Google Shopping / Custom Product', 'Variant Image', 'Variant Weight Unit', 'Status'
      ];
      
      const csvRows = [csvHeaders.join(',')];
      
      // Create variants or single product
      if (!hasColorVariants && !hasSizeVariants) {
        // Single product without variants - but check if we have any colors at all
        let option1Name = '', option1Value = '';
        if (realColors.length > 0 && realColors[0] !== 'Standart') {
          option1Name = 'Renk';
          option1Value = realColors[0];
        }
        
        const row = [
          handle,
          `${brand.toUpperCase()} ${product.title}`,
          `<p>${product.description || product.title}</p>`,
          brand,
          'Apparel & Accessories > Clothing',
          'Giyim',
          `${brand.toLowerCase()},fashion,clothing`,
          'TRUE',
          option1Name, option1Value, '', '', '', '', // Use real color if available
          `${handle}-default`,
          '145', 'shopify', '10', 'continue', 'manual',
          priceWithProfit, '', 'TRUE', 'TRUE', '',
          product.images?.[0] || '', '1', `${product.title} - Ana Görsel`,
          'FALSE', `${brand} ${product.title}`, `${brand} markası ${product.title}`,
          '212', 'unisex', 'adult', brand, 'new', 'TRUE',
          product.images?.[0] || '', 'g', 'active'
        ];
        
        csvRows.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
      } else {
        // Create variants with real color/size names
        let variantCount = 0;
        const colorsToProcess = hasColorVariants ? realColors : [''];
        const sizesToProcess = hasSizeVariants ? realSizes : [''];
        
        for (const color of colorsToProcess) {
          for (const size of sizesToProcess) {
            variantCount++;
            const isMainVariant = variantCount === 1;
            
            let option1Name = '', option1Value = '', option2Name = '', option2Value = '';
            
            if (hasColorVariants && hasSizeVariants) {
              option1Name = 'Renk'; option1Value = color;
              option2Name = 'Beden'; option2Value = size;
            } else if (hasColorVariants) {
              option1Name = 'Renk'; option1Value = color;
            } else if (hasSizeVariants) {
              option1Name = 'Beden'; option1Value = size;
            }
            
            const row = [
              handle,
              isMainVariant ? `${brand.toUpperCase()} ${product.title}` : '',
              isMainVariant ? `<p>${product.description || product.title}</p>` : '',
              isMainVariant ? brand : '',
              isMainVariant ? 'Apparel & Accessories > Clothing' : '',
              isMainVariant ? 'Giyim' : '',
              isMainVariant ? `${brand.toLowerCase()},fashion,clothing` : '',
              isMainVariant ? 'TRUE' : '',
              isMainVariant ? option1Name : '', option1Value,
              isMainVariant ? option2Name : '', option2Value,
              '', '',
              `${handle}-${color || 'default'}-${size || 'default'}`,
              '145', 'shopify', '10', 'continue', 'manual',
              priceWithProfit, '', 'TRUE', 'TRUE', '',
              isMainVariant && product.images?.[0] ? product.images[0] : '',
              isMainVariant ? '1' : '',
              isMainVariant ? `${product.title} - Ana Görsel` : '',
              'FALSE',
              isMainVariant ? `${brand} ${product.title}` : '',
              isMainVariant ? `${brand} markası ${product.title}` : '',
              isMainVariant ? '212' : '', isMainVariant ? 'unisex' : '',
              isMainVariant ? 'adult' : '', isMainVariant ? brand : '',
              isMainVariant ? 'new' : '', isMainVariant ? 'TRUE' : '',
              '', 'g', isMainVariant ? 'active' : ''
            ];
            
            csvRows.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
          }
        }
      }
      
      fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf-8');
      
      console.log(`✅ CSV created: ${outputPath} (${csvRows.length - 1} data rows)`);
      
      return {
        success: true,
        message: `CSV oluşturuldu: ${csvRows.length - 1} satır`,
        csvPath: outputPath
      };
      
    } catch (error) {
      console.error('❌ CSV generation error:', error);
      return {
        success: false,
        message: `CSV oluşturma hatası: ${error.message}`
      };
    }
  }
}

export const instantCSVGenerator = new InstantCSVGenerator();