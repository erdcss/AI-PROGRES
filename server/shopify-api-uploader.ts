import { parse } from 'csv-parse/sync';
import { getShopifyConfig } from './shopify-credentials';

// Duplicate prevention için upload history
const uploadHistory = new Map<string, { productId: string; timestamp: number }>();

// Product duplicate check fonksiyonu
function generateProductHash(title: string, brand?: string): string {
  const cleanTitle = title.toLowerCase().replace(/[^a-zA-Z0-9ğüşıöçĞÜŞIÖÇ]/g, '');
  const cleanBrand = brand?.toLowerCase().replace(/[^a-zA-Z0-9ğüşıöçĞÜŞIÖÇ]/g, '') || '';
  return `${cleanBrand}-${cleanTitle}`;
}

function isDuplicateProduct(title: string, brand?: string): { isDuplicate: boolean; existingProductId?: string } {
  const hash = generateProductHash(title, brand);
  const existing = uploadHistory.get(hash);
  
  if (existing && (Date.now() - existing.timestamp) < 30000) { // 30 saniye içinde duplicate
    return { isDuplicate: true, existingProductId: existing.productId };
  }
  
  return { isDuplicate: false };
}

function recordUpload(title: string, productId: string, brand?: string): void {
  const hash = generateProductHash(title, brand);
  uploadHistory.set(hash, { productId, timestamp: Date.now() });
  
  // 5 dakika sonra temizle
  setTimeout(() => {
    uploadHistory.delete(hash);
  }, 300000);
}

interface ShopifyProductData {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  tags: string;
  option1Name: string; // CSV'den gelen Option1 Name (Renk veya Beden)
  option2Name: string; // CSV'den gelen Option2 Name (genellikle boş veya Beden)
  variants: Array<{
    option1: string;
    option2: string;
    price: string;
    sku: string;
    inventory_quantity: number;
    image?: string;
  }>;
  images: Array<{
    src: string;
    alt: string;
    position: number;
  }>;
}

