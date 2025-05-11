import { Product } from "@shared/schema";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";
import path from "path";

/**
 * Sadeleştirilmiş Shopify CSV dışa aktarım - 10 Mayıs 2025
 * 
 * Bu modül, Shopify import için CSV dosyaları oluşturur.
 * Şu değişiklikler yapıldı:
 * - Basitleştirilmiş format dönüşümü
 * - Doğrudan veri yazma stratejisi
 * - Kesin sütun eşleştirmeleri
 */

export async function generateSimpleShopifyCSV(
  product: Product,
  outputDir: string = "exports"
): Promise<string> {
  // Çıktı klasörünün varlığını kontrol et
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Benzersiz dosya ismi oluştur
  const timestamp = Date.now();
  const fileName = `shopify_export_${timestamp}.csv`;
  const outputPath = path.join(outputDir, fileName);
  
  console.log(`CSV dosyası oluşturuluyor: ${outputPath}`);

  // Handle (URL-bağlantılı) oluşturma
  const handle = product.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")  // İzin verilen karakterler dışındakileri temizle
    .replace(/\s+/g, "-")         // Boşlukları tire ile değiştir
    .replace(/-+/g, "-")          // Çoklu tireleri tek tire yap
    .substring(0, 50);            // Maksimum 50 karakter

  // Fiyat hesaplama (Mevcut fiyat + %10 kar)
  let price = "0.00";
  
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    price = (basePrice * 1.10).toFixed(2);
    console.log(`Orijinal fiyat: ${basePrice}, %10 kar eklenmiş fiyat: ${price}`);
  } else {
    console.log("Geçerli bir fiyat bulunamadı, varsayılan 0.00 kullanılıyor");
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
    mainRow['Option2 Name'] = 'Color';
    mainRow['Option2 Value'] = colors[0];
  }

  // Ana ürüne görsel ekle
  if (product.images && product.images.length > 0) {
    mainRow['Image Src'] = product.images[0];
    mainRow['Image Position'] = '1';
    mainRow['Image Alt Text'] = product.title;
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

  // Diğer görselleri ekleyelim (ilk görsel zaten ana satırda var)
  if (product.images && product.images.length > 1) {
    for (let i = 1; i < product.images.length; i++) {
      rows.push({
        Handle: handle,
        'Image Src': product.images[i],
        'Image Position': (i + 1).toString(),
        'Image Alt Text': `${product.title} - Görsel ${i + 1}`
      });
    }
  }

  console.log(`Toplam ${rows.length} satır CSV'ye yazılacak`);

  // CSV Writer'ı oluştur
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'Handle', title: 'Handle' },
      { id: 'Title', title: 'Title' },
      { id: 'Body (HTML)', title: 'Body (HTML)' },
      { id: 'Vendor', title: 'Vendor' },
      { id: 'Standard Product Type', title: 'Standard Product Type' },
      { id: 'Custom Product Type', title: 'Custom Product Type' },
      { id: 'Tags', title: 'Tags' },
      { id: 'Published', title: 'Published' },
      { id: 'Status', title: 'Status' },
      { id: 'Published At', title: 'Published At' },
      { id: 'Published Scope', title: 'Published Scope' },
      { id: 'Template Suffix', title: 'Template Suffix' },
      { id: 'Option1 Name', title: 'Option1 Name' },
      { id: 'Option1 Value', title: 'Option1 Value' },
      { id: 'Option2 Name', title: 'Option2 Name' },
      { id: 'Option2 Value', title: 'Option2 Value' },
      { id: 'Option3 Name', title: 'Option3 Name' },
      { id: 'Option3 Value', title: 'Option3 Value' },
      { id: 'Variant SKU', title: 'Variant SKU' },
      { id: 'Variant Grams', title: 'Variant Grams' },
      { id: 'Variant Inventory Tracker', title: 'Variant Inventory Tracker' },
      { id: 'Variant Inventory Qty', title: 'Variant Inventory Qty' },
      { id: 'Variant Inventory Policy', title: 'Variant Inventory Policy' },
      { id: 'Variant Fulfillment Service', title: 'Variant Fulfillment Service' },
      { id: 'Variant Price', title: 'Variant Price' },
      { id: 'Variant Compare At Price', title: 'Variant Compare At Price' },
      { id: 'Variant Requires Shipping', title: 'Variant Requires Shipping' },
      { id: 'Variant Taxable', title: 'Variant Taxable' },
      { id: 'Variant Barcode', title: 'Variant Barcode' },
      { id: 'Image Src', title: 'Image Src' },
      { id: 'Image Position', title: 'Image Position' },
      { id: 'Image Alt Text', title: 'Image Alt Text' },
      { id: 'Gift Card', title: 'Gift Card' },
      { id: 'SEO Title', title: 'SEO Title' },
      { id: 'SEO Description', title: 'SEO Description' },
      { id: 'Google Shopping / Google Product Category', title: 'Google Shopping / Google Product Category' },
      { id: 'Google Shopping / Gender', title: 'Google Shopping / Gender' },
      { id: 'Google Shopping / Age Group', title: 'Google Shopping / Age Group' },
      { id: 'Google Shopping / MPN', title: 'Google Shopping / MPN' },
      { id: 'Google Shopping / AdWords Grouping', title: 'Google Shopping / AdWords Grouping' },
      { id: 'Google Shopping / AdWords Labels', title: 'Google Shopping / AdWords Labels' },
      { id: 'Google Shopping / Condition', title: 'Google Shopping / Condition' },
      { id: 'Google Shopping / Custom Product', title: 'Google Shopping / Custom Product' },
      { id: 'Google Shopping / Custom Label 0', title: 'Google Shopping / Custom Label 0' },
      { id: 'Google Shopping / Custom Label 1', title: 'Google Shopping / Custom Label 1' },
      { id: 'Google Shopping / Custom Label 2', title: 'Google Shopping / Custom Label 2' },
      { id: 'Google Shopping / Custom Label 3', title: 'Google Shopping / Custom Label 3' },
      { id: 'Google Shopping / Custom Label 4', title: 'Google Shopping / Custom Label 4' },
      { id: 'Variant Image', title: 'Variant Image' },
      { id: 'Variant Weight Unit', title: 'Variant Weight Unit' },
      { id: 'Variant Tax Code', title: 'Variant Tax Code' },
      { id: 'Cost per item', title: 'Cost per item' }
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