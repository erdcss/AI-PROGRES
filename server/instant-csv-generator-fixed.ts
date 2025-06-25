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
      
      const product = {
        title: productData.title,
        brand: productData.brand,
        price: productData.price,
        description: productData.description,
        images: productData.images,
        category: productData.categories?.join(' > ') || 'Giyim',
        categories: productData.categories || ['Giyim']
      };

      const variants = {
        sizes: productData.variants.sizes || [],
        colors: productData.variants.colors || [],
        stockMap: productData.stockMap || {}
      };

      const outputPath = path.join('/home/runner/workspace', 'shopify-urunler.csv');
      
      // Fix Turkish price format (2.549.57 -> 2549.57)
      let cleanPrice = product.price;
      if (typeof cleanPrice === 'string') {
        if (cleanPrice.includes('.')) {
          const parts = cleanPrice.split('.');
          if (parts.length === 3 && parts[2].length === 2) {
            cleanPrice = `${parts[0]}${parts[1]}.${parts[2]}`;
            console.log(`🔧 Fixed Turkish format: "${product.price}" -> "${cleanPrice}"`);
          }
        }
      }
      
      const basePrice = parseFloat(cleanPrice);
      const priceWithMargin = (basePrice * 1.15).toFixed(2);
      console.log(`💰 Price with 15% margin: ${basePrice} -> ${priceWithMargin}`);
      
      // Generate CSV content
      const csvRows = [];
      const headers = [
        'handle', 'title', 'body_html', 'vendor', 'product_category', 'type', 'tags',
        'published', 'option1_name', 'option1_value', 'option2_name', 'option2_value',
        'option3_name', 'option3_value', 'variant_sku', 'variant_grams', 'variant_inventory_tracker',
        'variant_inventory_qty', 'variant_inventory_policy', 'variant_fulfillment_service',
        'variant_price', 'variant_compare_at_price', 'variant_requires_shipping', 'variant_taxable',
        'variant_barcode', 'image_src', 'image_position', 'image_alt_text', 'gift_card',
        'seo_title', 'seo_description', 'google_shopping_google_product_category',
        'google_shopping_gender', 'google_shopping_age_group', 'google_shopping_mpn',
        'google_shopping_condition', 'google_shopping_custom_product', 'variant_image',
        'variant_weight_unit', 'variant_tax_code'
      ];
      
      csvRows.push(headers.join(','));
      
      const handle = `${product.brand ? product.brand.toLowerCase() + '-' : ''}${product.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
      
      // Enhanced variant analysis with better filtering
      const allColors = variants.colors || [];
      const allSizes = variants.sizes || [];
      
      console.log(`🔍 All received colors: ${allColors.join(', ')}`);
      console.log(`🔍 All received sizes: ${allSizes.join(', ')}`);
      
      // Filter out non-color terms but keep valid color variants
      const excludeTerms = [
        'buymorepayless', 'isblacklist', 'starred', 'registered', 'credit', 'expired', 'flash',
        'bag', 'more', 'promotions', 'email', 'address', 'suitable', 'attributes', 'sales',
        'show', 'true', 'false'
      ];
      
      // Restore original color filtering - only accept real colors
      const realColors = allColors.filter(c => {
        if (!c || typeof c !== 'string') return false;
        const clean = c.trim().toLowerCase();
        
        // Skip obvious placeholders
        if (clean === 'tek renk' || clean === 'default' || clean === 'n/a' || clean === '' || 
            clean === 'undefined' || clean === 'null' || clean.length <= 1) {
          return false;
        }
        
        // Skip terms that are clearly not colors
        const containsExcluded = excludeTerms.some(term => clean.includes(term.toLowerCase()));
        if (containsExcluded) {
          console.log(`🚫 Filtering out non-color term: ${c}`);
          return false;
        }
        
        // Very strict color filtering - only real product colors
        const actualColorKeywords = ['siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'turuncu', 'mor', 'pembe', 'gri', 'kahverengi', 'lacivert', 'bordo'];
        const isActualColor = actualColorKeywords.some(keyword => clean === keyword || clean.includes(keyword + ' '));
        
        // Exclude brand names, URLs, and non-color terms
        const excludePatterns = ['grimelange', 'zetus', 'nike', 'adidas', 'trendyol', '/', '-', 'x-', 'sarıyer', 'brand'];
        const isExcluded = excludePatterns.some(pattern => clean.includes(pattern));
        
        if (isActualColor && !isExcluded && clean.length < 15 && clean.length > 2) {
          console.log(`✅ Accepting real color: ${c}`);
          return true;
        } else {
          console.log(`🚫 Skipping non-color: ${c}`);
          return false;
        }
      });

      const realSizes = allSizes.filter(s => {
        if (!s || typeof s !== 'string') return false;
        const clean = s.trim().toLowerCase();
        
        // Accept standard sizes including S, M, L, XL, etc.
        const isValidSize = /^(xs|s|m|l|xl|xxl|xxxl|\d+|\d+-\d+)$/i.test(clean) ||
                           clean.match(/^\d{2,3}$/) || // Numeric sizes like 36, 38, 40
                           ['xs', 's', 'm', 'l', 'xl', 'xxl'].includes(clean);
        
        const isNotPlaceholder = clean !== 'os' && 
                                clean !== 'default' && 
                                clean !== 'tek beden' && 
                                clean !== 'n/a' && 
                                clean !== '' && 
                                clean !== 'undefined' &&
                                clean !== 'null';
        
        if (isValidSize && isNotPlaceholder) {
          console.log(`✅ Accepting size: ${s}`);
          return true;
        }
        
        return false;
      });
      
      console.log(`🔍 Final filtered colors: ${realColors.length} (${realColors.join(', ')})`);
      console.log(`🔍 Final filtered sizes: ${realSizes.length} (${realSizes.join(', ')})`);
      
      // Determine variant structure - restore original logic
      const hasColorVariants = realColors.length > 1;
      const hasSizeVariants = realSizes.length > 1;

      console.log(`🔍 Variant structure: ${hasColorVariants ? realColors.length + ' colors' : 'Single color'}, ${hasSizeVariants ? realSizes.length + ' sizes' : 'Single size/No variants'}`);
      
      if (!hasColorVariants && !hasSizeVariants) {
        console.log(`📦 Single product (no variants) - using Default Title`);
        const isMainVariant = true;
          
        const row = [
          handle,
          `${product.brand ? product.brand.toUpperCase() + ' ' : ''}${product.title}`,
          `${product.description || product.title}`,
          product.brand || 'TurMarkt',
          'Apparel & Accessories > Clothing',
          'Giyim',
          `${product.brand ? product.brand.toLowerCase() + ',' : ''}fashion,clothing`,
          'TRUE',
          'Title',
          'Default Title',
          '', '',
          '', '',
          `${handle}-default`,
          '145',
          'shopify',
          '10',
          'continue',
          'manual',
          priceWithMargin,
          '',
          'TRUE',
          'TRUE',
          '',
          product.images.length > 0 ? product.images[0] : '',
          '1',
          `${product.title} - Ana Görsel`,
          'FALSE',
          `${product.brand ? product.brand + ' ' : ''}${product.title}`,
          `${product.brand ? product.brand + ' markası ' : ''}${product.description || product.title}`,
          '212',
          'unisex',
          'adult',
          product.brand || '',
          'new',
          'TRUE',
          product.images.length > 0 ? product.images[0] : '',
          'g',
          ''
        ];
        
        csvRows.push(row.map(cell => {
          const cellStr = String(cell || '');
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(','));
        
      } else {
        // Create variants for actual combinations - using real color names
        console.log(`📦 Creating variants: ${hasColorVariants ? realColors.length + ' colors' : 'single color'} × ${hasSizeVariants ? realSizes.length + ' sizes' : 'single size'}`);
        console.log(`🎨 Real colors found:`, realColors);
        console.log(`📏 Real sizes found:`, realSizes);
        
        let variantCount = 0;
        const colorsToProcess = hasColorVariants ? realColors : [];
        const sizesToProcess = hasSizeVariants ? realSizes : [];
        
        // If no real variants, create single product without options
        if (!hasColorVariants && !hasSizeVariants) {
          const row = [
            handle,
            productTitle,
            bodyHtml,
            brand,
            'Giyim',
            tags,
            'TRUE',
            '', // Empty option1_name
            '', // Empty option1_value
            '', // Empty option2_name
            '', // Empty option2_value
            `${handle}-default`,
            inventory,
            priceWithProfit,
            '',
            originalPrice,
            product.images.length > 0 ? product.images[0] : '',
            'g',
            ''
          ];
          
          csvRows.push(row.map(cell => {
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          }).join(','));
        } else {
          // Create real variants
          for (const color of (colorsToProcess.length > 0 ? colorsToProcess : [''])) {
            for (const size of (sizesToProcess.length > 0 ? sizesToProcess : [''])) {
              variantCount++;
              const isMainVariant = variantCount === 1;
              
              let option1Name, option1Value, option2Name, option2Value;
              
              if (hasColorVariants && hasSizeVariants) {
                option1Name = 'Renk';
                option1Value = color;
                option2Name = 'Beden';
                option2Value = size;
              } else if (hasColorVariants) {
                option1Name = 'Renk';
                option1Value = color;
                option2Name = '';
                option2Value = '';
              } else if (hasSizeVariants) {
                option1Name = 'Beden';
                option1Value = size;
                option2Name = '';
                option2Value = '';
              } else {
                option1Name = '';
                option1Value = '';
                option2Name = '';
                option2Value = '';
              }
            
            // Use variant-specific pricing if available
            let variantPrice = priceWithMargin;
            if (typeof pricing !== 'undefined' && pricing && hasColorVariants && pricing[color]) {
              const colorPrice = parseFloat(pricing[color].toString());
              variantPrice = (colorPrice * 1.1).toFixed(2);
              console.log(`💰 Using variant price for ${color}: ${colorPrice} -> ${variantPrice}`);
            } else if (typeof pricing !== 'undefined' && pricing && hasSizeVariants && pricing[size]) {
              const sizePrice = parseFloat(pricing[size].toString());
              variantPrice = (sizePrice * 1.1).toFixed(2);
              console.log(`💰 Using variant price for ${size}: ${sizePrice} -> ${variantPrice}`);
            }

            const row = [
              handle,
              isMainVariant ? `${product.brand ? product.brand.toUpperCase() + ' ' : ''}${product.title}` : '',
              isMainVariant ? `${product.description || product.title}` : '',
              product.brand || 'TurMarkt',
              'Apparel & Accessories > Clothing',
              'Giyim',
              `${product.brand ? product.brand.toLowerCase() : 'fashion'},clothing`,
              'TRUE',
              option1Name,
              option1Value,
              option2Name,
              option2Value,
              '', '',
              `${handle}-${color || 'default'}-${size || 'default'}`,
              '145',
              'shopify',
              '10',
              'continue',
              'manual',
              variantPrice,
              '',
              'TRUE',
              'TRUE',
              '',
              isMainVariant && product.images.length > 0 ? product.images[0] : '',
              isMainVariant ? '1' : '',
              isMainVariant ? `${product.title} - Ana Görsel` : '',
              'FALSE',
              `${product.brand ? product.brand + ' ' : ''}${product.title}`,
              `${product.brand ? product.brand + ' markası ' : ''}${product.description || product.title}`,
              '212',
              'unisex',
              'adult',
              product.brand || '',
              'new',
              'TRUE',
              isMainVariant && product.images.length > 0 ? product.images[0] : '',
              'g',
              ''
            ];
            
            csvRows.push(row.map(cell => {
              const cellStr = String(cell || '');
              if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return `"${cellStr.replace(/"/g, '""')}"`;
              }
              return cellStr;
            }).join(','));
          }
        }
      }
      
      const csvContent = csvRows.join('\n');
      fs.writeFileSync(outputPath, csvContent, 'utf-8');
      
      console.log(`✅ CSV created: ${outputPath} (${csvRows.length} rows)`);
      
              }
            }
          }
        }
      }
      
      const csvContent = csvRows.join('\n');
      fs.writeFileSync(outputPath, csvContent, 'utf-8');
      
      console.log(`✅ CSV created: ${outputPath} (${csvRows.length} rows)`);
      
      return {
        success: true,
        message: `CSV oluşturuldu: ${csvRows.length - 1} satır`,
        csvPath: outputPath
      };
      
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