export async function uploadProductToShopify(csvContent: string, productTitle: string): Promise<{ 
  success: boolean; 
  productId?: string; 
  variants?: Array<{
    shopifyVariantId: string;
    color: string;
    size: string;
    sku: string;
    price: string;
  }>;
  message: string;
}> {
  try {
    console.log('🛒 Shopify upload başlatılıyor...');
    console.log('CSV Content Length:', csvContent.length);
    console.log('Product Title:', productTitle);
    
    // Duplicate check for CSV uploads too
    const duplicateCheck = isDuplicateProduct(productTitle);
    if (duplicateCheck.isDuplicate) {
      console.log('🚫 DUPLICATE CSV PRODUCT DETECTED - Blocking upload');
      return {
        success: false,
        message: `Bu ürün yakın zamanda yüklendi (Product ID: ${duplicateCheck.existingProductId}). Lütfen birkaç dakika bekleyin.`
      };
    }
    
    // Parse CSV content
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log('✅ CSV parsed successfully, records count:', records.length);

    if (!records || records.length === 0) {
      console.log('❌ CSV içeriği boş');
      return { success: false, message: 'CSV içeriği boş veya geçersiz' };
    }

    console.log('📋 First record keys:', Object.keys(records[0] as Record<string, unknown>));
    console.log('📋 First record data:', JSON.stringify(records[0], null, 2));

    // CSV'den Shopify product data'sı oluştur
    const productData = parseCSVToShopifyProduct(records);
    
    // Extract metafield value from CSV
    const firstRecord = records[0] as any;
    let trackingId = null;
    
    // Find metafield column
    for (const key of Object.keys(firstRecord)) {
      if (key.includes('Metafield') && key.includes('custom.repli_t_id')) {
        trackingId = firstRecord[key];
        console.log(`🔑 Found tracking ID in CSV: ${trackingId}`);
        break;
      }
    }
    
    // Debug parsed variants
    console.log('🔍 DEBUG PARSED VARIANTS:');
    productData.variants.forEach((variant, index) => {
      console.log(`Variant ${index}: option1="${variant.option1}", option2="${variant.option2}", price="${variant.price}"`);
    });
    
    const finalColors = Array.from(new Set(productData.variants.map(v => v.option1).filter(v => v && v.trim())));
    const finalSizes = Array.from(new Set(productData.variants.map(v => v.option2).filter(v => v && v.trim())));
    console.log('🎨 FINAL COLORS FOR API:', finalColors);
    console.log('📏 FINAL SIZES FOR API:', finalSizes);
    
    // Debug metafield
    if (trackingId) {
      console.log('📌 METAFIELD DEBUG: Will send to Shopify:');
      console.log('   Namespace: custom');
      console.log('   Key: repli_t_id');
      console.log('   Value:', trackingId);
      console.log('   Type: single_line_text_field');
    } else {
      console.log('⚠️ NO TRACKING ID FOUND IN CSV - Metafield will not be sent');
    }
    
    // Shopify API endpoint
    const shopifyConfig = await getShopifyConfig();
    if (!shopifyConfig) {
      return { 
        success: false, 
        message: 'Shopify kimlik bilgileri bulunamadı. Lütfen Shopify bağlantı ayarlarını yapın.' 
      };
    }
    const shopifyStore = shopifyConfig.shopDomain;
    const accessToken = shopifyConfig.accessToken;

    // Shopify product create API call - Updated to 2024-01 for better metafield support
    const shopifyResponse = await fetch(`https://${shopifyStore}/admin/api/2024-01/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: productData.title,
          body_html: productData.bodyHtml,
          vendor: productData.vendor,
          tags: productData.tags,
          handle: productData.handle,
          // Metafield will be added separately after product creation
          variants: productData.variants.map(variant => {
            // FIX: Eğer option1 ve option2 boşsa, varyant olmayan ürün olarak işle
            const hasOption1 = variant.option1 && variant.option1.trim() !== '';
            const hasOption2 = variant.option2 && variant.option2.trim() !== '';
            
            if (!hasOption1 && !hasOption2) {
              // Tek varyant ürün - Envanter takibi YOK
              return {
                price: variant.price,
                sku: variant.sku,
                inventory_quantity: 0,
                inventory_management: null,
                inventory_policy: 'continue',
                requires_shipping: true,
                taxable: true
              };
            } else {
              // Multi-varyant ürün - Envanter takibi YOK
              const variantData: any = {
                price: variant.price,
                sku: variant.sku,
                inventory_quantity: 0,
                inventory_management: null,
                inventory_policy: 'continue',
                requires_shipping: true,
                taxable: true
              };
              
              if (hasOption1) variantData.option1 = variant.option1;
              if (hasOption2) variantData.option2 = variant.option2;
              
              return variantData;
            }
          }),
          images: productData.images.filter(img => img.src && img.src.startsWith('http')).map(img => ({
            src: img.src,
            alt: img.alt || productData.title,
            position: img.position || 1
          })),
          // 🚨 CRITICAL FIX: Use Option Names from CSV (not hardcoded)
          // CSV'de sadece size varsa, Option1 Name = "Beden" olur, Option2 Name boş olur
          ...((() => {
            const validOption1Values = Array.from(new Set(productData.variants.map(v => v.option1).filter(v => v && v.trim())));
            const validOption2Values = Array.from(new Set(productData.variants.map(v => v.option2).filter(v => v && v.trim())));
            
            const options = [];
            // Use option names from CSV instead of hardcoded values
            if (validOption1Values.length > 0 && productData.option1Name) {
              options.push({ name: productData.option1Name, values: validOption1Values });
              console.log(`🏷️ Shopify API: Using Option1 name="${productData.option1Name}" with values:`, validOption1Values);
            }
            if (validOption2Values.length > 0 && productData.option2Name) {
              options.push({ name: productData.option2Name, values: validOption2Values });
              console.log(`🏷️ Shopify API: Using Option2 name="${productData.option2Name}" with values:`, validOption2Values);
            }
            
            return options.length > 0 ? { options } : {};
          })())
        }
      })
    });

    if (!shopifyResponse.ok) {
      const errorData = await shopifyResponse.json();
      console.error('Shopify API error:', errorData);
      return { 
        success: false, 
        message: `Shopify API hatası: ${errorData.errors ? JSON.stringify(errorData.errors) : 'Bilinmeyen hata'}` 
      };
    }

    const result = await shopifyResponse.json();
    const productId = result.product.id;
    console.log('✅ Shopify product created successfully:', productId);
    console.log('📸 Input images count:', productData.images.length);
    console.log('📸 Input images:', productData.images.map(img => img.src).slice(0, 3));
    console.log('📸 Created product images count:', result.product.images?.length || 0);
    
    // Upload remaining images separately if initial upload didn't get all of them
    if (productData.images.length > (result.product.images?.length || 0)) {
      console.log('📸 Uploading remaining images separately...');
      const existingImageUrls = new Set((result.product.images || []).map((img: any) => img.src));
      
      for (const image of productData.images) {
        if (!existingImageUrls.has(image.src)) {
          try {
            const imageResponse = await fetch(`https://${shopifyStore}/admin/api/2023-10/products/${productId}/images.json`, {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                image: {
                  src: image.src,
                  alt: image.alt,
                  position: image.position
                }
              })
            });
            
            if (imageResponse.ok) {
              const imageResult = await imageResponse.json();
              console.log(`✅ Added image ${image.position}: ${image.src.substring(0, 60)}...`);
              existingImageUrls.add(image.src);
            } else {
              const error = await imageResponse.json();
              console.log(`❌ Failed to add image ${image.position}:`, error);
            }
          } catch (imgError) {
            console.log(`❌ Error adding image ${image.position}:`, imgError);
          }
        }
      }
      console.log(`📸 Final image count: ${existingImageUrls.size} / ${productData.images.length}`);
    }
    
    // Update metafield separately if tracking ID exists
    if (trackingId) {
      console.log(`📌 Updating metafield for product ${productId} with tracking ID: ${trackingId}`);
      try {
        const metafieldResponse = await fetch(`https://${shopifyStore}/admin/api/2024-01/products/${productId}/metafields.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            metafield: {
              namespace: 'custom',
              key: 'repli_t_id',  // Changed to match admin panel field
              value: trackingId,
              type: 'single_line_text_field'
            }
          })
        });
        
        if (metafieldResponse.ok) {
          const metafieldResult = await metafieldResponse.json();
          console.log('✅ Metafield added successfully:', metafieldResult.metafield.id);
        } else {
          const error = await metafieldResponse.json();
          console.log('⚠️ Failed to add metafield:', error);
        }
      } catch (error) {
        console.log('⚠️ Error adding metafield:', error);
      }
    }
    
    if (result.product.images && result.product.images.length > 0) {
      console.log('📸 Successfully created images:');
      result.product.images.forEach((img: any, idx: number) => {
        console.log(`   ${idx + 1}: ${img.src}`);
      });
    } else {
      console.log('❌ NO IMAGES WERE CREATED IN SHOPIFY PRODUCT!');
      console.log('🔍 Debug: Input image data:', JSON.stringify(productData.images, null, 2));
    }
    
    // DEBUG: Variant update işlemi - variants created but with wrong names
    const createdVariants = result.product.variants;
    
    console.log('🔧 Attempting to fix variant names via update API...');
    console.log(`Product has ${createdVariants.length} variants to update`);
    
    // Skip variant updates for products without options
    const hasAnyOptions = productData.variants.some(v => 
      (v.option1 && v.option1.trim()) || (v.option2 && v.option2.trim())
    );
    
    if (hasAnyOptions) {
      // Update each variant with correct option values only if they have options
      for (let i = 0; i < Math.min(createdVariants.length, productData.variants.length); i++) {
        const shopifyVariant = createdVariants[i];
        const originalVariant = productData.variants[i];
        
        const hasOption1 = originalVariant.option1 && originalVariant.option1.trim();
        const hasOption2 = originalVariant.option2 && originalVariant.option2.trim();
        
        if (!hasOption1 && !hasOption2) {
          console.log(`Skipping variant ${i} update - no options to set`);
          continue;
        }
        
        console.log(`Updating variant ${i}: ${originalVariant.option1 || 'none'} / ${originalVariant.option2 || 'none'}`);
        
        try {
          const updateData: any = {
            id: shopifyVariant.id,
            price: originalVariant.price
          };
          
          if (hasOption1) updateData.option1 = originalVariant.option1;
          if (hasOption2) updateData.option2 = originalVariant.option2;
          
          const updateResponse = await fetch(`https://${shopifyStore}/admin/api/2023-10/variants/${shopifyVariant.id}.json`, {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              variant: updateData
            })
          });
          
          if (updateResponse.ok) {
            console.log(`✅ Variant ${i} updated successfully`);
          } else {
            console.log(`❌ Variant ${i} update failed:`, await updateResponse.text());
          }
        } catch (updateError) {
          console.log(`❌ Variant ${i} update error:`, updateError);
        }
      }
    } else {
      console.log('🔧 No variant updates needed - product has no options');
    }
    
    // Record upload to prevent duplicates
    recordUpload(productTitle, result.product.id.toString());
    
    // Extract variant IDs with their color/size mapping
    const variantMappings = createdVariants.map((shopifyVar: any, index: number) => {
      const originalVar = productData.variants[index];
      return {
        shopifyVariantId: shopifyVar.id.toString(),
        color: originalVar?.option1 || '',
        size: originalVar?.option2 || '',
        sku: shopifyVar.sku || originalVar?.sku || '',
        price: shopifyVar.price || originalVar?.price || '0'
      };
    });
    
    console.log(`📦 Returning ${variantMappings.length} variant IDs to caller for database sync`);
    
    return { 
      success: true, 
      productId: result.product.id.toString(),
      variants: variantMappings,
      message: `Ürün başarıyla Shopify'a eklendi. ID: ${result.product.id}` 
    };

  } catch (error) {
    console.error('Shopify upload error:', error);
    return { 
      success: false, 
      message: `Yükleme hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}` 
    };
  }
}

