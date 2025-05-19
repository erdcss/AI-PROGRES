import { Product } from "@shared/schema";
import fs from "fs";
import slugify from "slugify";

/**
 * ULTRA BASİT CSV OLUŞTURUCU - 19 Mayıs 2025
 * 
 * Bu modül çok basit bir CSV dosyası oluşturur:
 * - Sadece 1 satır (ana ürün) 
 * - Kesinlikle 1 ürün görseli (ana görsel)
 * - Minimum sayıda alan
 * 
 * GÜÇLÜ GÖRSEL FİLTRELEME:
 * Soruna çözüm: Seçici CSS ile sadece ana ürün görseli (#product-main-image-gallery > img:first-child)
 * Amaç: 100'den fazla gereksiz görseli tamamen elemek
 */

export function generateUltraSimpleCSV(product: Product, outputPath: string): string {
  // Handle oluştur
  const handle = slugify(product.title, {
    replacement: '-',
    lower: true,
    strict: true,
    trim: true
  }).substring(0, 60);

  // Ana ürün görseli bul - KESİNLİKLE SADECE 1 GÖRSEL
  let mainImage = "";
  
  // JSON-LD METODU: 
  // Doğrudan JSON-LD'deki <script type="application/ld+json"> içindeki contentUrl dizisinden 
  // alınan görselleri kullan. Bu görseller Trendyol'un ana ürün görselleridir.
  
  if (product.images && product.images.length > 0) {
    console.log("TOPLAM GÖRSEL SAYISI: " + product.images.length);
    
    // Gelen veriler artık doğrudan JSON-LD'den alınmış gerçek ürün görselleri
    // Hepsinin yüksek kaliteli (_org_zoom.jpg) formatında olduğundan emin ol
    const cleanedImages = product.images.filter(url => {
      if (!url || typeof url !== 'string') return false;
      
      // Sadece yüksek kaliteli ürün görselleri
      return (
        url.includes('_org_zoom.jpg') || 
        url.includes('_org.jpg') || 
        (url.includes('.jpg') && url.includes('_org_'))
      ) && (
        // Gereksiz içerikleri filtrele
        !url.includes('badge') && 
        !url.includes('icon') && 
        !url.includes('logo') &&
        !url.includes('placeholder') &&
        !url.includes('production/product-detail') &&
        !url.includes('colors/')
      );
    });
    
    console.log("JSON-LD GERÇEK ÜRÜN GÖRSELLERİ: " + cleanedImages.length);
    
    // Sadece ilk ana ürün görselini seç!
    if (cleanedImages.length > 0) {
      // İlk görseli seç - Trendyol'da ilk görsel ana görseldir
      mainImage = cleanedImages[0];
      console.log("SEÇİLEN ANA GÖRSEL: " + mainImage);
    } else if (product.images.length > 0) {
      // Temizleme sonrası hiç görsel kalmadıysa, en azından bir görsel göster
      mainImage = product.images[0];
      console.log("EN AZ 1 GÖRSEL GÖSTER: " + mainImage);
    } else {
      console.log("HİÇ GÖRSEL BULUNAMADI!");
    }
    
    console.log("CSV İÇİN KULLANILACAK TEK GÖRSEL:", mainImage);
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