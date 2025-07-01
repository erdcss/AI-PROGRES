import { z } from 'zod';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM için __dirname işlevi
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Kategori yapılandırma şeması
export const CategoryConfig = z.object({
  shopifyCategory: z.string().default('Apparel & Accessories > Clothing'),
  variantConfig: z.object({
    sizeLabel: z.string().default("Beden"),
    colorLabel: z.string().default("Renk"),
    defaultStock: z.number().default(50)
  }).default({
    sizeLabel: "Beden",
    colorLabel: "Renk",
    defaultStock: 50
  })
});

// Kategori eşleştirmeleri için tip tanımı
type CategoryMapping = Record<string, z.infer<typeof CategoryConfig>>;

// Kategorilerin doğru şekilde eşleştirilmesi için yardımcı fonksiyon
function normalizeCategory(category: string): string {
  return category.toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/\s+/g, '')
    .trim();
}

// Excel dosyasından kategori eşleştirmelerini yükle
function loadExcelMappings(): Record<string, string> {
  // Excel kullanımında sorun var, doğrudan CSV'ye yönlendir
  console.log('Excel dosyası desteği atlandı, CSV kullanılıyor');
  return {};
}

// Alternatif olarak CSV dosyalarını kullanma
function loadCSVMappings(): Record<string, string> {
  try {
    const mappings: Record<string, string> = {};
    
    // Tüm CSV dosyalarını kontrol et
    const csvFiles = [
      '../product_template (1).csv',
      '../product_template (2).csv'
    ];
    
    for (const csvFile of csvFiles) {
      const csvPath = path.join(__dirname, csvFile);
      
      if (fs.existsSync(csvPath)) {
        const content = fs.readFileSync(csvPath, 'utf8');
        const rows = content.split('\n').slice(1); // Header'ı atla
        
        for (const row of rows) {
          const columns = row.split(',');
          
          if (columns.length >= 5) {
            const productCategory = columns[4].trim(); // Product category sütunu
            const type = columns[5].trim(); // Type sütunu
            
            if (productCategory) {
              // Ürün tipini kategori olarak kullan ve eşleştirme yap
              const normalizedCategory = normalizeCategory(type);
              mappings[normalizedCategory] = productCategory;
            }
          }
        }
      }
    }
    
    console.log(`CSV'den ${Object.keys(mappings).length} kategori eşleştirmesi yüklendi`);
    return mappings;
  } catch (error) {
    console.error('CSV dosyaları yüklenirken hata:', error);
    return {};
  }
}

