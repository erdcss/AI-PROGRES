import { Product } from "@shared/schema";
import fs from "fs";
import slugify from "slugify";

/**
 * ULTRA BASİT CSV OLUŞTURUCU - 19 Mayıs 2025
 * 
 * Bu modül çok basit bir CSV dosyası oluşturur:
 * - Sadece 1 satır (ana ürün) 
 * - En fazla 1 ürün görseli
 * - Minimum sayıda alan
 */

export function generateUltraSimpleCSV(product: Product, outputPath: string): string {
  // Handle oluştur
  const handle = slugify(product.title, {
    replacement: '-',
    lower: true,
    strict: true,
    trim: true
  }).substring(0, 60);

  // Ana ürün görseli bul - sadece gerçek ürün görselleri
  let mainImage = "";
  if (product.images && product.images.length > 0) {
    // Sadece gerçek ürün görsellerini filtrele
    const filteredImages = product.images.filter(url => 
      // Sadece _org_ içeren görselleri kabul et
      (url.includes('_org_zoom.jpg') || url.includes('_org.jpg')) &&
      // Badge, logo, css, js dosyalarını reddet
      !url.includes('badge') && 
      !url.includes('icon') && 
      !url.includes('logo') &&
      !url.includes('.css') &&
      !url.includes('.js') &&
      !url.includes('.png')
    );
    
    // Sadece ilk görseli kullan
    if (filteredImages.length > 0) {
      mainImage = filteredImages[0];
    }
  }

  // %10 kar marjı ekle
  let price = "0.00";
  if (product.price && !isNaN(parseFloat(product.price))) {
    const basePrice = parseFloat(product.price);
    price = (basePrice * 1.10).toFixed(2);
  }
  
  // Tagları hazırla - maksimum 8 tag
  let tags = "";
  if (product.tags && Array.isArray(product.tags) && product.tags.length > 0) {
    tags = product.tags
      .map(tag => tag.replace(/trendyol/i, "").trim())
      .filter(tag => tag.length > 0)
      .map(tag => tag.substring(0, 20))
      .slice(0, 8)
      .join(", ");
  }

  // Minimal CSV formatı - sadece gerekli alanlar
  const header = "Handle,Title,Body (HTML),Vendor,Tags,Published,Status,Variant Price,Image Src";
  const row = [
    handle,
    `"${product.title.replace(/"/g, '""')}"`,
    `"${(product.description || '').replace(/"/g, '""')}"`,
    "turmarkt",
    `"${tags}"`,
    "TRUE",
    "active",
    price,
    mainImage
  ].join(",");

  // Tek satırlık CSV oluştur
  const csvContent = header + "\n" + row;
  
  // Dosyaya yaz
  fs.writeFileSync(outputPath, csvContent);
  console.log(`Ultra basit CSV oluşturuldu: ${outputPath} (1 SATIR, 1 GÖRSEL)`);
  
  return outputPath;
}