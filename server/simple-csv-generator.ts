/**
 * Basit CSV Generator - Shopify Uyumlu
 */

export interface SimpleProductData {
  title: string;
  brand: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
    withProfit: number;
    profitFormatted: string;
  };
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{color: string, size: string, inStock: boolean}>;
}

export function generateSimpleCSV(data: SimpleProductData): string {
  const handle = data.title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  // Özelliklerden gelişmiş HTML açıklama oluştur
  const featuresHTML = data.features.length > 0 
    ? `<h3>Ürün Özellikleri</h3><ul>${data.features.map(f => `<li><strong>${f.key}:</strong> ${f.value}</li>`).join('')}</ul>`
    : '';
  
  const description = `${featuresHTML}<p>Bu ürün Trendyol'dan otomatik olarak içe aktarılmıştır.</p>`;
  
  // Tags oluştur - özelliklerden
  const tags = data.features
    .filter(f => f.key && f.value)
    .map(f => `${f.key}:${f.value}`)
    .slice(0, 10) // İlk 10 özellik
    .join(', ');
  
  // Kar marjlı fiyat - direkt obje'den al
  const profitPrice = data.price.withProfit;
  const formattedPrice = data.price.profitFormatted;
  
  // CSV başlıkları
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
    'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 
    'Variant Taxable', 'Image Src', 'Image Position', 'Status'
  ];
  
  // CSV satırları
  const rows: string[][] = [];
  
  // Ana ürün satırı
  rows.push([
    handle,
    data.title,
    description,
    data.brand,
    'Apparel & Accessories > Clothing',
    'Giyim',
    tags,
    'TRUE',
    'Renk',
    'Beyaz',
    'Beden',
    'S',
    formattedPrice,
    '',
    'TRUE',
    'TRUE',
    data.images[0] || '',
    '1',
    'active'
  ]);
  
  // Ek görseller
  data.images.slice(1, 6).forEach((img, index) => {
    rows.push([
      handle, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', img, (index + 2).toString(), ''
    ]);
  });
  
  // CSV formatına dönüştür
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  return csvContent;
}