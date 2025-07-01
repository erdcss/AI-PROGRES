// strict-csv-generator.ts

export interface StrictProductData {
  title: string;
  brand: string;
  variants: Array<{
    color: string;
    size: string;
    stock: number;
    price: number;
    images?: string[];
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
  'Cost per item': string;
  'Google Shopping / Custom Label 0': string;
  'Google Shopping / Custom Label 1': string;
  'Google Shopping / Custom Label 2': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'Gift Card': string;
  'SEO Title': string;
  'SEO Description': string;
  'Variant Image': string;
  'Variant Weight Unit': string;
  'Included / Turkey': string;
}

export function generateStrictCSV(productData: StrictProductData): {
  success: boolean;
  filename: string;
  content: string;
  rowCount: number;
  validationErrors: string[];
} {
  const errors: string[] = [];

  if (!productData.title || productData.title.length < 3) errors.push("Ürün başlığı eksik");
  if (!productData.brand || productData.brand.length < 2) errors.push("Marka bilgisi eksik");
  if (!productData.variants || productData.variants.length === 0) errors.push("Varyant yok");

  const validVariants = productData.variants.filter(
    (v) => v.stock > 0 && v.price > 0 && v.color && v.size
  );
  if (validVariants.length === 0) errors.push("Stokta geçerli varyant yok");

  if (errors.length > 0) {
    return {
      success: false,
      filename: '',
      content: '',
      rowCount: 0,
      validationErrors: errors
    };
  }

  const rows: StrictCSVRow[] = [];
  const baseHandle = productData.title.toLowerCase().replace(/[^a-z0-9ğüşıöç\s]/g, '').replace(/\s+/g, '-').substring(0, 50);

  validVariants.forEach((variant, index) => {
    const isFirst = index === 0;
    
    // Her satır için base row oluştur - Option Name'ler HER SATIRDA tekrar
    const createBaseRow = () => ({
      Handle: isFirst ? baseHandle : '',
      Title: isFirst ? productData.title : '',
      'Body (HTML)': isFirst ? `<p>${productData.title} - Kaliteli ${productData.brand} ürünü.</p>` : '',
      Vendor: isFirst ? productData.brand : '',
      'Product Type': isFirst ? 'Giyim' : '',
      Tags: isFirst ? `${productData.brand}, Kaliteli, Trendyol` : '',
      Published: isFirst ? 'TRUE' : '',
      // CRITICAL: Option Name'ler her satırda sabit kalmalı
      'Option1 Name': 'Renk',
      'Option1 Value': variant.color,
      'Option2 Name': 'Beden', 
      'Option2 Value': variant.size,
      'Variant SKU': `${baseHandle}-${variant.color.toLowerCase().replace(/\s+/g, '-')}-${variant.size}`,
      'Variant Inventory Qty': `${variant.stock}`,
      'Variant Price': `${Math.round(variant.price * 1.10)}`,
      'Variant Compare At Price': `${Math.round(variant.price * 1.25)}`,
      'Cost per item': `${Math.round(variant.price * 0.8)}`,
      'Google Shopping / Custom Label 0': variant.color,
      'Google Shopping / Custom Label 1': variant.size,
      'Google Shopping / Custom Label 2': productData.brand,
      'Image Src': '',
      'Image Position': '',
      'Image Alt Text': `${productData.title} ${variant.color} ${variant.size}`,
      'Gift Card': 'False',
      'SEO Title': isFirst ? `${productData.title} | ${productData.brand}` : '',
      'SEO Description': isFirst ? `${productData.brand} ${productData.title}` : '',
      'Variant Image': '',
      'Variant Weight Unit': 'kg',
      'Included / Turkey': 'True'
    });

    if (variant.images && variant.images.length > 0) {
      // Her görsel için ayrı satır ama Option Name'ler her satırda
      variant.images.forEach((imgUrl, i) => {
        const row = createBaseRow();
        row['Image Src'] = imgUrl;
        row['Image Position'] = `${i + 1}`;
        row['Variant Image'] = imgUrl;
        rows.push(row);
      });
    } else {
      // Görsel yoksa sadece varyant satırı
      rows.push(createBaseRow());
    }
  });

  const headers = Object.keys(rows[0]);
  const content = [headers.join(','), ...rows.map(row => headers.map(h => `"${(row as any)[h] || ''}"`).join(','))].join('\n');

  return {
    success: true,
    filename: `${baseHandle}.csv`,
    content,
    rowCount: rows.length,
    validationErrors: []
  };
}