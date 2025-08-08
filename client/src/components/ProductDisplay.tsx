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
                {/* Colors */}
                {data.variants?.colors && data.variants.colors.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-4 h-4 text-white" />
                      <span className="text-white font-medium">Renkler</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.variants.colors.map((color) => (
                        <Badge
                          key={color}
                          variant="outline"
                          className="border-white/30 text-white text-xs px-2 py-1"
                        >
                          {color}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sizes */}
                {data.variants?.sizes && data.variants.sizes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Shirt className="w-4 h-4 text-white" />
                      <span className="text-white font-medium">Bedenler</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.variants.sizes.map((size) => (
                        <Badge
                          key={size}
                          variant="outline" 
                          className="border-white/30 text-white text-xs px-2 py-1"
                        >
                          {size}
                        </Badge>
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

                {/* Tags */}
                {data.tags && data.tags.length > 0 && (
                  <div>
                    <span className="text-white font-medium mb-2 block">Etiketler</span>
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