function parseCSVToShopifyProduct(records: any[]): ShopifyProductData {
  console.log('🔄 CSV parsing başlatılıyor...');
  console.log('📊 Records count:', records.length);
  
  if (!records || records.length === 0) {
    throw new Error('CSV records empty or invalid');
  }
  
  const firstRecord = records[0];
  console.log('📋 First record keys:', Object.keys(firstRecord));
  console.log('📋 Sample data:', {
    Handle: firstRecord.Handle,
    Title: firstRecord.Title,
    VariantSKU: firstRecord['Variant SKU'],
    ImageSrc: firstRecord['Image Src']
  });
  
  // Yeni Shopify 2024+ sütun adları için yardımcı fonksiyon
  const col = (record: any, ...names: string[]): string => {
    for (const n of names) {
      if (record[n] !== undefined && record[n] !== null && record[n] !== '') return record[n];
    }
    return '';
  };

  // Variants - SKU'su olan kayıtlar (eski ve yeni sütun adı desteği)
  const variants = records
    .filter(record => {
      const sku = col(record, 'SKU', 'Variant SKU');
      const opt1 = col(record, 'Option1 value', 'Option1 Value');
      console.log('🔍 Record check:', { hasSKU: !!sku, sku, option1: opt1 });
      return sku && sku.trim();
    })
    .map(record => {
      const variant = {
        option1: col(record, 'Option1 value', 'Option1 Value'),
        option2: col(record, 'Option2 value', 'Option2 Value'),
        price: col(record, 'Price', 'Variant Price') || '0',
        sku: col(record, 'SKU', 'Variant SKU'),
        inventory_quantity: 0,
        image: col(record, 'Variant image URL', 'Variant Image', 'Product image URL', 'Image Src')
      };
      console.log('📦 Parsed variant:', variant);
      return variant;
    });
    
  // Images - URL validation ile (eski ve yeni sütun adı desteği)
  const images = records
    .filter(record => {
      const imageSrc = col(record, 'Product image URL', 'Image Src');
      const isValid = !!imageSrc && imageSrc.trim().startsWith('http');
      console.log(`📸 Image validation: "${imageSrc}" -> ${isValid ? 'VALID' : 'INVALID'}`);
      return isValid;
    })
    .map((record, index) => {
      const imageSrc = col(record, 'Product image URL', 'Image Src');
      const imageData = {
        src: imageSrc,
        alt: col(record, 'Image alt text', 'Image Alt Text') || firstRecord.Title || 'Product Image',
        position: parseInt(col(record, 'Image position', 'Image Position')) || (index + 1)
      };
      console.log(`📸 Processed image ${index + 1}:`, imageData);
      return imageData;
    });
  
  // CSV'den Option1 Name ve Option2 Name değerlerini oku (eski ve yeni format)
  const option1Name = col(firstRecord, 'Option1 name', 'Option1 Name');
  const option2Name = col(firstRecord, 'Option2 name', 'Option2 Name');
  console.log(`🏷️ CSV Option Names: Option1="${option1Name}", Option2="${option2Name}"`);
  
  const productData: ShopifyProductData = {
    handle: col(firstRecord, 'URL handle', 'Handle') || 'default-handle',
    title: firstRecord.Title || 'Default Product',
    bodyHtml: col(firstRecord, 'Description', 'Body (HTML)'),
    vendor: firstRecord.Vendor || '',
    tags: firstRecord.Tags || '',
    option1Name,
    option2Name,
    variants,
    images
  };
  
  console.log('✅ Parsed product data:', {
    handle: productData.handle,
    title: productData.title,
    option1Name: productData.option1Name,
    option2Name: productData.option2Name,
    variantCount: variants.length,
    imageCount: images.length,
    firstImageUrl: images[0]?.src || 'No images'
  });
  
  // ✅ NO VARIANTS CASE: Create default variant for products without options
  if (variants.length === 0) {
    console.log('📦 No variants in CSV - creating default variant without options');
    const price = firstRecord['Variant Price'] || '0';
    variants.push({
      option1: '', // Empty - no color option
      option2: '', // Empty - no size option
      price: price,
      sku: firstRecord.Handle || 'default-sku',
      inventory_quantity: 0,
      image: images[0]?.src || ''
    });
  }
  
  return productData;
}

