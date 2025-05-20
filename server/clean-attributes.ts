/**
 * Trendyol'dan gelen karmaşık ürün özelliklerini temizleyen modül
 */

/**
 * Ürün açıklamasından temiz özellikler çıkarır
 * @param attributes Mevcut özelliklerin karmaşık hali
 * @param description Ürün açıklaması
 * @returns Temizlenmiş özelliklerin bir kaydı
 */
export function cleanTrendyolAttributes(
  attributes: Record<string, string>,
  description: string
): Record<string, string> {
  const cleanAttributes: Record<string, string> = {};
  
  // Standart ayakkabı özellikleri
  const attributeKeys = [
    'Bağlama Şekli', 'Materyal', 'Taban Tipi', 'Dış Materyal', 'Renk',
    'Saya Materyali', 'Astar Materyali', 'İç Taban Materyali', 'Taban Materyali',
    'Topuk Boyu', 'Persona', 'Ek Özellik', 'Sürdürülebilirlik Detayı', 'Topuk Tipi',
    'Ortam', 'Koleksiyon', 'Desen', 'Kumaş Tipi', 'Ürün Detayı', 'Kutu Durumu',
    'Materyal Bileşeni', 'Yıkama Talimatları'
  ];
  
  // Mevcut özellikleri temizleme listesi
  for (const [key, value] of Object.entries(attributes)) {
    // Eğer değer çok uzunsa (muhtemelen description parçasıdır)
    if (value && value.length > 50) {
      // Bu durumu görmezden gel ve temiz verileri işlemeye devam et
      continue;
    } else if (key && value) {
      // Değer makul bir uzunluktaysa, doğrudan ekle
      cleanAttributes[key] = value;
    }
  }
  
  // Trendyol'un "Ürün Özellikleri" bölümünü ayrıştır
  if (description && description.includes('Ürün Özellikleri')) {
    // Özellikleri çıkar
    let propsSection = description.split('Ürün Özellikleri')[1];
    
    // Sadece ürün özellikleri bölümünü al
    const endKeywords = ['Yıkama Talimatları', 'Trendyol Pazaryeri', 'Bu ürün', 'Ürün hakkında'];
    
    for (const keyword of endKeywords) {
      if (propsSection.includes(keyword)) {
        propsSection = propsSection.split(keyword)[0];
        break;
      }
    }
    
    // Satır bazında özellikleri çıkar
    const lines = propsSection.split('\n');
    
    for (const line of lines) {
      // Her anahtar değer ikilisini analiz et
      for (const key of attributeKeys) {
        if (line.includes(key)) {
          // Değeri çıkar
          const keyIndex = line.indexOf(key);
          const restOfLine = line.substring(keyIndex + key.length).trim();
          
          // İlk boşluğa kadar değilse değer alınamaz
          if (restOfLine && restOfLine.length > 0) {
            cleanAttributes[key] = restOfLine;
          }
        }
      }
    }
  }
  
  // Özellikle aranan değerleri daha ayrıntılı ara
  const specificProps = [
    { key: 'Bağlama Şekli', values: ['Bağcıklı', 'Cırtlı', 'Fermuarlı', 'Lastikli', 'Tokalı', 'Bağcıksız'] },
    { key: 'Materyal', values: ['Poliüretan', 'Deri', 'Kumaş', 'Tekstil', 'Suni Deri', 'Pamuk'] },
    { key: 'Renk', values: ['Beyaz', 'Siyah', 'Lacivert', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Pembe', 'Mor', 'Turuncu', 'Gri', 'Kahverengi', 'Bej'] },
    { key: 'Taban Tipi', values: ['Kalın Taban', 'İnce Taban', 'Düz Taban', 'Yüksek Taban', 'Platform'] },
    { key: 'Topuk Tipi', values: ['Düz Topuklu', 'Dolgu Topuk', 'Yüksek Topuk', 'İnce Topuk', 'Kalın Topuk'] }
  ];
  
  for (const prop of specificProps) {
    if (!cleanAttributes[prop.key]) {
      for (const value of prop.values) {
        if (description.includes(value)) {
          cleanAttributes[prop.key] = value;
          break;
        }
      }
    }
  }
  
  return cleanAttributes;
}