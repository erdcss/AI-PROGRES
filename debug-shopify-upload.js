// Debug Shopify upload için direct test
const fs = require('fs');

// Multi-URL data okuma
const rawData = JSON.parse(fs.readFileSync('/tmp/multi_product.json', 'utf8'));

console.log('🔍 Multi-URL Data Analysis:');
console.log('Title:', rawData.title);
console.log('Images count:', rawData.images?.length || 0);
console.log('First image:', rawData.images?.[0]?.url || 'No images');
console.log('Variants colors:', rawData.variants?.colors || []);
console.log('Variants sizes:', rawData.variants?.sizes || []);
console.log('AllVariants count:', rawData.variants?.allVariants?.length || 0);
console.log('AllVariants data:', rawData.variants?.allVariants);

// Test direct Shopify upload
const testData = {
  productData: rawData,
  productTitle: "MANUAL DEBUG TEST"
};

console.log('\n📦 Test data structure:');
console.log('productData exists:', !!testData.productData);
console.log('productData.variants exists:', !!testData.productData.variants);
console.log('productData.variants.allVariants exists:', !!testData.productData.variants?.allVariants);
console.log('productData.images exists:', !!testData.productData.images);