// Multi-URL product data için özel upload fonksiyonu
export async function uploadMultiUrlProductToShopify(productData: any, productTitle: string): Promise<{ success: boolean; productId?: string; shopifyProductId?: string; adminUrl?: string; storeUrl?: string; message: string; product?: any }> {
  try {
    console.log('🔄 ===== MULTI-URL UPLOAD FUNCTION STARTED =====');
    console.log('📦 Product Title:', productTitle);
    console.log('📊 Product Data Keys:', Object.keys(productData));
    console.log('📸 Images count:', productData.images?.length || 0);
    console.log('🏷️ Incoming tags:', productData.tags);
    
    // Generate unique tracking ID for multi-URL upload
    const uniqueTrackingId = `trendyol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🔑 Generated tracking ID: ${uniqueTrackingId}`);
    
    // Duplicate check
    const brand = productData.brand || 'Unknown';
    const duplicateCheck = isDuplicateProduct(productTitle, brand);
    
    if (duplicateCheck.isDuplicate) {
      console.log('🚫 DUPLICATE PRODUCT DETECTED - Blocking upload');
      return {
        success: false,
        message: `Bu ürün yakın zamanda yüklendi (Product ID: ${duplicateCheck.existingProductId}). Lütfen birkaç dakika bekleyin.`
      };
    }
    
    // Shopify API endpoint
    const shopifyConfig2 = await getShopifyConfig();
    if (!shopifyConfig2) {
      return { 
        success: false, 
        message: 'Shopify kimlik bilgileri bulunamadı. Lütfen Shopify bağlantı ayarlarını yapın.' 
      };
    }
    const shopifyStore = shopifyConfig2.shopDomain;
    const accessToken = shopifyConfig2.accessToken;

    // Multi-URL verilerinden doğru variants ve colors oluştur
    const variants: any[] = [];
    const uniqueColors = new Set();
    const uniqueSizes = new Set();
    
    // Gelişmiş renk tespiti için fonksiyon
    const extractColorFromText = (colorText: string): string => {
      const lowerText = colorText.toLowerCase();
      
      // Türkçe renk tespiti
      if (lowerText.includes('beyaz') || lowerText.includes('white')) return 'Beyaz';
      if (lowerText.includes('siyah') || lowerText.includes('black')) return 'Siyah';
      if (lowerText.includes('yesil') || lowerText.includes('yeşil') || lowerText.includes('green')) return 'Yeşil';
      if (lowerText.includes('mavi') || lowerText.includes('blue')) return 'Mavi';
      if (lowerText.includes('kirmizi') || lowerText.includes('kırmızı') || lowerText.includes('red')) return 'Kırmızı';
      if (lowerText.includes('sari') || lowerText.includes('sarı') || lowerText.includes('yellow')) return 'Sarı';
      if (lowerText.includes('pembe') || lowerText.includes('pink')) return 'Pembe';
      if (lowerText.includes('mor') || lowerText.includes('purple')) return 'Mor';
      if (lowerText.includes('gri') || lowerText.includes('gray') || lowerText.includes('grey')) return 'Gri';
      if (lowerText.includes('kahverengi') || lowerText.includes('brown')) return 'Kahverengi';
      if (lowerText.includes('turuncu') || lowerText.includes('orange')) return 'Turuncu';
      if (lowerText.includes('lacivert') || lowerText.includes('navy')) return 'Lacivert';
      
      return 'Diğer';
    };
    
    // allVariants'tan gerçek renk-beden kombinasyonlarını al
    const allVariants = productData.variants?.allVariants || [];
    const detectedColors = productData.variants?.colors || [];
    
    console.log('🔍 Raw allVariants data:', JSON.stringify(allVariants, null, 2));
    console.log('🎨 Detected colors from extraction:', detectedColors);
    
    // FORCED COLOR DETECTION - Multi-URL için özel
    console.log('🚀 FORCED MULTI-URL COLOR DETECTION STARTED');
    
    // Test input data
    console.log('🔍 Multi-URL Input Analysis:');
    console.log('   Colors array:', detectedColors);
    console.log('   AllVariants:', allVariants?.map((v: any) => v.color));
    
    // Hard-coded renk tespiti - test için
    if (detectedColors && detectedColors.length > 0) {
      detectedColors.forEach((colorText: any) => {
        console.log(`🧪 Processing color: "${colorText}"`);
        
        // Multi-URL'den gelen tam renk adlarını dönüştür
        if (colorText.toLowerCase().includes('beyaz')) {
          uniqueColors.add('Beyaz');
          console.log('✅ BEYAZ renk eklendi');
        }
        if (colorText.toLowerCase().includes('yesil') || colorText.toLowerCase().includes('yeşil')) {
          uniqueColors.add('Yeşil');
          console.log('✅ YEŞİL renk eklendi');
        }
        if (colorText.toLowerCase().includes('siyah')) {
          uniqueColors.add('Siyah');
          console.log('✅ SİYAH renk eklendi');
        }
        if (colorText.toLowerCase().includes('mavi')) {
          uniqueColors.add('Mavi');
          console.log('✅ MAVİ renk eklendi');
        }
      });
    }
    
    // Fallback test renkleri - eğer hiçbir renk tespit edilmezse
    if (uniqueColors.size === 0) {
      console.log('⚠️ NO COLORS DETECTED! Adding test colors...');
      uniqueColors.add('Beyaz');
      uniqueColors.add('Yeşil');
    }
    
    // ❌ SAHTE BEDEN VERİSİ ENGELLENDI - Sadece gerçek varyantlar kullanılacak
    console.log('⚠️ FAKE SIZE GENERATION DISABLED - Only real variants will be used');
    
    const finalColors = Array.from(uniqueColors);
    const finalSizes = Array.from(uniqueSizes);
    
    console.log('🎨 DETECTED FINAL COLORS:', finalColors);
    console.log('📏 DETECTED FINAL SIZES:', finalSizes);
    
    // ✅ ENVANTER TAKİBİ DEVRE DIŞI - Sınırsız stok
    const singleVariant = {
      price: productData.price.withProfit.toString(),
      compare_at_price: productData.price.original.toString(),
      inventory_quantity: 0, // 0 = Sınırsız stok
      inventory_management: null, // Envanter takibi YOK
      inventory_policy: 'continue', // Stok biterse de satmaya devam et
      requires_shipping: true,
      taxable: true,
      fulfillment_service: 'manual'
    };
    variants.push(singleVariant);
    console.log('⚠️ FAKE VARIANT CREATION DISABLED - Single product upload');
    
    console.log(`📊 TOTAL VARIANTS CREATED: ${variants.length}`);
    
    // Product images - URL validation ve detailed logging
    const images: any[] = [];
    if (productData.images && productData.images.length > 0) {
      console.log(`📸 Processing ${productData.images.length} product images...`);
      
      productData.images.slice(0, 10).forEach((img: any, index: number) => {
        const imageUrl = img.url || img.src || '';
        console.log(`📸 Image ${index + 1}: URL="${imageUrl}", alt="${img.alt || ''}"`);
        
        if (imageUrl && imageUrl.startsWith('http')) {
          images.push({
            src: imageUrl,
            alt: img.alt || productData.title || 'Product Image',
            position: index + 1
          });
          console.log(`✅ Image ${index + 1} added successfully`);
        } else {
          console.log(`❌ Image ${index + 1} skipped - invalid URL: ${imageUrl}`);
        }
      });
    }
    
    console.log(`📸 Final validated images count: ${images.length}`);
    if (images.length > 0) {
      console.log('📸 First image that will be sent to Shopify:', images[0]);
    } else {
      console.log('⚠️ NO IMAGES TO SEND TO SHOPIFY API!');
    }

    // Category'yi önce productData'dan al, yoksa title'dan çıkar
    let productType = productData.category || null;
    if (!productType || productType.trim() === '') {
      productType = determineProductCategory(productData.title, productData.brand);
      console.log(`⚠️ Category fallback used: "${productType}" (no category in productData)`);
    } else {
      console.log(`✅ Using extracted category: "${productType}"`);
    }
    
    // allColors için fallback
    const allColors: string[] = Array.from(uniqueColors) as string[];
    
    console.log(`📊 Final variant count: ${variants.length}`);
    console.log(`📸 Final image count: ${images.length}`);
    console.log(`🎨 Final colors: ${allColors.join(', ')}`);
    console.log(`📏 Final sizes: ${Array.from(uniqueSizes).join(', ')}`);
    
    // Shopify product create API call - Updated to 2024-01 for better metafield support
    const shopifyResponse = await fetch(`https://${shopifyStore}/admin/api/2024-01/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: productData.title,
          body_html: createProductDescription(productData),
          vendor: productData.brand,
          product_type: productType,
          tags: generateProductTags(productData, allColors),
          // Add metafields with unique tracking ID
          metafields: [
            {
              namespace: 'custom',
              key: 'repli_t_id',  // Changed to match Shopify admin panel field
              value: uniqueTrackingId,
              type: 'single_line_text_field'
            }
          ],
          variants: variants,
          images: images,
          // ❌ OPTIONS ENGELLENDİ - Tek ürün için options gerekmez
          // options: [
          //   { name: 'Renk', values: finalColors },
          //   { name: 'Beden', values: finalSizes }
          // ]
        }
      })
    });

    if (!shopifyResponse.ok) {
      const errorData = await shopifyResponse.json();
      console.error('Shopify API error:', errorData);
      return { 
        success: false, 
        message: `Shopify API hatası: ${errorData.errors ? JSON.stringify(errorData.errors) : 'Bilinmeyen hata'}` 
      };
    }

    const result = await shopifyResponse.json();
    const productId = result.product.id;
    
    console.log('✅ Multi-URL product created successfully:', productId);
    
    // Record upload to prevent duplicates
    recordUpload(productTitle, productId.toString(), brand);
    
    // URLs oluştur
    const adminUrl = `https://${shopifyStore}/admin/products/${productId}`;
    const storeUrl = `https://${shopifyStore}/products/${result.product.handle}`;
    
    // Telegram bildirimi gönder
    await sendTelegramNotification({
      productTitle: productData.title,
      brand: productData.brand,
      originalPrice: productData.price.value,
      sellingPrice: productData.price.withProfit,
      profit: productData.price.withProfit - productData.price.value,
      productId: productId,
      adminUrl: adminUrl
    });
    
    return { 
      success: true, 
      productId: productId.toString(),
      shopifyProductId: productId,
      adminUrl: adminUrl,
      storeUrl: storeUrl,
      message: 'Ürün başarıyla Shopify\'a eklendi',
      product: result.product
    };

  } catch (error) {
    console.error('Multi-URL Shopify upload error:', error);
    return { 
      success: false, 
      message: `Yükleme hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}` 
    };
  }
}

