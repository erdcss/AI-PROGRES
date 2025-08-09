import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ShoppingCart, Package, Palette, Shirt } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

interface ProductDisplayProps {
  data: {
    title: string;
    brand?: string;
    price: string | number | { profitFormatted: string };
    description?: string;
    images: string[] | Array<{ url: string; alt?: string }>;
    variants: {
      colors: string[];
      sizes: string[];
      variantImages?: Record<string, string[]>;
      pricing?: Record<string, number>;
      allVariants: Array<{
        color: string;
        size: string;
        sku?: string;
        price: number;
        shopifyPrice?: string;
        images?: string[];
        inStock?: boolean;
      }>;
      totalVariants: number;
    };
    features?: Array<{
      key: string;
      value: string;
    }>;
    tags?: string[];
    shopifyCompatible?: boolean;
    aiAnalysis?: any;
  };
}

export function ProductDisplay({ data }: ProductDisplayProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Price formatting helper
  const formatPrice = (price: string | number | { profitFormatted: string }) => {
    if (typeof price === 'string') return price;
    if (typeof price === 'number') return `${price} TL`;
    if (typeof price === 'object' && price?.profitFormatted) return price.profitFormatted;
    return 'Fiyat bilgisi yok';
  };
  
  // Images processing helper
  const processImages = (images: string[] | Array<{ url: string; alt?: string }>) => {
    if (!Array.isArray(images)) return [];
    return images.map(img => 
      typeof img === 'string' ? img : img.url
    );
  };

  // Güvenli image array kontrolü
  const images = processImages(data?.images || []);
  const imageCount = images.length;

  const nextImage = () => {
    if (imageCount > 0) {
      setCurrentImageIndex((prev) => 
        prev === imageCount - 1 ? 0 : prev + 1
      );
    }
  };

  const prevImage = () => {
    if (imageCount > 0) {
      setCurrentImageIndex((prev) => 
        prev === 0 ? imageCount - 1 : prev - 1
      );
    }
  };

  const handleExportToShopify = async () => {
    try {
      // Loading toast
      toast({
        title: "Yükleniyor",
        description: "Ürün Shopify'a yükleniyor, lütfen bekleyin..."
      });
      
      const response = await fetch('/api/export-to-shopify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        toast({
          title: "Başarılı!",
          description: result.message,
          variant: "default"
        });
        
        console.log('✅ Shopify upload successful:', result.data);
      } else {
        toast({
          title: "Hata",
          description: result.message || 'Shopify\'a yükleme başarısız',
          variant: "destructive"
        });
        
        console.error('❌ Shopify upload failed:', result);
      }
    } catch (error) {
      console.error('Shopify export error:', error);
      toast({
        title: "Bağlantı Hatası",
        description: "Shopify\'a bağlanırken hata oluştu. Lütfen tekrar deneyin.",
        variant: "destructive"
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <Card className="bg-gradient-to-br from-purple-800/30 via-purple-900/30 to-indigo-900/30 backdrop-blur-lg border border-white/20 shadow-2xl">
        <CardContent className="p-6">
          {/* Header with title and brand */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">{data.title}</h2>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-white/20 text-white">
                {data.brand}
              </Badge>
              <span className="text-xl font-semibold text-green-400">{formatPrice(data.price)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Image Slider Section - Left */}
            <div className="lg:col-span-1">
              <div className="relative">
                {/* Main Image */}
                <div className="aspect-square bg-white rounded-lg overflow-hidden mb-3">
                  <img
                    src={images[currentImageIndex] || '/placeholder-image.png'}
                    alt={`${data.title} - Image ${currentImageIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Navigation Buttons */}
                {imageCount > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* Image Counter */}
                <div className="absolute bottom-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-sm">
                  {currentImageIndex + 1} / {imageCount}
                </div>

                {/* Thumbnail Strip - Horizontal Slider */}
                {imageCount > 1 && (
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                          index === currentImageIndex 
                            ? 'border-white shadow-lg' 
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={image}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Variants Section - Center */}
            <div className="lg:col-span-1">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Varyantlar ({data.variants?.totalVariants || 0})
              </h3>

              <div className="space-y-4">
                {/* Compact Colors */}
                {data.variants?.colors && data.variants.colors.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-3 h-3 text-white/80" />
                      <span className="text-white text-xs font-medium">Renk Seçenekleri ({data.variants.colors.length})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {data.variants.colors.map((color, index) => {
                        // Enhanced Turkish and cosmetic color name mapping
                        const colorMap: Record<string, { name: string; bg: string; emoji: string }> = {
                          'BEYAZ': { name: 'Beyaz', bg: 'bg-white/90 text-black border-gray-300', emoji: '⚪' },
                          'SIYAH': { name: 'Siyah', bg: 'bg-black text-white border-gray-600', emoji: '⚫' },
                          'GRI': { name: 'Gri', bg: 'bg-gray-500 text-white border-gray-400', emoji: '🔘' },
                          'GRİ': { name: 'Gri', bg: 'bg-gray-500 text-white border-gray-400', emoji: '🔘' },
                          'LIGHT-GRAY': { name: 'Açık Gri', bg: 'bg-gray-300 text-black border-gray-400', emoji: '⬜' },
                          'LACIVERT': { name: 'Lacivert', bg: 'bg-blue-900 text-white border-blue-700', emoji: '🔵' },
                          'LACİVERT': { name: 'Lacivert', bg: 'bg-blue-900 text-white border-blue-700', emoji: '🔵' },
                          'KIRMIZI': { name: 'Kırmızı', bg: 'bg-red-500 text-white border-red-400', emoji: '🔴' },
                          'MAVI': { name: 'Mavi', bg: 'bg-blue-500 text-white border-blue-400', emoji: '🔵' },
                          'TURUNCU': { name: 'Turuncu', bg: 'bg-orange-500 text-white border-orange-400', emoji: '🟠' },
                          'ORANGE': { name: 'Turuncu', bg: 'bg-orange-500 text-white border-orange-400', emoji: '🟠' },
                          'BEJ': { name: 'Bej', bg: 'bg-amber-100 text-amber-900 border-amber-300', emoji: '🟨' },
                          'YEŞIL': { name: 'Yeşil', bg: 'bg-green-500 text-white border-green-400', emoji: '🟢' },
                          'SARI': { name: 'Sarı', bg: 'bg-yellow-500 text-black border-yellow-400', emoji: '🟡' },
                          'KAHVERENGI': { name: 'Kahverengi', bg: 'bg-amber-800 text-white border-amber-700', emoji: '🟤' },
                          'PEMBE': { name: 'Pembe', bg: 'bg-pink-400 text-white border-pink-300', emoji: '🩷' },
                          'MOR': { name: 'Mor', bg: 'bg-purple-500 text-white border-purple-400', emoji: '🟣' },
                          // L'Oreal specific shades
                          '901-FAIR-GLOW': { name: '901 - Açık Ten', bg: 'bg-amber-50 text-amber-900 border-amber-200', emoji: '✨' },
                          '903-MEDIUM-GLOW': { name: '903 - Orta Ten', bg: 'bg-amber-200 text-amber-900 border-amber-300', emoji: '✨' },
                          '904 - DEEP GLOW': { name: '904 - Koyu Ten', bg: 'bg-amber-600 text-white border-amber-500', emoji: '✨' },
                          'LIGHT-GLOW': { name: 'Işıltılı Açık', bg: 'bg-yellow-100 text-yellow-900 border-yellow-300', emoji: '💫' },
                          'LIGHT': { name: 'Açık', bg: 'bg-gray-100 text-gray-900 border-gray-300', emoji: '💡' }
                        };
                        
                        // Handle hex colors and special patterns
                        let colorInfo: { name: string; bg: string; emoji: string; hexCode?: string };
                        if (color.startsWith('#')) {
                          colorInfo = { 
                            name: `Renk Kodu: ${color}`, 
                            bg: `text-white border-gray-400`,
                            emoji: '🎨',
                            hexCode: color
                          };
                        } else {
                          colorInfo = colorMap[color.toUpperCase()] || { 
                            name: color.replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), 
                            bg: 'bg-gray-600 text-white border-gray-500', 
                            emoji: '🎨' 
                          };
                        }
                        
                        return (
                          <div 
                            key={index} 
                            className={`rounded-md px-2 py-1 border text-xs font-medium ${colorInfo.bg}`}
                            style={colorInfo.hexCode ? { backgroundColor: colorInfo.hexCode } : {}}
                          >
                            <div className="flex items-center gap-1">
                              <span className="text-xs">{colorInfo.emoji}</span>
                              <span className="truncate text-xs">{colorInfo.name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Enhanced Sizes */}
                {data.variants?.sizes && data.variants.sizes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shirt className="w-4 h-4 text-white" />
                      <span className="text-white font-medium">Beden Seçenekleri ({data.variants.sizes.length})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {data.variants.sizes.map((size, index) => (
                        <div key={index} className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg px-3 py-2 border-2 border-green-400/30 text-center">
                          <div className="text-green-200 font-bold text-sm">👕 {size}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Compact Variant List */}
                {data.variants?.allVariants && data.variants.allVariants.length > 0 && (
                  <div>
                    <span className="text-white font-medium mb-2 block">Tüm Kombinasyonlar</span>
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {(data.variants?.allVariants || []).slice(0, 8).map((variant, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                        >
                          <div className="text-sm text-white">
                            {variant.color} - {variant.size}
                          </div>
                          <div className="text-sm text-green-400 font-medium">
                            {variant.price ? `${variant.price} TL` : formatPrice(data.price)}
                          </div>
                        </div>
                      ))}
                      {(data.variants?.allVariants?.length || 0) > 8 && (
                        <div className="text-center text-white/60 text-sm py-2">
                          +{(data.variants?.allVariants?.length || 0) - 8} daha fazla varyant
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions Section - Right */}
            <div className="lg:col-span-1">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white mb-4">İşlemler</h3>
                
                {/* Shopify Export Button */}
                <Button
                  onClick={handleExportToShopify}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Shopify'a Direkt Yükle
                </Button>

                {/* Product Summary */}
                <div className="bg-white/5 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Toplam Resim:</span>
                    <span className="text-white">{imageCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Toplam Varyant:</span>
                    <span className="text-white">{data.variants?.totalVariants || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Renk Seçeneği:</span>
                    <span className="text-white">{data.variants?.colors?.length || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Beden Seçeneği:</span>
                    <span className="text-white">{data.variants?.sizes?.length || 0}</span>
                  </div>
                </div>

                {/* Enhanced Product Features Section */}
                {data.features && data.features.length > 0 && (
                  <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-400/20">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      📋 Ürün Özellikleri ({data.features.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {data.features.map((feature, index) => (
                        <div key={index} className="bg-white/5 rounded-md p-2 border border-white/10">
                          <div className="flex flex-col gap-1">
                            <span className="text-blue-300 text-xs font-medium">{feature.key}</span>
                            <span className="text-white text-sm">{feature.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Features Warning */}
                {(!data.features || data.features.length === 0) && (
                  <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-400/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-amber-300">⚠️</span>
                      <span className="text-amber-200 text-sm font-medium">Ürün Özellikleri</span>
                    </div>
                    <p className="text-amber-100 text-xs">Özellik bilgisi bulunamadı</p>
                  </div>
                )}

                {/* Tags */}
                {data.tags && data.tags.length > 0 && (
                  <div>
                    <span className="text-white font-medium mb-2 block">🏷️ Etiketler</span>
                    <div className="flex flex-wrap gap-1">
                      {data.tags.slice(0, 6).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="bg-white/10 text-white text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* No data fallback */}
                {(!data.variants || !data.variants.allVariants || data.variants.allVariants.length === 0) && (
                  <div className="text-center text-white/60 text-sm py-8">
                    Ürün varyant bilgileri henüz yüklenmedi
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}