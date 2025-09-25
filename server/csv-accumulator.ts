/**
 * CSV Accumulator - Birden fazla ürünü tek CSV'de toplar
 */

import { StrictProductData, generateStrictCSV } from './strict-csv-generator';

interface AccumulatedData {
  products: StrictProductData[];
  totalVariants: number;
  totalProducts: number;
  errors: string[];
}

export class CSVAccumulator {
  private data: AccumulatedData = {
    products: [],
    totalVariants: 0,
    totalProducts: 0,
    errors: []
  };
  
  /**
   * Ürün ekle
   */
  addProduct(productData: StrictProductData): {
    success: boolean;
    message: string;
    productCount: number;
    variantCount: number;
  } {
    try {
      // Doğrulama
      if (!productData.title || !productData.brand) {
        const error = 'Eksik ürün bilgisi: başlık veya marka';
        this.data.errors.push(error);
        return {
          success: false,
          message: error,
          productCount: this.data.totalProducts,
          variantCount: this.data.totalVariants
        };
      }
      
      const validVariants = productData.variants.filter(v => 
        v.stock > 0 && v.price > 0 && v.color && v.size
      );
      
      if (validVariants.length === 0) {
        const error = `${productData.title}: Stokta varyant yok`;
        this.data.errors.push(error);
        return {
          success: false,
          message: error,
          productCount: this.data.totalProducts,
          variantCount: this.data.totalVariants
        };
      }
      
      // Veriyi normalize et
      const normalizedProduct: StrictProductData = {
        ...productData,
        variants: validVariants
      };
      
      this.data.products.push(normalizedProduct);
      this.data.totalProducts++;
      this.data.totalVariants += validVariants.length;
      
      return {
        success: true,
        message: `${productData.title} eklendi (${validVariants.length} varyant)`,
        productCount: this.data.totalProducts,
        variantCount: this.data.totalVariants
      };
      
    } catch (error) {
      const errorMsg = `Ürün ekleme hatası: ${error.message}`;
      this.data.errors.push(errorMsg);
      return {
        success: false,
        message: errorMsg,
        productCount: this.data.totalProducts,
        variantCount: this.data.totalVariants
      };
    }
  }
  
  /**
   * Toplu CSV oluştur
   */
  generateBulkCSV(): {
    success: boolean;
    filename: string;
    content: string;
    summary: {
      totalProducts: number;
      totalVariants: number;
      errors: string[];
    };
  } {
    if (this.data.products.length === 0) {
      return {
        success: false,
        filename: '',
        content: '',
        summary: {
          totalProducts: 0,
          totalVariants: 0,
          errors: ['Hiç ürün eklenmedi']
        }
      };
    }
    
    try {
      // Tüm varyantları birleştir
      const allRows: any[] = [];
      let globalHandle = 'bulk-products';
      
      this.data.products.forEach((product, productIndex) => {
        const productHandle = product.title
          .toLowerCase()
          .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 30);
        
        product.variants.forEach((variant, variantIndex) => {
          const isFirstVariantOfProduct = variantIndex === 0;
          const finalPrice = Math.round(variant.price * 1.15);
          const comparePrice = Math.round(variant.price * 1.25);
          const costPrice = Math.round(variant.price * 0.8);
          
          allRows.push({
            Handle: `${productHandle}-${productIndex}`,
            Title: isFirstVariantOfProduct ? product.title : '',
            'Body (HTML)': isFirstVariantOfProduct ? `<p>${product.title} - ${product.brand} kalitesi.</p>` : '',
            Vendor: isFirstVariantOfProduct ? product.brand : '',
            'Product Type': isFirstVariantOfProduct ? 'Giyim' : '',
            Tags: isFirstVariantOfProduct ? `${product.brand}, Kaliteli` : '',
            Published: isFirstVariantOfProduct ? 'TRUE' : '',
            'Option1 Name': 'Renk',
            'Option1 Value': variant.color,
            'Option2 Name': 'Beden',
            'Option2 Value': variant.size,
            'Variant SKU': `${productHandle}-${variant.color.toLowerCase()}-${variant.size.toLowerCase()}`,
            'Variant Inventory Qty': variant.stock.toString(),
            'Variant Price': finalPrice.toString(),
            'Variant Compare At Price': comparePrice.toString(),
            'Image Src': variant.images[0] || '',
            'Cost per item': costPrice.toString(),
            'Google Shopping / Custom Label 0': `Orijinal: ₺${variant.price}`,
            'Google Shopping / Custom Label 1': `Kar: %15`,
            'Google Shopping / Custom Label 2': `Stok: ${variant.stock}`
          });
        });
      });
      
      // CSV oluştur
      const headers = Object.keys(allRows[0]);
      const csvContent = [
        headers.join(','),
        ...allRows.map(row => 
          headers.map(header => {
            const value = row[header] || '';
            return `"${value.toString().replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `bulk-shopify-${this.data.totalProducts}products-${timestamp}.csv`;
      
      return {
        success: true,
        filename,
        content: csvContent,
        summary: {
          totalProducts: this.data.totalProducts,
          totalVariants: this.data.totalVariants,
          errors: this.data.errors
        }
      };
      
    } catch (error) {
      return {
        success: false,
        filename: '',
        content: '',
        summary: {
          totalProducts: this.data.totalProducts,
          totalVariants: this.data.totalVariants,
          errors: [...this.data.errors, `CSV oluşturma hatası: ${error.message}`]
        }
      };
    }
  }
  
  /**
   * Durumu temizle
   */
  clear(): void {
    this.data = {
      products: [],
      totalVariants: 0,
      totalProducts: 0,
      errors: []
    };
  }
  
  /**
   * Mevcut durum
   */
  getStatus(): AccumulatedData {
    return { ...this.data };
  }
}