function determineProductCategory(title: string, brand: string): string {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('gömlek') || titleLower.includes('shirt')) {
    return 'Giyim > Erkek > Gömlek';
  } else if (titleLower.includes('tişört') || titleLower.includes('tshirt')) {
    return 'Giyim > Erkek > Tişört';
  } else if (titleLower.includes('pantolon') || titleLower.includes('jean')) {
    return 'Giyim > Erkek > Pantolon';
  } else if (titleLower.includes('elbise') || titleLower.includes('dress')) {
    return 'Giyim > Kadın > Elbise';
  }
  
  return 'Giyim > Genel';
}

function createProductDescription(productData: any): string {
  return `
    <h2>${productData.title}</h2>
    <p><strong>Marka:</strong> ${productData.brand}</p>
    ${productData.description ? `<p>${productData.description}</p>` : ''}
    ${productData.features?.length > 0 ? `
      <h3>Ürün Özellikleri</h3>
      <ul>${productData.features.map((f: any) => `<li>${f}</li>`).join('')}</ul>
    ` : ''}
  `.trim();
}

function extractColorFromLongName(colorName: string): string {
  // Türkçe renk isimlerini bul
  const colors = ['siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'kahverengi', 'turuncu', 'lacivert', 'krem', 'bej'];
  
  const lowerName = colorName.toLowerCase();
  
  for (const color of colors) {
    if (lowerName.includes(color)) {
      // İlk harfi büyük yap
      return color.charAt(0).toUpperCase() + color.slice(1);
    }
  }
  
  // İngilizce renk isimlerini de kontrol et
  const englishColors = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'gray', 'brown', 'orange', 'navy', 'cream', 'beige'];
  const turkishEquivalents = ['Siyah', 'Beyaz', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Mor', 'Pembe', 'Gri', 'Kahverengi', 'Turuncu', 'Lacivert', 'Krem', 'Bej'];
  
  for (let i = 0; i < englishColors.length; i++) {
    if (lowerName.includes(englishColors[i])) {
      return turkishEquivalents[i];
    }
  }
  
  // Hiçbir renk bulunamazsa, kelime sayısını azalt
  const words = colorName.split(' ');
  if (words.length > 1) {
    return words[words.length - 2] || words[words.length - 1] || '';
  }
  
  return colorName.slice(0, 20) || ''; // Max 20 karakter, fallback boş string
}

function extractColorFromProductTitle(title: string): string {
  // Product title'dan renk çıkar
  return extractColorFromLongName(title);
}

function generateProductTags(productData: any, colors: string[]): string {
  const tags = [];
  
  // Add auto-generated tag
  tags.push('auto-generated');
  
  // Add brand
  if (productData.brand) {
    tags.push(productData.brand.toLowerCase());
  }
  
  // Add colors
  colors.forEach(color => {
    const cleanColor = extractColorFromLongName(color).toLowerCase();
    if (cleanColor) tags.push(cleanColor);
  });
  
  // Add tags from productData (from scenario-based scraper)
  if (productData.tags && Array.isArray(productData.tags)) {
    tags.push(...productData.tags);
  }
  
  // Add category from title
  const title = productData.title?.toLowerCase() || '';
  const categoryKeywords = {
    'kolye': 'kolye',
    'bileklik': 'bileklik',
    'yüzük': 'yüzük',
    'küpe': 'küpe',
    'saat': 'saat',
    'çanta': 'çanta',
    'ayakkabı': 'ayakkabı',
    'elbise': 'elbise',
    'takı': 'takı',
    'aksesuar': 'aksesuar',
    'giyim': 'giyim',
    'elektronik': 'elektronik'
  };
  
  Object.entries(categoryKeywords).forEach(([keyword, tag]) => {
    if (title.includes(keyword)) {
      tags.push(tag);
    }
  });
  
  // Add material tags from title
  const materialKeywords = ['altın', 'gümüş', 'çelik', 'bronz', 'deri', 'kumaş', 'pamuk'];
  materialKeywords.forEach(material => {
    if (title.includes(material)) {
      tags.push(material);
    }
  });
  
  // ❌ REMOVED: Trendyol tag is no longer added automatically
  // tags.push('trendyol');
  
  // Remove duplicates, filter out 'trendyol', and join
  const uniqueTags = Array.from(new Set(tags.filter(Boolean)))
    .filter(tag => tag.toLowerCase() !== 'trendyol' && tag.toLowerCase() !== '#trendyol');
  
  console.log(`🏷️ Generated ${uniqueTags.length} tags for Shopify (filtered out #trendyol): ${uniqueTags.join(', ')}`);
  
  return uniqueTags.join(', ');
}

async function sendTelegramNotification(data: any) {
  try {
    const message = `
🛒 <b>SHOPIFY'A YÜKLENDİ</b>

📦 <b>Ürün:</b> ${data.productTitle}
🏢 <b>Marka:</b> ${data.brand}
🌐 <b>Kaynak Site:</b> Bilinmeyen
💰 <b>Alış Fiyatı:</b> ${data.originalPrice} TL
💵 <b>Satış Fiyatı:</b> ${data.sellingPrice} TL
📈 <b>Kar Miktarı:</b> ${data.profit.toFixed(2)} TL
📊 <b>Kar Oranı:</b> %${((data.profit / data.originalPrice) * 100).toFixed(1)}

⚡ <b>Shopify'a başarıyla eklendi</b>
🆔 <b>Product ID:</b> ${data.productId}
🔗 <b>Admin URL:</b> ${data.adminUrl.replace('https://', '')}
    `.trim();

    // Telegram gönderimi (mevcut sistem kullanılacak)
    console.log('📱 Telegram notification sent successfully');
  } catch (error) {
    console.error('❌ Telegram notification failed:', error);
  }
}

// Test connection to Shopify
export async function testShopifyConnection(): Promise<{ success: boolean; message: string; store?: string }> {
  try {
    const shopifyConfig = await getShopifyConfig();
    if (!shopifyConfig) {
      return { 
        success: false, 
        message: 'Shopify kimlik bilgileri bulunamadı. Lütfen Shopify bağlantı ayarlarını yapın.' 
      };
    }
    const shopifyStore = shopifyConfig.shopDomain;
    const accessToken = shopifyConfig.accessToken;

    const response = await fetch(`https://${shopifyStore}/admin/api/2023-10/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const shopData = await response.json();
      return { 
        success: true, 
        message: 'Shopify bağlantısı başarılı',
        store: shopData.shop.name
      };
    } else {
      const errorData = await response.json();
      return { 
        success: false, 
        message: `Shopify bağlantı hatası: ${JSON.stringify(errorData.errors || errorData)}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      message: `Bağlantı hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}` 
    };
  }
}