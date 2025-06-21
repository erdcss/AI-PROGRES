/**
 * Türk Sayı Formatı Yardımcı Fonksiyonları
 * Binlik, on binlik, yüz binlik, milyonluk ayraçları için
 */

export function formatTurkishNumber(num: number): string {
  // Sayıyı 2 ondalık basamağa yuvarla
  const rounded = Math.round(num * 100) / 100;
  
  // Tam kısmı ve ondalık kısmı ayır
  const parts = rounded.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  // Binlik ayraçları ekle (sağdan sola 3'er digit)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  // Ondalık kısmı virgül ile birleştir
  return `${formattedInteger},${decimalPart}`;
}

export function formatTurkishPrice(num: number): string {
  return `${formatTurkishNumber(num)} TL`;
}

// Test fonksiyonu
export function testTurkishFormat() {
  console.log('Türk sayı formatı testleri:');
  console.log('49,99 →', formatTurkishPrice(49.99));
  console.log('749,99 →', formatTurkishPrice(749.99));
  console.log('1.899,99 →', formatTurkishPrice(1899.99));
  console.log('12.499,99 →', formatTurkishPrice(12499.99));
  console.log('125.999,99 →', formatTurkishPrice(125999.99));
  console.log('1.250.000,00 →', formatTurkishPrice(1250000));
  console.log('12.500.000,50 →', formatTurkishPrice(12500000.50));
}