// Varsayılan kategori eşleştirmeleri
export const categoryMapping: CategoryMapping = {
  // Giyim kategorileri
  "kadin": {
    shopifyCategory: "Apparel & Accessories > Clothing > Women's Clothing",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "erkek": {
    shopifyCategory: "Apparel & Accessories > Clothing > Men's Clothing",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "cocuk": {
    shopifyCategory: "Apparel & Accessories > Clothing > Baby & Toddler Clothing",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "ayakkabi": {
    shopifyCategory: "Apparel & Accessories > Shoes",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 40
    }
  },
  "canta": {
    shopifyCategory: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  
  // Ev & Yaşam kategorileri
  "ev": {
    shopifyCategory: "Home & Garden",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  "mobilya": {
    shopifyCategory: "Furniture > Home Furniture",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 15
    }
  },
  "dekorasyon": {
    shopifyCategory: "Home & Garden > Home Decor",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 25
    }
  },
  "mutfak": {
    shopifyCategory: "Home & Garden > Kitchen & Dining",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 40
    }
  },
  
  // Elektronik kategorileri
  "elektronik": {
    shopifyCategory: "Electronics > Electronics Accessories",
    variantConfig: {
      sizeLabel: "Variant",
      colorLabel: "Color",
      defaultStock: 20
    }
  },
  "telefon": {
    shopifyCategory: "Electronics > Communications > Mobile Phones",
    variantConfig: {
      sizeLabel: "Storage",
      colorLabel: "Color",
      defaultStock: 15
    }
  },
  "bilgisayar": {
    shopifyCategory: "Electronics > Computers > Laptops",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 10
    }
  },
  "evaletiblender": {
    shopifyCategory: "Home & Garden > Kitchen & Dining > Small Kitchen Appliances > Blenders",
    variantConfig: {
      sizeLabel: "Power",
      colorLabel: "Color",
      defaultStock: 25
    }
  },
  "evaletikettle": {
    shopifyCategory: "Home & Garden > Kitchen & Dining > Small Kitchen Appliances > Electric Kettles",
    variantConfig: {
      sizeLabel: "Capacity",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  "evaletitoast": {
    shopifyCategory: "Home & Garden > Kitchen & Dining > Small Kitchen Appliances > Toasters",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 20
    }
  },
  
  // Kozmetik & Kişisel Bakım kategorileri
  "kozmetik": {
    shopifyCategory: "Health & Beauty > Personal Care",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "makyaj": {
    shopifyCategory: "Health & Beauty > Personal Care > Cosmetics",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Shade",
      defaultStock: 40
    }
  },
  "parfum": {
    shopifyCategory: "Health & Beauty > Personal Care > Fragrances",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Type",
      defaultStock: 30
    }
  },
  "sacboyasi": {
    shopifyCategory: "Health & Beauty > Personal Care > Hair Care > Hair Coloring",
    variantConfig: {
      sizeLabel: "Volume",
      colorLabel: "Shade",
      defaultStock: 45
    }
  },
  "sacbakim": {
    shopifyCategory: "Health & Beauty > Personal Care > Hair Care",
    variantConfig: {
      sizeLabel: "Volume",
      colorLabel: "Type",
      defaultStock: 40
    }
  },
  "igora": {
    shopifyCategory: "Health & Beauty > Personal Care > Hair Care > Hair Coloring",
    variantConfig: {
      sizeLabel: "Volume",
      colorLabel: "Shade",
      defaultStock: 35
    }
  },
  
  // Spor & Outdoor kategorileri
  "spor": {
    shopifyCategory: "Sporting Goods",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  "fitnessyoga": {
    shopifyCategory: "Sporting Goods > Exercise & Fitness",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 25
    }
  },
  
  // Tişört için özel kategori
  "tisort": {
    shopifyCategory: "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  
  // Giyim > T-shirt
  "giyimtshirt": {
    shopifyCategory: "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  
  // Mavi T-shirt - özel kategori
  "mavitisort": {
    shopifyCategory: "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts", 
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  
  // Özel durumlar
  "default": {
    shopifyCategory: "Apparel & Accessories > Clothing",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 20
    }
  }
};

// Excel veya CSV'den yüklenen eşleştirmeleri ekle
let dynamicMappings: Record<string, string> = {};

try {
  // Önce Excel'den yüklemeyi dene
  dynamicMappings = loadExcelMappings();
  
  // Excel'den yükleme başarısız olduysa CSV'den dene
  if (Object.keys(dynamicMappings).length === 0) {
    dynamicMappings = loadCSVMappings();
  }
  
  // Dinamik yüklenen eşleştirmeleri kategori mapping'e ekle
  for (const [key, value] of Object.entries(dynamicMappings)) {
    if (!categoryMapping[key]) {
      categoryMapping[key] = {
        shopifyCategory: value,
        variantConfig: {
          sizeLabel: "Size",
          colorLabel: "Color",
          defaultStock: 30
        }
      };
    }
  }
} catch (error) {
  console.error('Kategori eşleştirmeleri yüklenirken hata:', error);
}

// Ürün kategorisine göre uygun ayarları döndürür
export function getCategoryConfig(categories: string[]): {
  shopifyCategory: string;
  mainCategory: string;
  subCategory: string;
  productType: string;
  tags: string[];
  variantConfig: {
    sizeLabel: string;
    colorLabel: string;
    defaultStock: number;
  }
} {
  if (!categories || categories.length === 0) {
    return {
      ...categoryMapping.default,
      mainCategory: "Apparel",
      subCategory: "Clothing",
      productType: "General",
      tags: ["Apparel", "Clothing", "turmarkt"]
    };
  }
  
  // Normalizasyon ve eşleştirme için kategorileri hazırla
  const normalizedCats = categories.map(normalizeCategory);
  const joinedCats = normalizedCats.join('');
  
  // Shopify kategori bilgisini elde et
  let categoryInfo;
  
  // Tam eşleşme
  for (const normalizedCat of normalizedCats) {
    if (categoryMapping[normalizedCat]) {
      categoryInfo = categoryMapping[normalizedCat];
      break;
    }
  }
  
  // Birleştirilmiş kategori yolu eşleşmesi
  if (!categoryInfo && categoryMapping[joinedCats]) {
    categoryInfo = categoryMapping[joinedCats];
  }
  
  // Kısmi eşleşme
  if (!categoryInfo) {
    for (const [key, config] of Object.entries(categoryMapping)) {
      // Anahtar kelime eşleşmesi
      if (normalizedCats.some(cat => cat.includes(key) || key.includes(cat))) {
        categoryInfo = config;
        break;
      }
    }
  }
  
  // Hiçbir eşleşme bulunamadıysa varsayılanı kullan
  if (!categoryInfo) {
    categoryInfo = categoryMapping.default;
  }
  
  // Etiketleri ve kategorileri oluştur
  const shopifyCategoryParts = categoryInfo.shopifyCategory.split(' > ');
  const mainCategory = shopifyCategoryParts[0] || "Other";
  const subCategory = shopifyCategoryParts[1] || "";
  const productType = shopifyCategoryParts[2] || "";
  const productSubType = shopifyCategoryParts[3] || "";
  
  // Trendyol ve diğer gereksiz kelimeleri etiketlerden temizle
  const cleanedCategories = categories.map(cat => 
    cat.replace(/trendyol|trend|yol|igora/gi, '').trim()
      .replace(/\s+/g, ' ') // Fazla boşlukları temizle
  ).filter(cat => cat.length > 0 && cat.length <= 20);
  
  // Etiketleri hazırla - Her zaman satıcı etiketi ekle
  const tags = ["turmarkt"];
  
  // Shopify kategori hiyerarşisine göre etiketleri sırasıyla oluştur
  // Ana kategoriyi ekle
  if (mainCategory && !tags.includes(mainCategory)) {
    tags.push(mainCategory);
  }
  
  // Alt kategoriyi ekle
  if (subCategory && !tags.includes(subCategory)) {
    tags.push(subCategory);
  }
  
  // Ürün tipini ekle
  if (productType && !tags.includes(productType)) {
    tags.push(productType);
  }
  
  // Ürün alt tipini ekle
  if (productSubType && !tags.includes(productSubType)) {
    tags.push(productSubType);
  }
  
  // Ürün adından akıllı etiketler çıkarma
  const extractTagsFromName = (name: string): string[] => {
    const extractedTags: string[] = [];
    
    // İlk kelimeler markayı temsil eder
    const nameParts = name.split(' ');
    if (nameParts.length > 2) {
      // Marka adını normalleştir ve ekle (ilk kelime)
      const brandName = nameParts[0].trim();
      if (brandName && brandName.length <= 20 && !tags.includes(brandName)) {
        extractedTags.push(brandName);
      }
      
      // Ürün tipini belirle (son 2-3 kelime genellikle ürün tipidir)
      const productTypeFromName = nameParts.slice(-3).join(' ').trim();
      if (productTypeFromName && productTypeFromName.length <= 20 && 
          !tags.includes(productTypeFromName) && 
          !extractedTags.includes(productTypeFromName)) {
        extractedTags.push(productTypeFromName);
      }
      
      // Anahtar özellikler için kontrol et
      const keyFeatures = [
        { keyword: "özel", tag: "Özel Seri" },
        { keyword: "royal", tag: "Royal" },
        { keyword: "azaltıcı", tag: "Azaltıcı" },
        { keyword: "boyası", tag: "Boya" },
        { keyword: "saç", tag: "Saç Ürünleri" },
        { keyword: "krem", tag: "Krem" },
        { keyword: "şampuan", tag: "Şampuan" },
        { keyword: "makyaj", tag: "Makyaj" },
        { keyword: "bakım", tag: "Bakım" },
        { keyword: "turuncu", tag: "Turuncu Ton" },
        { keyword: "yağ", tag: "Yağ" }
      ];
      
      // Anahtar özellikleri kontrol et ve etiket olarak ekle
      const nameLower = name.toLowerCase();
      keyFeatures.forEach(feature => {
        if (nameLower.includes(feature.keyword) && 
            !tags.includes(feature.tag) && 
            !extractedTags.includes(feature.tag)) {
          extractedTags.push(feature.tag);
        }
      });
    }
    
    return extractedTags;
  };
  
  // Ürün adından akıllı etiketler çıkar
  const titleTags = extractTagsFromName(categories[0] || "");
  titleTags.forEach(tag => {
    if (tags.length < 8 && !tags.includes(tag)) {
      tags.push(tag);
    }
  });
  
  // Kullanıcı kategorilerinden eklemeler yap
  for (const cat of cleanedCategories) {
    if (tags.length < 8 && cat.length <= 20 && !tags.includes(cat)) {
      tags.push(cat);
    }
  }
  
  return {
    ...categoryInfo,
    mainCategory,
    subCategory,
    productType,
    tags: tags.slice(0, 8) // Maksimum 8 etiket - daha kapsamlı etiketleme
  };
}