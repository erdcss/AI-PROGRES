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
    // Mevcut ürün kontrolü (ID bazında)
    const existingIndex = this.accumulator.products.findIndex(p => p.id === product.id);
    
    if (existingIndex !== -1) {
      // Güncelle
      this.accumulator.products[existingIndex] = product;
      console.log(`🔄 Ürün güncellendi: ${product.title}`);
    } else {
      // Ekle
      this.accumulator.products.push(product);
      console.log(`➕ Yeni ürün eklendi: ${product.title}`);
    }
    
    this.accumulator.lastUpdate = new Date();
    this.saveAccumulator();
    this.regenerateCSV();
  }

  private async regenerateCSV(): Promise<void> {
    try {
      console.log(`🔄 Toplam ${this.accumulator.products.length} ürün için CSV yeniden oluşturuluyor...`);
      
      // Debug: Show product titles being processed
      this.accumulator.products.forEach((p, i) => {
        console.log(`📦 ${i + 1}. ${p.title} (ID: ${p.id})`);
      });
      
      const { generateStrictShopifyCSV } = await import('./strict-csv-generator');
      const csvPath = await generateStrictShopifyCSV(this.accumulator.products);
      console.log(`✅ UTF-8 BOM ile Shopify CSV oluşturuldu: ${csvPath}`);
      
      // Verify CSV was created with all products
      const fs = await import('fs');
      if (fs.existsSync(csvPath)) {
        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        console.log(`📊 CSV doğrulandı: ${lines.length} satır`);
      }
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