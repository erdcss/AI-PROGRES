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

class SimpleStorage implements IStorage {
  async addProduct(productData: any): Promise<any> {
    return {
      id: Date.now(),
      url: productData.trendyolUrl || productData.url || "",
      title: productData.title || "",
      brand: productData.brand || "",
      description: productData.description || "",
      category: productData.category || "Genel",
      images: productData.images || [],
      features: productData.features || {},
      colorOptions: productData.colorOptions || [],
      sizeOptions: productData.sizeOptions || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getProduct(_identifier: string): Promise<any> {
    return null;
  }

  async getAllProducts(): Promise<any[]> {
    return [];
  }

  async updateProduct(_identifier: string, _updates: any): Promise<any> {
    return null;
  }

  async deleteProduct(_identifier: string): Promise<boolean> {
    return false;
  }

  async getUrlHistory(): Promise<string[]> {
    return [];
  }

  getHistory(): string[] {
    return [];
  }

  addToHistory(url: string): void {
    console.log("URL added to history:", url);
  }

  async getProductCount(): Promise<number> {
    return 0;
  }

  async searchProducts(_query: string): Promise<any[]> {
    return [];
  }

  async getProductsByCategory(_category: string): Promise<any[]> {
    return [];
  }

  async getProductsByBrand(_brand: string): Promise<any[]> {
    return [];
  }

  async getProductsByPriceRange(_minPrice: number, _maxPrice: number): Promise<any[]> {
    return [];
  }

  async getRecentProducts(_limit: number = 10): Promise<any[]> {
    return [];
  }

  async clearMemory(): Promise<void> {
    console.log("Memory temizlendi");
  }

  async getMemoryStats(): Promise<any> {
    return {
      totalProducts: 0,
      memoryUsage: "Simple: 0 products",
      oldestProduct: null,
      newestProduct: null,
    };
  }
}

export const storage = new SimpleStorage();
