import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { urlSchema } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Loader2,
  Package,
  ArrowRight,
  FileText,
  AlertTriangle,
  XCircle,
  AlertCircle,
  RefreshCcw,
  Image as ImageIcon,
  Clipboard,
  Download
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

// Platform logo configuration
const PlatformLogos = {
  trendyol: {
    name: "Trendyol",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-red-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">T</span>
        </div>
        <span className="text-2xl font-bold text-red-500">Trendyol</span>
      </div>
    ),
    color: "red",
    domain: "trendyol.com"
  },
  hepsiburada: {
    name: "Hepsiburada",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">H</span>
        </div>
        <span className="text-2xl font-bold text-orange-500">Hepsiburada</span>
      </div>
    ),
    color: "orange",
    domain: "hepsiburada.com"
  },
  amazon: {
    name: "Amazon",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">A</span>
        </div>
        <span className="text-2xl font-bold text-yellow-500">Amazon</span>
      </div>
    ),
    color: "yellow",
    domain: "amazon.com.tr"
  },
  n11: {
    name: "N11",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">N</span>
        </div>
        <span className="text-2xl font-bold text-purple-500">N11</span>
      </div>
    ),
    color: "purple",
    domain: "n11.com"
  }
};

interface ScraperPageProps {
  platform?: string;
}

