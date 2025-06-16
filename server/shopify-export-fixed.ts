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

function sanitizeImageUrl(url: string): string {
  if (!url) return '';
  
  // HTTPS'e zorla
  let cleanUrl = url.toString();
  if (cleanUrl.startsWith('//')) {
    cleanUrl = 'https:' + cleanUrl;
  } else if (cleanUrl.startsWith('http://')) {
    cleanUrl = cleanUrl.replace('http://', 'https://');
  }
  
  // Trendyol CDN URL'lerini optimize et
  if (cleanUrl.includes('cdn.dsmcdn.com')) {
    // _org_zoom.jpg formatını düzenle
    cleanUrl = cleanUrl.replace('_org_zoom.jpg', '.jpg');
    cleanUrl = cleanUrl.replace('_org_zoom.png', '.png');
  }
  
  return cleanUrl;
}

// Shopify resmi template formatı - tam uyumlu
export async function generateShopifyCSV(
  product: Product,
  variants: { 
    sizes?: string[], 
    colors?: string[],
    availability?: string,
    stockMap?: Record<string, boolean>,
    colorSizeMatrix?: Record<string, string[]>
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
  const availability = variants?.availability || '';
  const stockMap = variants?.stockMap || {};
  const hasSizeVariants = sizes?.length > 0;
  const hasColorVariants = colors?.length > 0;
  
  // Varyant bazlı akıllı stok yönetimi
  const getVariantStockQuantity = (color?: string, size?: string): string => {
    // Renk-beden matrisi kontrolü - özel kombinasyonlar
    if (color && size && variants.colorSizeMatrix) {
      const availableSizesForColor = variants.colorSizeMatrix[color];
      if (availableSizesForColor && !availableSizesForColor.includes(size)) {
        console.log(`🔧 CSV: ${color} renginde ${size} beden mevcut değil - stok: 0`);
        return '0';
      }
    }
    
    // Eğer stok haritası varsa, önce onu kontrol et
    if (Object.keys(stockMap).length > 0 && color && size) {
      const variantKey = `${color}-${size}`;
      const isInStock = stockMap[variantKey];
      if (isInStock === false) {
        return '0'; // Stokta yok
      }
      if (isInStock === true) {
        return '10'; // Stokta var
      }
    }
    
    // Genel availability kontrolü
    if (!availability) return '10'; // Varsayılan stok
    
    // Stokta var durumları
    if (availability.includes('InStock') || 
        availability.includes('Available') || 
        availability.includes('stokta')) {
      return '10'; // Normal stok
    }
    
    // Sınırlı stok durumları
    if (availability.includes('LimitedAvailability') || 
        availability.includes('LastFew') || 
        availability.includes('az kaldı')) {
      return '3'; // Sınırlı stok
    }
    
    // Stokta yok durumları
    if (availability.includes('OutOfStock') || 
        availability.includes('Discontinued') || 
        availability.includes('stokta yok')) {
      return '0'; // Stok yok
    }
    
    return '10'; // Varsayılan
  };
  
  console.log(`STOK ANALİZİ: Availability="${availability}", StockMap entries: ${Object.keys(stockMap).length}`);

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
        variant_inventory_qty: getVariantStockQuantity(
          hasSizeVariants && hasColorVariants ? colors[0] : undefined,
          hasSizeVariants && hasColorVariants ? sizes[0] : hasSizeVariants ? sizes[0] : undefined
        ),
        variant_inventory_policy: 'deny',
        variant_fulfillment_service: 'manual',
        variant_price: product.price,
        variant_compare_at_price: '',
        variant_requires_shipping: 'TRUE',
        variant_taxable: 'TRUE',
        variant_barcode: '',
        image_src: sanitizeImageUrl(mainImage),
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
          image_src: sanitizeImageUrl(imageUrl),
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

      // VARYANT SATIRLARI - SHOPIFY GERÇEK FORMATI - SADECE STOKTA OLANLAR
      if (hasSizeVariants && hasColorVariants) {
        // Renk-beden kombinasyonları (template formatında) - SADECE STOKTA OLANLAR
        console.log(`VARYANT SİSTEMİ: ${colors.length} renk × ${sizes.length} beden kombinasyonu kontrol ediliyor`);
        let addedVariants = 0;
        for (let c = 0; c < colors.length; c++) {
          for (let s = 0; s < sizes.length; s++) {
            if (c === 0 && s === 0) continue; // Ana ürünü atla
            
            // STOK KONTROLÜ - SADECE STOKTA OLANLAR EKLENSİN
            const stockQuantity = getVariantStockQuantity(colors[c], sizes[s]);
            if (stockQuantity === '0') {
              console.log(`🚫 ATLANDI: ${colors[c]}-${sizes[s]} kombinasyonu stokta yok`);
              continue; // Stoksuz varyantı atla
            }
            
            console.log(`✅ EKLENDİ: ${colors[c]}-${sizes[s]} kombinasyonu stokta (${stockQuantity} adet)`);
            addedVariants++;
            
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
              variant_inventory_qty: stockQuantity,
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
              variant_image: sanitizeImageUrl(mainImage), // Varyant görseli
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
        console.log(`SHOPIFY FORMAT: ${addedVariants} stokta olan varyant eklendi (toplam ${colors.length * sizes.length - 1} kombinasyondan)`);
      } else if (hasSizeVariants) {
        // Sadece beden varyantları - SADECE STOKTA OLANLAR
        console.log(`BEDEN VARYANTI SİSTEMİ: ${sizes.length} beden varyasyonu kontrol ediliyor`);
        let addedSizeVariants = 0;
        for (let s = 1; s < sizes.length; s++) {
          // STOK KONTROLÜ - SADECE STOKTA OLANLAR EKLENSİN
          const stockQuantity = getVariantStockQuantity('', sizes[s]);
          if (stockQuantity === '0') {
            console.log(`🚫 ATLANDI: ${sizes[s]} bedeni stokta yok`);
            continue;
          }
          
          console.log(`✅ EKLENDİ: ${sizes[s]} bedeni stokta (${stockQuantity} adet)`);
          addedSizeVariants++;
          
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
            variant_inventory_qty: stockQuantity,
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
            variant_image: sanitizeImageUrl(mainImage),
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
        console.log(`SHOPIFY FORMAT: ${addedSizeVariants} stokta olan beden varyantı eklendi (toplam ${sizes.length - 1} bedenden)`);
      } else if (hasColorVariants) {
        // Sadece renk varyantları - SADECE STOKTA OLANLAR
        console.log(`RENK VARYANTI SİSTEMİ: ${colors.length} renk varyasyonu kontrol ediliyor`);
        let addedColorVariants = 0;
        for (let c = 1; c < colors.length; c++) {
          // STOK KONTROLÜ - SADECE STOKTA OLANLAR EKLENSİN
          const stockQuantity = getVariantStockQuantity(colors[c], '');
          if (stockQuantity === '0') {
            console.log(`🚫 ATLANDI: ${colors[c]} rengi stokta yok`);
            continue;
          }
          
          console.log(`✅ EKLENDİ: ${colors[c]} rengi stokta (${stockQuantity} adet)`);
          addedColorVariants++;
          
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
            option1_value: colors[c],
            option2_name: '',
            option2_value: '',
            option3_name: '',
            option3_value: '',
            variant_sku: `${handle}-${colors[c]}`,
            variant_grams: '145',
            variant_inventory_tracker: 'shopify',
            variant_inventory_qty: stockQuantity,
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
        console.log(`SHOPIFY FORMAT: ${addedColorVariants} stokta olan renk varyantı eklendi (toplam ${colors.length - 1} renkten)`);
      } else {
        // Varyasyonu olmayan ürünler - "Default Title" ile tek varyant
        console.log('VARYASYON YOK SİSTEMİ: Tek varyant "Default Title" oluşturuluyor');
        // Ana ürün zaten "Default Title" ile oluşturuldu, ek varyant gerekmiyor
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
      
      // Dosyayı ./temp klasörüne de kopyala (download için)
      const tempPath = join('./temp', 'shopify_products.csv');
      const tempDir = './temp';
      
      // temp klasörünü oluştur
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Dosyayı kopyala
      try {
        fs.copyFileSync(outputPath, tempPath);
        console.log(`CSV dosyası hem /tmp hem de ./temp klasörüne kaydedildi`);
      } catch (copyError) {
        console.log(`Dosya kopyalama hatası: ${copyError}`);
        // temp klasöründe direkt oluştur
        fs.writeFileSync(tempPath, fs.readFileSync(outputPath, 'utf8'));
        console.log(`CSV dosyası ./temp klasörüne yazıldı`);
      }
      
      resolve({
        csvPath: tempPath,
        filename: `shopify_products.csv`,
        totalRows: csvRows.length
      });

    } catch (error) {
      console.error('CSV oluşturma hatası:', error);
      reject(error);
    }
  });
}