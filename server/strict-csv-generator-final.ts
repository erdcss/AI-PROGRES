// strict-csv-generator-final.ts - FINAL VERSION WITH CORRECT OPTION NAMES

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
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'SEO Title': string;
  'SEO Description': string;
  'Variant Weight Unit': string;
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

  validVariants.forEach((variant) => {
    // CRITICAL: Her satır için aynı Option Name'ler
    const baseRow = {
      Handle: baseHandle,
      Title: productData.title,
      'Body (HTML)': `<p>${productData.title} - Kaliteli ${productData.brand} ürünü.</p>`,
      Vendor: productData.brand,
      'Product Type': 'Giyim',
      Tags: `${productData.brand}, Kaliteli, Trendyol`,
      Published: 'TRUE',
      'Option1 Name': 'Renk', // HER SATIRDA SABİT
      'Option1 Value': variant.color || 'Koyu Mavi', // HER SATIRDA RENK
      'Option2 Name': 'Beden', // HER SATIRDA SABİT
      'Option2 Value': variant.size, // HER SATIRDA BEDEN
      'Variant SKU': `${baseHandle}-${variant.size}`,
      'Variant Inventory Qty': `${variant.stock}`,
      'Variant Price': `${Math.round(variant.price * 1.10)}`,
      'Variant Compare At Price': `${Math.round(variant.price * 1.25)}`,
      'Cost per item': `${Math.round(variant.price * 0.8)}`,
      'Image Src': '',
      'Image Position': '',
      'Image Alt Text': productData.title,
      'SEO Title': productData.title,
      'SEO Description': `${productData.brand} ${productData.title}`,
      'Variant Weight Unit': 'kg'
    };

    if (variant.images && variant.images.length > 0) {
      variant.images.forEach((imgUrl, i) => {
        rows.push({
          ...baseRow,
          'Image Src': imgUrl,
          'Image Position': `${i + 1}`
        });
      });
    } else {
      rows.push(baseRow);
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