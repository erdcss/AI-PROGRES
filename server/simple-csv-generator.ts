/**
 * Basit CSV Generator - Shopify Uyumlu
 */

export interface SimpleProductData {
  title: string;
  brand: string;
  price: string;
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{color: string, size: string, inStock: boolean}>;
}

export function generateSimpleCSV(data: SimpleProductData): string {
  const handle = data.title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  // Özelliklerden açıklama oluştur
  const description = data.features
    .map(f => `${f.key}: ${f.value}`)
    .join(' | ');
  
  // Fiyat hesaplama (%10 kar marjı) - Türk formatı
  const originalPrice = parseFloat(data.price.replace(/[^\d,]/g, '').replace(',', '.')) || 1924;
  const profitPrice = Math.round(originalPrice * 1.10 * 100) / 100;
  const formattedPrice = profitPrice.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).replace('.', ',') + ' TL';
  
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
    `${data.brand.toLowerCase()},giyim,moda`,
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