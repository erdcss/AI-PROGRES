import fs from 'fs';
import path from 'path';

interface Product {
  title: string;
  price: string;
  id: number;
  description: string;
  brand: string | null;
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
    totalVariants: number;
  };
  url: string;
  basePrice: string;
}

interface CSVAccumulator {
  products: Product[];
  lastUpdate: Date;
}

class CSVAccumulatorService {
  private csvPath = '/home/runner/workspace/shopify-urunler.csv';
  private dataPath = '/home/runner/workspace/csv-data.json';
  private accumulator: CSVAccumulator;

  constructor() {
    this.loadAccumulator();
  }

  private loadAccumulator(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf8');
        this.accumulator = JSON.parse(data);
        console.log(`📊 Mevcut CSV veri yüklendi: ${this.accumulator.products.length} ürün`);
      } else {
        this.accumulator = { products: [], lastUpdate: new Date() };
        console.log('📊 Yeni CSV accumulator başlatıldı');
      }
    } catch (error) {
      console.error('❌ CSV veri yükleme hatası:', error);
      this.accumulator = { products: [], lastUpdate: new Date() };
    }
  }

  private saveAccumulator(): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.accumulator, null, 2));
      console.log(`💾 CSV veri kaydedildi: ${this.accumulator.products.length} ürün`);
    } catch (error) {
      console.error('❌ CSV veri kaydetme hatası:', error);
    }
  }

  addProduct(product: Product): void {
    console.log(`🔍 Ürün ekleme işlemi: ${product.title} (ID: ${product.id})`);
    
    // Mevcut ürün kontrolü (ID bazında)
    const existingIndex = this.accumulator.products.findIndex(p => p.id === product.id);
    
    if (existingIndex !== -1) {
      // Güncelle
      this.accumulator.products[existingIndex] = product;
      console.log(`🔄 Ürün güncellendi: ${product.title}`);
    } else {
      // Ekle
      this.accumulator.products.push(product);
      console.log(`➕ Yeni ürün eklendi: ${product.title} - Toplam: ${this.accumulator.products.length}`);
    }
    
    this.accumulator.lastUpdate = new Date();
    this.saveAccumulator();
    
    // Force verification of data before CSV regeneration
    console.log(`💾 Current products in accumulator: ${this.accumulator.products.length}`);
    this.accumulator.products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title} (${p.id})`);
    });
    
    this.regenerateCSV();
  }

  private async regenerateCSV(): Promise<void> {
    try {
      console.log(`🔄 Toplam ${this.accumulator.products.length} ürün için CSV yeniden oluşturuluyor...`);
      
      // Debug: Show product titles being processed
      this.accumulator.products.forEach((p, i) => {
        console.log(`📦 ${i + 1}. ${p.title} (ID: ${p.id})`);
      });
      
      // Direct CSV generation to bypass compilation issues
      const csvPath = path.join(process.cwd(), 'shopify-urunler.csv');
      
      const headers = [
        'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
        'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
        'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
        'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
        'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position',
        'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description',
        'Google Shopping / Google Product Category', 'Google Shopping / Gender', 'Google Shopping / Age Group',
        'Google Shopping / MPN', 'Google Shopping / AdWords Grouping', 'Google Shopping / AdWords Labels',
        'Google Shopping / Condition', 'Google Shopping / Custom Product',
        'Google Shopping / Custom Label 0', 'Google Shopping / Custom Label 1', 'Google Shopping / Custom Label 2',
        'Google Shopping / Custom Label 3', 'Google Shopping / Custom Label 4', 'Variant Image',
        'Variant Weight Unit', 'Variant Tax Code', 'Cost per item',
        'Included / France', 'Price / France', 'Compare At Price / France',
        'Included / Germany', 'Price / Germany', 'Compare At Price / Germany',
        'Included / UK', 'Price / UK', 'Compare At Price / UK',
        'Included / US', 'Price / US', 'Compare At Price / US'
      ];
      
      const csvRows = [headers.map(h => `"${h}"`).join(',')];
      
      this.accumulator.products.forEach(product => {
        const handle = `${product.brand?.toLowerCase() || 'product'}-${product.id}`.replace(/[^a-z0-9-]/g, '');
        const colors = product.variants?.colors || ['tek renk'];
        const sizes = product.variants?.sizes || ['tek beden'];
        
        // Fix Turkish price formatting - remove dots used as thousands separators
        const cleanPrice = product.price.toString()
          .replace(/\./g, '') // Remove dots used as thousands separators
          .replace(/,/g, '.'); // Convert comma decimal separator to dot
        
        const basePrice = parseFloat(cleanPrice) || 0;
        const markedPrice = (basePrice * 1.1).toFixed(2);
        
        console.log(`💰 Price fix for ${product.title}: "${product.price}" → "${cleanPrice}" → ${basePrice}`);
        
        colors.forEach(color => {
          sizes.forEach((size, sizeIndex) => {
            const isFirst = color === colors[0] && sizeIndex === 0;
            const escapeCSV = (val) => `"${String(val).replace(/"/g, '""')}"`;
            
            const row = [
              escapeCSV(isFirst ? handle : ''),
              escapeCSV(isFirst ? product.title : ''),
              escapeCSV(isFirst ? product.description || 'Kaliteli ürün açıklaması.' : ''),
              escapeCSV(isFirst ? product.brand || 'Marka' : ''),
              escapeCSV(isFirst ? 'Giyim' : ''),
              escapeCSV(isFirst ? 'giyim,moda,trend' : ''),
              escapeCSV('TRUE'),
              escapeCSV('Renk'), escapeCSV(color), 
              escapeCSV('Beden'), escapeCSV(size), 
              escapeCSV(''), escapeCSV(''),
              escapeCSV(`${handle}-${color.replace(/\s+/g, '')}-${size}`.toLowerCase()),
              escapeCSV('300'), escapeCSV('shopify'), escapeCSV('50'), 
              escapeCSV('deny'), escapeCSV('manual'),
              escapeCSV(markedPrice), escapeCSV(cleanPrice),
              escapeCSV('TRUE'), escapeCSV('TRUE'), escapeCSV(''),
              escapeCSV(isFirst ? (product.images?.[0] || '') : ''),
              escapeCSV(isFirst ? '1' : ''),
              escapeCSV(isFirst ? `${product.title} - ${color}` : ''),
              escapeCSV('FALSE'),
              escapeCSV(isFirst ? product.title : ''),
              escapeCSV(isFirst ? `${product.title} - Yüksek kaliteli ürün` : ''),
              escapeCSV(isFirst ? 'Apparel & Accessories > Clothing' : ''),
              escapeCSV(isFirst ? 'unisex' : ''),
              escapeCSV(isFirst ? 'adult' : ''),
              escapeCSV(''), escapeCSV(''), escapeCSV(''), 
              escapeCSV(isFirst ? 'new' : ''), escapeCSV('FALSE'),
              escapeCSV(''), escapeCSV(''), escapeCSV(''), escapeCSV(''), escapeCSV(''),
              escapeCSV(product.images?.[sizeIndex] || product.images?.[0] || ''),
              escapeCSV('kg'), escapeCSV(''), escapeCSV((basePrice * 0.7).toFixed(2)),
              escapeCSV(''), escapeCSV(''), escapeCSV(''),
              escapeCSV(''), escapeCSV(''), escapeCSV(''),
              escapeCSV(''), escapeCSV(''), escapeCSV(''),
              escapeCSV(''), escapeCSV(''), escapeCSV('')
            ];
            
            csvRows.push(row.join(','));
          });
        });
      });
      
      const csvContent = csvRows.join('\n');
      const utf8BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
      const contentBuffer = Buffer.from(csvContent, 'utf8');
      const finalBuffer = Buffer.concat([utf8BOM, contentBuffer]);
      
      fs.writeFileSync(csvPath, finalBuffer);
      console.log(`✅ UTF-8 BOM ile Shopify CSV oluşturuldu: ${csvRows.length - 1} varyant`);
    } catch (error) {
      console.error('❌ CSV yeniden oluşturma hatası:', error);
      console.error('❌ Error details:', error.stack);
    }
  }

  getStats(): { totalProducts: number; lastUpdate: Date; csvExists: boolean } {
    return {
      totalProducts: this.accumulator.products.length,
      lastUpdate: this.accumulator.lastUpdate,
      csvExists: fs.existsSync(this.csvPath)
    };
  }

  clearAll(): void {
    this.accumulator = { products: [], lastUpdate: new Date() };
    
    // Dosyaları temizle
    if (fs.existsSync(this.csvPath)) {
      fs.unlinkSync(this.csvPath);
    }
    if (fs.existsSync(this.dataPath)) {
      fs.unlinkSync(this.dataPath);
    }
    
    console.log('🧹 Tüm CSV verileri temizlendi');
  }

  getProducts(): Product[] {
    return this.accumulator.products;
  }
}

export const csvAccumulator = new CSVAccumulatorService();