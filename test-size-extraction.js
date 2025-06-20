// Test script to verify size extraction is working
const testUrls = [
  "https://www.trendyol.com/kigili/polo-yaka-slim-fit-dar-kesim-nakisli-suprem-pamuklu-tisort-p-311970196",
  "https://www.trendyol.com/sheismono/ultra-soft-oval-yaka-kisa-kol-bluz-ekru-p-929411699"
];

async function testSizeExtraction() {
  for (const url of testUrls) {
    try {
      console.log(`\n=== Testing: ${url} ===`);
      
      const response = await fetch('http://localhost:5000/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      
      console.log(`Brand: ${data.brand}`);
      console.log(`Size Options: [${data.sizeOptions?.join(', ') || 'none'}]`);
      console.log(`Variants: ${data.variants?.length || 0}`);
      console.log(`Is Out of Stock: ${data.isOutOfStock}`);
      
      if (data.variants && data.variants.length > 0) {
        const uniqueSizes = [...new Set(data.variants.map(v => v.size))];
        console.log(`Unique Variant Sizes: [${uniqueSizes.join(', ')}]`);
      }
      
    } catch (error) {
      console.error(`Error testing ${url}:`, error.message);
    }
  }
}

testSizeExtraction();