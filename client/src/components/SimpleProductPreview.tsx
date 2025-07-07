import { motion } from "framer-motion";
import { Package, Image as ImageIcon, Tags, Palette, DollarSign } from "lucide-react";

interface SimpleProductPreviewProps {
  product: {
    success: boolean;
    brand: string;
    title: string;
    price?: number | {
      original: number;
      currency: string;
      formatted: string;
      withProfit: number;
      profitFormatted: string;
    };
    images: string[];
    colorOptions?: string[];
    sizeOptions?: string[];
    variants: {
      colors: string[];
      sizes: string[];
      stockMap: Record<string, boolean>;
    };
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

  // Use price details from API response
  const priceDetails = typeof price === 'object' ? price : {
    original: Math.round((typeof price === 'number' ? price : 0) / 1.15),
    withProfit: typeof price === 'number' ? price : 0,
    formatted: `${Math.round((typeof price === 'number' ? price : 0) / 1.15).toFixed(0)} TL`,
    profitFormatted: `${(typeof price === 'number' ? price : 0).toFixed(0)} TL`,
    currency: 'TL'
  };

  // Handle variants format (object)
  const getVariantCount = () => {
    if (variants && variants.colors && variants.sizes) {
      return variants.colors.length * variants.sizes.length;
    }
    return 0;
  };

  const getInStockCount = () => {
    if (variants && variants.stockMap) {
      return Object.values(variants.stockMap).filter(Boolean).length;
    }
    return 0;
  };

  const getVariantArray = () => {
    if (variants && variants.colors && variants.sizes) {
      // Convert object format to array format for display
      const variantArray = [];
      for (const color of variants.colors) {
        for (const size of variants.sizes) {
          const key = `${color}-${size}`;
          variantArray.push({
            color,
            size,
            inStock: variants.stockMap[key] || false,
            stockCount: variants.stockMap[key] ? 1 : 0
          });
        }
      }
      return variantArray;
    }
    return [];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-3xl overflow-hidden"
    >
      {/* Modern Header with Background Pattern */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10"></div>
        <div className="relative p-4 sm:p-8 border-b border-slate-700/50">
          <div className="flex items-center justify-between flex-col sm:flex-row gap-4 sm:gap-0">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="relative">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-3 sm:p-4 rounded-2xl shadow-lg">
                  <Package className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 bg-blue-500 rounded-full p-1 animate-pulse">
                  <div className="h-2 w-2 sm:h-3 sm:w-3 bg-white rounded-full"></div>
                </div>
              </div>
              <div className="text-center sm:text-left">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Ürün Başarıyla Çıkarıldı
                </h2>
                <p className="text-slate-400 text-sm sm:text-base lg:text-lg mt-1">AI destekli analiz tamamlandı</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Product Info Grid */}
      <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Enhanced Basic Info */}
          <div className="bg-gradient-to-br from-slate-700/30 to-slate-800/30 backdrop-blur-sm p-4 sm:p-8 rounded-2xl border border-slate-600/30">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6 flex items-center gap-3">
              <div className="bg-blue-500 p-2 rounded-lg">
                <Package className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              Ürün Bilgileri
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400 font-medium">Marka:</span>
                <span className="text-white font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  {brand}
                </span>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400 font-medium block mb-2">Başlık:</span>
                <span className="text-white text-sm leading-relaxed">
                  {title}
                </span>
              </div>
              {priceDetails && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <span className="text-orange-400 font-medium">Orijinal Fiyat:</span>
                    <span className="text-orange-300 font-bold text-lg">{priceDetails.formatted}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <span className="text-green-400 font-medium">Kar Marjlı Fiyat:</span>
                    <span className="text-green-300 font-bold text-xl">{priceDetails.profitFormatted}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-2 bg-blue-500/10 rounded-lg">
                      <span className="text-blue-300 text-sm font-medium">
                        %15 Kar Marjı
                      </span>
                    </div>
                    <div className="text-center p-2 bg-purple-500/10 rounded-lg">
                      <span className="text-purple-300 text-sm font-medium">
                        Kar: {Math.round((priceDetails.withProfit - priceDetails.original) || 0).toLocaleString('tr-TR', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        })} TL
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Compact Modern AI Analysis */}
          <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 backdrop-blur-sm p-3 rounded-lg border border-purple-500/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-purple-500 p-1 rounded">
                <Palette className="h-3 w-3 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white">AI Analiz Tamamlandı</h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                <div className="text-lg font-bold text-blue-400">{images.length}</div>
                <div className="text-xs text-gray-400">Görsel</div>
              </div>
              <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                <div className="text-lg font-bold text-green-400">{features.length}</div>
                <div className="text-xs text-gray-400">Özellik</div>
              </div>
              <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                <div className="text-lg font-bold text-purple-400">{getVariantCount()}</div>
                <div className="text-xs text-gray-400">Varyant</div>
              </div>
              <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                <div className="text-lg font-bold text-orange-400">{getInStockCount()}</div>
                <div className="text-xs text-gray-400">Stokta</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Summary */}
        <div className="bg-slate-800/30 rounded-lg p-2">
          <div className="grid grid-cols-3 gap-1 text-xs">
            <div className="bg-slate-800/50 rounded p-1 text-center">
              <span className="text-gray-400">Marka:</span> <span className="text-white ml-1">{brand}</span>
            </div>
            <div className="bg-slate-800/50 rounded p-1 text-center">
              <span className="text-gray-400">Orijinal:</span> <span className="text-orange-400 ml-1 font-bold">{priceDetails?.original.toFixed(0) || 0} TL</span>
            </div>
            <div className="bg-slate-800/50 rounded p-1 text-center">
              <span className="text-gray-400">Kar Marjlı:</span> <span className="text-green-400 ml-1 font-bold">{priceDetails?.withProfit.toFixed(0) || 0} TL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Images Section */}
      {images.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-gray-300">Ürün Görselleri</span>
            <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">{images.length}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {images.slice(0, 6).map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={image}
                  alt={`${index + 1}`}
                  className="w-full h-12 object-cover rounded border border-slate-600 group-hover:border-blue-400 transition-all duration-200"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact Variant Summary */}
      {getVariantCount() > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-3 w-3 text-purple-400" />
              <span className="text-xs font-medium text-gray-300">Varyantlar</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">{getVariantCount()}</span>
              <div className="flex items-center gap-1">
                <span className="text-green-400">{getInStockCount()}</span>
                <span className="text-gray-400">stokta</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-red-400">{getVariantCount() - getInStockCount()}</span>
                <span className="text-gray-400">tükendi</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ultra Compact Features */}
      {features.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Tags className="h-3 w-3 text-green-400" />
              <span className="text-xs font-medium text-gray-300">Ürün Özellikleri</span>
            </div>
            <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">{features.length}</span>
          </div>
          <div className="space-y-1">
            {features.slice(0, 4).map((feature, index) => (
              <div key={index} className="flex justify-between items-center text-xs bg-slate-700/20 rounded px-2 py-1">
                <span className="text-gray-400 truncate flex-1">{feature.key}:</span>
                <span className="text-white font-medium truncate ml-2">{feature.value}</span>
              </div>
            ))}
            {features.length > 4 && (
              <div className="text-center">
                <span className="text-xs text-gray-500">+{features.length - 4} özellik daha</span>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}