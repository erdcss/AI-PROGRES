import { Product } from "@shared/schema";
import { createObjectCsvWriter } from "csv-writer";
import { tmpdir } from "os";
import { join } from "path";
import fs from "fs";

/**
 * Bu dosya Shopify uyumlu CSV oluşturmak için tasarlanmıştır
 * Shopify'ın kesin CSV formatını kullanır
 */

export function generateShopifyCSV(
  product: Product,
  variants: { 
    sizes?: string[], 
    colors?: string[] 
  } = {},
  outputPath: string = join(tmpdir(), 'shopify_products.csv')
): Promise<string> {
  console.log('Generating Shopify CSV:', { 
    productName: product.title,
    variants: { sizes: variants.sizes?.length || 0, colors: variants.colors?.length || 0 }
  });
  
  // Shopify görüntüleme sorunu düzeltme: Gerekli alanların doğru formatları
  const fixShopifyVisibility = (row: any) => {
    // Status alanının "active" olması şart
    row.status = 'active';
    
    // ÖNEMLİ: Tüm Boolean alanlar BÜYÜK HARF olmalı
    row.published = 'TRUE';
    
    // Published scope alanı kritik - Shopify 2023/2024 gerekliliği
    row.published_scope = 'web';  // Bu alan Shopify'da gerekli
    
    // Shopify'da varyant ayarları için kritik değişiklikler
    row.variant_inventory_policy = 'deny'; // Şart
    row.variant_fulfillment_service = 'manual'; // Şart
    
    // Temel envanter ve durum ayarları
    row.inventory_policy = 'deny';
    row.fulfillment_service = 'manual';
    
    // Shopify gösterimi için mutlaka olması gereken alanlar
    if (!row.handle && row.title) {
      row.handle = row.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }
    
    // Shopify kategori alanı için ek kontrol
    if (!row.product_category) {
      row.product_category = 'Apparel & Accessories';
    }
    
    // Envanter alanlarını düzenle (yakın zamandaki Shopify değişiklikleri)
    row.variant_inventory_qty = row.inventory_quantity || '50';
    row.variant_inventory_tracker = row.inventory_tracker || 'shopify';
    
    // Alan eşleştirmeleri - aynı verinin farklı sürümleri için
    // Fiyat alanlarını düzenle - bazı Shopify sürümleri variant_price bazıları price kullanıyor
    row.variant_price = row.price || row.variant_price || '';
    row.price = row.variant_price || row.price || '';
    
    // SKU alanını düzenle
    row.variant_sku = row.sku || row.variant_sku || '';
    row.sku = row.variant_sku || row.sku || '';
    
    // Boolean alanları büyük harfe çevir (Shopify'ın gerektirdiği format)
    if (row.published === 'true') row.published = 'TRUE';
    if (row.published === 'false') row.published = 'FALSE';
    
    // Variant tabanlı Boolean alanlar
    if (row.variant_requires_shipping === 'true') row.variant_requires_shipping = 'TRUE';
    if (row.variant_requires_shipping === 'false') row.variant_requires_shipping = 'FALSE';
    if (row.variant_taxable === 'true') row.variant_taxable = 'TRUE';
    if (row.variant_taxable === 'false') row.variant_taxable = 'FALSE';
    
    // Doğrudan Boolean alanlar
    if (row.requires_shipping === 'true') row.requires_shipping = 'TRUE';
    if (row.requires_shipping === 'false') row.requires_shipping = 'FALSE';
    if (row.taxable === 'true') row.taxable = 'TRUE';
    if (row.taxable === 'false') row.taxable = 'FALSE';
    if (row.gift_card === 'true') row.gift_card = 'TRUE';
    if (row.gift_card === 'false') row.gift_card = 'FALSE';

    // Karşılıklı alan aktarımları (uyumluluk için)
    if (!row.requires_shipping && row.variant_requires_shipping) {
      row.requires_shipping = row.variant_requires_shipping;
    }
    if (!row.variant_requires_shipping && row.requires_shipping) {
      row.variant_requires_shipping = row.requires_shipping;
    }
    
    if (!row.taxable && row.variant_taxable) {
      row.taxable = row.variant_taxable;
    }
    if (!row.variant_taxable && row.taxable) {
      row.variant_taxable = row.taxable;
    }
    
    // Varsayılan değerler - Shopify'da gerekli olan temel alanlar
    if (!row.status) row.status = 'active';
    if (!row.requires_shipping) row.requires_shipping = 'TRUE';
    if (!row.variant_requires_shipping) row.variant_requires_shipping = 'TRUE';
    if (!row.taxable) row.taxable = 'TRUE';
    if (!row.variant_taxable) row.variant_taxable = 'TRUE';
    if (!row.gift_card) row.gift_card = 'FALSE';
    if (!row.inventory_tracker) row.inventory_tracker = 'shopify';
    if (!row.variant_inventory_tracker) row.variant_inventory_tracker = 'shopify';
    if (!row.published) row.published = 'TRUE';
    
    // Option değerlerini kontrol et - Shopify boş olanlara izin vermiyor
    if (row.option1_name === '') row.option1_name = 'Title';
    if (row.option1_value === '') row.option1_value = 'Default Title';
    
    return row;
  };
  return new Promise(async (resolve, reject) => {
    try {
      // Shopify'ın 2024 güncel CSV formatını kullan (örnek product_template.csv şablonundan)
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
          { id: 'google_shopping_metafields', title: 'Google Shopping / Google Product Category' },
          { id: 'google_shopping_gender', title: 'Google Shopping / Gender' },
          { id: 'google_shopping_age_group', title: 'Google Shopping / Age Group' },
          { id: 'google_shopping_mpn', title: 'Google Shopping / MPN' },
          { id: 'google_shopping_condition', title: 'Google Shopping / Condition' },
          { id: 'google_shopping_custom_product', title: 'Google Shopping / Custom Product' },
          { id: 'variant_image', title: 'Variant Image' },
          { id: 'variant_weight_unit', title: 'Variant Weight Unit' },
          { id: 'variant_tax_code', title: 'Variant Tax Code' },
          { id: 'cost_per_item', title: 'Cost per item' },
          { id: 'included_usa', title: 'Included / United States' },
          { id: 'price_usa', title: 'Price / United States' },
          { id: 'compare_price_usa', title: 'Compare At Price / United States' },
          { id: 'included_intl', title: 'Included / International' },
          { id: 'price_intl', title: 'Price / International' },
          { id: 'compare_price_intl', title: 'Compare At Price / International' },
          { id: 'status', title: 'Status' }
        ]
      });

      // CSV satırlarını oluştur
      const csvRows: any[] = [];
      
      // Handle oluştur (URL-uyumlu slug)
      const handle = product.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      
      // Body HTML oluştur
      const generateBodyHTML = () => {
        let html = product.description ? `<p>${product.description}</p>\n\n` : '';
        
        if (product.attributes && Object.keys(product.attributes).length > 0) {
          html += `<h3>Ürün Özellikleri</h3>\n<ul>`;
          for (const [key, value] of Object.entries(product.attributes)) {
            html += `\n  <li><strong>${key}:</strong> ${value}</li>`;
          }
          html += '\n</ul>';
        }
        return html;
      };
      
      // Etiketleri oluştur
      const tags = product.categories 
        ? product.categories
            .filter(cat => cat && typeof cat === 'string')
            .map(cat => cat.replace(/\s+/g, ''))
            .join(',')
        : '';
        
      // Ayakkabı/terlik veya mutfak ürünü kontrolü
      const isShoeProduct = product.categories ? product.categories.some((cat: string) => 
        cat.toLowerCase().includes('ayakkabı') || 
        cat.toLowerCase().includes('shoe') || 
        cat.toLowerCase().includes('terlik') || 
        cat.toLowerCase().includes('sandalet') ||
        cat.toLowerCase().includes('bot') ||
        cat.toLowerCase().includes('çizme')
      ) : false;
      
      const isKitchenProduct = product.categories ? product.categories.some((cat: string) => 
        cat.toLowerCase().includes('mutfak') || 
        cat.toLowerCase().includes('kitchen') || 
        cat.toLowerCase().includes('saklama')
      ) : false;
      
      // Varyantları belirle
      const sizes = variants.sizes || [];
      const colors = variants.colors || [];
      const hasVariants = sizes.length > 0 || colors.length > 0;
      
      // Ana ürün satırı
      if (hasVariants) {
        // Varyantlı ürün
        if (sizes.length > 0) {
          // Beden varyantları var
          
          if (colors.length > 0) {
            // Hem beden hem renk varyantları
            let row = {
              handle: handle,
              title: product.title,
              body_html: generateBodyHTML(),
              vendor: 'turmarkt',
              product_category: 'Apparel & Accessories > Clothing',
              type: product.categories && product.categories.length > 0 
                ? product.categories[product.categories.length - 1] 
                : 'Giyim',
              tags: tags,
              published: 'TRUE',
              status: 'active',
              option1_name: 'Size',
              option1_value: sizes[0],
              option2_name: 'Color',
              option2_value: colors[0],
              option3_name: '',
              option3_value: '',
              variant_sku: `${handle}-${sizes[0]}-${colors[0]}`,
              variant_grams: '500',
              variant_weight_unit: 'g',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: '50', 
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_price: product.price,
              variant_requires_shipping: 'TRUE',
              variant_taxable: 'TRUE',
              variant_barcode: '',
              image_src: product.images && product.images.length > 0 ? product.images[0] : '',
              image_position: '1',
              image_alt_text: product.title,
              gift_card: 'FALSE'
            };
            csvRows.push(row);
            
            // Diğer varyantlar
            let counter = 1;
            for (const size of sizes) {
              for (const color of colors) {
                if (counter === 1) {
                  counter++;
                  continue; // İlk varyantı atla, zaten ekledik
                }
                
                csvRows.push({
                  handle: handle,
                  option1_value: size,
                  option2_value: color,
                  variant_sku: `${handle}-${size}-${color}`,
                  variant_price: product.price,
                  variant_inventory_tracker: 'shopify',
                  variant_inventory_qty: '50', 
                  variant_inventory_policy: 'deny',
                  variant_requires_shipping: 'TRUE',
                  variant_taxable: 'TRUE',
                  variant_fulfillment_service: 'manual',
                  variant_grams: '500',
                  variant_weight_unit: 'g'
                });
                counter++;
              }
            }
          } else {
            // Sadece beden varyantları
            let row = {
              handle: handle,
              title: product.title,
              body_html: generateBodyHTML(),
              vendor: 'turmarkt',
              product_category: 'Apparel & Accessories > Clothing',
              type: product.categories && product.categories.length > 0 
                ? product.categories[product.categories.length - 1] 
                : 'Giyim',
              tags: tags,
              published: 'TRUE',
              option1_name: 'Size',
              option1_value: sizes[0],
              option2_name: '',
              option2_value: '',
              option3_name: '',
              option3_value: '',
              variant_sku: `${handle}-${sizes[0]}`,
              variant_grams: '500',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: '50',
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_price: product.price,
              variant_requires_shipping: 'TRUE',
              variant_taxable: 'TRUE',
              variant_barcode: '',
              image_src: product.images && product.images.length > 0 ? product.images[0] : '',
              image_position: '1',
              image_alt_text: product.title,
              gift_card: 'FALSE',
              variant_weight_unit: 'g',
              status: 'active'
            };
            csvRows.push(row);
            
            // Diğer beden varyantları
            for (let i = 1; i < sizes.length; i++) {
              csvRows.push({
                handle: handle,
                option1_value: sizes[i],
                sku: `${handle}-${sizes[i]}`,
                price: product.price,
                inventory_tracker: 'shopify',
                inventory_quantity: '50',
                inventory_policy: 'deny',
                requires_shipping: 'TRUE',
                taxable: 'TRUE',
                fulfillment_service: 'manual'
              });
            }
          }
        } else if (colors.length > 0) {
          // Sadece renk varyantları
          if ((isKitchenProduct || isShoeProduct) && colors.length === 1) {
            // Tek renkli özel ürünler için Title/Default Title formatı
            let row = {
              handle: handle,
              title: product.title,
              body_html: generateBodyHTML(),
              vendor: 'turmarkt',
              product_category: 'Apparel & Accessories > Clothing',
              type: product.categories && product.categories.length > 0 
                ? product.categories[product.categories.length - 1] 
                : 'Giyim',
              tags: product.tags,
              published: 'TRUE',
              status: 'active',
              variant_sku: handle,
              variant_barcode: '',
              option1_name: 'Title',
              option1_value: 'Default Title',
              option2_name: '',
              option2_value: '',
              option3_name: '',
              option3_value: '',
              variant_price: product.price,
              variant_compare_at_price: '',
              variant_grams: '500',
              variant_weight_unit: 'g',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: '50',
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_requires_shipping: 'TRUE',
              variant_taxable: 'TRUE',
              image_src: product.images && product.images.length > 0 ? product.images[0] : '',
              image_position: '1',
              image_alt_text: product.title,
              variant_image: '',
              gift_card: 'FALSE',
              seo_title: product.title,
              seo_description: ''
            };
            csvRows.push(row);
          } else {
            // Çok renkli ürünler
            let row = {
              handle: handle,
              title: product.title,
              body_html: generateBodyHTML(),
              vendor: 'turmarkt',
              product_category: 'Apparel & Accessories > Clothing',
              type: product.categories && product.categories.length > 0 
                ? product.categories[product.categories.length - 1] 
                : 'Giyim',
              tags: tags,
              published: 'TRUE',
              option1_name: 'Color',
              option1_value: colors[0],
              option2_name: '',
              option2_value: '',
              option3_name: '',
              option3_value: '',
              variant_sku: `${handle}-${colors[0]}`,
              variant_grams: '500',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: '50',
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_price: product.price,
              variant_requires_shipping: 'TRUE',
              variant_taxable: 'TRUE',
              variant_barcode: '',
              image_src: product.images && product.images.length > 0 ? product.images[0] : '',
              image_position: '1',
              image_alt_text: product.title,
              gift_card: 'FALSE',
              variant_weight_unit: 'g',
              status: 'active'
            };
            csvRows.push(row);
            
            // Diğer renk varyantları
            for (let i = 1; i < colors.length; i++) {
              csvRows.push({
                handle: handle,
                option1_value: colors[i],
                sku: `${handle}-${colors[i]}`,
                price: product.price,
                inventory_tracker: 'shopify',
                inventory_quantity: '50',
                inventory_policy: 'deny',
                requires_shipping: 'TRUE',
                taxable: 'TRUE',
                fulfillment_service: 'manual'
              });
            }
          }
        }
      } else {
        // Varyantı olmayan temel ürün - Shopify şablonuna uygun format
        let row = {
          handle: handle,
          title: product.title,
          body_html: generateBodyHTML(),
          vendor: 'turmarkt',
          product_category: 'Apparel & Accessories > Clothing',
          type: product.categories && product.categories.length > 0 
            ? product.categories[product.categories.length - 1] 
            : 'Giyim',
          tags: product.tags,
          published: 'TRUE',
          option1_name: 'Title',
          option1_value: 'Default Title',
          option2_name: '',
          option2_value: '',
          option3_name: '',
          option3_value: '',
          variant_sku: handle,
          variant_grams: '500',
          variant_inventory_tracker: 'shopify',
          variant_inventory_qty: '50',
          variant_inventory_policy: 'deny',
          variant_fulfillment_service: 'manual',
          variant_price: product.price,
          variant_compare_at_price: '',
          variant_requires_shipping: 'TRUE',
          variant_taxable: 'TRUE',
          variant_barcode: '',
          image_src: product.images && product.images.length > 0 ? product.images[0] : '',
          image_position: '1',
          image_alt_text: product.title,
          gift_card: 'FALSE',
          seo_title: product.title,
          seo_description: '',
          status: 'active'
        };
        csvRows.push(row);
      }
      
      // Diğer görseller için satırlar ekle
      if (product.images && product.images.length > 1) {
        const MAX_IMAGES = 8;
        for (let i = 1; i < Math.min(product.images.length, MAX_IMAGES); i++) {
          csvRows.push({
            handle: handle,
            image_src: product.images[i],
            image_position: (i + 1).toString(),
            image_alt_text: `${product.title} - Image ${i + 1}`
          });
        }
      }
      
      // Tüm CSV satırlarına visibility düzeltmelerini uygula
      const updatedRows = csvRows.map(row => fixShopifyVisibility(row));
      csvRows.length = 0;
      updatedRows.forEach(row => csvRows.push(row));
      
      // CSV içeriğini debug
      console.log("CSV satırları oluşturuldu:", csvRows.length, 
                  "İlk satır status:", csvRows[0]?.status,
                  "İlk satır published:", csvRows[0]?.published);
      
      // Tüm satırları BÜYÜK HARF boolean değerleriyle düzelt
      const processedRows = csvRows.map(row => {
        // SHOPIFY 2024 FORMAT ÖZELLİKLERİ - MUTLAKA GEREKLİ
        
        // Vendor ve marka bilgisi - kritik
        row.vendor = 'turmarkt';
        
        // Temel ürün statüsü
        row.status = 'active';
        row.published_scope = 'web';  // Bu alan Shopify'da gerekli
        
        // ÖNEMLİ: Shopify için boolean alanlar BÜYÜK HARF olmalı
        row.published = row.published === 'true' ? 'TRUE' : (row.published === 'false' ? 'FALSE' : row.published || 'TRUE');
        
        // Option alanları - Shopify'da her ürün için bir option gerekli 
        if (!row.option1_name && !row.option1_value) {
          row.option1_name = 'Title';
          row.option1_value = 'Default Title';
        }
        
        // Variant alanları
        if (row.variant_requires_shipping === 'true') row.variant_requires_shipping = 'TRUE';
        if (row.variant_requires_shipping === 'false') row.variant_requires_shipping = 'FALSE';
        if (row.variant_taxable === 'true') row.variant_taxable = 'TRUE';
        if (row.variant_taxable === 'false') row.variant_taxable = 'FALSE';
        
        // Standart alanlar
        if (row.requires_shipping === 'true') row.requires_shipping = 'TRUE';
        if (row.requires_shipping === 'false') row.requires_shipping = 'FALSE';
        if (row.taxable === 'true') row.taxable = 'TRUE';
        if (row.taxable === 'false') row.taxable = 'FALSE';
        if (row.gift_card === 'true') row.gift_card = 'TRUE';
        if (row.gift_card === 'false') row.gift_card = 'FALSE';
        
        // Boolean değerleri uygun formata zorla
        if (!row.requires_shipping) row.requires_shipping = 'TRUE';
        if (!row.taxable) row.taxable = 'TRUE';
        if (!row.gift_card) row.gift_card = 'FALSE';
        
        // Variant ayarları
        row.variant_inventory_policy = 'deny';
        row.variant_fulfillment_service = 'manual';
        row.variant_inventory_management = 'shopify';
        
        // Fiyat ve stok düzenlemeleri
        if (row.inventory_quantity === undefined || row.inventory_quantity === '') {
          row.inventory_quantity = '50'; // Varsayılan stok miktarı
        }
        
        return row;
      });
      
      // Değerleri kontrol için son hali logla
      console.log("SON HALİ >> İlk satır published:", processedRows[0]?.published,
                 "İlk satır option1_name:", processedRows[0]?.option1_name,
                 "İlk satır option1_value:", processedRows[0]?.option1_value);
      
      // CSV uyumluluğu için son kontrol
      for (let i = 0; i < processedRows.length; i++) {
        const row = processedRows[i];
        
        // Alanları Shopify'ın beklediği formata dönüştür
        
        // Handle ve Title alanları
        if (i === 0 && (!row.handle || !row.title)) {
          console.error("HATA: Ana ürün için Handle veya Title eksik!");
        }
        
        // Boş veya undefined alanları temizle
        Object.keys(row).forEach(key => {
          if (row[key] === undefined) {
            row[key] = '';
          }
        });

        // Varyant alanları dönüşümü
        if (row.sku) {
          row.variant_sku = row.sku;
          delete row.sku;
        }
        
        if (row.price) {
          row.variant_price = row.price;
          delete row.price;
        }
        
        if (row.inventory_tracker) {
          row.variant_inventory_tracker = row.inventory_tracker;
          delete row.inventory_tracker;
        }
        
        if (row.inventory_quantity) {
          row.variant_inventory_qty = row.inventory_quantity;
          delete row.inventory_quantity;
        }
        
        if (row.inventory_policy) {
          row.variant_inventory_policy = row.inventory_policy;
          delete row.inventory_policy;
        }

        if (row.weight) {
          row.variant_grams = row.weight;
          delete row.weight;
        }
        
        // variant_weight -> variant_grams dönüşümü
        if (row.variant_weight) {
          row.variant_grams = row.variant_weight;
          delete row.variant_weight;
        }
        
        if (row.weight_unit) {
          row.variant_weight_unit = row.weight_unit;
          delete row.weight_unit;
        }
        
        if (row.requires_shipping) {
          row.variant_requires_shipping = row.requires_shipping;
          delete row.requires_shipping;
        }
        
        if (row.taxable) {
          row.variant_taxable = row.taxable;
          delete row.taxable;
        }
        
        if (row.fulfillment_service) {
          row.variant_fulfillment_service = row.fulfillment_service;
          delete row.fulfillment_service;
        }
      }
      
      // Tam CSV uyumluluğu için hata ayıklama
      const dataCheck = JSON.stringify(processedRows[0]).substring(0, 150);
      console.log("CSV VERİ KONTROLÜ: ", dataCheck);
      
      // CSV'yi yaz
      await csvWriter.writeRecords(processedRows);
      console.log(`CSV başarıyla oluşturuldu: ${outputPath} (${processedRows.length} satır)`);
      resolve(outputPath);
    } catch (error) {
      console.error('CSV oluşturma hatası:', error);
      console.error('Hata detayları:', JSON.stringify(error, null, 2));
      reject(error);
    }
  });
}