/**
 * Test Turkish Price Parsing - Demonstrates the fix
 */

export function testTurkishPriceParsing() {
  console.log('🧪 Testing Turkish Price Parsing Algorithm');
  
  const testCases = [
    '14.681 TL',    // High value with thousands separator
    '1.299,99 TL',  // Thousands + decimal
    '639,99 TL',    // Standard decimal
    '500 TL',       // Simple integer
    '2.450 TL',     // Thousands separator only
  ];
  
  const results = testCases.map(testPrice => {
    let cleanPrice = testPrice.replace(/TL|₺/gi, '').trim();
    console.log(`🔍 Processing: "${cleanPrice}"`);
    
    if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
      // Format: 1.299,99 (thousands separator + decimal)
      cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
      console.log(`📊 Thousands+decimal format: ${cleanPrice}`);
    } else if (cleanPrice.includes('.') && !cleanPrice.includes(',')) {
      // Check if it's thousands separator (no decimal part after)
      const parts = cleanPrice.split('.');
      if (parts.length === 2 && parts[1].length === 3) {
        // Format: 14.681 (thousands separator)
        cleanPrice = cleanPrice.replace(/\./g, '');
        console.log(`📊 Thousands separator format: ${cleanPrice}`);
      } else {
        // Format: 14.68 (decimal separator)
        console.log(`📊 Decimal format: ${cleanPrice}`);
      }
    } else if (cleanPrice.includes(',')) {
      // Format: 639,99 (decimal with comma)
      cleanPrice = cleanPrice.replace(',', '.');
      console.log(`📊 Comma decimal format: ${cleanPrice}`);
    }
    
    const parsedPrice = parseFloat(cleanPrice.replace(/[^\d.]/g, ''));
    console.log(`💰 Final parsed price: ${parsedPrice}`);
    
    return {
      original: testPrice,
      parsed: parsedPrice,
      withProfit: Math.round(parsedPrice * 1.15 * 100) / 100
    };
  });
  
  console.log('\n✅ Turkish Price Parsing Test Results:');
  results.forEach(result => {
    console.log(`${result.original} → ${result.parsed} TL → ${result.withProfit} TL (15% profit)`);
  });
  
  return results;
}

// Run test
if (require.main === module) {
  testTurkishPriceParsing();
}