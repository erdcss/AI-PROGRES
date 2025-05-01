import { z } from 'zod';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

// Kategori yapılandırma şeması
export const CategoryConfig = z.object({
  shopifyCategory: z.string(),
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
  try {
    const excelPath = path.join(__dirname, '../attached_assets/Export_2025-05-01_091708.xlsx');
    
    if (!fs.existsSync(excelPath)) {
      console.warn('Excel dosyası bulunamadı, varsayılan eşleştirmeleri kullanılıyor');
      return {};
    }
    
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any>(worksheet);
    
    const mappings: Record<string, string> = {};
    
    for (const row of data) {
      const trendyolCategory = row['Trendyol Kategori Yolu'] || '';
      const shopifyCategory = row['Shopify Kategori'] || '';
      
      if (trendyolCategory && shopifyCategory) {
        const normalizedCategory = normalizeCategory(trendyolCategory);
        mappings[normalizedCategory] = shopifyCategory;
      }
    }
    
    console.log(`Excel'den ${Object.keys(mappings).length} kategori eşleştirmesi yüklendi`);
    return mappings;
  } catch (error) {
    console.error('Excel dosyası yüklenirken hata:', error);
    return {};
  }
}

// Alternatif olarak CSV dosyalarını kullanma
function loadCSVMappings(): Record<string, string> {
  try {
    const mappings: Record<string, string> = {};
    
    // Tüm CSV dosyalarını kontrol et
    const csvFiles = [
      '../attached_assets/product_template (1).csv',
      '../attached_assets/product_template (2).csv'
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
    shopifyCategory: "Women's Clothing",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "erkek": {
    shopifyCategory: "Men's Clothing",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "cocuk": {
    shopifyCategory: "Kids' Clothing",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "ayakkabi": {
    shopifyCategory: "Shoes & Accessories",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 40
    }
  },
  "canta": {
    shopifyCategory: "Bags & Purses",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  
  // Ev & Yaşam kategorileri
  "ev": {
    shopifyCategory: "Home & Living",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  "mobilya": {
    shopifyCategory: "Furniture",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 15
    }
  },
  "dekorasyon": {
    shopifyCategory: "Home Decor",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 25
    }
  },
  "mutfak": {
    shopifyCategory: "Kitchen & Dining",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 40
    }
  },
  
  // Elektronik kategorileri
  "elektronik": {
    shopifyCategory: "Electronics",
    variantConfig: {
      sizeLabel: "Variant",
      colorLabel: "Color",
      defaultStock: 20
    }
  },
  "telefon": {
    shopifyCategory: "Cell Phones & Accessories",
    variantConfig: {
      sizeLabel: "Storage",
      colorLabel: "Color",
      defaultStock: 15
    }
  },
  "bilgisayar": {
    shopifyCategory: "Computers & Tablets",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 10
    }
  },
  "evaletiblender": {
    shopifyCategory: "Home Appliances > Blenders",
    variantConfig: {
      sizeLabel: "Power",
      colorLabel: "Color",
      defaultStock: 25
    }
  },
  "evaletikettle": {
    shopifyCategory: "Home Appliances > Kettles",
    variantConfig: {
      sizeLabel: "Capacity",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  "evaletitoast": {
    shopifyCategory: "Home Appliances > Toasters",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 20
    }
  },
  
  // Kozmetik & Kişisel Bakım kategorileri
  "kozmetik": {
    shopifyCategory: "Beauty & Personal Care",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 50
    }
  },
  "makyaj": {
    shopifyCategory: "Beauty & Personal Care > Makeup",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Shade",
      defaultStock: 40
    }
  },
  "parfum": {
    shopifyCategory: "Beauty & Personal Care > Fragrances",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Type",
      defaultStock: 30
    }
  },
  
  // Spor & Outdoor kategorileri
  "spor": {
    shopifyCategory: "Sports & Outdoors",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 30
    }
  },
  "fitnessyoga": {
    shopifyCategory: "Sports & Outdoors > Fitness & Yoga",
    variantConfig: {
      sizeLabel: "Size",
      colorLabel: "Color",
      defaultStock: 25
    }
  },
  
  // Özel durumlar
  "default": {
    shopifyCategory: "Other",
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