function ScraperPage({ platform = 'trendyol' }: ScraperPageProps) {
  const [product, setProduct] = useState<any>(null);
  const [error, setError] = useState<{
    message: string;
    status?: number;
    details?: string;
    solution?: string;
  } | null>(null);

  const { toast } = useToast();
  
  // Get current platform configuration
  const currentPlatform = PlatformLogos[platform as keyof typeof PlatformLogos] || PlatformLogos.trendyol;

  const form = useForm({
    resolver: zodResolver(urlSchema),
    defaultValues: {
      url: ""
    }
  });

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (type === "change" && name === "url") {
        setError(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch]);
  
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        form.setValue("url", text);
        toast({
          title: "URL yapıştırıldı",
          description: "Panodaki URL başarıyla yapıştırıldı"
        });
      }
    } catch (error) {
      toast({
        title: "Yapıştırma hatası",
        description: "Panodaki veri alınamadı. Tarayıcı izinlerini kontrol edin.",
        variant: "destructive"
      });
    }
  };

  const scrapeMutation = useMutation({
    mutationFn: async (data: { url: string }) => {
      const response = await apiRequest("POST", "/api/scrape", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw {
          message: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
          details: errorData.details || "Sunucu yanıt vermedi"
        };
      }
      return response.json();
    },
    onSuccess: (data) => {
      setProduct(data);
      setError(null);
      toast({
        title: "Başarılı",
        description: "Ürün verileri başarıyla çekildi"
      });
    },
    onError: (error: any) => {
      setError({
        message: error.message,
        status: error.status,
        details: error.details,
        solution: getErrorSolution(error.status, error.details)
      });
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const onSubmit = form.handleSubmit((data) => {
    scrapeMutation.mutate(data);
  });

  const getErrorSolution = (status?: number, details?: string) => {
    switch (status) {
      case 403:
        return "VPN kullanmayı deneyin veya farklı bir ağdan bağlanın";
      case 404:
        return "URL'yi kontrol edin, ürün mevcut değil olabilir";
      case 429:
        return "Birkaç dakika bekleyin ve tekrar deneyin";
      case 500:
        return "Sistem yeniden başlatılıyor, lütfen bekleyin";
      default:
        return "URL formatını kontrol edin ve tekrar deneyin";
    }
  };

  const getErrorIcon = (status?: number) => {
    switch (status) {
      case 403:
        return <AlertTriangle className="h-4 w-4" />;
      case 404:
        return <XCircle className="h-4 w-4" />;
      case 429:
        return <RefreshCcw className="h-4 w-4" />;
      case 500:
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getErrorTitle = (status?: number) => {
    switch (status) {
      case 403:
        return "Erişim Engellendi";
      case 404:
        return "Ürün Bulunamadı";
      case 429:
        return "İstek Limiti Aşıldı";
      case 500:
        return "Sistem Hatası";
      default:
        return "Hata Oluştu";
    }
  };

  const downloadCSV = async () => {
    if (!product?.preview?.csvPath) {
      toast({
        title: "CSV bulunamadı",
        description: "Önce bir ürün verisi çekin",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch(`/api/download-csv?path=${encodeURIComponent(product.preview.csvPath)}`);
      if (!response.ok) throw new Error('CSV indirilemedi');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${product.brand || 'urun'}-shopify-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "CSV indirildi",
        description: `${product.preview.totalRows} satır Shopify formatında`
      });
    } catch (error) {
      toast({
        title: "İndirme hatası",
        description: "CSV dosyası indirilemedi",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 relative">
      {/* CSV Export Button - Top Right */}
      {product && (
        <div className="fixed top-4 right-4 z-50">
          <Button
            onClick={downloadCSV}
            className="bg-green-600 hover:bg-green-700 text-white shadow-lg"
            size="sm"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV İndir
          </Button>
        </div>
      )}
      
      <div className="max-w-2xl mx-auto space-y-6">
        <motion.div
          initial={false}
          animate={product ? { y: -20, scale: 0.95, opacity: 0.8 } : { y: 0, scale: 1, opacity: 1 }}
          className="transition-all duration-500"
        >
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              {currentPlatform.logo}
            </div>
            <h1 className="text-2xl font-bold mb-2">Ürün Aktarıcı</h1>
            <p className="text-sm text-gray-400">
              {currentPlatform.name} ürün verilerini Shopify'a uyumlu formata dönüştürün
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {currentPlatform.domain} için optimize edilmiştir
            </p>
            <p className="text-xs text-gray-500 mt-1">ERDEM ÇALIŞGAN tarafından geliştirilmiştir</p>
            <p className="text-xs text-gray-600 mt-1">Versiyon 0.13.1006</p>
          </div>

          {error && (
            <div className="mb-4">
              <Alert variant="destructive">
                {getErrorIcon(error.status)}
                <AlertTitle>{getErrorTitle(error.status)}</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  <p>{error.message}</p>
                  {error.solution && (
                    <p className="text-sm mt-2 p-2 bg-red-900/50 rounded-md">
                      <strong>Çözüm önerisi:</strong> {error.solution}
                    </p>
                  )}
                  {error.details && (
                    <p className="text-xs mt-1 text-gray-400">
                      Teknik detay: {error.details}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="relative">
              {form.watch("url") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-1 top-1/2 transform -translate-y-1/2 h-7 w-7 z-10 bg-[#0f3e6c] hover:bg-[#1a4d7c] text-white border-none"
                  onClick={() => form.setValue("url", "")}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              )}
              
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-[40px] top-1/2 transform -translate-y-1/2 h-7 w-7 z-10 bg-[#0f3e6c] hover:bg-[#1a4d7c] text-white border-none"
                onClick={handlePaste}
              >
                <Clipboard className="h-3.5 w-3.5" />
              </Button>
              <Input
                placeholder="Ürün URL'sini girin..."
                {...form.register("url")}
                className={`text-xs p-4 bg-gray-900 border-gray-800 rounded-lg w-full truncate pr-12 pl-[80px]`}
              />
              <Button
                type="submit"
                className="absolute right-2 top-1/2 transform -translate-y-1/2"
                disabled={scrapeMutation.isPending}
              >
                {scrapeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
              </Button>
            </div>
          </form>
        </motion.div>

        <AnimatePresence>
          {product && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="p-6">
                  {/* Product Brand and Title Header */}
                  <div className="mb-6 text-center border-b border-gray-800 pb-4">
                    <div className="text-lg font-bold text-blue-400 mb-2">
                      {product.brand?.toUpperCase() || 'MARKA'}
                    </div>
                    <h2 className="text-xl font-semibold text-white leading-tight">
                      {product.title}
                    </h2>
                    <div className="text-sm text-gray-400 mt-2">
                      Ürün kodu: {product.url?.split('-p-')[1]?.split('?')[0] || 'N/A'}
                    </div>
                  </div>

                  {/* Enhanced Product Images Gallery */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium text-gray-200">Ürün Görselleri</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                          {product.images?.length || 0} adet
                        </span>
                        <span className="text-xs text-green-500 bg-green-900/20 px-2 py-1 rounded border border-green-800">
                          Yüksek Kalite
                        </span>
                      </div>
                    </div>
                    
                    {/* Enhanced Main Image Display */}
                    {product.images && product.images.length > 0 && (
                      <div className="bg-gray-900 rounded-lg p-3">
                        <div className="aspect-square w-full max-w-lg mx-auto mb-4 relative group">
                          <img
                            id="mainProductImage"
                            src={product.images[0]}
                            alt={`${product.brand} ${product.title} - Ana görsel`}
                            className="w-full h-full object-cover rounded-lg shadow-lg border-2 border-gray-700 group-hover:border-blue-500 transition-all duration-300"
                            loading="lazy"
                          />
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                            Ana Görsel
                          </div>
                          <div className="absolute top-2 right-2 bg-blue-600/80 text-white text-xs px-2 py-1 rounded-full">
                            {product.images.length} Görsel
                          </div>
                        </div>
                        
                        {/* Enhanced All Images Grid Gallery */}
                        <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-700">
                          <div className="flex items-center justify-between mb-4">
                            <h5 className="text-sm font-medium text-gray-200">
                              Tüm Ürün Görselleri
                            </h5>
                            <div className="flex items-center gap-2">
                              <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded border border-blue-600">
                                {product.images?.length || 0} Adet
                              </span>
                              <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded border border-green-600">
                                HD Kalite
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {product.images
                              .filter((image: string) => {
                                const isValidImage = 
                                  /\.(jpg|jpeg|png|webp|gif)($|\?)/.test(image.toLowerCase()) || 
                                  /(cdn\.trendyol\.com|cdn\.dsmcdn\.com).*\/(product\/media|products)/.test(image);
                                const isInvalidFile = 
                                  /\.(css|js|html|php)($|\?)/.test(image.toLowerCase()) ||
                                  image.includes('sizechart') ||
                                  image.includes('main.') ||
                                  image.includes('spacer.gif') ||
                                  image.includes('badge') ||
                                  image.includes('icon') ||
                                  image.includes('logo');
                                return isValidImage && !isInvalidFile;
                              })
                              .map((image: string, index: number) => {
                                let cleanedImage = image;
                                if (cleanedImage.includes('#')) {
                                  cleanedImage = cleanedImage.split('#')[0];
                                }
                                if (cleanedImage.includes('?')) {
                                  cleanedImage = cleanedImage.split('?')[0];
                                }
                                
                                if (cleanedImage.startsWith('/ty')) {
                                  cleanedImage = `https://cdn.dsmcdn.com${cleanedImage}`;
                                }
                                
                                return (
                                  <div key={index} className="relative aspect-square group cursor-pointer">
                                    <img
                                      src={cleanedImage}
                                      alt={`${product.brand} ${product.title} - Görsel ${index + 1}`}
                                      className="w-full h-full object-cover rounded-lg border-2 border-gray-600 hover:border-blue-400 group-hover:scale-105 transition-all duration-300"
                                      loading="lazy"
                                      onClick={() => {
                                        // Update main image with smooth transition
                                        const mainImg = document.getElementById('mainProductImage') as HTMLImageElement;
                                        if (mainImg) {
                                          mainImg.style.opacity = '0.5';
                                          setTimeout(() => {
                                            mainImg.src = cleanedImage;
                                            mainImg.style.opacity = '1';
                                          }, 150);
                                        }
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 rounded-lg"></div>
                                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-2 py-1 rounded-full">
                                      {index + 1}
                                    </div>
                                    {index === 0 && (
                                      <div className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-medium">
                                        Ana
                                      </div>
                                    )}
                                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                      <div className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                        Büyüt
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                          <div className="text-xs text-gray-400 mt-3 p-2 bg-gray-900/50 rounded text-center border border-gray-700">
                            💡 Görsellere tıklayarak ana görseli değiştirebilirsiniz
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Comprehensive Data Preview */}
                  <div className="space-y-4 border-t border-gray-800 pt-4">
                    <h3 className="text-lg font-semibold text-gray-200">Veri Önizleme</h3>
                    
                    {/* Price with Profit Margin */}
                    <div className="bg-green-900/20 p-3 rounded-lg border border-green-800">
                      <div className="flex items-center justify-between">
                        <span className="text-green-400 font-medium">Satış Fiyatı</span>
                        <span className="text-lg font-bold text-green-300">{product.price}</span>
                      </div>
                      <div className="text-xs text-green-500 mt-1">10% kar marjı dahil</div>
                    </div>

                    {/* Enhanced Product Variants with Pricing */}
                    {product.variants && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-200">Varyant Bilgileri</h3>
                        
                        <div className="grid grid-cols-1 gap-3">
                          {/* Colors with Pricing */}
                          {product.variants.colors && product.variants.colors.length > 0 && (
                            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800">
                              <div className="text-blue-400 text-sm font-medium mb-3">
                                Renk Seçenekleri ({product.variants.colors.length})
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {product.variants.colors.map((color: string, index: number) => (
                                  <div key={index} className="bg-blue-900/30 p-2 rounded border border-blue-700">
                                    <div className="text-blue-300 text-xs font-medium">{color}</div>
                                    {product.variants.pricing && product.variants.pricing[color] && (
                                      <div className="text-green-400 text-xs mt-1">
                                        {(product.variants.pricing[color] * 1.10).toFixed(2)} TL
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Sizes with Pricing */}
                          {product.variants.sizes && product.variants.sizes.length > 0 && (
                            <div className="bg-purple-900/20 p-4 rounded-lg border border-purple-800">
                              <div className="text-purple-400 text-sm font-medium mb-3">
                                Beden Seçenekleri ({product.variants.sizes.length})
                              </div>
                              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                                {product.variants.sizes.map((size: string, index: number) => (
                                  <div key={index} className="bg-purple-900/30 p-2 rounded border border-purple-700 text-center">
                                    <div className="text-purple-300 text-xs font-medium">{size}</div>
                                    {product.variants.pricing && product.variants.pricing[size] && (
                                      <div className="text-green-400 text-xs mt-1">
                                        {(product.variants.pricing[size] * 1.10).toFixed(2)} TL
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Enhanced Advanced Tagging System */}
                    {product.tags && product.tags.length > 0 && (
                      <div className="bg-yellow-900/20 p-4 rounded-lg border border-yellow-800">
                        <div className="text-yellow-400 text-sm font-medium mb-3">
                          Akıllı Etiket Sistemi ({product.tags.length})
                        </div>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {product.tags.slice(0, 8).map((tag: string, index: number) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-yellow-900/30 text-yellow-300 text-xs rounded border border-yellow-700 hover:bg-yellow-800/30 transition-colors"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                          {product.tags.length > 8 && (
                            <div className="text-yellow-500 text-xs">
                              +{product.tags.length - 8} ek kategorizasyon etiketi
                            </div>
                          )}
                          <div className="text-yellow-600 text-xs mt-2 p-2 bg-yellow-900/20 rounded">
                            Bu etiketler ürünün kategorize edilmesi ve aranabilirliğini artırmak için otomatik oluşturulmuştur
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CSV Export Status */}
                    {product.preview && (
                      <div className="bg-green-900/20 p-3 rounded-lg border border-green-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-green-400 font-medium">CSV Dosyası</span>
                          <span className="text-green-300 text-sm">{product.preview.totalRows} satır</span>
                        </div>
                        <div className="text-green-500 text-xs">
                          {product.preview.shopifyReady ? 'Shopify uyumlu format' : 'Standart format'}
                        </div>
                        {product.preview.note && (
                          <div className="text-green-600 text-xs mt-2 p-2 bg-green-900/30 rounded">
                            {product.preview.note}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ScraperPage;