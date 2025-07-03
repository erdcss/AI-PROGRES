import axios from 'axios';
import * as cheerio from 'cheerio';

interface ColorImageMap {
  [color: string]: string[];
}

export async function extractAllColorImages(url: string): Promise<ColorImageMap> {
  console.log('🎨 Tüm renk görsellerini çıkarıyor...');
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
  const $ = cheerio.load(response.data);
  const html = response.data;
  
  const colorImages: ColorImageMap = {};
  
  // Renk seçeneklerini bul
  const colors = extractAvailableColors($, html);
  console.log(`🎨 Bulunan renkler: ${colors.join(', ')}`);
  
  // Her renk için görselleri çıkar
  for (const color of colors) {
    const images = await extractImagesForColor($, html, color);
    if (images.length > 0) {
      colorImages[color] = images;
      console.log(`📸 ${color}: ${images.length} görsel bulundu`);
    }
  }
  
  return colorImages;
}

function extractAvailableColors($: cheerio.CheerioAPI, html: string): string[] {
  const colors: Set<string> = new Set();
  
  // Method 1: Renk butonlarından çıkar
  $('.pr-in-dt-cl button, .color-option, .variant-color').each((i, el) => {
    const colorText = $(el).attr('title') || $(el).text().trim();
    if (colorText && colorText.length > 0) {
      colors.add(colorText.toLowerCase());
    }
  });
  
  // Method 2: Script içindeki renk verilerini bul
  const scripts = $('script').toArray();
  for (const script of scripts) {
    const scriptContent = $(script).html() || '';
    
    if (scriptContent.includes('color') || scriptContent.includes('variant')) {
      // Renk array'lerini bul
      const colorMatches = scriptContent.match(/"name":\s*"([^"]+)"[^}]*"attributeType":\s*"Color"/g);
      if (colorMatches) {
        colorMatches.forEach(match => {
          const colorMatch = match.match(/"name":\s*"([^"]+)"/);
          if (colorMatch) {
            colors.add(colorMatch[1].toLowerCase());
          }
        });
      }
    }
  }
  
  // Method 3: URL pattern'lerinden renk çıkar
  const urlPatterns = [
    /color[=:]([^&\s]+)/gi,
    /renk[=:]([^&\s]+)/gi,
    /variant[=:]([^&\s]+)/gi
  ];
  
  urlPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const colorPart = match.split(/[=:]/)[1];
        if (colorPart && colorPart.length > 2) {
          colors.add(colorPart.toLowerCase());
        }
      });
    }
  });
  
  // Bilinen renkler için fallback
  const knownColors = [
    'sarı', 'sari', 'yellow',
    'lacivert', 'navy', 'mavi', 'blue',
    'turuncu', 'orange', 'portakal',
    'pembe', 'pink', 'rozé',
    'mor', 'purple', 'lila',
    'yeşil', 'green', 'yesil',
    'siyah', 'black', 'kara',
    'beyaz', 'white', 'ak',
    'kırmızı', 'red', 'kirmizi',
    'gri', 'gray', 'grey',
    'kahverengi', 'brown',
    'haki', 'khaki',
    'bordo', 'maroon',
    'ekru', 'cream', 'bej'
  ];
  
  // Script içinde bilinen renkleri ara
  knownColors.forEach(color => {
    if (html.toLowerCase().includes(color)) {
      colors.add(color);
    }
  });
  
  return Array.from(colors).filter(color => color.length > 1);
}

async function extractImagesForColor($: cheerio.CheerioAPI, html: string, color: string): Promise<string[]> {
  const images: Set<string> = new Set();
  
  // Method 1: Renk specific CDN pattern'leri bul
  const colorPatterns = [
    new RegExp(`cdn\\.dsmcdn\\.com[^"'\\s]*${color}[^"'\\s]*\\.jpg`, 'gi'),
    new RegExp(`cdn\\.dsmcdn\\.com[^"'\\s]*${color.charAt(0).toUpperCase() + color.slice(1)}[^"'\\s]*\\.jpg`, 'gi'),
    new RegExp(`cdn\\.dsmcdn\\.com[^"'\\s]*_${color}[^"'\\s]*\\.jpg`, 'gi')
  ];
  
  colorPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        if (match.includes('_org_zoom.jpg') || match.includes('mnresize')) {
          images.add(`https://${match}`);
        }
      });
    }
  });
  
  // Method 2: Genel CDN resimlerinden color-specific olanları filtrele
  const allCDNImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
  
  allCDNImages.forEach(imageUrl => {
    const imagePath = imageUrl.toLowerCase();
    
    // Renk ile eşleşen URL path'leri bul
    if (imagePath.includes(color.toLowerCase()) || 
        imagePath.includes(color.charAt(0).toUpperCase() + color.slice(1)) ||
        imagePath.includes(`_${color.toLowerCase()}`)) {
      
      // Kaliteli resimleri seç
      if (imageUrl.includes('_org_zoom.jpg') || imageUrl.includes('mnresize')) {
        images.add(imageUrl);
      }
    }
  });
  
  // Method 3: Image ID pattern'lerini analiz et
  const imageIdMatches = html.match(/\/(\d{8,})\/(\d{8,})\/\d+\/\d+_org_zoom\.jpg/g);
  if (imageIdMatches) {
    // Her renk için farklı image ID pattern'leri var
    imageIdMatches.forEach(match => {
      const fullUrl = match.startsWith('http') ? match : `https://cdn.dsmcdn.com${match}`;
      images.add(fullUrl);
    });
  }
  
  return Array.from(images).slice(0, 3); // Her renk için max 3 görsel
}

