/**
 * Test Color Extraction - Renk çıkarma sistemini test eder
 */

import { extractRealColors } from './real-color-extractor';

export async function testColorExtraction(url: string): Promise<void> {
  console.log(`🧪 Testing color extraction for: ${url}`);
  
  try {
    // Simulate HTML content for testing
    const testHtml = `
      <div class="pr-in-dt-cl-wr">
        <button class="pr-in-dt-cl" title="Siyah" data-color="#000000">Siyah</button>
        <button class="pr-in-dt-cl" title="Beyaz" data-color="#FFFFFF">Beyaz</button>
        <button class="pr-in-dt-cl disabled" title="Kırmızı" data-color="#FF0000">Kırmızı</button>
      </div>
      <script>
        var productState = {
          "variants": [
            {"color": "Mavi", "available": true},
            {"color": "Yeşil", "available": false}
          ]
        };
      </script>
    `;
    
    const colors = await extractRealColors(testHtml, url);
    
    console.log(`🎨 Test completed: ${colors.length} colors found`);
    colors.forEach((color, index) => {
      console.log(`   ${index + 1}. ${color.color} ${color.available ? '✅' : '❌'}`);
    });
    
  } catch (error) {
    console.error('❌ Color extraction test failed:', error);
  }
}