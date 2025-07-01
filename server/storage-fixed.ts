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

// Simple storage implementation
class SimpleStorage implements IStorage {
  async addProduct(productData: any): Promise<any> {
    try {
      console.log('Storage: Ürün kaydediliyor...');
      return {
        id: Date.now(),
        url: productData.trendyolUrl || productData.url || '',
        title: productData.title || '',
        brand: productData.brand || '',
        description: productData.description || '',
        category: productData.category || 'Genel',
        images: productData.images || [],
        features: productData.features || {},
        colorOptions: productData.colorOptions || [],
        sizeOptions: productData.sizeOptions || [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error) {
      console.error('Product kaydetme hatası:', error);
      throw error;
    }
  }

  async getProduct(identifier: string): Promise<any> {
    console.log('Storage: Ürün getiriliyor:', identifier);
    return null;
  }

  async getAllProducts(): Promise<any[]> {
    return [];
  }

  async updateProduct(identifier: string, updates: any): Promise<any> {
    return null;
  }

  async deleteProduct(identifier: string): Promise<boolean> {
    return false;
  }

  async getUrlHistory(): Promise<string[]> {
    return [];
  }

  // Legacy compatibility methods
  getHistory(): string[] {
    return [];
  }

  addToHistory(url: string): void {
    console.log('URL added to history:', url);
  }

  async getProductCount(): Promise<number> {
    return 0;
  }

  async searchProducts(query: string): Promise<any[]> {
    return [];
  }

  async getProductsByCategory(category: string): Promise<any[]> {
    return [];
  }

  async getProductsByBrand(brand: string): Promise<any[]> {
    return [];
  }

  async getProductsByPriceRange(minPrice: number, maxPrice: number): Promise<any[]> {
    return [];
  }

  async getRecentProducts(limit: number = 10): Promise<any[]> {
    return [];
  }

  async clearMemory(): Promise<void> {
    console.log('Memory temizlendi');
  }

  async getMemoryStats(): Promise<any> {
    return {
      totalProducts: 0,
      memoryUsage: 'Simple: 0 products',
      oldestProduct: null,
      newestProduct: null
    };
  }
}

export const storage = new SimpleStorage();