import { products, type Product, type InsertProduct } from "@shared/schema";

export interface IStorage {
  saveProduct(product: InsertProduct): Promise<Product>;
  getProduct(url: string): Promise<Product | undefined>;
  updateProductAttributes(id: number, attributes: Record<string, string>): Promise<void>;
  reset(): void;
  addToHistory(url: string): void;
  getHistory(): string[];
}

export class MemStorage implements IStorage {
  private products: Map<string, Product>;
  private currentId: number;
  private urlHistory: string[];

  constructor() {
    this.products = new Map();
    this.currentId = 1;
    this.urlHistory = [];
  }

  async saveProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.currentId++;
    
    // Video alanı için undefined değerini null olarak ayarla (type hatası gidermek için)
    const videoValue = insertProduct.video === undefined ? null : insertProduct.video;
    
    // Null olmaması gereken alanlar için varsayılan değerler belirle
    const basePrice = insertProduct.basePrice || "0";
    const category = insertProduct.category || "Other";
    const subcategory = insertProduct.subcategory || "";
    const productType = insertProduct.productType || "";
    const tags = Array.isArray(insertProduct.tags) ? insertProduct.tags : ["turmarkt"];
    
    const product: Product = { 
      ...insertProduct, 
      id, 
      video: videoValue,
      basePrice,
      category,
      subcategory,
      productType,
      tags
    };
    
    // URL'yi normalize et - parametrelerin bir kısmını kaldır
    const normalizedUrl = this.normalizeUrl(product.url);
    
    // Hem orijinal URL'yi hem de normalize edilmiş URL'yi ekle
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