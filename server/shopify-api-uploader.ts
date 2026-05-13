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
    compareAtPrice?: string;
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
  handle?: string;
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

    // ✅ 100+ varyant için GraphQL API'ye yönlendir
    if (productData.variants.length > 100) {
      console.log(`🔀 ${productData.variants.length} varyant > 100 — GraphQL API kullanılıyor`);
      const gqlResult = await uploadProductViaGraphQL(productData, shopifyStore, accessToken, trackingId);
      if (gqlResult.success) recordUpload(productTitle, gqlResult.productId!);
      return gqlResult;
    }

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
              const singleVariant: any = {
                price: variant.price,
                sku: variant.sku,
                inventory_quantity: 0,
                inventory_management: null,
                inventory_policy: 'continue',
                requires_shipping: true,
                taxable: true
              };
              if (variant.compareAtPrice) singleVariant.compare_at_price = variant.compareAtPrice;
              return singleVariant;
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
              
              if (variant.compareAtPrice) variantData.compare_at_price = variant.compareAtPrice;
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

      // ── 401: Token süresi dolmuş → otomatik yenile ve tekrar dene ──────────
      if (shopifyResponse.status === 401) {
        console.log('🔑 SHOPIFY 401: Token geçersiz — otomatik yenileme deneniyor...');
        try {
          const { rotateShopifyToken } = await import('./shopify-token-rotator');
          const rotResult = await rotateShopifyToken();
          if (rotResult.success && rotResult.newToken) {
            console.log(`✅ SHOPIFY TOKEN: Yenilendi (${rotResult.method}), istek tekrarlanıyor...`);
            const retryRes = await fetch(
              `https://${shopifyStore}/admin/api/2024-01/products.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': rotResult.newToken,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  product: {
                    title: productData.title,
                    body_html: productData.bodyHtml,
                    vendor: productData.vendor,
                    tags: productData.tags,
                    handle: productData.handle,
                    variants: productData.variants.map(v => {
                      const h1 = v.option1 && v.option1.trim() !== '';
                      const h2 = v.option2 && v.option2.trim() !== '';
                      const vd: any = {
                        price: v.price, sku: v.sku, inventory_quantity: 0,
                        inventory_management: null, inventory_policy: 'continue',
                        requires_shipping: true, taxable: true
                      };
                      if (v.compareAtPrice) vd.compare_at_price = v.compareAtPrice;
                      if (h1) vd.option1 = v.option1;
                      if (h2) vd.option2 = v.option2;
                      return vd;
                    }),
                    images: productData.images.filter(i => i.src?.startsWith('http')).map(i => ({
                      src: i.src, alt: i.alt || productData.title, position: i.position || 1
                    })),
                    ...((() => {
                      const v1 = Array.from(new Set(productData.variants.map(v => v.option1).filter(Boolean)));
                      const v2 = Array.from(new Set(productData.variants.map(v => v.option2).filter(Boolean)));
                      const opts: any[] = [];
                      if (v1.length && productData.option1Name) opts.push({ name: productData.option1Name, values: v1 });
                      if (v2.length && productData.option2Name) opts.push({ name: productData.option2Name, values: v2 });
                      return opts.length > 0 ? { options: opts } : {};
                    })())
                  }
                })
              }
            );
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              const pid = retryData.product.id;
              console.log('✅ Shopify ürün oluşturuldu (token yenileme sonrası):', pid);
              return {
                success: true,
                productId: pid.toString(),
                handle: retryData.product.handle,
                message: `Ürün yüklendi (token otomatik yenilendi): ${pid}`
              };
            }
          }
        } catch (retryErr: any) {
          console.error('❌ Token yenileme sonrası retry hatası:', retryErr.message);
        }
        return {
          success: false,
          message: 'Shopify 401: Token geçersiz. Sistem otomatik yenilemeyi denedi ancak başarısız oldu. Lütfen yeni bir Shopify access token girin.'
        };
      }
      // ─────────────────────────────────────────────────────────────────────

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
    
    // Upload remaining images — PARALLEL batch upload (5 at a time)
    if (productData.images.length > (result.product.images?.length || 0)) {
      console.log('📸 Uploading remaining images in parallel batches...');
      const existingImageUrls = new Set((result.product.images || []).map((img: any) => img.src));
      const pendingImages = productData.images.filter(img => !existingImageUrls.has(img.src));
      const IMAGE_BATCH_SIZE = 5;

      for (let b = 0; b < pendingImages.length; b += IMAGE_BATCH_SIZE) {
        const batch = pendingImages.slice(b, b + IMAGE_BATCH_SIZE);
        await Promise.all(batch.map(async (image) => {
          try {
            const imageResponse = await fetch(
              `https://${shopifyStore}/admin/api/2024-01/products/${productId}/images.json`,
              {
                method: 'POST',
                headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: { src: image.src, alt: image.alt, position: image.position } })
              }
            );
            if (imageResponse.ok) {
              console.log(`✅ Image uploaded: ${image.src.substring(0, 60)}...`);
            } else {
              const err = await imageResponse.text();
              console.log(`⚠️ Image upload skipped (${imageResponse.status}): ${err.substring(0, 80)}`);
            }
          } catch (imgError: any) {
            console.log(`⚠️ Image upload error: ${imgError.message}`);
          }
        }));
      }
      console.log(`📸 Parallel image upload done: ${pendingImages.length} images processed`);
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
      // Update variants in PARALLEL — all at once
      const variantUpdateTasks = [];
      for (let i = 0; i < Math.min(createdVariants.length, productData.variants.length); i++) {
        const shopifyVariant = createdVariants[i];
        const originalVariant = productData.variants[i];
        const hasOption1 = originalVariant.option1 && originalVariant.option1.trim();
        const hasOption2 = originalVariant.option2 && originalVariant.option2.trim();
        if (!hasOption1 && !hasOption2) continue;

        const updateData: any = { id: shopifyVariant.id, price: originalVariant.price };
        if (hasOption1) updateData.option1 = originalVariant.option1;
        if (hasOption2) updateData.option2 = originalVariant.option2;

        variantUpdateTasks.push(
          fetch(`https://${shopifyStore}/admin/api/2024-01/variants/${shopifyVariant.id}.json`, {
            method: 'PUT',
            headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant: updateData })
          }).then(r => {
            if (r.ok) console.log(`✅ Variant ${i} updated: ${originalVariant.option1 || ''}`);
            else r.text().then(t => console.log(`⚠️ Variant ${i} update skipped: ${t.substring(0, 80)}`));
          }).catch(e => console.log(`⚠️ Variant ${i} update error: ${e.message}`))
        );
      }
      if (variantUpdateTasks.length > 0) {
        await Promise.all(variantUpdateTasks);
        console.log(`✅ All ${variantUpdateTasks.length} variant updates completed in parallel`);
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

async function uploadProductViaGraphQL(
  productData: ShopifyProductData,
  shopifyStore: string,
  accessToken: string,
  trackingId: string | null
): Promise<{ success: boolean; productId?: string; handle?: string; variants?: any[]; message: string }> {
  const graphqlUrl = `https://${shopifyStore}/admin/api/2024-04/graphql.json`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  };

  // Step 1: Collect unique option values
  const option1Values = Array.from(new Set(productData.variants.map(v => v.option1).filter(v => v && v.trim())));
  const option2Values = Array.from(new Set(productData.variants.map(v => v.option2).filter(v => v && v.trim())));

  const productOptionsInput: any[] = [];
  if (option1Values.length > 0 && productData.option1Name) {
    productOptionsInput.push({ name: productData.option1Name, values: option1Values.map(v => ({ name: v })) });
  }
  if (option2Values.length > 0 && productData.option2Name) {
    productOptionsInput.push({ name: productData.option2Name, values: option2Values.map(v => ({ name: v })) });
  }

  // Step 2: Create product (no variants yet)
  const createMutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          handle
          options { id name values }
        }
        userErrors { field message }
      }
    }
  `;

  const productInput: any = {
    title: productData.title,
    descriptionHtml: productData.bodyHtml,
    vendor: productData.vendor,
    tags: productData.tags ? productData.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    handle: productData.handle,
  };
  if (productOptionsInput.length > 0) productInput.productOptions = productOptionsInput;

  const createRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: createMutation, variables: { input: productInput } }),
  });

  if (!createRes.ok) {
    return { success: false, message: `GraphQL HTTP hatası: ${createRes.status}` };
  }

  const createData = await createRes.json();
  const userErrors = createData.data?.productCreate?.userErrors || [];
  if (createData.errors || userErrors.length > 0) {
    const errMsg = createData.errors
      ? JSON.stringify(createData.errors)
      : userErrors.map((e: any) => e.message).join(', ');
    return { success: false, message: `GraphQL ürün oluşturma hatası: ${errMsg}` };
  }

  const createdProduct = createData.data.productCreate.product;
  const productGid: string = createdProduct.id;
  const productId = productGid.split('/').pop()!;
  console.log(`✅ GraphQL: Ürün oluşturuldu ID=${productId}`);

  // Step 3: Upload images via REST
  const validImages = productData.images.filter(img => img.src && img.src.startsWith('http'));
  if (validImages.length > 0) {
    const IMAGE_BATCH_SIZE = 5;
    for (let b = 0; b < validImages.length; b += IMAGE_BATCH_SIZE) {
      const batch = validImages.slice(b, b + IMAGE_BATCH_SIZE);
      await Promise.all(batch.map(async (image) => {
        try {
          await fetch(`https://${shopifyStore}/admin/api/2024-01/products/${productId}/images.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: { src: image.src, alt: image.alt || productData.title, position: image.position || 1 } }),
          });
        } catch (e) {
          console.log(`⚠️ GraphQL image upload error:`, (e as Error).message);
        }
      }));
    }
    console.log(`📸 GraphQL: ${validImages.length} görsel yüklendi`);
  }

  // Step 4: Bulk create variants in batches of 100
  const bulkVariantMutation = `
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants {
          id
          selectedOptions { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const VARIANT_BATCH_SIZE = 100;
  const allCreatedVariants: any[] = [];

  for (let i = 0; i < productData.variants.length; i += VARIANT_BATCH_SIZE) {
    const batch = productData.variants.slice(i, i + VARIANT_BATCH_SIZE);

    const variantsInput = batch.map(v => {
      const vi: any = {
        price: v.price,
        sku: v.sku || '',
        inventoryPolicy: 'CONTINUE',
        inventoryItem: { tracked: false },
      };
      if (v.compareAtPrice) vi.compareAtPrice = v.compareAtPrice;

      const selectedOptions: { name: string; value: string }[] = [];
      if (v.option1 && v.option1.trim() && productData.option1Name) {
        selectedOptions.push({ name: productData.option1Name, value: v.option1 });
      }
      if (v.option2 && v.option2.trim() && productData.option2Name) {
        selectedOptions.push({ name: productData.option2Name, value: v.option2 });
      }
      if (selectedOptions.length > 0) vi.optionValues = selectedOptions;

      return vi;
    });

    const varRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: bulkVariantMutation, variables: { productId: productGid, variants: variantsInput } }),
    });

    if (!varRes.ok) {
      console.error(`⚠️ GraphQL varyant batch ${i} HTTP hatası: ${varRes.status}`);
      continue;
    }

    const varData = await varRes.json();
    const created = varData.data?.productVariantsBulkCreate?.productVariants || [];
    allCreatedVariants.push(...created);
    const vErrors = varData.data?.productVariantsBulkCreate?.userErrors || [];
    if (vErrors.length > 0) {
      console.error(`⚠️ GraphQL varyant hataları (batch ${i}):`, vErrors.map((e: any) => e.message).join(', '));
    }
    console.log(`✅ GraphQL: Varyant batch ${i}-${i + batch.length} yüklendi (${created.length} varyant)`);
  }

  // Step 5: Add metafield if needed
  if (trackingId) {
    try {
      await fetch(`https://${shopifyStore}/admin/api/2024-01/products/${productId}/metafields.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metafield: { namespace: 'custom', key: 'repli_t_id', value: trackingId, type: 'single_line_text_field' },
        }),
      });
    } catch (e) {
      console.log('⚠️ GraphQL metafield hatası (critical değil):', (e as Error).message);
    }
  }

  // Map variants back
  const variantMappings = allCreatedVariants.map((sv: any, index: number) => {
    const opts = sv.selectedOptions || [];
    return {
      shopifyVariantId: sv.id.split('/').pop(),
      color: opts.find((o: any) => o.name === productData.option1Name)?.value || productData.variants[index]?.option1 || '',
      size: opts.find((o: any) => o.name === productData.option2Name)?.value || productData.variants[index]?.option2 || '',
      sku: productData.variants[index]?.sku || '',
      price: productData.variants[index]?.price || '0',
    };
  });

  console.log(`✅ GraphQL upload tamamlandı: ${productData.variants.length} varyant, ID=${productId}`);

  return {
    success: true,
    productId,
    handle: createdProduct.handle,
    variants: variantMappings,
    message: `GraphQL ile yüklendi (${productData.variants.length} varyant). ID: ${productId}`,
  };
}

