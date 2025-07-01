/**
 * Maximum Number Detection Test - Tests all Turkish number formats
 */

export function testMaximumNumberDetection() {
  console.log('🧪 Testing Maximum Number Detection System');
  
  const testCases = [
    // Basic formats
    { input: '500 TL', expected: 500, description: 'Simple integer' },
    { input: '639,99 TL', expected: 639.99, description: 'Decimal comma' },
    
    // Thousands
    { input: '14.681 TL', expected: 14681, description: 'Thousands separator' },
    { input: '25.500 TL', expected: 25500, description: 'Thousands with zeros' },
    { input: '99.999 TL', expected: 99999, description: 'High thousands' },
    
    // Hundreds of thousands
    { input: '250.000 TL', expected: 250000, description: 'Quarter million' },
    { input: '500.000 TL', expected: 500000, description: 'Half million' },
    { input: '999.999 TL', expected: 999999, description: 'Near million' },
    
    // Millions
    { input: '1.000.000 TL', expected: 1000000, description: 'One million' },
    { input: '2.500.000 TL', expected: 2500000, description: 'Two and half million' },
    { input: '5.000.000 TL', expected: 5000000, description: 'Five million' },
    
    // Complex with decimals
    { input: '1.234.567,89 TL', expected: 1234567.89, description: 'Complex millions with decimal' },
    { input: '2.500.000,00 TL', expected: 2500000, description: 'Millions with zero decimal' },
    { input: '999.999,99 TL', expected: 999999.99, description: 'High value with decimal' },
    
    // Ultra high values
    { input: '10.000.000 TL', expected: 10000000, description: 'Ten million' },
    { input: '50.000.000 TL', expected: 50000000, description: 'Fifty million' },
    
    // Real estate level
    { input: '1.000.000.000 TL', expected: 1000000000, description: 'One billion (real estate)' }
  ];
  
  console.log(`Testing ${testCases.length} number formats:`);
  
  testCases.forEach((testCase, index) => {
    const html = `<div>Price: ${testCase.input}</div>`;
    
    try {
      // Test regex pattern
      const matches = html.match(/(\d{1,10}(?:[.,]\d{3})*(?:[.,]\d{1,3})?)\s*(?:TL|₺|Türk\s*Lirası)/gi);
      
      if (matches && matches.length > 0) {
        const match = matches[0];
        const numberPart = match.replace(/\s*(?:TL|₺|Türk\s*Lirası)/gi, '').trim();
        
        // Apply Turkish formatting logic
        let cleanNum = numberPart;
        
        if (cleanNum.includes('.') && cleanNum.includes(',')) {
          cleanNum = cleanNum.replace(/\./g, '').replace(',', '.');
        } else if (cleanNum.includes('.') && !cleanNum.includes(',')) {
          const parts = cleanNum.split('.');
          if (parts.length >= 2 && parts[parts.length - 1].length === 3 && parts.length > 2) {
            cleanNum = cleanNum.replace(/\./g, '');
          } else if (parts.length === 2 && parts[1].length === 3) {
            cleanNum = cleanNum.replace(/\./g, '');
          }
        } else if (cleanNum.includes(',')) {
          cleanNum = cleanNum.replace(',', '.');
        }
        
        const parsed = parseFloat(cleanNum);
        const success = Math.abs(parsed - testCase.expected) < 0.01;
        
        console.log(`${index + 1}. ${testCase.description}: ${success ? '✅' : '❌'}`);
        console.log(`   Input: "${testCase.input}" → Expected: ${testCase.expected} → Got: ${parsed}`);
        
        if (!success) {
          console.log(`   ⚠️ FAILED: Expected ${testCase.expected}, got ${parsed}`);
        }
      } else {
        console.log(`${index + 1}. ${testCase.description}: ❌ NO MATCH`);
        console.log(`   Input: "${testCase.input}" → No regex match found`);
      }
    } catch (error) {
      console.log(`${index + 1}. ${testCase.description}: ❌ ERROR`);
      console.log(`   Error: ${error}`);
    }
    
    console.log(''); // Empty line for readability
  });
  
  console.log('🎯 Maximum Number Detection Test Complete');
}

// Export for use in routes
export { testMaximumNumberDetection as runMaxNumberTest };