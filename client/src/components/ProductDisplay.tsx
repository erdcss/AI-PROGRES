import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ShoppingCart, Package, Palette, Shirt } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { VariantDisplay } from "@/components/VariantDisplay";
import { ProductVariants } from "@/components/ProductVariants";

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
      <Card className="bg-slate-800/50 backdrop-blur-lg border border-white/20 shadow-2xl">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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



            {/* Product Details & Variants Section - Right */}
            <div className="lg:col-span-1">
              <div className="space-y-4">
                {/* Shopify Export Button */}
                <Button
                  onClick={handleExportToShopify}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  SHOPIFY'A AKTAR
                </Button>
                
                {/* Variant Display */}
                {data?.variants?.allVariants && data.variants.allVariants.length > 0 ? (
                  <VariantDisplay 
                    variants={data.variants.allVariants}
                    title="Ürün Varyantları"
                    showPricing={true}
                    showInventory={true}
                  />
                ) : (
                  <Card className="bg-gray-900/50 border-gray-700">
                    <CardContent className="p-4">
                      <div className="text-center py-4 text-gray-400">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Tek ürün - varyant bulunmuyor</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Alternative Simple Variant Display */}
                {data?.variants?.colors?.length > 0 || data?.variants?.sizes?.length > 0 ? (
                  <ProductVariants 
                    variants={{
                      color: data.variants.colors || [],
                      size: data.variants.sizes || [],
                      availableSizes: data.variants.sizes?.filter(size => 
                        data.variants.allVariants?.some(v => v.size === size && v.inStock)
                      ) || [],
                      unavailableSizes: data.variants.sizes?.filter(size => 
                        data.variants.allVariants?.some(v => v.size === size && !v.inStock)
                      ) || []
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}