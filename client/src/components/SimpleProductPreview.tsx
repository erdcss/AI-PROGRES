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
      className="w-full bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-3xl overflow-hidden"
    >
      {/* Modern Header with Background Pattern */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10"></div>
        <div className="relative p-8 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-4 rounded-2xl shadow-lg">
                  <Package className="h-8 w-8 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 bg-blue-500 rounded-full p-1 animate-pulse">
                  <div className="h-3 w-3 bg-white rounded-full"></div>
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Ürün Başarıyla Çıkarıldı
                </h2>
                <p className="text-slate-400 text-lg mt-1">AI destekli analiz tamamlandı</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Product Info Grid */}
      <div className="p-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Enhanced Basic Info */}
          <div className="bg-gradient-to-br from-slate-700/30 to-slate-800/30 backdrop-blur-sm p-8 rounded-2xl border border-slate-600/30">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <div className="bg-blue-500 p-2 rounded-lg">
                <Package className="h-5 w-5 text-white" />
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
              {price && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <span className="text-orange-400 font-medium">Orijinal Fiyat:</span>
                    <span className="text-orange-300 font-bold text-lg">{price.formatted}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <span className="text-green-400 font-medium">Kar Marjlı Fiyat:</span>
                    <span className="text-green-300 font-bold text-xl">{price.profitFormatted}</span>
                  </div>
                  <div className="text-center p-2 bg-blue-500/10 rounded-lg">
                    <span className="text-blue-300 text-sm font-medium">
                      %10 Kar Marjı Eklendi
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Stats */}
          <div className="bg-gradient-to-br from-slate-700/30 to-slate-800/30 backdrop-blur-sm p-8 rounded-2xl border border-slate-600/30">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <div className="bg-purple-500 p-2 rounded-lg">
                <Palette className="h-5 w-5 text-white" />
              </div>
              AI Analiz Sonuçları
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl"
              >
                <div className="text-3xl font-bold text-blue-400 mb-2">{images.length}</div>
                <div className="text-slate-300 font-medium">Yüksek Kalite</div>
                <div className="text-slate-400 text-sm">Görsel</div>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-4 bg-green-500/10 border border-green-500/20 rounded-xl"
              >
                <div className="text-3xl font-bold text-green-400 mb-2">{features.length}</div>
                <div className="text-slate-300 font-medium">Detaylı</div>
                <div className="text-slate-400 text-sm">Özellik</div>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl"
              >
                <div className="text-3xl font-bold text-purple-400 mb-2">{variants.length}</div>
                <div className="text-slate-300 font-medium">Toplam</div>
                <div className="text-slate-400 text-sm">Varyant</div>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl"
              >
                <div className="text-3xl font-bold text-orange-400 mb-2">
                  {variants.filter(v => v.inStock).length}
                </div>
                <div className="text-slate-300 font-medium">Mevcut</div>
                <div className="text-slate-400 text-sm">Stokta</div>
              </motion.div>
            </div>
            <div className="mt-6 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-center justify-center gap-2 text-green-300">
                <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="font-medium">Shopify Formatında Hazır</span>
              </div>
            </div>
          </div>
        </div>

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