import { motion } from "framer-motion";
import { Package, Image as ImageIcon, Tags, Palette, DollarSign, Info } from "lucide-react";

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
  
  // Safety check for arrays
  const safeImages = images || [];
  const safeColorOptions = colorOptions || [];
  const safeSizeOptions = sizeOptions || [];
  const safeFeatures = features || [];
  const safeVariants = variants || { colors: [], sizes: [], stockMap: {} };

  // Use price details from API response - %10 kar marjı
  const priceDetails = typeof price === 'object' && price.withProfit ? price : {
    original: typeof price === 'number' ? price : 0,
    withProfit: Math.round((typeof price === 'number' ? price : 0) * 1.10),
    formatted: `${(typeof price === 'number' ? price : 0).toFixed(0)} TL`,
    profitFormatted: `${Math.round((typeof price === 'number' ? price : 0) * 1.10).toFixed(0)} TL`,
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

      {/* Simplified Product Info - Single Row Layout */}
      <div className="p-4 space-y-4">
        {/* Basic Product Info - Horizontal Layout */}
        <div className="bg-gradient-to-br from-slate-700/30 to-slate-800/30 backdrop-blur-sm p-4 rounded-2xl border border-slate-600/30">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Package className="h-4 w-4 text-white" />
            </div>
            Ürün Bilgileri
          </h3>
          
          {/* Horizontal Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Marka */}
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-slate-400 text-sm">Marka</div>
              <div className="text-white font-bold text-lg">{brand}</div>
            </div>
            
            {/* SKU */}
            {features.find(f => f.key === 'SKU') && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-slate-400 text-sm">SKU</div>
                <div className="text-white font-bold text-lg">{features.find(f => f.key === 'SKU')?.value}</div>
              </div>
            )}
            
            {/* Materyal */}
            {features.find(f => f.key.includes('Materyal') || f.key.includes('Material')) && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-slate-400 text-sm">Materyal</div>
                <div className="text-white font-bold text-lg">{features.find(f => f.key.includes('Materyal') || f.key.includes('Material'))?.value}</div>
              </div>
            )}
            
            {/* Stok Durumu */}
            {features.find(f => f.key.includes('Stok')) && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-slate-400 text-sm">Stok Durumu</div>
                <div className="text-white font-bold text-lg">{features.find(f => f.key.includes('Stok'))?.value}</div>
              </div>
            )}
          </div>
          
          {/* Açıklama */}
          {features.find(f => f.key.includes('Açıklama') || f.key.includes('Meta')) && (
            <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
              <div className="text-slate-400 text-sm mb-2">Açıklama</div>
              <div className="text-white text-sm leading-relaxed">
                {features.find(f => f.key.includes('Açıklama') || f.key.includes('Meta'))?.value}
              </div>
            </div>
          )}
          
          {/* Fiyat Bilgileri */}
          {priceDetails && (
            <div className="mt-4 bg-slate-800/50 rounded-lg p-3">
              <div className="text-slate-400 text-sm mb-3">Satış Fiyatı</div>
              <div className="flex justify-between items-center">
                <div className="text-center">
                  <div className="text-orange-400 text-sm">Orijinal</div>
                  <div className="text-orange-300 font-bold text-xl">{priceDetails.formatted}</div>
                </div>
                <div className="text-center">
                  <div className="text-green-400 text-sm">Kar Marjlı</div>
                  <div className="text-green-300 font-bold text-xl">{priceDetails.profitFormatted}</div>
                </div>
                <div className="text-center">
                  <div className="text-blue-400 text-sm">%10 Kar Marjı</div>
                  <div className="text-blue-300 font-bold text-xl">
                    {Math.round((priceDetails.withProfit - priceDetails.original) || 0)} TL
                  </div>
                </div>
              </div>
            </div>
          )}
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

      {/* Detailed Size Variants Display */}
      {variants && variants.sizes && variants.sizes.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">Beden Seçenekleri</span>
            <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-1 rounded">{variants.sizes.length}</span>
          </div>
          
          {/* Size Grid - All sizes displayed */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {variants.sizes.map((size, index) => {
              // Check stock for this size across all colors
              const isInStock = variants.colors.some(color => {
                const key = `${color}-${size}`;
                return variants.stockMap && variants.stockMap[key] === true;
              });
              
              return (
                <div
                  key={index}
                  className={`
                    relative px-3 py-2 rounded-lg border text-center text-sm font-medium transition-all duration-200
                    ${isInStock 
                      ? 'bg-green-500/20 border-green-400/50 text-green-300 hover:bg-green-500/30' 
                      : 'bg-gray-800/50 border-gray-600/50 text-gray-500 opacity-60'
                    }
                  `}
                >
                  <div className="font-bold">{size}</div>
                  <div className="text-xs mt-0.5">
                    {isInStock ? (
                      <span className="text-green-400">Stokta</span>
                    ) : (
                      <span className="text-gray-500">Tükendi</span>
                    )}
                  </div>
                  
                  {/* Stock indicator dot */}
                  <div className={`
                    absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-800
                    ${isInStock ? 'bg-green-400' : 'bg-gray-600'}
                  `} />
                </div>
              );
            })}
          </div>
          
          {/* Stock Summary */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-green-400">{getInStockCount()} Stokta</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                <span className="text-gray-500">{getVariantCount() - getInStockCount()} Tükendi</span>
              </div>
            </div>
            <span className="text-gray-400">Toplam {variants.sizes.length} beden</span>
          </div>
        </div>
      )}

      {/* Simplified Product Specifications - Compact Grid */}
      {features.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Ürün Özellikleri</h3>
            <span className="text-sm text-blue-400 bg-blue-400/10 px-2 py-1 rounded">{features.length}</span>
          </div>
          
          {/* Compact Grid - 3 columns on desktop, 2 on tablet, 1 on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {features.slice(0, 12).map((feature, index) => (
              <div key={index} className="bg-slate-700/20 border border-slate-600 rounded-lg p-3 hover:border-blue-400/50 transition-all duration-200">
                <div className="text-sm font-medium text-gray-300 mb-1 truncate">{feature.key}</div>
                <div className="text-sm font-semibold text-white truncate">{feature.value}</div>
              </div>
            ))}
          </div>
          
          {features.length > 12 && (
            <div className="mt-3 text-center">
              <div className="text-sm text-gray-400 bg-slate-700/30 rounded-lg p-2">
                +{features.length - 12} özellik daha - Shopify'a aktarılacak
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}