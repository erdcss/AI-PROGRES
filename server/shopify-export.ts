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
): string {
  /**
   * Shopify için ürün başlıklarını temizler ve optimize eder
   * 
   * Üç aşamalı temizleme:
   * 1. Düzensiz boşlukları ve yapısal sorunları düzeltir
   * 2. Trendyol'dan gelen yaygın hatalı kelime biçimlerini düzeltir
   * 3. Basit ve doğru tümceler oluşturur
   */
  function cleanProductTitle(title: string): string {
    if (!title) return title;
    
    console.log("Düzeltme öncesi başlık:", title);
    
    // Aşama 1: Temel boşluk düzeltmeleri
    title = title.replace(/\s+/g, ' ').trim();
    
    // Aşama 2: Karakter bazlı boşluk düzeltmeleri
    // Küçük harften büyük harfe geçişte boşluk ekle
    title = title.replace(/([a-zışğüöçâîû])([A-ZİŞĞÜÖÇÂÎÛ])/g, '$1 $2');
    
    // Aşama 3: Yaygın hatalı kelime biçimlerini düzelt
    // Çok görülen sorunlu kelimeler ayrı ayrı düzeltilir
    const wordFixes: Record<string, string> = {
      // Genel Sorunlar
      "Kulaklıkarışık": "Kulaklık Karışık",
      "karışıkrenk": "Karışık Renk", 
      "renkılıf": "Renk Kılıf",
      "Renkilıf": "Renk Kılıf",
      "Renkılıf": "Renk Kılıf",
      "RenkKılıf": "Renk Kılıf",
      "Ren kKılıf": "Renk Kılıf",
      "Kablo suz": "Kablosuz",
      
      // Çok görülen boşluk sorunları
      " K ": " ",
      "K kılıf": "Kılıf",
      "k Karışık": "Karışık",
      "k kılıf": "Kılıf",
      "Renkk": "Renk",
      "Ren k": "Renk",
      "kK": "k K",
      
      // Eksik Harfler
      "arışık": "Karışık",
      "ılıf": "Kılıf",
      "ediyeli": "Hediyeli",
      "Kulaklı ": "Kulaklık ",
      "Kulaklı": "Kulaklık",
      
      // Gereksiz marka bilgileri
      "Bilinmeyen Mar ka ": "",
      "Bilinmeyen Marka ": "",
      "Marka ": ""
    };
    
    // Her bir problemi düzelt
    for (const [wrong, correct] of Object.entries(wordFixes)) {
      title = title.replace(new RegExp(wrong, 'gi'), correct);
    }
    
    // Aşama 4: Kelime arası boşluk sorunlarını gider 
    // "AKelime" -> "A Kelime" şeklinde dönüştürür
    title = title.replace(/([A-ZİŞĞÜÖÇÂÎÛ])([A-ZİŞĞÜÖÇÂÎÛ][a-zışğüöçâîû]+)/g, '$1 $2');
    
    // Son aşama: Özel kelime parçalarını tek tek düzelt
    // Örneğin: "Renk Kılıf" yapıları için
    title = title
      .replace(/\bRen\s+k\b/gi, "Renk")
      .replace(/\bK\s+kılıf\b/gi, "Kılıf")
      .replace(/\s+K\s+/gi, " ")
      .replace(/\bKulaklı\b/gi, "Kulaklık")
      // Tek başına K harfi sorunları
      .replace(/\s[kK]\s/g, " ")
      .replace(/\s[kK](?=[A-Za-zışğüöçâîûİŞĞÜÖÇÂÎÛ])/g, " ");
    
    // Türkçe'ye özgü yaygın ürün kelimelerini kontrol et
    const turkishCommonWords = [
      "Kulaklık", "Kılıf", "Karışık", "Kablosuz", "Telefon", "Hediyeli",
      "Renk", "Android", "Uyumlu", "Bluetooth", "Stereo", "Set"
    ];
    
    // Türkçe terimleri düzgün ara boşlukla ayır
    turkishCommonWords.forEach(word => {
      // Önce "word" kelimesi kendisi değil, başka bir kelimeyle bitişikse, onları ayır
      const pattern = new RegExp(`${word}([a-zışğüöçâîûA-ZİŞĞÜÖÇÂÎÛ])`, 'g');
      title = title.replace(pattern, `${word} $1`);
      
      // Başka bir kelime "word" kelimesiyle birleşikse, onları da ayır
      const pattern2 = new RegExp(`([a-zışğüöçâîûA-ZİŞĞÜÖÇÂÎÛ])${word}`, 'g');
      title = title.replace(pattern2, `$1 ${word}`);
    });
    
    // Son boşluk temizliği ve normalizasyon
    title = title.replace(/\s+/g, ' ').trim();
    
    console.log("Düzeltme sonrası başlık:", title);
    
    return title;
  }
  
  product.title = cleanProductTitle(product.title);
  console.log("============================================");
  console.log("SHOPIFY CSV GENERATOR ÇİFT DOĞRULAMA KONTROLÜ");
  console.log("Shopify'a ürün yüklenme problemini çözüyoruz");
  console.log("============================================");
  console.log('Generating Shopify CSV:', { 
    productName: product.title,
    variants: { sizes: variants.sizes?.length || 0, colors: variants.colors?.length || 0 }
  });
  
  // Türkçe karakterleri İngilizce karşılıklarına çeviren yardımcı fonksiyon
  const turkishToEnglish = (text: string): string => {
    return text
      .replace(/ç/g, 'c')
      .replace(/Ç/g, 'C')
      .replace(/ğ/g, 'g')
      .replace(/Ğ/g, 'G')
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'I')
      .replace(/ö/g, 'o')
      .replace(/Ö/g, 'O')
      .replace(/ş/g, 's')
      .replace(/Ş/g, 'S')
      .replace(/ü/g, 'u')
      .replace(/Ü/g, 'U');
  };
  
  // CSV veri kalitesini doğrula ve gerekli düzeltmeleri yap
  function validateCSVRow(row: any, isFirstRow: boolean = false): boolean {
    // Temel veri doğrulama - boş veya null kontrolü
    if (!row || typeof row !== 'object') {
      return false;
    }
    
    // Handle kontrolü (birincil anahtar)
    if (!row.handle) {
      console.log("HATA: Handle eksik, satır geçersiz");
      return false;
    }
    
    // Ana ürün satırında olması gereken alanlar
    if (isFirstRow) {
      if (!row.title) {
        console.log("HATA: Ana ürün Title alanı eksik");
        return false;
      }
      
      if (!row.vendor) {
        row.vendor = 'turmarkt';
      }
      
      // Option alanı kontrolü
      if (!row.option1_name || !row.option1_value) {
        row.option1_name = 'Title';
        row.option1_value = 'Default Title';
      }
    }
    
    // Yayınlama durumu kontrolü
    if (!row.published) {
      row.published = 'TRUE';
    } else if (row.published.toLowerCase() === 'true') {
      row.published = 'TRUE'; // Büyük harfe dönüştür
    }
    
    // Diğer gerekli alanları doldur
    if (!row.published_on_online_store) {
      row.published_on_online_store = 'TRUE';
    }
    
    if (!row.status) {
      row.status = 'active';
    }
    
    // Veri uygun
    return true;
  }
  
  // Benzersiz handle oluşturma (slug)
  const createUniqueHandle = (title: string): string => {
    // Önce Türkçe karakterleri değiştir
    const normalized = turkishToEnglish(title);
    
    // Sadece alfanümerik karakterlere izin ver, diğerlerini tire ile değiştir
    return normalized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')      // Ardışık tireleri tek tireye dönüştür
      .replace(/^-|-$/g, '')    // Başta ve sonda tire varsa kaldır
      .substring(0, 60);        // Maksimum 60 karakter (Shopify sınırı)
  };
  
  // Shopify görüntüleme sorunu düzeltme: Gerekli alanların doğru formatları
  const fixShopifyVisibility = (row: any) => {
    // 1. ÖNEMLİ: Zorunlu alanların varlığını kontrol et
    if (!row.title) {
      console.error("HATA: Ürün başlığı eksik!");
      row.title = product.title || "Ürün Başlığı";
    }
    
    if (!row.vendor) {
      row.vendor = "turmarkt";
    }
    
    // 2. Status alanının "active" olması şart (status değil durum değil)
    row.status = 'active';
    
    // 3. ÖNEMLİ: Tüm Boolean alanlar BÜYÜK HARF olmalı
    row.published = 'TRUE';
    row.published_on_online_store = 'TRUE'; // Önemli: Online mağazada yayınlanma durumu
    
    // 4. Published tarih ve kapsamı - Shopify 2024 gerekliliği
    row.published_scope = 'web';  // Bu alan Shopify'da gerekli
    row.published_at = new Date().toISOString(); // Şu anki tarih/saat
    
    // 5. Shopify'da varyant ayarları için kritik değişiklikler
    row.variant_inventory_policy = 'deny'; // Şart
    row.variant_fulfillment_service = 'manual'; // Şart
    
    // 6. Temel envanter ve durum ayarları
    row.inventory_policy = 'deny';
    row.fulfillment_service = 'manual';
    
    // 7. Handle alanı - Shopify için kritik önem taşır
    if (!row.handle) {
      if (row.title) {
        row.handle = createUniqueHandle(row.title);
      } else {
        // Yedek handle oluştur
        row.handle = `product-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      }
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
      // Shopify'ın kesin istediği format (2024 şablonu)
      // ÖNEMLİ: Başlık isimleri ve sıralaması kritik önem taşır
      const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: [
          // 2024 SHOPIFY IMPORT FORMAT - KESIN SHOPIFY BAŞLIK SIRASI
          { id: 'handle', title: 'Handle' },
          { id: 'title', title: 'Title' },
          { id: 'body_html', title: 'Body (HTML)' },
          { id: 'vendor', title: 'Vendor' },
          { id: 'standard_product_type', title: 'Standard Product Type' },
          { id: 'custom_product_type', title: 'Custom Product Type' },
          { id: 'tags', title: 'Tags' },
          { id: 'published', title: 'Published' },
          { id: 'status', title: 'Status' },
          { id: 'published_at', title: 'Published At' },
          { id: 'published_scope', title: 'Published Scope' },
          { id: 'template_suffix', title: 'Template Suffix' },
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
          { id: 'google_shopping_adwords_grouping', title: 'Google Shopping / AdWords Grouping' },
          { id: 'google_shopping_adwords_labels', title: 'Google Shopping / AdWords Labels' },
          { id: 'google_shopping_condition', title: 'Google Shopping / Condition' },
          { id: 'google_shopping_custom_product', title: 'Google Shopping / Custom Product' },
          { id: 'google_shopping_custom_label_0', title: 'Google Shopping / Custom Label 0' },
          { id: 'google_shopping_custom_label_1', title: 'Google Shopping / Custom Label 1' },
          { id: 'google_shopping_custom_label_2', title: 'Google Shopping / Custom Label 2' },
          { id: 'google_shopping_custom_label_3', title: 'Google Shopping / Custom Label 3' },
          { id: 'google_shopping_custom_label_4', title: 'Google Shopping / Custom Label 4' },
          { id: 'variant_image', title: 'Variant Image' },
          { id: 'variant_weight_unit', title: 'Variant Weight Unit' },
          { id: 'variant_tax_code', title: 'Variant Tax Code' },
          { id: 'cost_per_item', title: 'Cost per item' }
        ]
      });

      // CSV satırlarını oluştur
      const csvRows: any[] = [];
      
      // Handle oluştur (URL-uyumlu slug)
      const handle = createUniqueHandle(product.title);
      
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
      
      // Elektronik ürün türleri
      const isElectronicProduct = product.categories ? product.categories.some((cat: string) => 
        cat.toLowerCase().includes('elektronik') || 
        cat.toLowerCase().includes('dijital') ||
        cat.toLowerCase().includes('tartı') ||
        cat.toLowerCase().includes('baskül') ||
        cat.toLowerCase().includes('cihaz') ||
        cat.toLowerCase().includes('ölçer')
      ) : false;
      
      // Varyantları belirle
      const sizes = variants.sizes || [];
      const colors = variants.colors || [];
      // Elektronik ürünler için renk varyantı kullanma - daha uyumlu Title/Default Title formatı kullan
      const hasVariants = sizes.length > 0 || (colors.length > 0 && !isElectronicProduct);
      
      // Ana ürün satırı
      if (hasVariants) {
        // Varyantlı ürün veya elektronik ürün kontrol
        // Elektronik ürünler için Title/Default Title formatına zorla
        if (isElectronicProduct) {
          // Elektronik ürün için standart Title/Default Title formatı
          let row = {
            handle: handle,
            title: product.title,
            body_html: generateBodyHTML(),
            vendor: 'turmarkt',
            product_category: 'Electronics & Accessories',
            type: product.categories && product.categories.length > 0 
              ? product.categories[product.categories.length - 1] 
              : 'Elektronik',
            tags: product.tags || '',
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
        }
        else if (sizes.length > 0) {
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
                  variant_weight_unit: 'g',
                  published: 'TRUE',
                  published_on_online_store: 'TRUE'
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
                variant_sku: `${handle}-${sizes[i]}`,
                variant_price: product.price,
                variant_inventory_tracker: 'shopify',
                variant_inventory_qty: '50',
                variant_inventory_policy: 'deny',
                variant_requires_shipping: 'TRUE',
                variant_taxable: 'TRUE',
                variant_fulfillment_service: 'manual',
                variant_grams: '500',
                variant_weight_unit: 'g',
                published: 'TRUE',
                published_on_online_store: 'TRUE'
              });
            }
          }
        } else if (colors.length > 0) {
          // Sadece renk varyantları
          // Tek renk varyantlı veya özel ürün türleri için standartlaştırılmış format
          if (colors.length === 1) {
            // Tek renkli ürünler için Title/Default Title formatı - tüm ürün türleri için geçerli
            let row = {
              handle: handle,
              title: product.title,
              body_html: generateBodyHTML(),
              vendor: 'turmarkt',
              product_category: 'Apparel & Accessories > Clothing',
              type: product.categories && product.categories.length > 0 
                ? product.categories[product.categories.length - 1] 
                : 'Elektronik',
              tags: product.tags || '',
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
                variant_sku: `${handle}-${colors[i]}`,
                variant_price: product.price,
                variant_inventory_tracker: 'shopify',
                variant_inventory_qty: '50',
                variant_inventory_policy: 'deny',
                variant_requires_shipping: 'TRUE',
                variant_taxable: 'TRUE',
                variant_fulfillment_service: 'manual',
                variant_grams: '500',
                variant_weight_unit: 'g',
                published: 'TRUE',
                published_on_online_store: 'TRUE'
              });
            }
          }
        }
      } else {
        // Varyantı olmayan temel ürün - Shopify şablonunda Title/Default Title zorunlu
        // ÖNEMLİ: option1_name ve option1_value yoksa, ürün Shopify'da görünmez!
        let row = {
          handle: handle,
          title: product.title,
          body_html: generateBodyHTML(),
          vendor: 'turmarkt',
          type: product.categories && product.categories.length > 0 
            ? product.categories[product.categories.length - 1] 
            : (isElectronicProduct ? 'Elektronik' : 'Giyim'),
          tags: product.tags || '',
          published: 'TRUE',
          status: 'active',
          
          // ZORUNLU: Her ürün için en az bir option gerekli
          option1_name: 'Title',
          option1_value: 'Default Title',
          option2_name: '',
          option2_value: '',
          option3_name: '',
          option3_value: '',
          
          // Varyant alanları
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
          
          // Görsel alanları - URL'yi doğru formata dönüştür
          image_src: product.images && product.images.length > 0 
            ? (product.images[0].startsWith('http') 
               ? product.images[0] 
               : 'https://' + product.images[0].replace(/^\/\//, ''))
            : '',
          image_position: '1',
          image_alt_text: product.title,
          
          // Diğer alanlar
          gift_card: 'FALSE',
          seo_title: product.title,
          seo_description: ''
        };
        csvRows.push(row);
      }
      
      // Diğer görseller için satırlar ekle
      if (product.images && product.images.length > 1) {
        const MAX_IMAGES = 8;
        for (let i = 1; i < Math.min(product.images.length, MAX_IMAGES); i++) {
          // Görsel URL'lerini doğru formata dönüştür
          let imageUrl = product.images[i];
          
          // HTTP protokolünü kontrol et
          if (!imageUrl.startsWith('http')) {
            imageUrl = 'https://' + imageUrl.replace(/^\/\//, '');
          }
          
          csvRows.push({
            handle: handle,
            published: 'TRUE', // Görsellerin de published=TRUE olması gerekiyor
            option1_name: 'Title', // Her satır için option gerekli
            option1_value: 'Default Title',
            // Shopify 2024 formatına uygun alanlar
            image_src: imageUrl,
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
        
        // Temel ürün statüsü - Shopify 2024 gereksinimleri
        row.status = 'active';
        
        // ÖNEMLİ: Shopify 2024'te Kullanılan Yeni Alan İsimleri
        row.published = 'TRUE'; // Ana boolean - BÜYÜK HARF olmalı
        row.published_at = new Date().toISOString(); // Şu anki tarih/saat
        
        // Shopify 2024'te Online Store Visibility için ek alan
        row.published_scope = 'web';
        row.published_on_online_store = 'TRUE';
        
        // Option alanları - Shopify'da her ürün için en az bir option gerekli (zorunlu alan)
        if (!row.option1_name || !row.option1_value) {
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
      
      // Alan adlarını Shopify uyumlu şekilde yeniden eşleştir
      // ÖNEMLİ: Shopify, alan adlarının birebir uymasını bekler (büyük/küçük harf ve boşluklara duyarlı)
      const mappedRows = processedRows.map(row => {
        const newRow: any = {};
        
        // SHOPIFY FORMAT EŞLEŞTİRME TABLOSU - birebir aynı olmalı
        const fieldMapping: Record<string, string> = {
          // Shopify ana alanları (tam olarak örnek CSV'deki gibi)
          'handle': 'Handle',                          // Handle - Zorunlu
          'title': 'Title',                            // Title - Zorunlu
          'body_html': 'Body (HTML)',                  // Body (HTML)  
          'vendor': 'Vendor',                          // Vendor - Zorunlu
          'product_category': 'Product Category',      // Product Category
          'type': 'Type',                              // Type
          'tags': 'Tags',                              // Tags
          'published': 'Published',                    // Published (örnek CSV'de Published)
          'published_at': 'Published At',              // Published At
          'published_scope': 'Published Scope',        // Published Scope
          'template_suffix': 'Template Suffix',        // Template Suffix
          'status': 'Status',                          // Status
          'variant_sku': 'Variant SKU',                // Variant SKU
          'variant_barcode': 'Variant Barcode',        // Variant Barcode
          'option1_name': 'Option1 Name',              // Option1 Name - Zorunlu
          'option1_value': 'Option1 Value',            // Option1 Value - Zorunlu
          'option2_name': 'Option2 Name',              // Option2 Name
          'option2_value': 'Option2 Value',            // Option2 Value
          'option3_name': 'Option3 Name',              // Option3 Name
          'option3_value': 'Option3 Value',            // Option3 Value
          'variant_price': 'Variant Price',            // Variant Price - Zorunlu
          'variant_compare_at_price': 'Variant Compare At Price', // Variant Compare At Price
          'variant_cost': 'Variant Cost',              // Variant Cost
          'variant_taxable': 'Variant Taxable',        // Variant Taxable
          'variant_tax_code': 'Variant Tax Code',      // Variant Tax Code
          'variant_inventory_tracker': 'Variant Inventory Tracker',  // Variant Inventory Tracker
          'variant_inventory_qty': 'Variant Inventory Qty',  // Variant Inventory Qty
          'variant_inventory_policy': 'Variant Inventory Policy',  // Variant Inventory Policy
          'variant_requires_shipping': 'Variant Requires Shipping',  // Variant Requires Shipping
          'variant_fulfillment_service': 'Variant Fulfillment Service',  // Variant Fulfillment Service  
          'variant_weight_unit': 'Variant Weight Unit',  // Variant Weight Unit
          'variant_grams': 'Variant Grams',            // Variant Grams
          'image_src': 'Image Src',                    // Image Src
          'image_position': 'Image Position',          // Image Position
          'image_alt_text': 'Image Alt Text',          // Image Alt Text
          'variant_image': 'Variant Image',            // Variant Image
          'gift_card': 'Gift Card',                    // Gift Card
          'seo_title': 'SEO Title',                    // SEO Title
          'seo_description': 'SEO Description',        // SEO Description
          
          // Alternatif alan adları (uyumluluk için)
          'url_handle': 'Handle',                      // URL handle -> Handle 
          'description': 'Body (HTML)',                // Description -> Body (HTML)
          'option1 name': 'Option1 Name',              // option1 name -> Option1 Name
          'option1 value': 'Option1 Value',            // option1 value -> Option1 Value
          'price': 'Variant Price',                    // Price -> Variant Price
          'sku': 'Variant SKU',                        // SKU -> Variant SKU
          'product_image_url': 'Image Src',            // Product image URL -> Image Src
          
          // Varyant alanları
          'weight': 'Variant Grams',                   // weight -> Variant Grams
          'weight_unit': 'Variant Weight Unit',        // weight_unit -> Variant Weight Unit
          'inventory_quantity': 'Variant Inventory Qty',     // inventory_quantity -> Variant Inventory Qty
          'inventory_tracker': 'Variant Inventory Tracker',  // inventory_tracker -> Variant Inventory Tracker
          'inventory_policy': 'Variant Inventory Policy',    // inventory_policy -> Variant Inventory Policy
          'fulfillment_service': 'Variant Fulfillment Service' // fulfillment_service -> Variant Fulfillment Service
        };
        
        // Tüm bilinen alan eşleştirmelerini uygula
        Object.entries(row).forEach(([oldKey, value]) => {
          if (fieldMapping[oldKey]) {
            const newKey = fieldMapping[oldKey];
            newRow[newKey] = value;
            delete row[oldKey];
          }
        });
        
        // Kalan tüm orijinal alanları kopyala
        Object.entries(row).forEach(([key, value]) => {
          // Anahtar zaten işlenmediyse, birebir kopyala
          if (newRow[key] === undefined) {
            newRow[key] = value;
          }
        });
        
        return newRow;
      });
      
      // Boş satırları ve geçersiz verileri filtrele
      // ÖNEMLİ: Shoify'a yüklenmeden önce tüm boş satırları temizle
      const filteredRows = mappedRows.filter(row => {
        // 1. Hiç bir değer içermeyen satırları tamamen filtrele
        const hasValues = Object.values(row).some(value => 
          value !== undefined && value !== null && value !== '');
        
        if (!hasValues) {
          console.log("UYARI: Tamamen boş satır filtrelendi");
          return false;
        }
        
        // 2. İlk satır için tüm kritik alanları kontrol et
        if (row === mappedRows[0]) {
          // İlk satır için handle, title, vendor zorunlu
          if (!row.handle || !row.title || !row.vendor) {
            console.log("UYARI: Ana ürün satırında eksik alanlar var, düzeltiliyor");
            if (!row.handle) row.handle = createUniqueHandle(row.title || `product-${Date.now()}`);
            if (!row.title) row.title = product.title || "Ürün";
            if (!row.vendor) row.vendor = "turmarkt";
          }
          
          // İlk satırda option1_name ve option1_value zorunlu
          if (!row.option1_name || !row.option1_value) {
            row.option1_name = 'Title';
            row.option1_value = 'Default Title';
          }
          
          // Diğer kritik alanları doldur (ürünü gizlememek için)
          row.published = 'TRUE';
          row.status = 'active';
          
        } else {
          // Diğer satırlar (görseller, varyantlar) için
          
          // 2. Handle eksikse filtrele
          if (!row.handle) {
            console.log("UYARI: Handle değeri eksik olan satır filtrelendi");
            return false;
          }
          
          // Varyant veya görsel satırları için gerekli alanlar
          if (row.image_src || row.image_position) {
            // Görsel satırı, gerekli alanları ekle
            row.published = 'TRUE';
          } else {
            // Varyant satırı, Option kontrolü yap
            if (!row.option1_name || !row.option1_value) {
              // Eksik option verileri içeren satır gördük, tamamlayalım
              row.option1_name = 'Title';
              row.option1_value = 'Default Title';
            }
          }
        }
        
        // Bu satırı kabul et
        return true;
      });
      
      console.log(`Filtreleme sonrası: ${processedRows.length} satırdan ${filteredRows.length} satır kaldı`);
      
      // Tam CSV uyumluluğu için hata ayıklama
      const dataCheck = JSON.stringify(filteredRows[0]).substring(0, 150);
      console.log("CSV VERİ KONTROLÜ: ", dataCheck);
      
      // CSV'yi yaz - sadece filtrelenmiş satırları kullan
      await csvWriter.writeRecords(filteredRows);
      console.log(`CSV başarıyla oluşturuldu: ${outputPath} (${filteredRows.length} satır)`);
      resolve(outputPath);
    } catch (error) {
      console.error('CSV oluşturma hatası:', error);
      console.error('Hata detayları:', JSON.stringify(error, null, 2));
      reject(error);
    }
  });
}