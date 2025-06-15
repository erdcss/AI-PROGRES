import { Product } from "@shared/schema";
import { createObjectCsvWriter } from "csv-writer";
import { tmpdir } from "os";
import { join } from "path";
import fs from "fs";

// Shopify CSV için ultra güvenli temizleme ve escape etme
function escapeForCSV(text: string): string {
  if (!text || typeof text !== 'string') return '""';
  
  let cleaned = String(text);
  
  // Remove all HTML tags completely
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Keep only basic alphanumeric and safe characters
  cleaned = cleaned
    .replace(/[^\w\s\-\.çğıöşüÇĞIÖŞÜ]/g, ' ') // Allow dots for prices
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .trim()
    .substring(0, 80); // Limit length to prevent CSV issues
  
  // Escape double quotes by doubling them
  cleaned = cleaned.replace(/"/g, '""');
  
  // Always wrap in quotes for CSV safety
  return `"${cleaned}"`;
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

// KESIN ÇÖZÜM: Gerçek ürün görseli kontrolü - gelişmiş filtre
function isValidProductImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Trendyol CDN'den olmalı
  if (!url.includes('cdn.dsmcdn.com')) return false;
  
  // Görsel dosyası olmalı
  if (!url.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i)) return false;
  
  // KESIN FİLTRE: Logo ve gereksiz içerikleri tamamen engelle
  const strictBlacklist = [
    'logo', 'badge', 'icon', 'sprite', 'placeholder', 'avatar',
    'ty-web.svg', 'favicon', 'button', 'arrow', 'star', 'rating',
    'social', 'payment', 'delivery', 'security', 'banner', 'advertisement',
    'default-thumb', 'basketPreview', 'master/', 'web/master', 'web/logo',
    'sticker', 'etiket', 'kampanya', 'overlay', 'text-label', 'stamp',
    'indexing-sticker', 'authorized-seller', 'free-shipping', 'shipping-icon'
  ];
  
  const urlLower = url.toLowerCase();
  if (strictBlacklist.some(term => urlLower.includes(term))) {
    return false;
  }
  
  // Ürün görseli pattern'lerini kontrol et
  const productPatterns = [
    '/product/media/images/',
    '/prod/QC/',
    '/prod/SPM/',
    '_org_zoom',
    '_org.jpg'
  ];
  
  const hasProductPattern = productPatterns.some(pattern => 
    url.includes(pattern)
  );
  
  // Minimum boyut kontrolü (URL'de boyut varsa)
  const sizeMatch = url.match(/(\d+)x(\d+)/);
  if (sizeMatch) {
    const width = parseInt(sizeMatch[1]);
    const height = parseInt(sizeMatch[2]);
    if (width < 200 || height < 200) return false;
  }
  
  return hasProductPattern;
}

