import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Check, XCircle } from "lucide-react";

interface VariantProps {
  size?: string[];
  color?: string[];
  availableSizes?: string[]; // Stokta olan bedenler
  unavailableSizes?: string[]; // Stokta olmayan bedenler
}

/**
 * Ürün varyantlarını gösteren bileşen
 * Stokta olan ve olmayan bedenleri farklı görünümde gösterir
 */
const ProductVariants: React.FC<{ variants: VariantProps }> = ({ variants }) => {
  const hasVariants = (variants.size && variants.size.length > 0) || 
                     (variants.color && variants.color.length > 0);

  if (!hasVariants) {
    return null;
  }

  // Varyant düğmelerini oluştur ve stok durumunu görsel olarak göster
  const renderVariantButtons = (items: string[], type: string, availableItems?: string[]) => {
    if (!items || items.length === 0) return null;

    return (
      <div className="space-y-2">
        <h3 className="text-md font-medium text-white">{type}</h3>
        <div className="flex flex-wrap gap-2">
          {items.map((item, idx) => {
            // Stokta var mı kontrolü - Tüm bedenleri göster
            const isAvailable = !availableItems || availableItems.includes(item);
            
            return (
              <Badge 
                key={idx} 
                variant={isAvailable ? "default" : "outline"}
                className={`px-3 py-1.5 text-sm ${
                  isAvailable 
                    ? 'bg-primary hover:bg-primary/90 text-white' 
                    : 'bg-gray-800 text-gray-400 border-gray-600 opacity-70'
                } cursor-default flex items-center gap-1.5`}
              >
                {isAvailable ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {item}
              </Badge>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2 space-y-4">
      {variants.color && variants.color.length > 0 && (
        renderVariantButtons(variants.color, 'Ürün')
      )}
      
      {variants.size && variants.size.length > 0 && (
        renderVariantButtons(
          variants.size, 
          'Beden', 
          variants.availableSizes
        )
      )}
      
      {/* Stok durumu özeti */}
      {variants.availableSizes && variants.unavailableSizes && (
        <div className="text-sm text-gray-400 mt-2">
          <span className="text-green-500 font-medium">{variants.availableSizes.length}</span> beden stokta, {' '}
          <span className="text-red-500 font-medium">{variants.unavailableSizes.length}</span> beden tükendi
        </div>
      )}
    </div>
  );
};

export default ProductVariants;