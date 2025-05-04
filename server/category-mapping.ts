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
export function getCategoryConfig(categories: string[]): z.infer<typeof CategoryConfig> {
  if (!categories || categories.length === 0) {
    return categoryMapping.default;
  }
  
  // Normalizasyon ve eşleştirme için kategorileri hazırla
  const normalizedCats = categories.map(normalizeCategory);
  const joinedCats = normalizedCats.join('');
  
  // Tam eşleşme
  for (const normalizedCat of normalizedCats) {
    if (categoryMapping[normalizedCat]) {
      return categoryMapping[normalizedCat];
    }
  }
  
  // Birleştirilmiş kategori yolu eşleşmesi
  if (categoryMapping[joinedCats]) {
    return categoryMapping[joinedCats];
  }
  
  // Kısmi eşleşme
  for (const [key, config] of Object.entries(categoryMapping)) {
    // Anahtar kelime eşleşmesi
    if (normalizedCats.some(cat => cat.includes(key) || key.includes(cat))) {
      return config;
    }
  }
  
  // Varsayılan kategori ayarlarını döndür
  return categoryMapping.default;
}