export async function generateShopifyCSV(
  product: Product,
  variants: { 
    sizes?: string[], 
    colors?: string[] 
  } = {},
  outputPath: string = join(tmpdir(), 'shopify_products.csv')
): Promise<{ csvPath: string; filename: string; totalRows: number }> {
  // Ürün fiyatına %10 kar ekle
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    const priceWithProfit = (basePrice * 1.10).toFixed(2);
    console.log(`FİYAT GÜNCELLEME: ${basePrice} TL + %10 kar = ${priceWithProfit} TL`);
    product.price = priceWithProfit;
  }
  
  // ESKI FİLTRELEME SİSTEMİ DEVRE DIŞI - Yeni gelişmiş sistem aktif
  console.log(`HAM GÖRSEL VERİSİ KORUNUYOR: ${product.images?.length || 0} görsel enhanced filtreye gönderiliyor`);
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
    
    // Shopify zorunlu değer - kabul edilen format
    row.status = 'active';
    
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
    
    // 2. Status alanının Türkçe değerlerle olması gerekiyor - zorunlu alan
    row.status = 'active'; // Shopify kabul edilen format: active, draft, archived
    
    // 3. ÖNEMLİ: Tüm Boolean alanlar BÜYÜK HARF olmalı
    row.published = 'TRUE';
    row.published_on_online_store = 'TRUE'; // Önemli: Online mağazada yayınlanma durumu
    
    // 4. Published tarih ve kapsamı - Shopify 2024 gerekliliği
    row.published_scope = 'web';  // Bu alan Shopify'da gerekli
    row.published_at = new Date().toISOString(); // Şu anki tarih/saat
    
    // 5. Shopify Türkiye için zorunlu alanları - HER ZAMAN SET ET
    row.variant_inventory_policy = 'deny'; // Shopify kabul edilen: deny, continue
    row.variant_fulfillment_service = 'manual'; // Shopify kabul edilen: manual, automatic
    
    // 6. Temel envanter ve durum ayarları - zorunlu alanlar
    row.inventory_policy = row.inventory_policy || 'deny'; 
    row.fulfillment_service = row.fulfillment_service || 'manual';
    
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
    
    // GÖRSEL ALANLARI KONTROLÜ VE DÜZENLEMESİ
    // Image Src alanının korunmasını sağla
    if (row.image_src) {
      // Görsel URL'ini temizle ve doğrula
      const cleanImageUrl = String(row.image_src).trim();
      if (cleanImageUrl && cleanImageUrl !== '' && cleanImageUrl !== 'undefined') {
        row.image_src = cleanImageUrl;
      } else {
        row.image_src = '';
      }
    }
    
    // Image Position kontrolü
    if (row.image_position && !isNaN(row.image_position)) {
      row.image_position = String(row.image_position);
    }
    
    // Image Alt Text kontrolü
    if (row.image_alt_text) {
      row.image_alt_text = String(row.image_alt_text).trim();
    }
    
    // Variant Image alanı
    if (row.variant_image) {
      const cleanVariantImage = String(row.variant_image).trim();
      if (cleanVariantImage && cleanVariantImage !== '' && cleanVariantImage !== 'undefined') {
        row.variant_image = cleanVariantImage;
      } else {
        row.variant_image = '';
      }
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
    
    // Option değerlerini kontrol et - SADECE ana ürün satırı için
    // Ek görsel satırları boş option değerleriyle kalmalı (duplicate önlenir)
    if (row.option1_name === '' && row.variant_sku && row.variant_price) {
      row.option1_name = 'Title';
      row.option1_value = 'Default Title';
    } else if (row.option1_name === '') {
      // Görsel-only satırlar için option alanları boş kalır
      row.option1_name = '';
      row.option1_value = '';
    }
    
    return row;
  };
  // CSV satırındaki tüm değerleri Shopify kurallarına göre temizle
  function sanitizeCSVRow(row: any): any {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') {
        // Boş değerler için sadece boş string (tırnak yok)
        sanitized[key] = '';
      } else if (typeof value === 'string') {
        // String değerleri temizle ve escape et
        const cleanValue = value.trim();
        if (cleanValue === '') {
          sanitized[key] = '';
        } else {
          // HTML taglarını kaldır ve güvenli karakterlere dönüştür
          let cleaned = cleanValue
            .replace(/<[^>]*>/g, '') // HTML tagları
            .replace(/"/g, '""') // Çift tırnakları escape et
            .replace(/[\r\n\t]/g, ' ') // Satır sonu karakterleri
            .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluğa
            .trim();
          
          // Eğer virgül, çift tırnak veya satır sonu varsa tırnakla sar
          if (cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n') || cleaned.includes('\r')) {
            sanitized[key] = `"${cleaned}"`;
          } else {
            sanitized[key] = cleaned;
          }
        }
      } else if (typeof value === 'boolean') {
        // Boolean değerleri büyük harfle (tırnak yok)
        sanitized[key] = value.toString().toUpperCase();
      } else {
        // Diğer tüm değerleri string'e çevir
        const stringValue = String(value).trim();
        if (stringValue === '') {
          sanitized[key] = '';
        } else {
          sanitized[key] = stringValue;
        }
      }
    }
    return sanitized;
  }

  return new Promise<{ csvPath: string; filename: string; totalRows: number }>(async (resolve, reject) => {
    try {
      // Shopify'ın kesin istediği format (2024 şablonu)
      // ÖNEMLİ: Başlık isimleri ve sıralaması kritik önem taşır
      const csvWriter = createObjectCsvWriter({
        path: outputPath,
        encoding: 'utf8',
        header: [
          // SHOPIFY RESMI CSV FORMATI - Verilen şablonla tam uyumlu
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

      // CSV satırlarını oluştur
      const csvRows: any[] = [];
      
      // Handle oluştur (URL-uyumlu slug)
      const handle = createUniqueHandle(product.title);
      
      // KESIN ÇÖZÜM: Ultra sıkı görsel filtreleme sistemi
      console.log('🔧 KESIN görsel filtreleme başlatılıyor...');
      console.log('🔧 Ham görseller:', product.images);
      
      // Başlangıçta tüm görselleri al
      let validImages = product.images ? [...product.images] : [];
      console.log(`🔧 Toplam ${validImages.length} ham görsel bulundu`);
      
      // 1. AŞAMA: Kesin logo filtreleme
      validImages = validImages.filter(url => {
        const urlLower = url.toLowerCase();
        const isLogo = urlLower.includes('logo') || 
                      urlLower.includes('ty-web.svg') || 
                      urlLower.includes('web/logo') ||
                      urlLower.includes('master/') ||
                      urlLower.includes('icon') ||
                      urlLower.includes('badge');
        
        if (isLogo) {
          console.log(`🔧 Logo filtrelendi: ${url}`);
          return false;
        }
        return true;
      });
      
      // 2. AŞAMA: Sadece gerçek ürün görselleri
      validImages = validImages.filter(url => {
        const hasProductPattern = url.includes('product/media/images/') || 
                                 url.includes('_org_zoom') ||
                                 url.includes('/prod/');
        
        if (!hasProductPattern) {
          console.log(`🔧 Ürün görseli değil: ${url}`);
          return false;
        }
        return true;
      });
      
      // 3. AŞAMA: Duplicate kaldırma
      const uniqueImages = Array.from(new Set(validImages));
      console.log(`🔧 Duplicate'ler kaldırıldı: ${validImages.length} -> ${uniqueImages.length}`);
      
      // 4. AŞAMA: Kalite sıralaması ve limit
      const finalImages = uniqueImages
        .sort((a, b) => {
          let scoreA = 0, scoreB = 0;
          if (a.includes('_org_zoom')) scoreA += 100;
          if (b.includes('_org_zoom')) scoreB += 100;
          if (a.includes('/1200/1800/')) scoreA += 50;
          if (b.includes('/1200/1800/')) scoreB += 50;
          return scoreB - scoreA;
        })
        .slice(0, 3); // Maksimum 3 temiz görsel
      
      console.log(`🔧 Final temiz görseller (${finalImages.length}):`, finalImages);
      validImages = finalImages;
      
      console.log(`GÖRSEL SİSTEMİ: Toplam ${product.images?.length || 0} görsel, geçerli ${validImages.length} görsel`);
      
      // İlk görseli ana ürün için ayır, kalanları ayrı satırlar için
      const mainImage = validImages.length > 0 ? validImages[0] : '';
      const additionalImages = validImages.slice(1);
      

      
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
      
      // Gelişmiş etiket sistemi - JSON-LD verilerini kullan
      let tags = '';
      
      if (product.tags && Array.isArray(product.tags) && product.tags.length > 0) {
        // JSON-LD'den gelen kapsamlı etiketleri kullan
        tags = product.tags
          .filter(tag => tag && tag.length > 0 && tag.length <= 30)
          .slice(0, 15) // Maksimum 15 etiket
          .join(',');
      } else if (product.category) {
        // Fallback: Kategori bilgisinden etiketler oluştur
        const categoryParts = product.category.split('>').map(part => part.trim());
        const maxTags = Math.min(3, categoryParts.length);
        
        const categoryTags = categoryParts
          .slice(0, maxTags)
          .map(tag => tag.replace(/trendyol/i, '').trim())
          .filter(tag => tag.length > 0 && tag.length <= 20);
          
        tags = categoryTags.join(',');
      }
      
      console.log(`ETİKET SİSTEMİ: ${product.tags?.length || 0} etiket, CSV'de kullanılan: ${tags}`);

      if (productHasVariants) {
        // Sadece beden varyantları içeren ürün
        if (hasSizeVariants && !hasColorVariants) {
          let mainRow = {
            handle: handle,
            title: product.title,
            body_html: product.description || product.title,
            vendor: product.brand || 'turmarkt',
            product_category: 'Apparel & Accessories',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Giyim'
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
            variant_compare_at_price: product.basePrice || '',
            variant_requires_shipping: 'TRUE',
            variant_taxable: 'TRUE',
            variant_barcode: '',
            image_src: mainImage,
            image_position: '1',
            image_alt_text: product.title || '',
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
            status: 'etkin'
          };
          
          // Ana satırı ekle
          csvRows.push(fixShopifyVisibility(mainRow));
          
          // Ek görseller varsa ayrı satırlar ekle
          additionalImages.forEach((imageUrl, index) => {
            const imageRow = {
              handle: handle,
              title: '',
              body_html: '',
              vendor: '',
              type: '',
              tags: '',
              published: '',
              option1_name: '',
              option1_value: '',
              variant_sku: '',
              variant_price: '',
              image_src: imageUrl,
              image_alt_text: `${product.title} - Görsel ${index + 2}`
            };
            csvRows.push(fixShopifyVisibility(imageRow));
          });
          
          // Diğer beden varyantlarını ekle
          for (let i = 1; i < sizes.length; i++) {
            const variantRow = {
              handle: handle,
              title: '',
              body_html: '',
              vendor: '',
              product_category: '',
              type: '',
              tags: '',
              published: '',
              option1_name: '',
              option1_value: sizes[i],
              option2_name: '',
              option2_value: '',
              option3_name: '',
              option3_value: '',
              variant_sku: `${handle}-${sizes[i]}`,
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
              variant_image: '',
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
            };
            
            csvRows.push(variantRow);
          }
        }
        // Sadece renk varyantları içeren ürün
        else if (hasColorVariants && !hasSizeVariants) {
          let mainRow = {
            handle: handle,
            title: product.title,
            body_html: product.description || product.title,
            vendor: product.brand || 'turmarkt',
            product_category: 'Apparel & Accessories',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Giyim'
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
            variant_compare_at_price: product.basePrice || '',
            variant_requires_shipping: 'TRUE',
            variant_taxable: 'TRUE',
            variant_barcode: '',
            image_src: mainImage,
            image_position: '1',
            image_alt_text: product.title || '',
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
            status: 'etkin'
          };
          
          // Ana satırı ekle
          csvRows.push(fixShopifyVisibility(mainRow));
          
          // Ek görseller varsa ayrı satırlar ekle
          additionalImages.forEach((imageUrl, index) => {
            const imageRow = {
              handle: handle,
              title: '',
              body_html: '',
              vendor: '',
              type: '',
              tags: '',
              published: '',
              option1_name: '',
              option1_value: '',
              variant_sku: '',
              variant_price: '',
              image_src: imageUrl,
              image_alt_text: `${product.title} - Görsel ${index + 2}`
            };
            csvRows.push(fixShopifyVisibility(imageRow));
          });
          
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
            body_html: product.title,
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
            body_html: product.title,
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
          // Varyantı olmayan temel ürün - Tam Shopify formatında
          let row = {
            handle: handle,
            title: product.title,
            body_html: product.description || product.title,
            vendor: product.brand || 'turmarkt',
            type: product.category ? 
              product.category.split('>').pop()?.trim() || 'Giyim'
              : 'Giyim',
            tags: tags,
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
            variant_compare_at_price: product.basePrice || '',
            variant_requires_shipping: 'TRUE',
            variant_taxable: 'TRUE',
            variant_barcode: '',
            image_src: mainImage,
            image_position: '1',
            image_alt_text: product.title || '',
            gift_card: 'FALSE',
            seo_title: product.title,
            seo_description: product.description || product.title,
            google_shopping_google_product_category: product.category || '',
            google_shopping_gender: 'Unisex',
            google_shopping_age_group: 'Adult',
            google_shopping_mpn: product.brand || '',
            google_shopping_adwords_grouping: '',
            google_shopping_adwords_labels: '',
            google_shopping_condition: 'New',
            google_shopping_custom_product: 'FALSE',
            google_shopping_custom_label_0: '',
            google_shopping_custom_label_1: '',
            google_shopping_custom_label_2: '',
            google_shopping_custom_label_3: '',
            google_shopping_custom_label_4: '',
            variant_image: mainImage,
            variant_weight_unit: 'g',
            variant_tax_code: '',
            cost_per_item: '',
            status: 'active'
          };
          
          csvRows.push(fixShopifyVisibility(row));
          
          // Ek görseller varsa ayrı satırlar ekle - SADECE görsel bilgisi
          additionalImages.forEach((imageUrl, index) => {
            const imageRow = {
              handle: handle,
              title: '',
              body_html: '',
              vendor: '',
              type: '',
              tags: '',
              published: '',
              option1_name: '',
              option1_value: '', // BOŞ BIRAK - Shopify duplicate hatası önlenir
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
              image_position: `${index + 2}`,
              image_alt_text: `${product.title} - Görsel ${index + 2}`,
              gift_card: '',
              seo_title: '',
              seo_description: '',
              google_shopping_google_product_category: '',
              google_shopping_gender: '',
              google_shopping_age_group: '',
              google_shopping_mpn: '',
              google_shopping_adwords_grouping: '',
              google_shopping_adwords_labels: '',
              google_shopping_condition: '',
              google_shopping_custom_product: '',
              google_shopping_custom_label_0: '',
              google_shopping_custom_label_1: '',
              google_shopping_custom_label_2: '',
              google_shopping_custom_label_3: '',
              google_shopping_custom_label_4: '',
              variant_image: '',
              variant_weight_unit: '',
              variant_tax_code: '',
              cost_per_item: '',
              status: ''
            };
            csvRows.push(fixShopifyVisibility(imageRow));
          });
        }
      }
      

      
      // CSV dosyası için satırları hazırla - alan eşleştirmeleri yap
      const processedRows = csvRows.map(row => {
        // Satırı Shopify uyumluluk katmanından geçir
        const fixedRow = fixShopifyVisibility(row);
        
        // Şimdi Shopify'ın 2024 CSV belgeleri ile uyumlu hale getir
        const newRow: Record<string, any> = {};
        
        // Basitleştirilmiş alan eşleştirme - duplicate'ler kaldırıldı
        const fieldMapping: Record<string, string> = {
          'handle': 'Handle',
          'title': 'Title',
          'body_html': 'Body (HTML)',
          'vendor': 'Vendor',
          'tags': 'Tags',
          'published': 'Published',
          'status': 'Status',
          'option1_name': 'Option1 Name',
          'option1_value': 'Option1 Value',
          'option2_name': 'Option2 Name',
          'option2_value': 'Option2 Value',
          'option3_name': 'Option3 Name',
          'option3_value': 'Option3 Value',
          'variant_sku': 'Variant SKU',
          'variant_grams': 'Variant Grams',
          'variant_inventory_tracker': 'Variant Inventory Tracker',
          'variant_inventory_qty': 'Variant Inventory Qty',
          'variant_inventory_policy': 'Variant Inventory Policy',
          'variant_fulfillment_service': 'Variant Fulfillment Service',
          'variant_price': 'Variant Price',
          'variant_compare_at_price': 'Variant Compare At Price',
          'variant_requires_shipping': 'Variant Requires Shipping',
          'variant_taxable': 'Variant Taxable',
          'variant_barcode': 'Variant Barcode',
          'image_src': 'Image Src',
          'image_position': 'Image Position',
          'image_alt_text': 'Image Alt Text',
          'variant_image': 'Variant Image',
          'variant_weight_unit': 'Variant Weight Unit',
          'gift_card': 'Gift Card'
        };
        
        // Tüm bilinen alan eşleştirmelerini uygula
        Object.entries(fixedRow).forEach(([oldKey, value]) => {
          if (fieldMapping[oldKey]) {
            const newKey = fieldMapping[oldKey];
            newRow[newKey] = value;
            delete fixedRow[oldKey];
          }
        });
        
        // Özel görsel alan eşleştirmeleri - kritik düzeltme
        if (fixedRow.image_src && !newRow['Image Src']) {
          newRow['Image Src'] = fixedRow.image_src;
        }
        if (fixedRow.image_position && !newRow['Image Position']) {
          newRow['Image Position'] = fixedRow.image_position;
        }
        if (fixedRow.image_alt_text && !newRow['Image Alt Text']) {
          newRow['Image Alt Text'] = fixedRow.image_alt_text;
        }
        if (fixedRow.variant_image && !newRow['Variant Image']) {
          newRow['Variant Image'] = fixedRow.variant_image;
        }
        
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
          
          // ANA ÜRÜN SATIRI İÇİN GÖRSEL URL'İNİ ZORLA EKLE
          if (validImages.length > 0 && !row['Image Src']) {
            row['Image Src'] = validImages[0];
            row['Image Position'] = '1';
            row['Image Alt Text'] = product.title || '';
            console.log(`GÖRSEL ZORLA EKLENDİ: Ana satıra ${validImages[0]} eklendi`);
          }
        }
        
        // 3. Handle alanı eksik satırları filtrele
        if (!row.Handle) {
          console.log("UYARI: Handle değeri eksik olan satır filtrelendi");
          return false;
        }
        
        // SHOPIFY TÜRKIYE ZORUNLU ALANLAR - Sadece ana ürün satırına uygula
        if (row === processedRows[0] || (row.Title && row['Variant SKU'])) {
          // Sadece ana ürün satırı için zorunlu alanlar
          row.Status = 'active'; // Shopify kabul edilen değer
          row['Variant Inventory Policy'] = 'deny';
          row['Variant Fulfillment Service'] = 'manual';
          row.Published = 'TRUE';
          
          // Ana satır için Option kontrolü
          if (!row['Option1 Name'] || !row['Option1 Value']) {
            row['Option1 Name'] = 'Title';
            row['Option1 Value'] = 'Default Title';
          }
        } else {
          // Ek görsel satırları için Option alanlarını BOŞ BIRAK
          // Bu Shopify duplicate variant hatasını önleyecek
          row['Option1 Name'] = '';
          row['Option1 Value'] = '';
          row.Status = '';
          row['Variant Inventory Policy'] = '';
          row['Variant Fulfillment Service'] = '';
          row.Published = '';
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
      const normalizedRows = filteredRows.map((row, index) => {
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
        
        // Durum bilgileri - Shopify compliance
        newRow.Published = row.Published || row.published || 'TRUE';
        newRow.Status = 'active'; // Shopify accepted: active, draft, archived
        
        // Varyant bilgileri - SADECE ilk satır için
        newRow['Option1 Name'] = 'Title';
        newRow['Option1 Value'] = 'Default Title';
        
        // İlk satır için (ana ürün), tüm renk varyantlarını da ekle
        if (product.variants && typeof product.variants === 'object' && 'color' in product.variants) {
          const variantColors = (product.variants as any).color;
          if (Array.isArray(variantColors) && variantColors.length > 0) {
            newRow['Option2 Name'] = 'Color';
            newRow['Option2 Value'] = variantColors[0] || 'Default';
          }
        }
        
        // Fiyat ve envanter bilgileri - Shopify Türkiye için zorunlu değerler
        newRow['Variant Price'] = row['Variant Price'] || row.variant_price || product.price;
        newRow['Variant Compare At Price'] = row['Variant Compare At Price'] || row.variant_compare_at_price || product.basePrice;
        newRow['Variant Inventory Qty'] = row['Variant Inventory Qty'] || row.variant_inventory_qty || '50';
        newRow['Variant Inventory Tracker'] = row['Variant Inventory Tracker'] || row.variant_inventory_tracker || 'shopify';
        newRow['Variant Inventory Policy'] = 'deny'; // Shopify Türkiye: reddet, devam et
        newRow['Variant Fulfillment Service'] = 'manual'; // Shopify Türkiye: manuel, otomatik
        newRow['Variant Requires Shipping'] = row['Variant Requires Shipping'] || row.variant_requires_shipping || 'TRUE';
        newRow['Variant Taxable'] = row['Variant Taxable'] || row.variant_taxable || 'TRUE';
        
        // İlk ürün için resimleri ekle - CRITICAL FIX
        // Ürün görsellerinden birincisini kullan
        const firstValidImage = product.images && product.images.length > 0 ? product.images[0] : '';
        
        newRow['Image Src'] = firstValidImage;
        newRow['Image Position'] = firstValidImage ? '1' : '';
        newRow['Image Alt Text'] = firstValidImage ? product.title : '';
        
        // Orijinal satırdaki diğer tüm alanları kopyala (yukarıda eklenmemişse)
        Object.keys(row).forEach(key => {
          if (newRow[key] === undefined && row[key] !== undefined) {
            newRow[key] = row[key];
          }
        });
        
        return newRow;
      });
      
      // Detaylı hata ayıklama için bir örnek satır göster
      if (normalizedRows.length > 0) {
        console.log("STANDARTLAŞTIRILMIŞ SATIR ÖRNEĞİ:", Object.keys(normalizedRows[0]).slice(0, 5).join(", "));
      }
      
      console.log(`CSV'ye yazılacak: ${normalizedRows.length} satır`);
      
      // Debug: İlk satırın key'lerini kontrol et
      if (normalizedRows.length > 0) {
        console.log("İLK SATIR KEY'LERİ:", Object.keys(normalizedRows[0]));
        console.log("İLK SATIR VERİLERİ:", JSON.stringify(normalizedRows[0], null, 2).substring(0, 200));
      }
      
      // CSV'yi yaz - field ID'leri küçük harfe çevir
      const csvCompatibleRows = normalizedRows.map((row, index) => {
        const newRow: Record<string, any> = {};
        
        // Büyük harfli key'leri küçük harfli field ID'lere dönüştür
        // Enhanced CSV mapping - includes essential image fields
        newRow.handle = row.Handle || '';
        newRow.title = row.Title || '';
        newRow.body_html = row['Body (HTML)'] || '';
        newRow.vendor = row.Vendor || 'Turmarkt';
        newRow.type = row.Type || '';
        newRow.tags = row.Tags || '';
        newRow.published = row.Published || 'TRUE';
        newRow.option1_name = row['Option1 Name'] || 'Title';
        newRow.option1_value = row['Option1 Value'] || 'Default Title';
        
        // Debug field mapping
        console.log(`Row ${index} - option1_value mapping: "${newRow.option1_value}"`);
        console.log(`Row ${index} - option1_name mapping: "${newRow.option1_name}"`);
        newRow.variant_sku = row['Variant SKU'] || '';
        newRow.variant_price = row['Variant Price'] || '';
        
        // CRITICAL: Add image fields to CSV output
        newRow.image_src = row['Image Src'] || row.image_src || '';
        newRow.image_position = row['Image Position'] || row.image_position || '';
        newRow.image_alt_text = row['Image Alt Text'] || row.image_alt_text || '';
        
        // SHOPIFY COMPLIANCE - ACCEPTED ENGLISH VALUES  
        newRow.status = 'active'; // Shopify accepted: active, draft, archived
        newRow.variant_inventory_policy = 'deny'; // Shopify accepted: deny, continue
        newRow.variant_fulfillment_service = 'manual'; // Shopify accepted: manual, automatic
        
        // CRITICAL FIX: Ensure only first row has variant data
        if (index !== 0) {
          // Clear variant fields for additional rows to prevent duplicates
          newRow.option1_name = '';
          newRow.option1_value = '';
          newRow.variant_sku = '';
          newRow.variant_price = '';
          newRow.status = '';
          newRow.variant_inventory_policy = '';
          newRow.variant_fulfillment_service = '';
        }
        newRow.variant_inventory_qty = row['Variant Inventory Qty'] || '50';
        newRow.variant_inventory_tracker = row['Variant Inventory Tracker'] || 'shopify';
        newRow.variant_requires_shipping = row['Variant Requires Shipping'] || 'TRUE';
        newRow.variant_taxable = row['Variant Taxable'] || 'TRUE';
        newRow.variant_grams = row['Variant Grams'] || '500';
        
        return newRow;
      });
      
      // WRITE PROCESSED CSV DATA WITH SHOPIFY COMPLIANCE
      const csvData = csvCompatibleRows;
      
      await csvWriter.writeRecords(csvData);
      console.log(`CSV başarıyla oluşturuldu: ${outputPath} (${csvData.length} satır)`);
      
      // Preview dosyasını temp klasörüne kopyala
      if (outputPath.startsWith('/tmp/')) {
        const timestamp = new Date().getTime();
        const filename = `preview_${timestamp}.csv`;
        const previewPath = `./temp/${filename}`;
        
        try {
          fs.copyFileSync(outputPath, previewPath);
          console.log(`CSV önizleme dosyası oluşturuldu: ${filename}`);
          resolve({
            csvPath: previewPath,
            filename: filename,
            totalRows: csvData.length
          });
        } catch (copyError) {
          console.error('CSV kopyalama hatası:', copyError);
          resolve({
            csvPath: outputPath,
            filename: `shopify_products_${timestamp}.csv`,
            totalRows: csvData.length
          });
        }
      } else {
        const filename = outputPath.split('/').pop() || 'shopify_products.csv';
        resolve({
          csvPath: outputPath,
          filename: filename,
          totalRows: csvData.length
        });
      }
    } catch (error) {
      console.error('CSV oluşturma hatası:', error);
      console.error('Hata detayları:', JSON.stringify(error, null, 2));
      reject(error);
    }
  });
}