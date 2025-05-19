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
    // Sadece gerçek ürün görsellerini filtrele - çok daha sıkı filtre
    const filteredImages = product.images.filter(url => {
      // 1. ADIM: Doğru formatta olan görselleri al (yüksek çözünürlüklü ürün görselleri)
      const isCorrectFormat = (url.includes('_org_zoom.jpg') || url.includes('_org.jpg'));
      
      // 2. ADIM: Tüm yasaklı görselleri reddet
      const isNotProhibited = (
        !url.includes('badge') && 
        !url.includes('icon') && 
        !url.includes('logo') &&
        !url.includes('.css') &&
        !url.includes('.js') &&
        !url.includes('.png') &&
        !url.includes('sticker') &&
        !url.includes('color-option')
      );
      
      // 3. ADIM: Çok küçük görselleri reddet (genellikle renk/boyut seçenekleri)
      // URL'de boyut bilgisi varsa kontrol et
      let isLargeEnough = true;
      if (url.includes('width=') && url.includes('height=')) {
        const widthMatch = url.match(/width=(\d+)/);
        const heightMatch = url.match(/height=(\d+)/);
        
        if (widthMatch && heightMatch) {
          const width = parseInt(widthMatch[1]);
          const height = parseInt(heightMatch[1]);
          
          // Çok küçük görsellerden kaçın (genellikle renk/boyut görselleri)
          isLargeEnough = width > 200 && height > 200;
        }
      }
      
      return isCorrectFormat && isNotProhibited && isLargeEnough;
    });
    
    // Ana görseller genellikle listenin başında olur
    if (filteredImages.length > 0) {
      mainImage = filteredImages[0];
      console.log("SEÇİLEN ANA GÖRSEL: " + mainImage);
    } else {
      console.log("FİLTRELEME SONRASI GÖRSEL BULUNAMADI!");
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