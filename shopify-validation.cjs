const fs = require('fs');

const csvPath = '/home/runner/workspace/shopify-urunler.csv';
const buffer = fs.readFileSync(csvPath);
const content = fs.readFileSync(csvPath, 'utf-8');

// UTF-8 BOM check
const hasBOM = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;

// CSV structure check
const lines = content.split('\n').filter(l => l.trim());
const headerFields = (lines[0].match(/"/g) || []).length / 2;
const dataFields = lines.length > 1 ? (lines[1].match(/"/g) || []).length / 2 : 0;

console.log('Shopify CSV Validation:');
console.log('======================');
console.log('UTF-8 BOM:', hasBOM ? 'PRESENT' : 'MISSING');
console.log('File size:', buffer.length, 'bytes');
console.log('Lines:', lines.length);
console.log('Header fields:', headerFields);
console.log('Data fields:', dataFields);
console.log('Field match:', headerFields === dataFields ? 'YES' : 'NO');

const ready = hasBOM && lines.length > 1 && headerFields === dataFields;
console.log('\nShopify Ready:', ready ? 'YES' : 'NO');

if (ready) {
  console.log('\nSuccess! CSV can be imported directly to Shopify admin panel.');
} else {
  console.log('\nIssues detected that need fixing.');