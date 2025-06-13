import { Product } from "@shared/schema";
import { createObjectCsvWriter } from "csv-writer";
import { tmpdir } from "os";
import { join } from "path";
import fs from "fs";

// CSV için güvenli metin temizleme - tırnak hatalarını tamamen önler
function escapeForCSV(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  // Convert to string and remove all HTML tags
  let cleaned = String(text).replace(/<[^>]*>/g, '');
  
  // Remove all problematic characters that cause CSV parsing issues
  cleaned = cleaned
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Control characters
    .replace(/[""]/g, '') // Remove smart quotes entirely
    .replace(/['']/g, '') // Remove smart apostrophes entirely  
    .replace(/[–—]/g, '-') // Convert dashes to hyphens
    .replace(/[…]/g, '...') // Convert ellipsis
    .replace(/[\n\r\t]+/g, ' ') // Convert line breaks and tabs to spaces
    .replace(/[^\w\s.,!?;:()\-+='çğıöşüÇĞIÖŞÜ]/g, ' ') // Keep only safe characters
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .trim();
  
  // Final safety check - remove any remaining quotes or commas that could break CSV
  cleaned = cleaned.replace(/[",]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Bu dosya Shopify uyumlu CSV oluşturmak için tasarlanmıştır
 * Shopify'ın kesin CSV formatını kullanır
 * 
 * LOGO/ETIKET FILTRELEME:
 * L'OREAL gibi logolar ve Fenerli Kozmetik gibi etiketler içeren görseller filtrelenir
 */

// Logo ve metin etiketleri içeren görselleri filtrelemek için URL parçaları
const BLACKLISTED_IMAGE_TERMS = [
  'logo', 'badge', 'text-label', 'overlay', 'loreal', 'fener', 'kozmetik',
  'seller-store', 'basarili_satici', 'hizli-satici', 'indexing-sticker',
  'generated-logo', 'preview', 'enerjietiketi', 'authorized-seller', 'free-shipping',
  '.svg', '.css', '.js', '.html', 'sticker-stamp', 'web-pdp', 'web-gray', 
  'indexing-sticker', 'statics', 'stamp', 'Assets', 'icon', 'webp', 'mweb',
  'satici-store', 'sticker', 'etiket', 'kampanya', 'overlay',
  'saticistore', 'shipping-icon', 'tick-icon', 'kalp', 'sepet', 'satanlar',
  'cok_satanlar', 'en_cok_sepete_eklenenler', 'en_begenilenler'
];

// Görsel URL'inin gerçek ürün görseli olup olmadığını kontrol et
function isValidProductImage(url: string): boolean {
  if (!url) return false;
  
  // URL'de yasaklı terimlerden biri var mı kontrol et
  const isBlacklisted = BLACKLISTED_IMAGE_TERMS.some(term => 
    url.toLowerCase().includes(term.toLowerCase())
  );
  
  // URL içinde "org_zoom.jpg" veya "mnresize/1200" gibi gerçek ürün görseli içeriyor mu
  const isRealProductImage = url.includes('org_zoom.jpg') || 
                          url.includes('mnresize/1200') || 
                          url.includes('cdn.dsmcdn.com/ty') ||
                          url.includes('/prod/');
  
  // Gerçek ürün görseli ve yasaklı terim içermeyen URL'ler için true döndür
  return isRealProductImage && !isBlacklisted;
}

export function generateShopifyCSV(
  product: Product,
  variants: { 
    sizes?: string[], 
    colors?: string[] 
  } = {},
  outputPath: string = join(tmpdir(), 'shopify_products.csv')
): string {
  // Ürün fiyatına %10 kar ekle
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    const priceWithProfit = (basePrice * 1.10).toFixed(2);
    console.log(`FİYAT GÜNCELLEME: ${basePrice} TL + %10 kar = ${priceWithProfit} TL`);
    product.price = priceWithProfit;
  }
  
  // Ürün görsellerini filtrele - sadece gerçek ürün görselleri kalsın
  if (product.images && product.images.length > 0) {
    const originalImagesCount = product.images.length;
    product.images = product.images.filter(img => isValidProductImage(img));
    console.log(`GÖRSEL FİLTRELEME: ${originalImagesCount} görsel içinden ${product.images.length} gerçek ürün görseli seçildi`);
  }
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
      // Tek başına K harfi sorunları - Kadın gibi önemli kelimeleri koruyalım
      .replace(/\s[kK]\s/g, " ");
    
    // Türkçe'ye özgü yaygın ürün kelimelerini kontrol et
    const turkishCommonWords = [
      "Kulaklık", "Kılıf", "Karışık", "Kablosuz", "Telefon", "Hediyeli",
      "Renk", "Android", "Uyumlu", "Bluetooth", "Stereo", "Set",
      "Kadın", "Erkek", "Çocuk", "Unisex", "Sneaker", "Spor", "Ayakkabı"
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
        // Başlıktan düzgün bir handle oluştur
        const cleanTitle = row.title.trim();
        row.handle = createUniqueHandle(cleanTitle);
      } else if (product && product.title) {
        // Başlık yoksa ana ürün başlığını kullan
        row.handle = createUniqueHandle(product.title);
      } else {
        // Son çare olarak timestamp kullan
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
  // CSV satırındaki tüm değerleri temizle
  function sanitizeCSVRow(row: any): any {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string') {
        sanitized[key] = escapeForCSV(value);
      } else if (value === null || value === undefined) {
        sanitized[key] = '';
      } else {
        sanitized[key] = String(value);
      }
    }
    return sanitized;
  }

  return new Promise(async (resolve, reject) => {
    try {
      // Shopify'ın kesin istediği format (2024 şablonu)
      // ÖNEMLİ: Başlık isimleri ve sıralaması kritik önem taşır
      const csvWriter = createObjectCsvWriter({
        path: outputPath,
        encoding: 'utf8',
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
      
      // Body HTML oluştur - Sadece düz metin, HTML yok
      const generateBodyHTML = () => {
        // Sadece ürün başlığını kullan - en güvenli yöntem
        return escapeForCSV(product.title || 'Ürün');
      };
      
      // Ana ürün ve varyantları kontrol et
      const productHasVariants = 
        variants && 
        ((variants.sizes && variants.sizes.length > 0) || 
         (variants.colors && variants.colors.length > 0));
      
      const sizes = variants?.sizes || [];
      const colors = variants?.colors || [];
      const hasSizeVariants = sizes?.length > 0;
      const hasColorVariants = colors?.length > 0;
      
      // Elektronik ürün kontrolü
      const isElectronicProduct = product.category && 
                                (product.category.includes('Elektronik') || 
                                 product.category.includes('Bilgisayar') ||
                                 product.category.includes('Telefon'));
      
      // Etiketleri hazırla (Shopify için önemli)
      let tags = '';
      
      // Kategori bilgisinden etiketler oluştur
      if (product.category) {
        // Kategori ağacını etiketlere çevir (maksimum 3 etiket)
        const categoryParts = product.category.split('>').map(part => part.trim());
        const maxTags = Math.min(3, categoryParts.length);
        
        // İlk 3 etiketi al, Trendyol kelimesini temizle
        const categoryTags = categoryParts
          .slice(0, maxTags)
          .map(tag => tag.replace(/trendyol/i, '').trim())
          .filter(tag => tag.length > 0 && tag.length <= 20); // 20 karakter sınırı
          
        tags = categoryTags.join(',');
      }

      if (productHasVariants) {
        // Sadece beden varyantları içeren ürün
        if (hasSizeVariants && !hasColorVariants) {
          let mainRow = {
            handle: handle,
            title: product.title,
            body_html: generateBodyHTML(),
            vendor: 'turmarkt',
            product_category: 'Apparel & Accessories > Clothing',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Giyim'
              : 'Giyim',
            tags: tags,
            published: 'TRUE',
            status: 'active',
            option1_name: 'Size',
            option1_value: sizes[0], // İlk beden değeri
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
            variant_weight_unit: 'g',
            published_scope: 'web'
          };
          
          // Ana satırı ekle
          csvRows.push(fixShopifyVisibility(mainRow));
          
          // Diğer beden varyantlarını ekle
          for (let i = 1; i < sizes.length; i++) {
            const variantRow = {
              handle: handle,
              title: '',
              body_html: '',
              vendor: '',
              option1_value: sizes[i],
              option2_value: '',
              option3_value: '',
              variant_sku: `${handle}-${sizes[i]}`,
              variant_grams: '500',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: '50',
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_price: product.price,
              variant_requires_shipping: 'TRUE',
              variant_taxable: 'TRUE',
              variant_weight_unit: 'g'
            };
            
            csvRows.push(fixShopifyVisibility(variantRow));
          }
        }
        // Sadece renk varyantları içeren ürün
        else if (hasColorVariants && !hasSizeVariants) {
          let mainRow = {
            handle: handle,
            title: product.title,
            body_html: product.title,
            vendor: 'turmarkt',
            product_category: 'Apparel & Accessories',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Giyim'
              : 'Giyim',
            tags: tags,
            published: 'TRUE',
            status: 'active',
            option1_name: 'Color',
            option1_value: colors[0], // İlk renk değeri
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
            variant_weight_unit: 'g'
          };
          
          // Ana satırı ekle
          csvRows.push(fixShopifyVisibility(mainRow));
          
          // Diğer renk varyantlarını ekle
          for (let i = 1; i < colors.length; i++) {
            const variantRow = {
              handle: handle,
              title: product.title,
              body_html: product.title,
              vendor: 'turmarkt',
              option1_value: colors[i],
              option2_value: '',
              option3_value: '',
              variant_sku: `${handle}-${colors[i]}`,
              variant_grams: '500',
              variant_inventory_tracker: 'shopify',
              variant_inventory_qty: '50',
              variant_inventory_policy: 'deny',
              variant_fulfillment_service: 'manual',
              variant_price: product.price,
              variant_requires_shipping: 'TRUE',
              variant_taxable: 'TRUE',
              variant_weight_unit: 'g'
            };
            
            csvRows.push(fixShopifyVisibility(variantRow));
          }
        }
        // Hem beden hem renk varyantları içeren ürün
        else if (hasSizeVariants && hasColorVariants) {
          let row = {
            handle: handle,
            title: product.title,
            body_html: generateBodyHTML(),
            vendor: 'turmarkt',
            product_category: 'Apparel & Accessories > Clothing',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Giyim'
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
            variant_inventory_tracker: 'shopify',
            variant_inventory_qty: '50',
            variant_inventory_policy: 'deny',
            variant_fulfillment_service: 'manual',
            variant_price: product.price,
            variant_requires_shipping: 'TRUE',
            variant_taxable: 'TRUE',
            variant_barcode: '',
            image_src: product.images && product.images.length > 0 ? product.images[0] : '',
            variant_weight_unit: 'g'
          };
          
          // Ana satırı ekle
          csvRows.push(fixShopifyVisibility(row));
          
          // Tüm beden ve renk kombinasyonlarını ekle
          for (let i = 0; i < sizes.length; i++) {
            for (let j = 0; j < colors.length; j++) {
              // İlk kombinasyon zaten eklendi, diğerlerini ekle
              if (i === 0 && j === 0) continue;
              
              const variantRow = {
                handle: handle,
                title: '',
                body_html: '',
                vendor: '',
                option1_value: sizes[i],
                option2_value: colors[j],
                option3_value: '',
                variant_sku: `${handle}-${sizes[i]}-${colors[j]}`,
                variant_grams: '500',
                variant_inventory_tracker: 'shopify',
                variant_inventory_qty: '50',
                variant_inventory_policy: 'deny',
                variant_fulfillment_service: 'manual',
                variant_price: product.price,
                variant_requires_shipping: 'TRUE',
                variant_taxable: 'TRUE',
                variant_weight_unit: 'g'
              };
              
              csvRows.push(fixShopifyVisibility(variantRow));
            }
          }
        }
      } else {
        // Elektronik ürün ise farklı kategori ve type bilgisi
        if (isElectronicProduct) {
          let row = {
            handle: handle,
            title: product.title,
            body_html: generateBodyHTML(),
            vendor: 'turmarkt',
            product_category: 'Electronics & Accessories',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Elektronik'
              : 'Elektronik',
            tags: product.tags || '',
            published: 'TRUE',
            status: 'active',
            variant_sku: handle,
            variant_grams: '1000',
            variant_inventory_tracker: 'shopify',
            variant_inventory_qty: '50',
            variant_inventory_policy: 'deny',
            variant_fulfillment_service: 'manual',
            variant_price: product.price,
            variant_requires_shipping: 'TRUE',
            variant_taxable: 'TRUE',
            variant_barcode: '',
            image_src: product.images && product.images.length > 0 ? product.images[0] : '',
            option1_name: 'Title',
            option1_value: 'Default Title',
            variant_weight_unit: 'g',
            published_on_online_store: 'TRUE'
          };
          
          csvRows.push(fixShopifyVisibility(row));
        } else {
          // Varyantı olmayan temel ürün - Shopify şablonunda Title/Default Title zorunlu
          // ÖNEMLİ: option1_name ve option1_value yoksa, ürün Shopify'da görünmez!
          let row = {
            handle: handle,
            title: product.title,
            body_html: generateBodyHTML(),
            vendor: 'turmarkt',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Giyim'
              : 'Giyim',
            tags: product.tags || '',
            published: 'TRUE',
            status: 'active',
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
            variant_requires_shipping: 'TRUE',
            variant_taxable: 'TRUE',
            variant_barcode: '',
            image_src: product.images && product.images.length > 0 ? product.images[0] : '',
            variant_weight_unit: 'g'
          };
          
          csvRows.push(fixShopifyVisibility(row));
        }
      }
      
      // Ürün görselleri için ayrı satırlar (Shopify için önemli)
      if (product.images && product.images.length > 1) {
        // İlk görsel zaten ana üründe, diğer görseller için ayrı satırlar ekle
        for (let i = 1; i < product.images.length; i++) {
          const imageRow = {
            handle: handle,
            title: product.title,
            body_html: generateBodyHTML(),
            vendor: 'turmarkt',
            published: 'TRUE',
            status: 'active',
            image_src: product.images[i],
            image_position: (i + 1).toString(),
            image_alt_text: `${product.title} - ${i + 1}`
          };
          
          csvRows.push(fixShopifyVisibility(imageRow));
        }
      }
      
      // CSV dosyası için satırları hazırla - alan eşleştirmeleri yap
      const processedRows = csvRows.map(row => {
        // Satırı Shopify uyumluluk katmanından geçir
        const fixedRow = fixShopifyVisibility(row);
        
        // Şimdi Shopify'ın 2024 CSV belgeleri ile uyumlu hale getir
        const newRow: Record<string, any> = {};
        
        // Alan eşleştirme (değişen Shopify başlıklarına uyum)
        const fieldMapping: Record<string, string> = {
          // Shopify alanları - kesin API alanları (2024)
          'id': 'ID',                                  // Shopify Product ID
          'handle': 'Handle',                         // URL-friendly name
          'title': 'Title',                           // Product title
          'body_html': 'Body (HTML)',                // Product description
          'vendor': 'Vendor',                        // Manufacturer
          'standard_product_type': 'Standard Product Type', // Ürün tipi (standart)
          'custom_product_type': 'Custom Product Type',    // Özel ürün tipi
          'tags': 'Tags',                            // Tags
          'published': 'Published',                  // Whether product is published
          'status': 'Status',                        // Product status (active, draft)
          'published_at': 'Published At',            // Publish date
          'published_scope': 'Published Scope',      // Publish scope
          'template_suffix': 'Template Suffix',      // Template override
          'option1_name': 'Option1 Name',            // First option name
          'option1_value': 'Option1 Value',          // First option value
          'option2_name': 'Option2 Name',            // Second option name
          'option2_value': 'Option2 Value',          // Second option value
          'option3_name': 'Option3 Name',            // Third option name
          'option3_value': 'Option3 Value',          // Third option value
          'variant_sku': 'Variant SKU',              // Variant stock keeping unit
          'variant_grams': 'Variant Grams',          // Variant weight in grams
          'variant_inventory_tracker': 'Variant Inventory Tracker', // Variant inventory tracking
          'variant_inventory_qty': 'Variant Inventory Qty',         // Variant inventory quantity
          'variant_inventory_policy': 'Variant Inventory Policy',   // Variant inventory policy
          'variant_fulfillment_service': 'Variant Fulfillment Service', // Variant fulfillment service
          'variant_price': 'Variant Price',          // Variant price
          'variant_compare_at_price': 'Variant Compare At Price', // Variant compare at price
          'variant_requires_shipping': 'Variant Requires Shipping', // Variant requires shipping
          'variant_taxable': 'Variant Taxable',      // Variant taxable
          'variant_barcode': 'Variant Barcode',      // Variant barcode
          'image_src': 'Image Src',                  // Image source URL
          'image_position': 'Image Position',        // Image position
          'image_alt_text': 'Image Alt Text',        // Image alt text
          'gift_card': 'Gift Card',                  // Gift card
          'seo_title': 'SEO Title',                  // SEO title
          'seo_description': 'SEO Description',      // SEO description
          
          // Google Shopping alanları
          'google_shopping_google_product_category': 'Google Shopping / Google Product Category',
          'google_shopping_gender': 'Google Shopping / Gender',
          'google_shopping_age_group': 'Google Shopping / Age Group',
          'google_shopping_mpn': 'Google Shopping / MPN',
          'google_shopping_adwords_grouping': 'Google Shopping / AdWords Grouping',
          'google_shopping_adwords_labels': 'Google Shopping / AdWords Labels',
          'google_shopping_condition': 'Google Shopping / Condition',
          'google_shopping_custom_product': 'Google Shopping / Custom Product',
          'google_shopping_custom_label_0': 'Google Shopping / Custom Label 0',
          'google_shopping_custom_label_1': 'Google Shopping / Custom Label 1',
          'google_shopping_custom_label_2': 'Google Shopping / Custom Label 2',
          'google_shopping_custom_label_3': 'Google Shopping / Custom Label 3',
          'google_shopping_custom_label_4': 'Google Shopping / Custom Label 4',
          'variant_image': 'Variant Image',            // Variant Image
          'variant_weight_unit': 'Variant Weight Unit',  // Variant Weight Unit
          // Removed duplicate properties
          
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
        Object.entries(fixedRow).forEach(([oldKey, value]) => {
          if (fieldMapping[oldKey]) {
            const newKey = fieldMapping[oldKey];
            newRow[newKey] = value;
            delete fixedRow[oldKey];
          }
        });
        
        // Kalan tüm orijinal alanları kopyala
        Object.entries(fixedRow).forEach(([key, value]) => {
          // Anahtar zaten işlenmediyse, birebir kopyala
          if (newRow[key] === undefined) {
            newRow[key] = value;
          }
        });
        
        return newRow;
      });
      
      // Boş satırları ve geçersiz verileri filtrele
      // ÖNEMLİ: Shoify'a yüklenmeden önce tüm boş satırları temizle
      const filteredRows = processedRows.filter(row => {
        // 1. Hiç bir değer içermeyen satırları tamamen filtrele
        const hasValues = Object.values(row).some(value => 
          value !== undefined && value !== null && value !== '');
        
        if (!hasValues) {
          console.log("UYARI: Tamamen boş satır filtrelendi");
          return false;
        }
        
        // 2. İlk satır için tüm kritik alanları kontrol et
        if (row === processedRows[0]) {
          // Ana ürün için Handle ve Title şart
          if (!row.Handle || !row.Title || !row['Option1 Name'] || !row['Option1 Value']) {
            console.log("UYARI: Ana ürün satırında eksik alanlar var, düzeltiliyor");
            
            // Temel düzeltmeyi yap
            row.Handle = row.Handle || handle;
            row.Title = row.Title || product.title;
            row['Option1 Name'] = row['Option1 Name'] || 'Title';
            row['Option1 Value'] = row['Option1 Value'] || 'Default Title';
          }
        }
        
        // 3. Handle alanı eksik satırları filtrele
        if (!row.Handle) {
          console.log("UYARI: Handle değeri eksik olan satır filtrelendi");
          return false;
        }
        
        // Varyant veya görsel satırları için gerekli alanlar
        if (row['Image Src'] || row['Image Position']) {
          // Görsel satırı, gerekli alanları ekle
          row.Published = 'TRUE';
        } else {
          // Varyant satırı, Option kontrolü yap
          if (!row['Option1 Name'] || !row['Option1 Value']) {
            // Eksik option verileri içeren satır gördük, tamamlayalım
            row['Option1 Name'] = 'Title';
            row['Option1 Value'] = 'Default Title';
          }
        }
        
        // Bu satırı kabul et
        return true;
      });
      
      console.log(`Filtreleme sonrası: ${processedRows.length} satırdan ${filteredRows.length} satır kaldı`);
      
      // Daha detaylı hata ayıklama
      console.log("FİLTRELENEN SATIRLAR:", JSON.stringify(filteredRows.map(r => {
        // Sadece önemli alanları göster
        return {
          handle: r.Handle,
          title: r.Title,
          option1_name: r['Option1 Name'],
          option1_value: r['Option1 Value']
        };
      })));
      
      // Tam CSV uyumluluğu için hata ayıklama
      const dataCheck = JSON.stringify(filteredRows[0]).substring(0, 150);
      console.log("CSV VERİ KONTROLÜ: ", dataCheck);
      
      // Alanları standartlaştır - büyük/küçük harf ve farklı yazım tarzı sorunlarını çöz
      const standardizedRows = filteredRows.map((row, index) => {
        // Tüm veriyi tek bir formata dönüştür
        const newRow: Record<string, any> = {};
        
        // Shopify'ın beklediği format için temel alanları doldur
        newRow.Handle = row.Handle || row.handle || handle;
        newRow.Title = row.Title || row.title || product.title;
        newRow['Body (HTML)'] = row['Body (HTML)'] || row.body_html || `<p>${product.description}</p>`;
        newRow.Vendor = row.Vendor || row.vendor || 'turmarkt';
        newRow.Tags = row.Tags || row.tags || (product.tags ? product.tags.join(', ') : '');
        
        // Ürün tipi
        newRow['Custom Product Type'] = row['Custom Product Type'] || row.custom_product_type || product.category;
        
        // Durum bilgileri
        newRow.Published = row.Published || row.published || 'TRUE';
        newRow.Status = row.Status || row.status || 'active';
        
        // Varyant bilgileri
        newRow['Option1 Name'] = row['Option1 Name'] || row.option1_name || 'Size';
        newRow['Option1 Value'] = row['Option1 Value'] || row.option1_value || 'Default';
        
        // İlk satır için (ana ürün), tüm renk varyantlarını da ekle
        if (index === 0 && product.variants && typeof product.variants === 'object' && 'color' in product.variants) {
          const variantColors = (product.variants as any).color;
          if (Array.isArray(variantColors) && variantColors.length > 0) {
            newRow['Option2 Name'] = 'Color';
            newRow['Option2 Value'] = variantColors[0] || 'Default';
          }
        }
        
        // Fiyat ve envanter bilgileri
        newRow['Variant Price'] = row['Variant Price'] || row.variant_price || product.price;
        newRow['Variant Compare At Price'] = row['Variant Compare At Price'] || row.variant_compare_at_price || product.basePrice;
        newRow['Variant Inventory Qty'] = row['Variant Inventory Qty'] || row.variant_inventory_qty || '50';
        newRow['Variant Inventory Tracker'] = row['Variant Inventory Tracker'] || row.variant_inventory_tracker || 'shopify';
        newRow['Variant Inventory Policy'] = row['Variant Inventory Policy'] || row.variant_inventory_policy || 'deny';
        newRow['Variant Requires Shipping'] = row['Variant Requires Shipping'] || row.variant_requires_shipping || 'TRUE';
        newRow['Variant Taxable'] = row['Variant Taxable'] || row.variant_taxable || 'TRUE';
        
        // İlk ürün için resimleri ekle
        if (index === 0 && product.images && product.images.length > 0) {
          newRow['Image Src'] = product.images[0];
          newRow['Image Position'] = 1;
          newRow['Image Alt Text'] = product.title;
        }
        
        // Orijinal satırdaki diğer tüm alanları kopyala (yukarıda eklenmemişse)
        Object.keys(row).forEach(key => {
          if (newRow[key] === undefined && row[key] !== undefined) {
            newRow[key] = row[key];
          }
        });
        
        return newRow;
      });
      
      // Detaylı hata ayıklama için bir örnek satır göster
      if (standardizedRows.length > 0) {
        console.log("STANDARTLAŞTIRILMIŞ SATIR ÖRNEĞİ:", Object.keys(standardizedRows[0]).slice(0, 5).join(", "));
      }
      
      console.log(`CSV'ye yazılacak: ${standardizedRows.length} satır`);
      
      // Debug: İlk satırın key'lerini kontrol et
      if (standardizedRows.length > 0) {
        console.log("İLK SATIR KEY'LERİ:", Object.keys(standardizedRows[0]));
        console.log("İLK SATIR VERİLERİ:", JSON.stringify(standardizedRows[0], null, 2).substring(0, 200));
      }
      
      // CSV'yi yaz - field ID'leri küçük harfe çevir
      const csvCompatibleRows = standardizedRows.map(row => {
        const newRow: Record<string, any> = {};
        
        // Büyük harfli key'leri küçük harfli field ID'lere dönüştür
        newRow.handle = row.Handle || '';
        newRow.title = row.Title || '';
        newRow.body_html = row['Body (HTML)'] || '';
        newRow.vendor = row.Vendor || 'turmarkt';
        newRow.standard_product_type = row['Standard Product Type'] || '';
        newRow.custom_product_type = row['Custom Product Type'] || '';
        newRow.tags = row.Tags || '';
        newRow.published = row.Published || 'TRUE';
        newRow.status = row.Status || 'active';
        newRow.published_at = row['Published At'] || '';
        newRow.published_scope = row['Published Scope'] || 'web';
        newRow.template_suffix = row['Template Suffix'] || '';
        newRow.option1_name = row['Option1 Name'] || 'Title';
        newRow.option1_value = row['Option1 Value'] || 'Default Title';
        newRow.option2_name = row['Option2 Name'] || '';
        newRow.option2_value = row['Option2 Value'] || '';
        newRow.option3_name = row['Option3 Name'] || '';
        newRow.option3_value = row['Option3 Value'] || '';
        newRow.variant_sku = row['Variant SKU'] || '';
        newRow.variant_grams = row['Variant Grams'] || '';
        newRow.variant_inventory_tracker = row['Variant Inventory Tracker'] || 'shopify';
        newRow.variant_inventory_qty = row['Variant Inventory Qty'] || '50';
        newRow.variant_inventory_policy = row['Variant Inventory Policy'] || 'deny';
        newRow.variant_fulfillment_service = row['Variant Fulfillment Service'] || 'manual';
        newRow.variant_price = row['Variant Price'] || '';
        newRow.variant_compare_at_price = row['Variant Compare At Price'] || '';
        newRow.variant_requires_shipping = row['Variant Requires Shipping'] || 'TRUE';
        newRow.variant_taxable = row['Variant Taxable'] || 'TRUE';
        newRow.variant_barcode = row['Variant Barcode'] || '';
        newRow.image_src = row['Image Src'] || '';
        newRow.image_position = row['Image Position'] || '';
        newRow.image_alt_text = row['Image Alt Text'] || '';
        newRow.gift_card = row['Gift Card'] || 'FALSE';
        newRow.seo_title = row['SEO Title'] || '';
        newRow.seo_description = row['SEO Description'] || '';
        newRow.google_shopping_metafields = row['Google Shopping / Google Product Category'] || '';
        newRow.google_shopping_gender = row['Google Shopping / Gender'] || '';
        newRow.google_shopping_age_group = row['Google Shopping / Age Group'] || '';
        newRow.google_shopping_mpn = row['Google Shopping / MPN'] || '';
        newRow.google_shopping_adwords_grouping = row['Google Shopping / AdWords Grouping'] || '';
        newRow.google_shopping_adwords_labels = row['Google Shopping / AdWords Labels'] || '';
        newRow.google_shopping_condition = row['Google Shopping / Condition'] || '';
        newRow.google_shopping_custom_product = row['Google Shopping / Custom Product'] || '';
        newRow.google_shopping_custom_label_0 = row['Google Shopping / Custom Label 0'] || '';
        newRow.google_shopping_custom_label_1 = row['Google Shopping / Custom Label 1'] || '';
        newRow.google_shopping_custom_label_2 = row['Google Shopping / Custom Label 2'] || '';
        newRow.google_shopping_custom_label_3 = row['Google Shopping / Custom Label 3'] || '';
        newRow.google_shopping_custom_label_4 = row['Google Shopping / Custom Label 4'] || '';
        newRow.variant_image = row['Variant Image'] || '';
        newRow.variant_weight_unit = row['Variant Weight Unit'] || 'g';
        newRow.variant_tax_code = row['Variant Tax Code'] || '';
        newRow.cost_per_item = row['Cost per item'] || '';
        
        return newRow;
      });
      
      // Tüm satırları sanitize et
      const sanitizedRows = csvCompatibleRows.map(row => sanitizeCSVRow(row));
      
      await csvWriter.writeRecords(sanitizedRows);
      console.log(`CSV başarıyla oluşturuldu: ${outputPath} (${sanitizedRows.length} satır)`);
      
      // Preview dosyasını temp klasörüne kopyala
      if (outputPath.startsWith('/tmp/')) {
        const timestamp = new Date().getTime();
        const previewPath = `./temp/preview_${timestamp}.csv`;
        
        try {
          fs.copyFileSync(outputPath, previewPath);
          console.log(`CSV önizleme dosyası oluşturuldu: preview_${timestamp}.csv`);
          resolve(previewPath);
        } catch (copyError) {
          console.error('CSV kopyalama hatası:', copyError);
          resolve(outputPath);
        }
      } else {
        resolve(outputPath);
      }
    } catch (error) {
      console.error('CSV oluşturma hatası:', error);
      console.error('Hata detayları:', JSON.stringify(error, null, 2));
      reject(error);
    }
  });
}