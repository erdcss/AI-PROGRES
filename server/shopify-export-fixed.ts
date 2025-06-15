import { Product } from "@shared/schema";
import { createObjectCsvWriter } from "csv-writer";
import { tmpdir } from "os";
import { join } from "path";
import fs from "fs";

// Shopify CSV için güvenli temizleme
function escapeForCSV(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  let cleaned = String(text);
  
  // HTML etiketlerini kaldır
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Güvenli karakterlere sınırla
  cleaned = cleaned
    .replace(/[^\w\s\-\.çğıöşüÇĞIÖŞÜ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 250);
  
  // CSV için escape et
  if (cleaned.includes('"') || cleaned.includes(',') || cleaned.includes('\n')) {
    cleaned = cleaned.replace(/"/g, '""');
    return `"${cleaned}"`;
  }
  
  return cleaned;
}

// Shopify resmi template formatı - tam uyumlu
export async function generateShopifyCSV(
  product: Product,
  variants: { 
    sizes?: string[], 
    colors?: string[] 
  } = {},
  outputPath: string = join(tmpdir(), 'shopify_products.csv')
): Promise<{ csvPath: string; filename: string; totalRows: number }> {

  // Fiyata %10 kar ekle
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    const priceWithProfit = (basePrice * 1.10).toFixed(2);
    product.price = priceWithProfit;
  }

  const sizes = variants?.sizes || [];
  const colors = variants?.colors || [];
  const hasSizeVariants = sizes?.length > 0;
  const hasColorVariants = colors?.length > 0;

  // Handle oluştur
  const turkishToEnglish = (text: string): string => {
    return text
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
      .replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U');
  };

  const handle = turkishToEnglish(product.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);

  // Ana görsel ve ek görseller
  const mainImage = product.images?.[0] || '';
  const additionalImages = product.images?.slice(1) || [];

  // Etiketler
  let tags = '';
  if (product.tags && Array.isArray(product.tags) && product.tags.length > 0) {
    tags = product.tags
      .filter(tag => tag && tag.length > 0 && tag.length <= 30)
      .slice(0, 15)
      .join(',');
  }

  // Body HTML
  const generateBodyHTML = () => {
    let bodyContent = `<p>${escapeForCSV(product.title)}</p>`;
    
    if (product.description) {
      bodyContent += `\n<p>${escapeForCSV(product.description)}</p>`;
    }
    
    // Ürün özelliklerini attributes'tan ekle
    if (product.attributes && Object.keys(product.attributes).length > 0) {
      bodyContent += '\n<p>Ürün Özellikleri:</p><ul>';
      Object.entries(product.attributes).slice(0, 10).forEach(([key, value]) => {
        if (value && value.length > 0) {
          bodyContent += `<li>${escapeForCSV(key)}: ${escapeForCSV(value)}</li>`;
        }
      });
      bodyContent += '</ul>';
    }
    
    return bodyContent;
  };

  return new Promise(async (resolve, reject) => {
    try {
      const csvRows: any[] = [];

      console.log('SHOPIFY GERÇEK FORMAT: Template uyumlu CSV oluşturuluyor');
      
      // ANA ÜRÜN SATIRI - Shopify template formatı
      const mainRow = {
        handle: handle,
        title: product.title,
        body_html: generateBodyHTML(),
        vendor: product.brand || 'turmarkt',
        product_category: 'Apparel & Accessories > Clothing',
        type: product.category?.split('>').pop()?.trim() || 'Giyim',
        tags: tags,
        published: 'TRUE',
        option1_name: hasSizeVariants && hasColorVariants ? 'Color' : hasSizeVariants ? 'Size' : 'Title',
        option1_value: hasSizeVariants && hasColorVariants ? colors[0] : hasSizeVariants ? sizes[0] : 'Default Title',
        option2_name: hasSizeVariants && hasColorVariants ? 'Size' : '',
        option2_value: hasSizeVariants && hasColorVariants ? sizes[0] : '',
        option3_name: '',
        option3_value: '',
        variant_sku: `${handle}-${hasSizeVariants && hasColorVariants ? colors[0] + '-' + sizes[0] : hasSizeVariants ? sizes[0] : 'default'}`,
        variant_grams: '145',
        variant_inventory_tracker: 'shopify',
        variant_inventory_qty: '0',
        variant_inventory_policy: 'deny',
        variant_fulfillment_service: 'manual',
        variant_price: product.price,
        variant_compare_at_price: '',
        variant_requires_shipping: 'TRUE',
        variant_taxable: 'TRUE',
        variant_barcode: '',
        image_src: mainImage,
        image_position: '1',
        image_alt_text: product.title,
        gift_card: 'FALSE',
        seo_title: product.title,
        seo_description: product.description || product.title,
        google_shopping_google_product_category: '212',
        google_shopping_gender: 'unisex',
        google_shopping_age_group: 'adult',
        google_shopping_mpn: product.brand || '',
        google_shopping_condition: 'new',
        google_shopping_custom_product: 'TRUE',
        variant_image: mainImage,
        variant_weight_unit: 'g',
        variant_tax_code: '',
        cost_per_item: '',
        included_united_states: 'TRUE',
        price_united_states: '',
        compare_at_price_united_states: '',
        included_international: 'TRUE',
        price_international: '',
        compare_at_price_international: '',
        status: 'active'
      };
      csvRows.push(mainRow);

      // EK GÖRSELLER - Template formatı (boş alanlarla)
      additionalImages.forEach((imageUrl, index) => {
        csvRows.push({
          handle: handle,
          title: '',
          body_html: '',
          vendor: '',
          product_category: '',
          type: '',
          tags: '',
          published: '',
          option1_name: '',
          option1_value: '',
          option2_name: '',
          option2_value: '',
          option3_name: '',
          option3_value: '',
          variant_sku: '',
          variant_grams: '',
          variant_inventory_tracker: '',
          variant_inventory_qty: '',
          variant_inventory_policy: '',
          variant_fulfillment_service: '',
          variant_price: '',
          variant_compare_at_price: '',
          variant_requires_shipping: '',
          variant_taxable: '',
          variant_barcode: '',
          image_src: imageUrl,
          image_position: (index + 2).toString(),
          image_alt_text: `${product.title} - Görsel ${index + 2}`,
          gift_card: '',
          seo_title: '',
          seo_description: '',
          google_shopping_google_product_category: '',
          google_shopping_gender: '',
          google_shopping_age_group: '',
          google_shopping_mpn: '',
          google_shopping_condition: '',
          google_shopping_custom_product: '',
          variant_image: '',
          variant_weight_unit: '',
          variant_tax_code: '',
          cost_per_item: '',
          included_united_states: '',
          price_united_states: '',
          compare_at_price_united_states: '',
          included_international: '',
          price_international: '',
          compare_at_price_international: '',
          status: ''
        });
      });

      // VARYANT SATIRLARI - SHOPIFY GERÇEK FORMATI
      if (hasSizeVariants && hasColorVariants) {
        // Renk-beden kombinasyonları (template formatında)
        for (let c = 0; c < colors.length; c++) {
          for (let s = 0; s < sizes.length; s++) {
            if (c === 0 && s === 0) continue; // Ana ürünü atla
            
            csvRows.push({
              handle: handle,
              title: '', // BOŞŞ BIRAK - Shopify kuralı
              body_html: '',
              vendor: '',
              product_category: '',
              type: '',
              tags: '',
              published: '',
              option1_name: '', // BOŞŞ BIRAK - Sadece ana üründe dolu
              option1_value: colors[c], // SADECE DEĞER
              option2_name: '', // BOŞŞ BIRAK - Sadece ana üründe dolu
              option2_value: sizes[s], // SADECE DEĞER
              option3_name: '',
              option3_value: '',
              variant_sku: `${handle}-${colors[c]}-${sizes[s]}`,
              variant_grams: '145',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: '0',
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_price: product.price,
              variant_compare_at_price: '',
              variant_requires_shipping: 'TRUE',
              variant_taxable: 'TRUE',
              variant_barcode: '',
              image_src: '', // Varyant satırlarında genelde boş
              image_position: '',
              image_alt_text: '',
              gift_card: '',
              seo_title: '',
              seo_description: '',
              google_shopping_google_product_category: '',
              google_shopping_gender: '',
              google_shopping_age_group: '',
              google_shopping_mpn: '',
              google_shopping_condition: '',
              google_shopping_custom_product: '',
              variant_image: mainImage, // Varyant görseli
              variant_weight_unit: 'g',
              variant_tax_code: '',
              cost_per_item: '',
              included_united_states: '',
              price_united_states: '',
              compare_at_price_united_states: '',
              included_international: '',
              price_international: '',
              compare_at_price_international: '',
              status: ''
            });
          }
        }
        console.log(`SHOPIFY FORMAT: ${(colors.length * sizes.length - 1)} varyant kombinasyonu eklendi`);
      } else if (hasSizeVariants) {
        // Sadece beden varyantları
        for (let s = 1; s < sizes.length; s++) {
          csvRows.push({
            handle: handle,
            title: '',
            body_html: '',
            vendor: '',
            product_category: '',
            type: '',
            tags: '',
            published: '',
            option1_name: '',
            option1_value: sizes[s],
            option2_name: '',
            option2_value: '',
            option3_name: '',
            option3_value: '',
            variant_sku: `${handle}-${sizes[s]}`,
            variant_grams: '145',
            variant_inventory_tracker: 'shopify',
            variant_inventory_qty: '0',
            variant_inventory_policy: 'deny',
            variant_fulfillment_service: 'manual',
            variant_price: product.price,
            variant_compare_at_price: '',
            variant_requires_shipping: 'TRUE',
            variant_taxable: 'TRUE',
            variant_barcode: '',
            image_src: '',
            image_position: '',
            image_alt_text: '',
            gift_card: '',
            seo_title: '',
            seo_description: '',
            google_shopping_google_product_category: '',
            google_shopping_gender: '',
            google_shopping_age_group: '',
            google_shopping_mpn: '',
            google_shopping_condition: '',
            google_shopping_custom_product: '',
            variant_image: mainImage,
            variant_weight_unit: 'g',
            variant_tax_code: '',
            cost_per_item: '',
            included_united_states: '',
            price_united_states: '',
            compare_at_price_united_states: '',
            included_international: '',
            price_international: '',
            compare_at_price_international: '',
            status: ''
          });
        }
      }

      // CSV WRITER - Shopify template header sırası
      const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: [
          { id: 'handle', title: 'Handle' },
          { id: 'title', title: 'Title' },
          { id: 'body_html', title: 'Body (HTML)' },
          { id: 'vendor', title: 'Vendor' },
          { id: 'product_category', title: 'Product Category' },
          { id: 'type', title: 'Type' },
          { id: 'tags', title: 'Tags' },
          { id: 'published', title: 'Published' },
          { id: 'option1_name', title: 'Option1 Name' },
          { id: 'option1_value', title: 'Option1 Value' },
          { id: 'option2_name', title: 'Option2 Name' },
          { id: 'option2_value', title: 'Option2 Value' },
          { id: 'option3_name', title: 'Option3 Name' },
          { id: 'option3_value', title: 'Option3 Value' },
          { id: 'variant_sku', title: 'Variant SKU' },
          { id: 'variant_grams', title: 'Variant Grams' },
          { id: 'variant_inventory_tracker', title: 'Variant Inventory Tracker' },
          { id: 'variant_inventory_qty', title: 'Variant Inventory Qty' },
          { id: 'variant_inventory_policy', title: 'Variant Inventory Policy' },
          { id: 'variant_fulfillment_service', title: 'Variant Fulfillment Service' },
          { id: 'variant_price', title: 'Variant Price' },
          { id: 'variant_compare_at_price', title: 'Variant Compare At Price' },
          { id: 'variant_requires_shipping', title: 'Variant Requires Shipping' },
          { id: 'variant_taxable', title: 'Variant Taxable' },
          { id: 'variant_barcode', title: 'Variant Barcode' },
          { id: 'image_src', title: 'Image Src' },
          { id: 'image_position', title: 'Image Position' },
          { id: 'image_alt_text', title: 'Image Alt Text' },
          { id: 'gift_card', title: 'Gift Card' },
          { id: 'seo_title', title: 'SEO Title' },
          { id: 'seo_description', title: 'SEO Description' },
          { id: 'google_shopping_google_product_category', title: 'Google Shopping / Google Product Category' },
          { id: 'google_shopping_gender', title: 'Google Shopping / Gender' },
          { id: 'google_shopping_age_group', title: 'Google Shopping / Age Group' },
          { id: 'google_shopping_mpn', title: 'Google Shopping / MPN' },
          { id: 'google_shopping_condition', title: 'Google Shopping / Condition' },
          { id: 'google_shopping_custom_product', title: 'Google Shopping / Custom Product' },
          { id: 'variant_image', title: 'Variant Image' },
          { id: 'variant_weight_unit', title: 'Variant Weight Unit' },
          { id: 'variant_tax_code', title: 'Variant Tax Code' },
          { id: 'cost_per_item', title: 'Cost per item' },
          { id: 'included_united_states', title: 'Included / United States' },
          { id: 'price_united_states', title: 'Price / United States' },
          { id: 'compare_at_price_united_states', title: 'Compare At Price / United States' },
          { id: 'included_international', title: 'Included / International' },
          { id: 'price_international', title: 'Price / International' },
          { id: 'compare_at_price_international', title: 'Compare At Price / International' },
          { id: 'status', title: 'Status' }
        ]
      });

      await csvWriter.writeRecords(csvRows);
      
      console.log(`SHOPIFY TEMPLATE FORMAT CSV oluşturuldu: ${outputPath} (${csvRows.length} satır)`);
      
      resolve({
        csvPath: outputPath,
        filename: `shopify_products.csv`,
        totalRows: csvRows.length
      });

    } catch (error) {
      console.error('CSV oluşturma hatası:', error);
      reject(error);
    }
  });
}