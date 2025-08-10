interface CombinedProduct {
  id: string;
  title: string;
  brand: string;
  price: any;
  description: string;
  category: string;
  images: Array<{ url: string; alt?: string; colorName?: string }>;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features: Array<{ key: string; value: string }>;
  tags: string[];
}

export function generateMultiVariantShopifyCSV(product: CombinedProduct): string {
  // HEADERS - Shopify import formatına uygun
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Tags', 'Published',
    'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
    'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price',
    'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 
    'SEO Title', 'SEO Description', 'Variant Image', 'Variant Weight Unit', 'Status'
  ];

  const rows: string[][] = [];
  rows.push(headers);

  // Handle oluştur (Türkçe karakter temizleme)
  const productHandle = product.title.toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Body HTML oluştur
  let bodyHtml = `<p><strong>${product.brand}</strong></p>`;
  bodyHtml += `<p>${product.description}</p>`;
  
  if (product.features.length > 0) {
    bodyHtml += '<h3>Ürün Özellikleri:</h3><ul>';
    product.features.forEach(feature => {
      bodyHtml += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
    });
    bodyHtml += '</ul>';
  }

  // Fiyat hesapla
  let basePrice = '0';
  if (typeof product.price === 'object' && product.price.value) {
    basePrice = product.price.value.toString();
  } else if (typeof product.price === 'number') {
    basePrice = product.price.toString();
  } else if (typeof product.price === 'string') {
    const priceMatch = product.price.match(/[\d.,]+/);
    basePrice = priceMatch ? priceMatch[0].replace(',', '.') : '0';
  }

  // Görselleri renklerine göre grupla
  const imagesByColor: { [color: string]: string[] } = {};
  const generalImages: string[] = [];
  
  product.images.forEach(img => {
    if (img.colorName) {
      if (!imagesByColor[img.colorName]) {
        imagesByColor[img.colorName] = [];
      }
      imagesByColor[img.colorName].push(img.url);
    } else {
      generalImages.push(img.url);
    }
  });

  // Tüm varyantları işle
  let imagePosition = 1;
  let isFirstRow = true;
  
  product.variants.allVariants.forEach((variant, index) => {
    const row: string[] = [];
    
    // İlk satır için ürün bilgileri
    if (isFirstRow) {
      row.push(productHandle); // Handle
      row.push(product.title); // Title
      row.push(bodyHtml); // Body (HTML)
      row.push(product.brand || ''); // Vendor
      row.push(product.tags.join(', ')); // Tags
      row.push('TRUE'); // Published
    } else {
      // Sonraki satırlarda sadece varyant bilgileri
      row.push(productHandle); // Handle
      row.push(''); // Title (boş)
      row.push(''); // Body (boş)
      row.push(''); // Vendor (boş)
      row.push(''); // Tags (boş)
      row.push(''); // Published (boş)
    }
    
    // Option bilgileri
    row.push('Renk'); // Option1 Name
    row.push(variant.color); // Option1 Value
    row.push('Beden'); // Option2 Name
    row.push(variant.size); // Option2 Value
    
    // Varyant bilgileri
    row.push(`${productHandle}-${variant.colorCode}-${variant.size.toLowerCase()}`); // Variant SKU
    row.push(variant.inStock ? '10' : '0'); // Variant Inventory Qty
    row.push(basePrice); // Variant Price
    row.push(''); // Variant Compare At Price
    
    // Görseller - İlk satırda görselleri ekle
    if (isFirstRow) {
      // İlk görsel için
      const firstImage = generalImages[0] || product.images[0]?.url || '';
      row.push(firstImage); // Image Src
      row.push(imagePosition.toString()); // Image Position
      row.push(product.title); // Image Alt Text
      imagePosition++;
    } else {
      row.push(''); // Image Src
      row.push(''); // Image Position
      row.push(''); // Image Alt Text
    }
    
    row.push('FALSE'); // Gift Card
    row.push(product.title.substring(0, 70)); // SEO Title
    row.push(product.description.substring(0, 160)); // SEO Description
    
    // Varyant görseli (renk bazında)
    const colorImages = imagesByColor[variant.color];
    if (colorImages && colorImages.length > 0) {
      row.push(colorImages[0]); // İlk görseli varyant görseli olarak kullan
    } else {
      row.push(''); // Varyant görseli yoksa boş
    }
    
    row.push('kg'); // Variant Weight Unit
    row.push('active'); // Status

    rows.push(row);
    isFirstRow = false;
  });

  // Kalan görselleri ekle (renk bazında)
  Object.entries(imagesByColor).forEach(([colorName, images]) => {
    images.slice(1).forEach(imageUrl => { // İlk görsel zaten varyant görseli olarak kullanıldı
      const imageRow = Array(headers.length).fill('');
      imageRow[0] = productHandle; // Handle
      imageRow[14] = imageUrl; // Image Src
      imageRow[15] = imagePosition.toString(); // Image Position
      imageRow[16] = `${product.title} - ${colorName}`; // Image Alt Text
      rows.push(imageRow);
      imagePosition++;
    });
  });

  // Genel görselleri ekle (renk bazında olmayan)
  generalImages.slice(1).forEach(imageUrl => {
    const imageRow = Array(headers.length).fill('');
    imageRow[0] = productHandle; // Handle
    imageRow[14] = imageUrl; // Image Src
    imageRow[15] = imagePosition.toString(); // Image Position
    imageRow[16] = product.title; // Image Alt Text
    rows.push(imageRow);
    imagePosition++;
  });

  // CSV formatına dönüştür
  return rows.map(row => 
    row.map(cell => {
      // CSV için özel karakterleri escape et
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');
}