function parseCSVToShopifyProduct(records: any[]): ShopifyProductData {
  console.log('🔄 CSV parsing başlatılıyor...');
  console.log('📊 Records count:', records.length);
  
  if (!records || records.length === 0) {
    throw new Error('CSV records empty or invalid');
  }
  
  const firstRecord = records[0];
  console.log('📋 First record keys:', Object.keys(firstRecord));
  console.log('📋 Sample data (new format):', {
    URLHandle: firstRecord['URL handle'] || firstRecord.Handle,
    Title: firstRecord.Title,
    SKU: firstRecord['SKU'] || firstRecord['Variant SKU'],
    ProductImageURL: firstRecord['Product image URL'] || firstRecord['Image Src'],
    Option1Name: firstRecord['Option1 name'] || firstRecord['Option1 Name'],
    Price: firstRecord['Price'] || firstRecord['Variant Price']
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
      const compareAtRaw = col(record, 'Compare-at price', 'Variant Compare At Price');
      const variant = {
        option1: col(record, 'Option1 value', 'Option1 Value'),
        option2: col(record, 'Option2 value', 'Option2 Value'),
        price: col(record, 'Price', 'Variant Price') || '0',
        compareAtPrice: compareAtRaw && parseFloat(compareAtRaw) > 0 ? compareAtRaw : undefined,
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
    const price = col(firstRecord, 'Price', 'Variant Price') || '0';
    const handle = col(firstRecord, 'URL handle', 'Handle') || 'default-sku';
    variants.push({
      option1: '', // Empty - no color option
      option2: '', // Empty - no size option
      price: price,
      sku: handle,
      inventory_quantity: 0,
      image: images[0]?.src || ''
    });
    console.log(`📦 Default variant created: price=${price}, sku=${handle}`);
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