import { Product } from "@shared/schema";
import fs from "fs";
import slugify from "slugify";

/**
 * TEMEL CSV EXPORT - 19 Mayıs 2025
 * 
 * SORUN: Fazla satır ve görsel oluşuyor
 * ÇÖZÜM: Doğrudan dosyaya yazma, sadece 1 ana satır ve 1 görsel
 */

export async function generateSimpleShopifyCSV(
  product: Product,
  outputPath: string = "/tmp/shopify_products.csv"
): Promise<string> {
  console.log("Basit CSV oluşturuluyor - CSV yazma sistemini tamamen değiştirdim");

  // Ürüne ait temel bilgileri hazırla
  const handle = slugify(product.title, {
    replacement: '-',
    lower: true,
    strict: true,
    trim: true
  }).substring(0, 60);

  // Fiyat hesaplama (%10 kar marjı)
  let finalPrice = "0.00";
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    finalPrice = (basePrice * 1.10).toFixed(2);
  }
  
  // Tagları hazırla
  let tags = "";
  const productType = product.category || "Genel Ürünler";
  
  if (product.tags && Array.isArray(product.tags) && product.tags.length > 0) {
    tags = product.tags
      .map(tag => tag.replace(/trendyol/i, "").trim())
      .filter(tag => tag.length > 0)
      .map(tag => tag.substring(0, 20))
      .slice(0, 8)
      .join(", ");
  }
  
  // Ana ürün görselini bul (SADECE bir tane)
  let mainImage = "";
  if (product.images && product.images.length > 0) {
    const productImages = product.images.filter(url => 
      (url.includes('_org_zoom.jpg') || url.includes('_org.jpg')) &&
      !url.includes('badge') && 
      !url.includes('icon') && 
      !url.includes('logo') &&
      !url.includes('.css') &&
      !url.includes('.js')
    );
    
    if (productImages.length > 0) {
      mainImage = productImages[0];
      console.log(`Ana ürün görseli: ${mainImage}`);
    }
  }
  
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    price = (basePrice * 1.10).toFixed(2);
    console.log(`Orijinal fiyat: ${basePrice}, %10 kar eklenmiş fiyat: ${price}`);
  } else {
    throw new Error("Geçerli fiyat bulunamadı - sadece otantik veri kullanılabilir");
  }
  
  // TypeScript güvenli varyant erişimi
  const variants = product.variants || {};
  const variantData = typeof variants === 'object' ? variants : {};
  
  // Varyantlar
  const sizes = Array.isArray((variantData as any).size) 
    ? (variantData as any).size 
    : ['Default'];
  
  const colors = Array.isArray((variantData as any).color) 
    ? (variantData as any).color 
    : ['Default'];

  console.log(`Varyant yapısı: ${sizes.length} beden, ${colors.length} renk`);

  // Veri yapısını oluştur
  const rows = [];

  // Ana ürün satırı
  const mainRow = {
    Handle: handle,
    Title: product.title,
    'Body (HTML)': `<p>${product.description}</p>`,
    Vendor: product.vendor || 'turmarkt',
    'Custom Product Type': product.category,
    Tags: (product.tags || []).join(', '),
    Published: 'TRUE',
    Status: 'active',
    'Option1 Name': 'Size',
    'Option1 Value': sizes[0],
    'Variant Price': price,
    'Variant Compare At Price': product.basePrice || '',
    'Variant Inventory Tracker': 'shopify',
    'Variant Inventory Qty': '50',
    'Variant Inventory Policy': 'deny',
    'Variant Fulfillment Service': 'manual',
    'Variant Requires Shipping': 'TRUE',
    'Variant Taxable': 'TRUE',
    'Variant Weight Unit': 'g'
  };

  // Renkler varsa, ikinci seçenek olarak ekle
  if (colors.length > 0 && colors[0] !== 'Default') {
    (mainRow as any)['Option2 Name'] = 'Color';
    (mainRow as any)['Option2 Value'] = colors[0];
  } else {
    // Eğer renk yok ise, boş değerler ekle
    (mainRow as any)['Option2 Name'] = '';
    (mainRow as any)['Option2 Value'] = '';
  }

  // Ana ürün görsellerini filtrele - SADECE gerçek ürün görselleri kullanılsın, EN FAZLA 5 GÖRSEL
  // Trendyol'un "KARGO BEDAVA", "HIZLI TESLİMAT", vs. etiketleri KESİNLİKLE alınmasın
  const isMainProductImage = (url: string): boolean => {
    if (!url) return false;
    
    console.log(`İncelenen görsel URL: ${url}`);
    
    // Önce görselin bir ürün URL'si olup olmadığını belirgin şekilde kontrol et
    // Sadece belirli formatları kabul et, diğerlerini reddet
    // Örneğin: _org_zoom.jpg, _org.jpg, 1_org.jpg, 2_org.jpg gibi formatlar
    const STRICT_PRODUCT_IMAGE_PATTERNS = [
      '_org_zoom.jpg',
      '_org.jpg',
      '/1_org',
      '/2_org',
      '/3_org',
      '/4_org',
      '/5_org',
      '1_org_zoom',
      '2_org_zoom'
    ];
    
    // Kesin ürün görseli olup olmadığını kontrol et
    let isDefinitelyProductImage = false;
    for (const pattern of STRICT_PRODUCT_IMAGE_PATTERNS) {
      if (url.includes(pattern)) {
        isDefinitelyProductImage = true;
        console.log(`✓ Ana ürün görseli tespit edildi: ${pattern}`);
        break;
      }
    }
    
    // KESİN OLARAK REDDEDİLECEK URL'ler - herhangi birini içeriyorsa reddet
    const REJECT_PATTERNS = [
      // Promosyonlar ve etiketler
      'hizli', 'teslimat', 'kargo', 'bedava', 'satici', 'basarili', 
      'avantaj', 'badge', 'cok_satan', 'en_cok', 'en-cok',
      'kampanya', 'indirim', 'icon', 'logo', 'tamamlayici',
      
      // Yan panel ve diğer bileşenler
      'resources', 'store', 'seller', '/web/', '/assets/',
      '/50/50/', 'mnresize/50', 'mnresize/128', 'enerjietiketi',
      'sepet', 'satin', 'sepet', 'gift', 'hediye',
      
      // Dosya türleri
      '.svg', '.css', '.js', '.html'
    ];
    
    // Kesin olarak reddedilecek desen varsa, false döndür
    for (const pattern of REJECT_PATTERNS) {
      if (url.toLowerCase().includes(pattern)) {
        console.log(`✗ Filtrelendi (yasaklı içerik: ${pattern}): ${url}`);
        return false;
      }
    }
    
    // Ürün görseli değilse ve net bir şekilde içerik URL'si değilse reddet
    if (!isDefinitelyProductImage) {
      const isFallbackProductImage = (
        (url.includes('/prod/') && url.includes('/media/images/')) ||
        url.includes('_zoom')
      );
      
      if (!isFallbackProductImage) {
        console.log(`✗ Filtrelendi (ürün görseli değil): ${url}`);
        return false;
      }
    }
    
    // Dosya uzantısını kontrol et (sadece jpg/jpeg/png olmalı)
    if (!/\.(jpe?g|png)($|\?)/.test(url.toLowerCase())) {
      console.log(`✗ Filtrelendi (geçersiz dosya uzantısı): ${url}`);
      return false;
    }
    
    console.log(`✓ Kabul edilen ürün görseli: ${url}`);
    return true;
  };
  
  // En iyi kalitede en fazla 5 görsel seç - SADECE ana ürün görselleri alınsın, etiket ve promosyonlar alınmasın
  let filteredImages: string[] = [];
  
  if (product.images && product.images.length > 0) {
    console.log("Görsel filtreleme başlatılıyor. Toplam görsel sayısı:", product.images.length);
    
    // ÖNEMLİ: SADECE ANA ÜRÜN GÖRSELLERİNİ SEÇ - çok katı kriterlerle
    console.log("TÜM GÖRSELLER (filtreleme öncesi):");
    
    // ÇOK DAHA SERT FİLTRELEME - KRİTİK: Sadece ana ürün görsellerini al (_org_ içeren)
    // Sorun: Mevcut filter yöntemimiz tüm URL'leri kabul ediyor. Daha kesin bir kriter uygulayalım.
    
    // SADECE bu patternleri içeren görselleri kabul et, diğerlerini kesinlikle reddet
    // Başlangıçta sadece "/_org_" ve "/_org_zoom" içeren URL'lere odaklan
    const strictProductImagePatterns = [
      '1_org_zoom.jpg',
      '0_org_zoom.jpg',
      '2_org_zoom.jpg',
      '3_org_zoom.jpg',
      '4_org_zoom.jpg',
      '5_org_zoom.jpg',
      '1_org.jpg',
      '0_org.jpg',
      '2_org.jpg',
      '3_org.jpg',
      '4_org.jpg',
      '5_org.jpg'
    ];
    
    // Kesin olarak sadece ana ürün görsellerini filtrele
    const mainProductImages = product.images.filter(url => {
      // Sadece belirli görselleri kesin olarak kabul et
      const isMainProductImage = strictProductImagePatterns.some(pattern => url.includes(pattern));
      
      // Eğer kesin kriterlerle eşleşmiyorsa, hemen reddet
      if (!isMainProductImage) return false;
      
      // Ayrıca logo, badge, enerji etiketi vb. kesinlikle reddet
      const hasUnwantedContent = (
        url.includes('badge') || 
        url.includes('icon') || 
        url.includes('logo') || 
        url.includes('satici') ||
        url.includes('enerji') ||
        url.includes('etiketi') ||
        url.includes('.css') ||
        url.includes('.js') ||
        url.includes('.html') ||
        url.includes('.svg') ||
        url.includes('.webp') ||
        url.includes('.png')
      );
      
      return !hasUnwantedContent;
    });
    
    console.log(`İlk filtreleme sonrası ürün görseli sayısı: ${mainProductImages.length}`);
    
    // Ana ürün görsellerini maksimum 5 tane olacak şekilde sınırla
    filteredImages = mainProductImages.slice(0, 5);
    
    // Eğer hiç ana ürün görseli bulunamadıysa, isMainProductImage fonksiyonunu kullan
    if (filteredImages.length === 0) {
      console.log("Ana ürün görseli bulunamadı, detaylı filtreleme yapılıyor...");
      const backupImages = product.images.filter(isMainProductImage).slice(0, 5);
      filteredImages = backupImages;
    }
    
    console.log(`FİNAL GÖRSEL SAYISI: ${filteredImages.length}`);
    filteredImages.forEach((url, i) => {
      console.log(`Final Görsel #${i+1}: ${url}`);
    });
      
    console.log(`${filteredImages.length} ana ürün görseli bulundu`);
    
    // Eğer ana görsel bulunamadıysa, daha esnek kriterleri dene
    if (filteredImages.length === 0) {
      console.log("Ana ürün görseli bulunamadı, daha geniş filtre kullanılıyor");
      
      // Gönderilen ürneğe özel: Saç boyası tüpleri için arama 
      // (Resimde gördüğümüz gibi genellikle IGORA Royal ürünleri)
      const isProductTube = (url: string) => {
        return url.toLowerCase().includes('igora') || 
               url.toLowerCase().includes('royal') || 
               url.toLowerCase().includes('zoom') ||
               url.toLowerCase().includes('product/media');
      };
      
      filteredImages = product.images
        .filter(url => {
          // Saç boyası veya benzer ürünler için ek filtreleme
          return isProductTube(url) && 
                 (/\.(jpg|jpeg|png)($|\?)/.test(url.toLowerCase())) &&
                 !url.includes('badge') &&
                 !url.includes('avantaj');
        })
        .slice(0, 2); // En fazla 2 görsel
        
      console.log(`Alternatif filtre kullanıldı, ${filteredImages.length} görsel seçildi`);
    }
    
    // Hala görsel bulunamadıysa, son çare olarak ilk birkaç jpg/png
    if (filteredImages.length === 0) {
      console.log("Kritik durum: Hiç ürün görseli bulunamadı, tüm jpg/png görsellerden ilki seçiliyor");
      
      filteredImages = product.images
        .filter(url => /\.(jpg|jpeg|png)($|\?)/.test(url.toLowerCase()) && 
                      !url.includes('.css') && 
                      !url.includes('.js') && 
                      !url.includes('badges'))
        .slice(0, 1); // Sadece ilk görsel
    }
    
    if (filteredImages.length > 0) {
      console.log("Seçilen görsel URL:", filteredImages[0]);
    } else {
      console.error("UYARI: Hiçbir görsel seçilemedi!");
    }
  }
  
  // Ana ürüne görsel ekle
  if (filteredImages.length > 0) {
    (mainRow as any)['Image Src'] = filteredImages[0];
    (mainRow as any)['Image Position'] = '1';
    (mainRow as any)['Image Alt Text'] = product.title;
  }

  rows.push(mainRow);
  
  // Diğer bedenleri ekleyelim (ilk beden zaten ana satırda var)
  for (let i = 1; i < sizes.length; i++) {
    const size = sizes[i];
    rows.push({
      Handle: handle,
      Title: '',  // Ana ürün dışındaki satırlarda boş bırakılabilir
      'Option1 Name': 'Size',
      'Option1 Value': size,
      'Variant SKU': `${handle}-${size}`,
      'Variant Inventory Tracker': 'shopify',
      'Variant Inventory Qty': '50',
      'Variant Price': price,
    });
  }

  // Diğer renkleri ekleyelim (ilk renk zaten ana satırda var)
  if (colors.length > 1) {
    for (let i = 1; i < colors.length; i++) {
      const color = colors[i];
      rows.push({
        Handle: handle,
        Title: '',
        'Option2 Name': 'Color',
        'Option2 Value': color,
        'Variant SKU': `${handle}-${color.toLowerCase().replace(/\s+/g, "-")}`,
        'Variant Inventory Tracker': 'shopify',
        'Variant Inventory Qty': '50',
        'Variant Price': price,
      });
    }
  }

  // KRİTİK DEĞİŞİKLİK: Diğer görselleri CSV'ye eklerken, sadece ana ürün satırı için 1 resim kullan
  // diğer satırlar için boş bırak - Bu, CSV'deki görsel sayısını radikal şekilde azaltacak
  console.log(`CSV SADELEŞTIRME: Ek ürün görselleri kapatıldı, tek ana ürün görseli kullanılıyor`);
  
  // BUNU KAPAT - sadece ana ürün görseli olsun
  // if (filteredImages && filteredImages.length > 1) {
  //   for (let i = 1; i < filteredImages.length && i < 5; i++) {
  //     const imageRow: any = {
  //       Handle: handle
  //     };
  //     (imageRow as any)['Image Src'] = filteredImages[i];
  //     (imageRow as any)['Image Position'] = String(i + 1);
  //     (imageRow as any)['Image Alt Text'] = `${product.title} - Görsel ${i + 1}`;
  //     rows.push(imageRow);
  //   }
  // }

  console.log(`Toplam ${rows.length} satır CSV'ye yazılacak`);

  // CSV'de SADECE GEREKLİ ALANLARI kullan
  // Çok fazla gereksiz alan olduğundan sadece şunları tutuyoruz:
  // 1. Ürün bilgileri (Handle, Title, Description)
  // 2. Shopify bilgileri (Vendor, Product Type, Tags)
  // 3. Varyant (Size/Color)
  // 4. Image Src (maksimum 5 resim)
  
  console.log("SADELEŞTIRILMIŞ CSV formatı kullanılıyor - gereksiz alanlar çıkarıldı");
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'Handle', title: 'Handle' },
      { id: 'Title', title: 'Title' },
      { id: 'Body (HTML)', title: 'Body (HTML)' },
      { id: 'Vendor', title: 'Vendor' },
      { id: 'Custom Product Type', title: 'Custom Product Type' },
      { id: 'Tags', title: 'Tags' },
      { id: 'Published', title: 'Published' },
      { id: 'Status', title: 'Status' },
      { id: 'Option1 Name', title: 'Option1 Name' },
      { id: 'Option1 Value', title: 'Option1 Value' },
      { id: 'Option2 Name', title: 'Option2 Name' },
      { id: 'Option2 Value', title: 'Option2 Value' },
      { id: 'Variant Inventory Tracker', title: 'Variant Inventory Tracker' },
      { id: 'Variant Inventory Qty', title: 'Variant Inventory Qty' },
      { id: 'Variant Price', title: 'Variant Price' },
      { id: 'Variant Compare At Price', title: 'Variant Compare At Price' },
      { id: 'Image Src', title: 'Image Src' },
      { id: 'Image Position', title: 'Image Position' },
      { id: 'Image Alt Text', title: 'Image Alt Text' },
      { id: 'Variant Weight Unit', title: 'Variant Weight Unit' }
    ]
  });

  try {
    // CSV Dosyasını yaz
    await csvWriter.writeRecords(rows);
    console.log(`CSV dosyası başarıyla oluşturuldu: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('CSV yazma hatası:', error);
    throw error;
  }
}