export async function generateMultiColorCSV(
  title: string,
  brand: string,
  colorImages: ColorImageMap,
  features: Array<{key: string; value: string}>
): Promise<string> {
  
  console.log(`🎨 Multi-color CSV oluşturuluyor: ${Object.keys(colorImages).length} renk`);
  
  // CSV headers
  const csvHeaders = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
    'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
    'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
    'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title',
    'SEO Description', 'Google Shopping / Google Product Category',
    'Google Shopping / Gender', 'Google Shopping / Age Group', 'Status'
  ];
  
  const rows: string[] = [csvHeaders.join(',')];
  
  const handle = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  const description = `
    <div class="product-description">
      <h3>Ürün Özellikleri</h3>
      <ul>
        ${features.map(f => `<li><strong>${f.key}:</strong> ${f.value}</li>`).join('')}
      </ul>
      <p>Premium kalitede boutique mayo, ${Object.keys(colorImages).length} farklı renk seçeneği ile.</p>
    </div>
  `;
  
  let isFirstRow = true;
  let imagePosition = 1;
  
  // Her renk için varyant oluştur
  Object.keys(colorImages).forEach((color, colorIndex) => {
    const images = colorImages[color];
    
    // Fiyat hesaplama (renk bazlı)
    const basePrice = getColorPrice(color);
    const finalPrice = Math.round(basePrice * 1.15 * 100) / 100;
    
    const row = [
      handle,
      isFirstRow ? title : '',
      isFirstRow ? `"${description.replace(/"/g, '""')}"` : '',
      isFirstRow ? brand : '',
      isFirstRow ? 'Giyim > Kadın > Plaj & Mayo' : '',
      isFirstRow ? 'Mayo' : '',
      isFirstRow ? 'boutique,mayo,swimwear,multi-color' : '',
      isFirstRow ? 'TRUE' : '',
      isFirstRow ? 'Renk' : '',
      color,
      '', '', '', '', // Option2, Option3 boş
      `${handle}-${color.toLowerCase()}`,
      '100',
      'shopify',
      '10',
      'deny',
      'manual',
      finalPrice.toFixed(2),
      (finalPrice * 1.1).toFixed(2), // %10 karşılaştırma fiyatı
      'TRUE',
      'TRUE',
      '',
      isFirstRow && images[0] ? images[0] : '',
      isFirstRow && images[0] ? imagePosition.toString() : '',
      isFirstRow ? `${brand} ${title} - ${color}` : '',
      'FALSE',
      isFirstRow ? title : '',
      isFirstRow ? `${brand} ${title} - ${Object.keys(colorImages).length} renk seçeneği` : '',
      isFirstRow ? 'Apparel & Accessories > Clothing > Swimwear' : '',
      isFirstRow ? 'female' : '',
      isFirstRow ? 'adult' : '',
      'active'
    ];
    
    rows.push(row.map(field => 
      typeof field === 'string' && field.includes(',') ? `"${field}"` : field
    ).join(','));
    
    isFirstRow = false;
    
    // Bu renk için ek resimler
    images.slice(1).forEach((imageUrl, index) => {
      imagePosition++;
      const imageRow = [
        handle, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        imageUrl,
        imagePosition.toString(),
        `${brand} ${title} - ${color} - Resim ${index + 2}`,
        '', '', '', '', '', '', ''
      ];
      rows.push(imageRow.join(','));
    });
  });
  
  return rows.join('\n');
}

function getColorPrice(color: string): number {
  // Renk bazlı fiyat hesaplama
  const lowerColor = color.toLowerCase();
  
  // Yüksek fiyat kategorisi
  if (['lacivert', 'navy', 'siyah', 'black', 'bordo', 'maroon'].includes(lowerColor)) {
    return 3079.22; // İndirimli fiyat
  }
  
  // Normal fiyat kategorisi
  return 1393.03; // İndirimli fiyat
}