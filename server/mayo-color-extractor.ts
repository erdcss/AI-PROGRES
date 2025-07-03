import axios from 'axios';
import * as cheerio from 'cheerio';

interface MayoColorVariant {
  color: string;
  colorCode: string;
  images: string[];
  price: number;
  originalPrice: number;
  sizes: string[];
}

export async function extractMayoColorVariants(url: string): Promise<MayoColorVariant[]> {
  console.log('🏊‍♀️ Mayo ürünü renk varyantları çıkarılıyor...');
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
  const $ = cheerio.load(response.data);
  const html = response.data;
  
  // Tüm CDN görsellerini bul
  const allImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
  console.log(`📸 Toplam CDN görsel: ${allImages.length}`);
  
  // Image ID pattern'lerini analiz et
  const imageGroups = new Map<string, string[]>();
  
  allImages.forEach(img => {
    // Pattern: /398949240/903474114/ gibi ID'leri çıkar
    const match = img.match(/\/(\d{9})\/(\d{9})\//);
    if (match) {
      const imageId = `${match[1]}/${match[2]}`;
      if (!imageGroups.has(imageId)) {
        imageGroups.set(imageId, []);
      }
      
      // Yüksek kaliteli resimleri seç
      if (img.includes('_org_zoom.jpg')) {
        imageGroups.get(imageId)?.push(img);
      }
    }
  });
  
  console.log(`🎨 Bulunan görsel grupları: ${imageGroups.size}`);
  
  // Bilinen mayo renk kodları (user specification'dan)
  const mayoColors: MayoColorVariant[] = [
    {
      color: 'Sarı',
      colorCode: '398949332/903542807',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Turuncu',
      colorCode: '398949240/903474114', 
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Lacivert',
      colorCode: 'unknown', // Bulunamadıysa genel görseller
      images: [],
      price: 3079.22,
      originalPrice: 3144.27,
      sizes: ['36', '38', '42', '44']
    },
    {
      color: 'İndigo Mavi',
      colorCode: 'unknown',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Lila',
      colorCode: 'unknown',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Mor',
      colorCode: 'unknown',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Bordo',
      colorCode: 'unknown',
      images: [],
      price: 3079.22,
      originalPrice: 3144.27,
      sizes: ['36', '38', '42', '44']
    },
    {
      color: 'Haki',
      colorCode: 'unknown',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Pembe',
      colorCode: 'unknown',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Ekru',
      colorCode: 'unknown',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    },
    {
      color: 'Siyah',
      colorCode: 'unknown',
      images: [],
      price: 3079.22,
      originalPrice: 3144.27,
      sizes: ['36', '38', '42', '44']
    },
    {
      color: 'Yeşil',
      colorCode: 'unknown',
      images: [],
      price: 1393.03,
      originalPrice: 1458.03,
      sizes: ['38', '40']
    }
  ];
  
  // Her renk için görselleri eşleştir
  mayoColors.forEach(variant => {
    if (variant.colorCode !== 'unknown' && imageGroups.has(variant.colorCode)) {
      variant.images = imageGroups.get(variant.colorCode)?.slice(0, 3) || [];
      console.log(`✅ ${variant.color}: ${variant.images.length} görsel bulundu`);
    } else {
      // Bilinmeyen renkler için genel görsel pool'undan al
      const availableImages = Array.from(imageGroups.values()).flat();
      variant.images = availableImages.slice(0, 2);
      console.log(`🔄 ${variant.color}: ${variant.images.length} genel görsel atandı`);
    }
  });
  
  // Ek görsel gruplarını keşfet
  const knownCodes = mayoColors.map(v => v.colorCode).filter(c => c !== 'unknown');
  const unknownGroups = Array.from(imageGroups.keys()).filter(code => !knownCodes.includes(code));
  
  if (unknownGroups.length > 0) {
    console.log(`🔍 Ek görsel grupları bulundu: ${unknownGroups.length}`);
    
    unknownGroups.forEach((code, index) => {
      if (index < mayoColors.length) {
        const unknownVariant = mayoColors.find(v => v.colorCode === 'unknown');
        if (unknownVariant) {
          unknownVariant.colorCode = code;
          unknownVariant.images = imageGroups.get(code)?.slice(0, 3) || [];
          console.log(`🆕 ${unknownVariant.color} → ${code}: ${unknownVariant.images.length} görsel`);
        }
      }
    });
  }
  
  // Boş görsel olan varyantları temizle veya varsayılan ata
  const validVariants = mayoColors.filter(v => v.images.length > 0);
  
  if (validVariants.length === 0) {
    console.log('⚠️ Hiçbir renk görseli bulunamadı, varsayılan görseller atanıyor...');
    const fallbackImages = Array.from(imageGroups.values()).flat().slice(0, 3);
    
    mayoColors.forEach(variant => {
      variant.images = fallbackImages;
    });
    
    return mayoColors;
  }
  
  console.log(`🎯 Başarıyla işlendi: ${validVariants.length} renk varyantı`);
  return validVariants;
}

export function generateMayoColorCSV(variants: MayoColorVariant[], title: string, brand: string): string {
  console.log(`🏊‍♀️ Mayo renk CSV'si oluşturuluyor: ${variants.length} varyant`);
  
  const csvHeaders = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title',
    'SEO Description', 'Status'
  ];
  
  const rows: string[] = [csvHeaders.join(',')];
  
  const handle = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  const description = `<div class="product-description"><h3>Premium Boutique Mayo</h3><p>${variants.length} farklı renk seçeneği ile üretilmiş özel tasarım mayo.</p></div>`;
  
  let isFirstRow = true;
  let imagePosition = 1;
  
  // Her renk için bedenlere göre varyant oluştur
  variants.forEach(variant => {
    variant.sizes.forEach(size => {
      const finalPrice = Math.round(variant.price * 1.15 * 100) / 100;
      const comparePrice = Math.round(variant.originalPrice * 1.15 * 100) / 100;
      
      const row = [
        handle,
        isFirstRow ? title : '',
        isFirstRow ? `"${description}"` : '',
        isFirstRow ? brand : '',
        isFirstRow ? 'Giyim > Kadın > Plaj & Mayo' : '',
        isFirstRow ? 'Mayo' : '',
        isFirstRow ? 'boutique,mayo,multi-color,swimwear' : '',
        isFirstRow ? 'TRUE' : '',
        isFirstRow ? 'Renk' : '',
        variant.color,
        isFirstRow ? 'Beden' : '',
        size,
        '', '', // Option3 boş
        `${handle}-${variant.color.toLowerCase()}-${size}`,
        '100',
        'shopify',
        '10',
        'deny',
        'manual',
        finalPrice.toFixed(2),
        comparePrice.toFixed(2),
        'TRUE',
        'TRUE',
        '',
        isFirstRow && variant.images[0] ? variant.images[0] : '',
        isFirstRow && variant.images[0] ? imagePosition.toString() : '',
        isFirstRow ? `${brand} ${title} - ${variant.color}` : '',
        'FALSE',
        isFirstRow ? title : '',
        isFirstRow ? `${brand} ${title} - ${variants.length} renk seçeneği` : '',
        'active'
      ];
      
      rows.push(row.map(field => 
        typeof field === 'string' && field.includes(',') ? `"${field}"` : field
      ).join(','));
      
      isFirstRow = false;
    });
    
    // Bu varyant için ek görseller
    variant.images.slice(1).forEach((imageUrl, index) => {
      imagePosition++;
      const imageRow = [
        handle, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        imageUrl,
        imagePosition.toString(),
        `${brand} ${title} - ${variant.color} - Resim ${index + 2}`,
        '', '', '', ''
      ];
      rows.push(imageRow.join(','));
    });
  });
  
  return rows.join('\n');
}