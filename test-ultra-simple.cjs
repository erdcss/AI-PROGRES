// Test için ultra basit CSV oluşturucu (CommonJS formatı)
const fs = require('fs');
const path = require('path');

// Demo ürün verisi
const demoProduct = {
  id: 12345,
  url: "https://www.trendyol.com/bershka/firfirli-mini-elbise-p-123456789",
  title: "Bershka Fırfırlı mini elbise",
  description: "Bershka Fırfırlı mini elbise ürün açıklaması",
  price: "499.99",
  brand: "Bershka",
  basePrice: "450.00",
  images: [
    "https://cdn.dsmcdn.com/mnresize/1200/-/ty500/product/media/images/20230109/13/258400100/650532310/1/1_org_zoom.jpg",
    "https://cdn.dsmcdn.com/mnresize/1200/-/ty498/product/media/images/20230109/13/258400100/650532310/2/2_org_zoom.jpg",
    "https://cdn.dsmcdn.com/web/production/product-detail-placeholder.jpg",
    "https://cdn.dsmcdn.com/mnresize/128/-/ty499/product/media/colors/c/C_1.jpg",
    "https://cdn.dsmcdn.com/mnresize/128/-/ty499/product/media/colors/d/D_1.jpg",
    "https://cdn.dsmcdn.com/mnresize/128/-/ty499/product/media/colors/e/E_1.jpg",
    "https://cdn.dsmcdn.com/assets/sticker/logo.png",
    "https://cdn.dsmcdn.com/mnresize/128/-/ty499/promotion/banners/badge1.jpg",
    "https://cdn.dsmcdn.com/mnresize/500/-/ty1620/prod/QC/20250108/09/3430777b-9351-3426-b44f-004e73c4e516/1_org.jpg",
    "https://cdn.dsmcdn.com/mnresize/500/-/ty1622/prod/QC/20250108/09/21f175e0-183e-3644-af8e-6cf1ebafc589/1_org.jpg",
    "https://cdn.dsmcdn.com/mweb/production/product-detail-placeholder.jpg"
  ],
  video: null,
  variants: [],
  attributes: {
    "Renk": "Siyah",
    "Beden": "S",
    "Materyal": "Polyester"
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: ["Giyim", "Elbise", "Mini", "Bershka", "Fırfırlı", "Siyah", "Kadın", "Trendyol"],
  vendor: "turmarkt",
};

// Manuel ultra basit CSV oluşturucu
function generateUltraSimpleCSV(product, outputPath) {
  // Handle oluştur
  const handle = product.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);

  // Ana ürün görseli bul - sadece gerçek ürün görselleri
  let mainImage = "";
  if (product.images && product.images.length > 0) {
    // Sadece gerçek ürün görsellerini filtrele - çok daha sıkı filtre
    const filteredImages = product.images.filter(url => {
      // KONTROL: Görsel URL'si geçerli mi?
      if (!url || typeof url !== 'string') return false;
      
      // 1. ADIM: Placeholder görselleri tamamen reddet
      if (url.includes('placeholder.jpg')) return false;
      
      // 2. ADIM: Sadece _org.jpg içeren görselleri kabul et (gerçek ürün görselleri)
      const isCorrectFormat = (
        url.includes('_org_zoom.jpg') || 
        url.includes('_org.jpg') || 
        (url.includes('.jpg') && url.includes('_org_'))
      );
      
      // 3. ADIM: Tüm yasaklı görselleri reddet
      const isNotProhibited = (
        !url.includes('badge') && 
        !url.includes('icon') && 
        !url.includes('logo') &&
        !url.includes('.css') &&
        !url.includes('.js') &&
        !url.includes('.png') &&
        !url.includes('sticker') &&
        !url.includes('color-option') &&
        !url.includes('placeholder') &&
        !url.includes('production/product-detail')
      );
      
      // 4. ADIM: Çok küçük görselleri reddet (genellikle renk/boyut seçenekleri)
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
      
      console.log(`Görsel kontrolü: ${url}`);
      console.log(`- Doğru format: ${isCorrectFormat}`);
      console.log(`- Yasaklı değil: ${isNotProhibited}`);
      console.log(`- Yeterli boyut: ${isLargeEnough}`);
      console.log(`- Sonuç: ${isCorrectFormat && isNotProhibited && isLargeEnough ? 'KABUL' : 'RED'}`);
      console.log("--------------------");
      
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

// Geçici dosya oluştur
const testDir = "./temp";
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

const testFilePath = path.join(testDir, 'test_ultra_simple.csv');

// Ultra basit CSV oluştur
console.log("DEMO ÜRÜN GÖRSEL SAYISI:", demoProduct.images.length);

const result = generateUltraSimpleCSV(demoProduct, testFilePath);

// Sonucu göster
console.log("\nOLUŞTURULAN CSV DOSYASI:", testFilePath);
console.log("CSV İÇERİĞİ:");
console.log(fs.readFileSync(testFilePath, 'utf8'));