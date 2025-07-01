import { eq, and, or, ilike, desc, asc, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { memorySystem } from "./memory-system";
import { products, productVariants } from "@shared/schema";

// Legacy storage interface for backward compatibility
interface IStorage {
  addProduct(productData: any): Promise<any>;
  getProduct(identifier: string): Promise<any>;
  getAllProducts(): Promise<any[]>;
  updateProduct(identifier: string, updates: any): Promise<any>;
  deleteProduct(identifier: string): Promise<boolean>;
  getUrlHistory(): Promise<string[]>;
  getProductCount(): Promise<number>;
  searchProducts(query: string): Promise<any[]>;
  getProductsByCategory(category: string): Promise<any[]>;
  getProductsByBrand(brand: string): Promise<any[]>;
  getProductsByPriceRange(minPrice: number, maxPrice: number): Promise<any[]>;
  getRecentProducts(limit: number): Promise<any[]>;
  clearMemory(): Promise<void>;
  getMemoryStats(): Promise<any>;
}

// Enhanced Database Storage with Memory System Integration
class DatabaseStorage implements IStorage {
    this.products.set(product.url, product);
    this.products.set(normalizedUrl, product);
    
    this.addToHistory(product.url);
    return product;
  }

  // URL'yi normalize et - query parametrelerini temizle
  private normalizeUrl(url: string): string {
    try {
      // Temel URL'yi al (p-XXXX kısmına kadar)
      const baseUrlMatch = url.match(/^(https?:\/\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+-p-\d+)/);
      if (baseUrlMatch) {
        return baseUrlMatch[1];
      }
      
      // Eğer match bulunamazsa, merchantId ve boutiqueId'ye kadar al
      const parsedUrl = new URL(url);
      const cleanedUrl = parsedUrl.origin + parsedUrl.pathname;
      return cleanedUrl;
    } catch (error) {
      console.error("URL normalize hatası:", error);
      return url;
    }
  }

  async getProduct(url: string): Promise<Product | undefined> {
    // İlk önce orijinal URL'yi dene
    let product = this.products.get(url);
    
    // Bulunamazsa normalize edilmiş URL'yi dene
    if (!product) {
      const normalizedUrl = this.normalizeUrl(url);
      product = this.products.get(normalizedUrl);
      
      // Debug
      console.log(`[DEBUG] Orijinal URL ile ürün bulunamadı. Normalize URL: ${normalizedUrl}`);
    }
    
    return product;
  }

  reset(): void {
    this.products.clear();
    this.currentId = 1;
  }

  addToHistory(url: string): void {
    // URL zaten varsa, onu listeden çıkar
    this.urlHistory = this.urlHistory.filter(u => u !== url);
    // URL'yi listenin başına ekle
    this.urlHistory.unshift(url);
    // Sadece son 3 URL'yi tut
    if (this.urlHistory.length > 3) {
      this.urlHistory = this.urlHistory.slice(0, 3);
    }
  }

  getHistory(): string[] {
    return this.urlHistory;
  }
  
  async updateProductAttributes(id: number, attributes: Record<string, string>): Promise<void> {
    // Tüm kayıtlı ürünleri kontrol et
    for (const [url, product] of this.products.entries()) {
      if (product.id === id) {
        // Ürün bulunduğunda özelliklerini güncelle
        product.attributes = attributes;
        // Güncellenen ürünü depoya geri yaz
        this.products.set(url, product);
      }
    }
  }
}

export const storage = new MemStorage();