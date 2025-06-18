const { generateShopifyCSV } = require('./server/shopify-csv-generator.ts');

const testProduct = {
  title: "Test Ürün",
  brand: "Test Marka",
  price: "100",
  basePrice: "100",
  description: "Test açıklama",
  images: ["test.jpg"],
  variants: {
    colors: ["siyah"],
    sizes: ["M"],
    totalVariants: 1
  },
  url: "test.com",
  id: 1,
  video: null,
  vendor: "turmarkt",
  category: "test",
  subcategory: "test",
  productType: "test",
  tags: ["test"],
  attributes: {},
  categories: null
};

async function testCSVDirect() {
  try {
    console.log('Direct CSV test başlatılıyor...');
    const result = await generateShopifyCSV([testProduct]);
    console.log('CSV başarıyla oluşturuldu:', result);
  } catch (error) {
    console.error('CSV hatası:', error);
  }
}

testCSVDirect();