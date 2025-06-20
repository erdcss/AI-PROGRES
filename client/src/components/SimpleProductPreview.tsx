import { motion } from "framer-motion";
import { Package, Image as ImageIcon, Tags, Palette, DollarSign } from "lucide-react";

interface SimpleProductPreviewProps {
  product: {
    success: boolean;
    brand: string;
    title: string;
    price?: {
      original: number;
      currency: string;
      formatted: string;
      withProfit: number;
      profitFormatted: string;
    };
    images: string[];
    colorOptions?: string[];
    sizeOptions?: string[];
    variants: Array<{
      color: string;
      size: string;
      inStock: boolean;
      stockCount: number;
    }>;
    stockAnalysis?: {
      totalVariants: number;
      inStockVariants: number;
      outOfStockVariants: number;
      availableSizes: string[];
      unavailableSizes: string[];
    };
    features: Array<{
      key: string;
      value: string;
    }>;
  };
}

export function SimpleProductPreview({ product }: SimpleProductPreviewProps) {
  if (!product || !product.success) {
    return null;
  }

  const { brand, title, price, images, colorOptions, sizeOptions, variants, stockAnalysis, features } = product;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full bg-gray-900/50 rounded-xl border border-gray-800 p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-blue-400" />
        <h2 className="text-xl font-semibold text-white">Ürün Ön İzlemesi</h2>
      </div>

      {/* Basic Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">Marka</h3>
            <p className="text-lg font-semibold text-white">{brand}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">Ürün Başlığı</h3>
            <p className="text-white text-sm leading-relaxed">{title}</p>
          </div>
          
          {price && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">💰 Fiyatlandırma</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-gray-800/30 rounded-lg p-3">
                  <span className="text-gray-400 text-sm">Trendyol Fiyatı:</span>
                  <span className="text-white font-medium">{price.formatted}</span>
                </div>
                <div className="flex items-center justify-between bg-green-900/30 rounded-lg p-3 border border-green-700">
                  <div className="flex flex-col">
                    <span className="text-green-400 text-sm font-medium">Satış Fiyatımız</span>
                    <span className="text-green-500 text-xs">(%10 kar dahil)</span>
                  </div>
                  <span className="text-green-300 font-bold text-lg">{price.profitFormatted}</span>
                </div>
                <div className="text-center bg-blue-900/20 rounded-lg p-2 border border-blue-800">
                  <span className="text-blue-300 text-xs">
                    Kar: {(price.withProfit - price.original).toFixed(2)} {price.currency}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Color and Size Options */}
        {(colorOptions?.length > 0 || sizeOptions?.length > 0) && (
          <div className="space-y-3">
            {colorOptions?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Renk Seçenekleri ({colorOptions.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-900/20 text-blue-300 text-sm rounded-lg border border-blue-800"
                    >
                      {color}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {sizeOptions?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Beden Seçenekleri ({sizeOptions.length})
                  {stockAnalysis && stockAnalysis.outOfStockVariants > 0 && (
                    <span className="text-red-400 text-xs ml-2">
                      ({stockAnalysis.unavailableSizes.length} stokta yok)
                    </span>
                  )}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((size, index) => {
                    const isAvailable = stockAnalysis?.availableSizes.includes(size) ?? true;
                    const isUnavailable = stockAnalysis?.unavailableSizes.includes(size) ?? false;
                    
                    return (
                      <span
                        key={index}
                        className={`px-3 py-1 text-sm rounded-lg border ${
                          isUnavailable 
                            ? 'bg-red-900/20 text-red-300 border-red-800 line-through' 
                            : isAvailable 
                              ? 'bg-green-900/20 text-green-300 border-green-800'
                              : 'bg-purple-900/20 text-purple-300 border-purple-800'
                        }`}
                      >
                        {size}
                        {isUnavailable && <span className="ml-1 text-xs">(stokta yok)</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary Card */}
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Çıkarılan Veri Özeti</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-blue-400" />
                <span className="text-gray-400 text-sm">Görseller</span>
              </div>
              <span className="text-blue-400 font-medium">{images.length}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-green-400" />
                <span className="text-gray-400 text-sm">Varyantlar</span>
              </div>
              <span className="text-green-400 font-medium">{variants.length}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-purple-400" />
                <span className="text-gray-400 text-sm">Özellikler</span>
              </div>
              <span className="text-purple-400 font-medium">{features.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Images Section */}
      {images.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Ürün Görselleri ({images.length})
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {images.slice(0, 12).map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={image}
                  alt={`${brand} ${title} - Görsel ${index + 1}`}
                  className="w-full h-20 object-cover rounded-lg border border-gray-700 group-hover:border-blue-400 transition-all duration-200 group-hover:scale-105"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Variants Section */}
      {variants.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Varyantlar ({variants.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {variants.slice(0, 9).map((variant, index) => (
              <div key={index} className="bg-gray-800/30 rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-white text-sm font-medium">
                    {variant.color}
                  </span>
                  <span className="text-gray-400 text-xs">{variant.size}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-xs px-2 py-1 rounded ${
                    variant.inStock 
                      ? 'bg-green-900/30 text-green-400' 
                      : 'bg-red-900/30 text-red-400'
                  }`}>
                    {variant.inStock ? 'Stokta' : 'Tükendi'}
                  </span>
                  {variant.inStock && (
                    <span className="text-xs text-gray-400">
                      {variant.stockCount} adet
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features Section */}
      {features.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <Tags className="h-4 w-4" />
            Ürün Özellikleri ({features.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
            {features.map((feature, index) => (
              <div key={index} className="bg-gray-800/20 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">{feature.key}</div>
                <div className="text-sm text-white break-words">{feature.value}</div>
              </div>
            ))}
          </div>
          {features.length === 0 && (
            <div className="text-center text-gray-500 py-4">
              Ürün özellikleri bulunamadı
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}