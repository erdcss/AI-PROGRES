import React from 'react';

interface ProductAttributesProps {
  attributes: Record<string, string>;
}

/**
 * Ürün özelliklerini tablo formatında düzenli sütunlarda göstermek için bileşen
 */
const ProductAttributes: React.FC<ProductAttributesProps> = ({ attributes }) => {
  if (!attributes || Object.keys(attributes).length === 0) {
    return <div className="text-gray-400 italic">Ürün özellikleri bulunamadı</div>;
  }

  // Ürün özellikleri başlığı ve tablosu
  return (
    <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
      <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Ürün Özellikleri</h3>
      
      <div className="grid grid-cols-1 gap-2">
        {Object.entries(attributes).map(([key, value], index) => (
          <div 
            key={index} 
            className={`grid grid-cols-2 gap-4 ${index % 2 === 0 ? 'bg-white dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-600'} p-3 rounded`}
          >
            <div className="font-medium text-gray-700 dark:text-gray-300">{key}</div>
            <div className="text-gray-800 dark:text-gray-200">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductAttributes;