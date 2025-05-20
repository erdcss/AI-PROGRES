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
    'Materyal Bileşeni', 'Yıkama Talimatları', 'Cinsiyet', 'Üretim Yeri', 'Marka',
    'Model', 'Mevsim', 'Kullanım Alanı', 'Bel Tipi', 'Kol Tipi', 'Yaka Tipi',
    'Kalıp', 'Boy', 'Kol Boyu', 'Paça', 'Kapama Tipi', 'Cep Tipi'
  ];

  // Açıklamadan özellikleri çıkar
  if (description) {
    // Direkt başlıklar
    const hardcodedValues: Record<string, string> = {
      'Bağcıklı': 'Bağlama Şekli',
      'Poliüretan': 'Materyal',
      'Kalın Taban': 'Taban Tipi',
      'Suni Deri': 'Dış Materyal',
      'Beyaz': 'Renk',
      'Tekstil': 'Astar Materyali',
      'Ortopedik Taban': 'Ek Özellik',
      'Spor': 'Kullanım Alanı',
      'Kadın': 'Cinsiyet',
      'Erkek': 'Cinsiyet',
      'Unisex': 'Cinsiyet',
      'Çocuk': 'Cinsiyet'
    };

    // Doğrudan değerleri açıklamadan çıkar
    for (const [value, key] of Object.entries(hardcodedValues)) {
      if (description.includes(value) && !cleanAttributes[key]) {
        cleanAttributes[key] = value;
      }
    }

    // Açıklamadaki "Özellik: Değer" formatındaki bilgileri çıkar
    const attributeRegex = /([A-Za-zÇçĞğİıÖöŞşÜü\s]+)\s*(?::|->)\s*([A-Za-zÇçĞğİıÖöŞşÜü0-9\s\-%\(\)\.]+)/g;
    let match;
    while ((match = attributeRegex.exec(description)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      if (key && value && key !== "Ürün Özellikleri" && value.length < 50) {
        cleanAttributes[key] = value;
      }
    }
  }

  // Ürün Özellikleri bölümünden özellikler çıkar
  if (description && description.includes('Ürün Özellikleri')) {
    const propertySection = description.split('Ürün Özellikleri')[1];
    
    // Bağlama Şekli Bağcıklı gibi Key-Value formatındaki özellikleri çıkar
    const propertyRegex = /([A-Za-zÇçĞğİıÖöŞşÜü\s]+)\s+([A-Za-zÇçĞğİıÖöŞşÜü0-9\s\-%\(\)\.]+)/g;
    let propMatch;
    
    while ((propMatch = propertyRegex.exec(propertySection)) !== null) {
      const key = propMatch[1].trim();
      const value = propMatch[2].trim();
      
      if (attributeKeys.includes(key) && value && value.length < 50) {
        cleanAttributes[key] = value;
      }
    }
  }
  
  // Manuel olarak girilmiş olan özellikleri ekle
  // Örnek manuel özellikler
  const manualProps = {
    'Materyal': 'Poliüretan',
    'Bağlama Şekli': 'Bağcıklı',
    'Renk': 'Beyaz',
    'Taban Tipi': 'Kalın Taban',
    'Dış Materyal': 'Suni Deri', 
    'Astar Materyali': 'Tekstil',
    'İç Taban Materyali': 'Tekstil',
    'Saya Materyali': 'Suni Deri',
    'Taban Materyali': 'Poli',
    'Topuk Boyu': 'Orta Topuklu (5-9 cm)',
    'Desen': 'Renk Bloklu',
    'Kumaş Tipi': 'Dokuma',
    'Ürün Detayı': 'Günlük'
  };
  
  // Manuel özellikleri ekle (sadece eğer mevcut değilse)
  for (const [key, value] of Object.entries(manualProps)) {
    if (!cleanAttributes[key]) {
      // Sadece açıklamada bu değer varsa ekle
      if (description.includes(value)) {
        cleanAttributes[key] = value;
      }
    }
  }
  
  // Mevcut temiz özellikleri ekle (uzun olanları hariç tut)
  for (const [key, value] of Object.entries(attributes)) {
    // Eğer değer çok uzunsa (muhtemelen description parçasıdır)
    if (value && value.length < 50 && !cleanAttributes[key] && attributeKeys.includes(key)) {
      cleanAttributes[key] = value;
    }
  }
  
  // En az 5 özellik bulunamazsa, basit özellikleri manuel ekle
  if (Object.keys(cleanAttributes).length < 5) {
    if (description.toLowerCase().includes('kadın')) cleanAttributes['Cinsiyet'] = 'Kadın';
    if (description.toLowerCase().includes('erkek')) cleanAttributes['Cinsiyet'] = 'Erkek';
    if (description.toLowerCase().includes('ayakkabı')) cleanAttributes['Ürün Tipi'] = 'Ayakkabı';
    if (description.toLowerCase().includes('sneaker')) cleanAttributes['Ürün Tipi'] = 'Sneaker';
  }
  
  console.log(`Temizlenen özellikler: ${Object.keys(cleanAttributes).length} adet`);
  return cleanAttributes;
}