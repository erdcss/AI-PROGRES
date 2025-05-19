// Test için ultra basit CSV oluşturucu
const fs = require('fs');
const { join } = require('path');
const { generateUltraSimpleCSV } = require('./server/ultra-simple-csv');

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

// Geçici dosya oluştur
const testDir = "./temp";
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

const testFilePath = join(testDir, 'test_ultra_simple.csv');

// Ultra basit CSV oluştur
console.log("DEMO ÜRÜN GÖRSEL SAYISI:", demoProduct.images.length);
console.log("GÖRSEL LİSTESİ:", demoProduct.images);

const result = generateUltraSimpleCSV(demoProduct, testFilePath);

// Sonucu göster
console.log("OLUŞTURULAN CSV DOSYASI:", testFilePath);
console.log("CSV İÇERİĞİ:");
console.log(fs.readFileSync(testFilePath, 'utf8'));