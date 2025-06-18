import { generateShopifyCSV } from './shopify-csv-generator';
import { autoAddState } from './auto-add-products';

export async function createSimpleCSV() {
  try {
    console.log(`📝 ${autoAddState.products.length} ürün için CSV oluşturuluyor...`);
    
    if (autoAddState.products.length === 0) {
      // Test ürünü ekle
      const testProduct = {
        title: "Test Ürün - peelter Elbise",
        brand: "peelter",
        price: "324",
        basePrice: "324",
        description: "Yazlık elbise",
        images: ["https://cdn.dsmcdn.com/ty1102/product/media/images/prod/SPM/PIM/20231222/09/1aee7899-050f-3e0c-9d77-5aa40c357fcd/1_org.jpg"],
        variants: {
          colors: ["lacivert"],
          sizes: ["XS", "S", "M", "L", "XL"],
          totalVariants: 5,
          variantImages: {},
          colorImageMap: {},
          variantPricing: {},
          variantSpecificPricing: {},
          stockMap: {},
          outOfStockVariants: []
        },
        url: "https://www.trendyol.com/test",
        id: 1,
        video: null,
        vendor: "turmarkt",
        category: "Giyim",
        subcategory: "Elbise",
        productType: "Elbise",
        tags: ["yazlık", "elbise"],
        attributes: {},
        categories: null
      };
      
      const filename = await generateShopifyCSV([testProduct]);
      return {
        success: true,
        message: "Test ürünü ile CSV oluşturuldu",
        filename,
        totalProducts: 1,
        totalVariants: 5
      };
    }
    
    const filename = await generateShopifyCSV(autoAddState.products);
    return {
      success: true,
      message: `${autoAddState.products.length} ürün CSV'ye aktarıldı`,
      filename,
      totalProducts: autoAddState.products.length,
      totalVariants: autoAddState.products.reduce((sum: number, product: any) => 
        sum + (product.variants?.totalVariants || 1), 0)
    };
    
  } catch (error: any) {
    console.error('CSV oluşturma hatası:', error);
    return {
      success: false,
      message: `CSV oluşturma hatası: ${error.message}`
    };
  }
}