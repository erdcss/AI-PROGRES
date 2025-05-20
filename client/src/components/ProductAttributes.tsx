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

  // Önemli ürün özelliklerini ön tarafa getir
  const priorityKeys = [
    'Materyal', 'Renk', 'Bağlama Şekli', 'Taban Tipi', 'Dış Materyal',
    'Saya Materyali', 'Astar Materyali', 'İç Taban Materyali', 'Taban Materyali',
    'Topuk Boyu', 'Persona', 'Ek Özellik', 'Sürdürülebilirlik Detayı', 'Topuk Tipi',
    'Ortam', 'Koleksiyon', 'Desen', 'Kumaş Tipi', 'Ürün Detayı', 'Kutu Durumu'
  ];

  // Özellikleri sıralı şekilde göstermek için sortedEntries dizisi oluştur
  const sortedEntries = Object.entries(attributes).sort((a, b) => {
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