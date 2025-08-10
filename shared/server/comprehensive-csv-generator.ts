/**
 * Kapsamlı CSV oluşturucu - Scrapy verilerini Shopify formatına çevirir
 */

import { ScrapyProductData } from './scrapy-enhanced-extractor';

interface ShopifyCSVRow {
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
  'Option3 Name': string;
  'Option3 Value': string;
  'Variant SKU': string;
  'Variant Grams': string;
  'Variant Inventory Tracker': string;
  'Variant Inventory Qty': string;
  'Variant Inventory Policy': string;
  'Variant Fulfillment Service': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant Requires Shipping': string;
  'Variant Taxable': string;
  'Variant Barcode': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'Gift Card': string;
  'SEO Title': string;
  'SEO Description': string;
  'Google Shopping / Google Product Category': string;
  'Google Shopping / Gender': string;
  'Google Shopping / Age Group': string;
  'Google Shopping / MPN': string;
  'Google Shopping / AdWords Grouping': string;
  'Google Shopping / AdWords Labels': string;
  'Google Shopping / Condition': string;
  'Google Shopping / Custom Product': string;
  'Google Shopping / Custom Label 0': string;
  'Google Shopping / Custom Label 1': string;
  'Google Shopping / Custom Label 2': string;
  'Google Shopping / Custom Label 3': string;
  'Google Shopping / Custom Label 4': string;
  'Cost per item': string;
}

export function generateComprehensiveCSV(scrapyData: ScrapyProductData[]): {
  filename: string;
  content: string;
  totalVariants: number;
  preview: ShopifyCSVRow[];
} {
  if (!scrapyData || scrapyData.length === 0) {
    throw new Error('Scrapy verisi boş');
  }

  const rows: ShopifyCSVRow[] = [];
  const firstProduct = scrapyData[0];
  
  // Ana ürün handle'ı oluştur
  const baseHandle = firstProduct.product_title
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  scrapyData.forEach((product, index) => {
    const isFirstVariant = index === 0;
    
    // Kar marjı hesaplamaları - %10 kar garantisi
    const originalPrice = product.price;
    const finalPrice = Math.round(originalPrice * 1.10); // %10 kar ekleme garantisi
    const compareAtPrice = Math.round(originalPrice * 1.25); // %25 daha yüksek karşılaştırma fiyatı
    const costPrice = Math.round(originalPrice * 0.8); // %20 daha düşük maliyet

    const row: ShopifyCSVRow = {
      Handle: baseHandle,
      Title: isFirstVariant ? product.product_title : '',
      'Body (HTML)': isFirstVariant ? `<p>${product.product_title} - Profesyonel kalitede ürün.</p>` : '',
      Vendor: isFirstVariant ? product.brand : '',
      'Product Type': isFirstVariant ? 'Giyim' : '',
      Tags: isFirstVariant ? `${product.brand}, Trendyol, Kaliteli` : '',
      Published: isFirstVariant ? 'TRUE' : '',
      'Option1 Name': 'Renk',
      'Option1 Value': product.color || 'Varsayılan',
      'Option2 Name': 'Beden',
      'Option2 Value': product.size || 'Tek Beden',
      'Option3 Name': '',
      'Option3 Value': '',
      'Variant SKU': `${baseHandle}-${(product.color || 'default').toLowerCase()}-${(product.size || 'default').toLowerCase()}`,
      'Variant Grams': '500',
      'Variant Inventory Tracker': 'shopify',
      'Variant Inventory Qty': product.stockCount.toString(),
      'Variant Inventory Policy': 'continue',
      'Variant Fulfillment Service': 'manual',
      'Variant Price': finalPrice.toString(),
      'Variant Compare At Price': compareAtPrice.toString(),
      'Variant Requires Shipping': 'TRUE',
      'Variant Taxable': 'TRUE',
      'Variant Barcode': '',
      'Image Src': product.image_urls[0] || '',
      'Image Position': '1',
      'Image Alt Text': `${product.product_title} ${product.color || ''} ${product.size || ''}`.trim(),
      'Gift Card': 'FALSE',
      'SEO Title': isFirstVariant ? `${product.product_title} | ${product.brand}` : '',
      'SEO Description': isFirstVariant ? `${product.product_title} uygun fiyatlarla. ${product.brand} kalitesi.` : '',
      'Google Shopping / Google Product Category': 'Giyim ve Aksesuar > Giyim',
      'Google Shopping / Gender': 'Unisex',
      'Google Shopping / Age Group': 'Yetişkin',
      'Google Shopping / MPN': `${product.brand}-${Date.now()}`,
      'Google Shopping / AdWords Grouping': product.brand,
      'Google Shopping / AdWords Labels': 'Trendyol, Kaliteli',
      'Google Shopping / Condition': 'Yeni',
      'Google Shopping / Custom Product': 'FALSE',
      'Google Shopping / Custom Label 0': `Orijinal Fiyat: ₺${originalPrice}`,
      'Google Shopping / Custom Label 1': `Kar Marjı: %10 (₺${finalPrice - originalPrice})`,
      'Google Shopping / Custom Label 2': `Stok: ${product.stockCount} adet`,
      'Google Shopping / Custom Label 3': `Görsel Sayısı: ${product.image_urls.length}`,
      'Google Shopping / Custom Label 4': `SKU: ${product.color || 'default'}-${product.size || 'default'}`,
      'Cost per item': costPrice.toString()
    };

    rows.push(row);
  });

  // CSV içeriği oluştur
  const headers = Object.keys(rows[0]) as Array<keyof ShopifyCSVRow>;
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
  const filename = `shopify-scrapy-${baseHandle}-${timestamp}.csv`;

  return {
    filename,
    content: csvContent,
    totalVariants: rows.length,
    preview: rows.slice(0, 5) // İlk 5 satır preview
  };
}