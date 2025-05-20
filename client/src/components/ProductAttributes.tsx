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

  return (
    <div className="mt-2 bg-gray-800 rounded-lg overflow-hidden">
      <h3 className="text-lg font-semibold p-3 text-white border-b border-gray-700">Ürün Özellikleri</h3>
      
      <div className="w-full">
        {Object.entries(attributes).map(([key, value], index) => (
          <div 
            key={index} 
            className={`flex items-stretch border-b border-gray-700 last:border-b-0 ${index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}`}
          >
            <div className="w-1/2 p-4 font-medium text-gray-300 border-r border-gray-700">{key}</div>
            <div className="w-1/2 p-4 text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductAttributes;