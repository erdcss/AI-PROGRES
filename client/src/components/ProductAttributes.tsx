import React from 'react';

interface ProductAttributesProps {
  attributes: Record<string, string>;
}

/**
 * Ürün özelliklerini tablo formatında düzenli sütunlarda göstermek için bileşen
 * Trendyol benzeri tasarımla
 */
const ProductAttributes: React.FC<ProductAttributesProps> = ({ attributes }) => {
  if (!attributes || Object.keys(attributes).length === 0) {
    return <div className="text-gray-400 italic">Ürün özellikleri bulunamadı</div>;
  }

  // Ürün özellik değerlerini temizle
  const cleanAttributes: Record<string, string> = {};
  
  // Filtrelenecek/kaldırılacak özellikler listesi
  const filteredKeys = [
    'İstanbul Vergi Kimlik Numarası', 'Semt', 'Sokak', 'Ücretsiz İade Hızlı TeslimatTrendyol Müşteri DesteğiSatıcı',
    'Adres', 'Satıcı Ünvanı', 'Vergi Kimlik Numarası', 'İletişim', 'Şehir', 'Mahalle', 'Cadde'
  ];
  
  // Özellik değerlerini temizle ve kısa hale getir
  for (const [key, value] of Object.entries(attributes)) {
    // Filtrelenen özellikleri atla
    if (filteredKeys.includes(key)) continue;
    
    if (!value || typeof value !== 'string') continue;
    
    // Çok uzun değerleri temizle
    if (value.length > 100) {
      // Değer içinde anahtar adını bulup, sonrasını kısa değer olarak al
      const keyInValue = value.indexOf(key);
      if (keyInValue !== -1 && keyInValue < 100) {
        // Key'den sonraki ilk 30 karakteri al
        const afterKey = value.substring(keyInValue + key.length).trim();
        const firstSentence = afterKey.split('.')[0];
        
        if (firstSentence && firstSentence.length < 50) {
          cleanAttributes[key] = firstSentence;
          continue;
        }
      }
      
      // Değer içinde özelliklerden sonra bir değer bul
      const propertiesSection = value.indexOf('Ürün Özellikleri');
      if (propertiesSection !== -1) {
        const afterProperties = value.substring(propertiesSection);
        const keyValueMatch = new RegExp(`${key}\\s+([\\wÇçĞğİıÖöŞşÜü\\s\\-\\(\\)\\d%]+)`).exec(afterProperties);
        
        if (keyValueMatch && keyValueMatch[1]) {
          cleanAttributes[key] = keyValueMatch[1].trim();
          continue;
        }
      }
      
      // Eğer hiçbir temizleme çalışmazsa, ilk 30 karakter al
      cleanAttributes[key] = value.substring(0, 30) + '...';
    } else {
      // Değer zaten kısa, olduğu gibi kullan
      cleanAttributes[key] = value;
    }
  }
  
  // Bilinen değerleri manuel olarak temizle
  const manualCleanValues: Record<string, string> = {
    'Materyal': 'Poliüretan',
    'Renk': 'Beyaz',
    'Bağlama Şekli': 'Bağcıklı',
    'Taban Tipi': 'Kalın Taban',
    'Dış Materyal': 'Suni Deri',
    'Saya Materyali': 'Suni Deri',
    'Astar Materyali': 'Tekstil',
    'İç Taban Materyali': 'Tekstil',
    'Taban Materyali': 'Poli',
    'Topuk Boyu': 'Orta Topuklu (5-9 cm)',
    'Ek Özellik': 'Ortopedik Taban',
    'Topuk Tipi': 'Düz Topuklu',
    'Ortam': 'Sportswear',
    'Koleksiyon': 'Basic',
    'Desen': 'Renk Bloklu',
    'Kumaş Tipi': 'Dokuma',
    'Ürün Detayı': 'Günlük',
    'Kutu Durumu': 'Kutusuz'
  };
  
  // Manuel değerleri ekle, eğer attributes'te varsa
  for (const [key, value] of Object.entries(manualCleanValues)) {
    if (attributes[key] && attributes[key].includes(value)) {
      cleanAttributes[key] = value;
    }
  }

  // Önemli ürün özelliklerini ön tarafa getir
  const priorityKeys = [
    'Materyal', 'Renk', 'Bağlama Şekli', 'Taban Tipi', 'Dış Materyal',
    'Saya Materyali', 'Astar Materyali', 'İç Taban Materyali', 'Taban Materyali',
    'Topuk Boyu', 'Persona', 'Ek Özellik', 'Sürdürülebilirlik Detayı', 'Topuk Tipi',
    'Ortam', 'Koleksiyon', 'Desen', 'Kumaş Tipi', 'Ürün Detayı', 'Kutu Durumu',
    'Cinsiyet', 'Üretim Yeri', 'Marka', 'Model', 'Mevsim', 'Kullanım Alanı'
  ];

  // Özellikleri sıralı şekilde göstermek için sortedEntries dizisi oluştur
  const sortedEntries = Object.entries(cleanAttributes).sort((a, b) => {
    const indexA = priorityKeys.indexOf(a[0]);
    const indexB = priorityKeys.indexOf(b[0]);
    
    // Öncelikli listede varsa, sıralamalarına göre göster
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // Sadece a öncelikli listede varsa, a önce gelsin
    if (indexA !== -1) {
      return -1;
    }
    // Sadece b öncelikli listede varsa, b önce gelsin
    if (indexB !== -1) {
      return 1;
    }
    // İkisi de öncelikli listede yoksa, alfabetik sırala
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="mt-2 bg-gray-800 rounded-lg overflow-hidden">
      <h3 className="text-lg font-semibold p-3 text-white border-b border-gray-700">Ürün Özellikleri</h3>
      
      <div className="w-full">
        {sortedEntries.map(([key, value], index) => (
          <div 
            key={index} 
            className={`flex items-stretch border-b border-gray-700 last:border-b-0 ${index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}`}
          >
            <div className="w-2/5 p-3 font-medium text-gray-300 border-r border-gray-700">{key}</div>
            <div className="w-3/5 p-3 text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductAttributes;