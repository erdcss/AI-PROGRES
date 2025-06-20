/**
 * Katı CSV oluşturucu - Sadece doğrulanmış verilerle CSV üretir
 */

export interface StrictProductData {
  title: string;
  brand: string;
  price: number;
  variants: Array<{
    color: string;
    size: string;
    stock: number;
    price: number;
    images: string[];
  }>;
  features: Array<{
    key: string;
    value: string;
  }>;
}

export interface StrictCSVRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Type': string;
  Tags: string;
  Published: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Variant SKU': string;
  'Variant Inventory Qty': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Image Src': string;
  'Cost per item': string;
  'Google Shopping / Custom Label 0': string;
  'Google Shopping / Custom Label 1': string;
  'Google Shopping / Custom Label 2': string;
}

export function generateStrictCSV(productData: StrictProductData): {
  success: boolean;
  filename: string;
  content: string;
  rowCount: number;
  validationErrors: string[];
} {
  const errors: string[] = [];
  
  // Katı doğrulama
  if (!productData.title || productData.title.length < 3) {
    errors.push('Ürün başlığı geçersiz');
  }
  
  if (!productData.brand || productData.brand.length < 2) {
    errors.push('Marka bilgisi geçersiz');
  }
  
  if (!productData.variants || productData.variants.length === 0) {
    errors.push('Varyant bilgisi bulunamadı');
  }
  
  const validVariants = productData.variants.filter(v => 
    v.stock > 0 && 
    v.price > 0 && 
    v.color && 
    v.size
  );
  
  if (validVariants.length === 0) {
    errors.push('Stokta varyant bulunamadı');
  }
  
  if (errors.length > 0) {
    return {
      success: false,
      filename: '',
      content: '',
      rowCount: 0,
      validationErrors: errors
    };
  }
  
  // CSV satırları oluştur
  const rows: StrictCSVRow[] = [];
  const baseHandle = productData.title
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  validVariants.forEach((variant, index) => {
    const isFirst = index === 0;
    const finalPrice = Math.round(variant.price * 1.10); // %10 kar
    const comparePrice = Math.round(variant.price * 1.25); // %25 yüksek
    const costPrice = Math.round(variant.price * 0.8); // %20 düşük
    
    rows.push({
      Handle: baseHandle,
      Title: isFirst ? productData.title : '',
      'Body (HTML)': isFirst ? `<p>${productData.title} - Kaliteli ${productData.brand} ürünü.</p>` : '',
      Vendor: isFirst ? productData.brand : '',
      'Product Type': isFirst ? 'Giyim' : '',
      Tags: isFirst ? `${productData.brand}, Kaliteli, Trendyol` : '',
      Published: isFirst ? 'TRUE' : '',
      'Option1 Name': 'Renk',
      'Option1 Value': variant.color,
      'Option2 Name': 'Beden',
      'Option2 Value': variant.size,
      'Variant SKU': `${baseHandle}-${variant.color.toLowerCase()}-${variant.size.toLowerCase()}`,
      'Variant Inventory Qty': variant.stock.toString(),
      'Variant Price': finalPrice.toString(),
      'Variant Compare At Price': comparePrice.toString(),
      'Image Src': variant.images[0] || '',
      'Cost per item': costPrice.toString(),
      'Google Shopping / Custom Label 0': `Orijinal: ₺${variant.price}`,
      'Google Shopping / Custom Label 1': `Kar: %10 (₺${finalPrice - variant.price})`,
      'Google Shopping / Custom Label 2': `Stok: ${variant.stock} adet`
    });
  });
  
  // CSV içeriği
  const headers = Object.keys(rows[0]) as Array<keyof StrictCSVRow>;
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      headers.map(header => {
        const value = row[header] || '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `strict-shopify-${baseHandle}-${timestamp}.csv`;
  
  return {
    success: true,
    filename,
    content: csvContent,
    rowCount: rows.length,
    validationErrors: []
  };
}