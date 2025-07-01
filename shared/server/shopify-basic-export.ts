import { Product } from "@shared/schema";
import fs from "fs";
import slugify from "slugify";

/**
 * ÇOK TEMEL SHOPIFY CSV EXPORT - 19 Mayıs 2025
 * 
 * Bu modül özellikle fazla satır ve görsel sorununu çözmek için yazıldı
 * Sadece 1 satır, 1 ana görsel ve minimum alanlar içerir
 */

export async function generateBasicShopifyCSV(
  product: Product,
  outputPath: string = "/tmp/shopify_products.csv"
): Promise<string> {
  console.log("Çok basit CSV oluşturuluyor - TEK SATIR, TEK GÖRSEL");

  // Handle oluşturma
  const handle = slugify(product.title, {
    replacement: '-',
    lower: true,
    strict: true,
    trim: true
  }).substring(0, 60);

  // Fiyat hesaplama (%10 kar marjı)
  let finalPrice = "0.00";
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    finalPrice = (basePrice * 1.10).toFixed(2);
  }
  
  // Etiketleri hazırla
  let tags = "";
  const productType = product.category || "Genel Ürünler";
  
  if (product.tags && Array.isArray(product.tags) && product.tags.length > 0) {
    tags = product.tags
      .map(tag => tag.replace(/trendyol/i, "").trim())
      .filter(tag => tag.length > 0)
      .map(tag => tag.substring(0, 20))
      .slice(0, 8)
      .join(", ");
  }
  
  // SADECE ana ürün görselini bul
  let mainImage = "";
  if (product.images && product.images.length > 0) {
    const productImages = product.images.filter(url => 
      (url.includes('_org_zoom.jpg') || url.includes('_org.jpg')) &&
      !url.includes('badge') && 
      !url.includes('icon') && 
      !url.includes('logo') &&
      !url.includes('.css') &&
      !url.includes('.js')
    );
    
    if (productImages.length > 0) {
      mainImage = productImages[0];
      console.log(`Ana ürün görseli: ${mainImage}`);
    }
  }

  // Shopify gerçekten ihtiyaç duyduğu minimum alanları içeren CSV başlık ve içeriği
  // Burada çok minimal bir CSV hazırlıyoruz - Shopify gerçekten sadece bunları istiyor
  const minimalHeader = [
    "Handle",
    "Title",
    "Body (HTML)",
    "Vendor",
    "Type",
    "Tags",
    "Published",
    "Variant Price",
    "Image Src",
    "Status"
  ].join(",");

  // CSV için sadece 1 satır hazırla - hiçbir ek satır olmadan
  const minimalRow = [
    handle,
    `"${product.title.replace(/"/g, '""')}"`,
    `"${(product.description || '').replace(/"/g, '""')}"`,
    "turmarkt",
    productType,
    `"${tags}"`,
    "TRUE",
    finalPrice,
    mainImage,
    "active"
  ].join(",");

  // Sadece 1 başlık ve 1 veri satırı içeren minimal CSV içeriği
  const csvContent = minimalHeader + "\n" + minimalRow;

  // Dosyaya yaz
  fs.writeFileSync(outputPath, csvContent);
  console.log(`CSV başarıyla oluşturuldu: ${outputPath} (1 satır)`);

  return outputPath;
}