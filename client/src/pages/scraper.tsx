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
  Clipboard
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import ProductAttributes from "@/components/ProductAttributes";
import ProductVariants from "@/components/ProductVariants";

// Uygulama sürüm numarası - Shopify seçenek değeri hatası düzeltmesi ile arttırıldı
const APP_VERSION = "0.13.1004";

const getCategoryConfig = (categories: string[] | undefined) => {
    if (!categories || categories.length === 0) {
        return { shopifyCategory: 'N/A' };
    }
    // Implement your logic to determine shopifyCategory based on categories here.
    // This is a placeholder, replace with your actual logic.
    return { shopifyCategory: categories[0] };
};


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
  const [categoryConfig, setCategoryConfig] = useState({ shopifyCategory: 'N/A' });

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

  const updateUrl = (url: string) => {
    form.setValue("url", url);
  };
  
  // Panodan URL yapıştırma fonksiyonu
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

  const getErrorSolution = (status?: number, details?: string) => {
    switch (status) {
      case 403:
        return "Birkaç dakika bekleyip tekrar deneyin veya farklı bir tarayıcı kullanın.";
      case 404:
        return "URL'nin doğru olduğundan emin olun ve ürünün hala satışta olup olmadığını kontrol edin.";
      case 429:
        return "Çok fazla istek yapıldı. Lütfen birkaç dakika bekleyip tekrar deneyin.";
      case 500:
        if (details?.includes('Firefox driver')) {
          return "Sistem yöneticinize başvurun veya farklı bir tarayıcı ile deneyin.";
        }
        return "Teknik bir hata oluştu. Lütfen daha sonra tekrar deneyin.";
      default:
        return "Sayfayı yenileyip tekrar deneyin veya farklı bir ürün URL'si ile tekrar deneyin.";
    }
  };

  const scrapeMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/scrape", { url });
      const data = await res.json();
      if (!res.ok) throw { ...data, status: res.status };
      return data;
    },
    onSuccess: (data) => {
      setProduct(data);
      setError(null);
      setCategoryConfig(getCategoryConfig(data.categories)); 
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

  const handleExportClick = () => {
    if (!product) {
      toast({
        title: "Hata",
        description: "Önce bir ürün çekmelisiniz",
        variant: "destructive"
      });
      return;
    }
    
    // CSV dosya yolu kontrolü
    if (!product.preview || !product.preview.csvPath) {
      toast({
        title: "Hata",
        description: "CSV dosyası bulunamadı",
        variant: "destructive"
      });
      return;
    }
    
    // CSV dışa aktarma isteği için URL oluştur
    toast({
      title: "Dışa aktarma başlatılıyor",
      description: "CSV dosyası hazırlanıyor..."
    });
    
    // CSV dosya adını al
    const fileName = `shopify_products_${Date.now()}.csv`;
    
    // Önizleme bilgileri response'ta mevcut
    const previewData = product.preview;
    
    toast({
      title: "CSV dosyası hazır",
      description: `${previewData.totalRows || 1} ürün satırı içeriyor`
    });
    
    // Güvenli CSV indirme - Shopify uyumlu
    const csvFileName = product.preview.filename || `shopify_products_${Date.now()}.csv`;
    const downloadUrl = `/api/download/${csvFileName}`;
    
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = csvFileName;
    downloadLink.target = '_blank';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };
  
  // Eski export mutation - bu artık kullanılmıyor ama referans için saklıyoruz
  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!product) {
        throw new Error("Önce bir ürün çekmelisiniz");
      }
      return new Blob([''], {type: 'text/csv'});
    },
    onSuccess: () => {
      // Artık bu fonksiyon doğrudan çağrılmıyor, handleExportClick kullanılıyor
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const onSubmit = form.handleSubmit((data) => {
    setError(null);
    scrapeMutation.mutate(data.url);
  });

  const getErrorIcon = (status?: number) => {
    switch (status) {
      case 403:
        return <XCircle className="h-5 w-5" />;
      case 404:
        return <AlertTriangle className="h-5 w-5" />;
      case 429:
        return <RefreshCcw className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
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

  return (
    <div className="min-h-screen bg-black text-white p-4">
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
              {/* Silme butonu */}
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
              
              {/* Yapıştır butonu */}
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-400">
                      {product.category ? product.category.replace(/>/g, "/") : "Ana Kategori"}
                    </div>
                    
                    <Button
                      onClick={handleExportClick}
                      disabled={exportMutation.isPending}
                      className="py-1 px-3 text-xs"
                    >
                      {exportMutation.isPending ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : null}
                      Shopify CSV'sine Aktar
                    </Button>
                  </div>

                  <div className="space-y-3 border-b border-gray-800 pb-4">
                    <h2 className="text-lg font-semibold">{product.title || "Ürün Başlığı"}</h2>
                    
                    {/* Marka Bilgisi */}
                    {product.brand && (
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        <span className="text-sm text-gray-300">Marka: {product.brand}</span>
                      </div>
                    )}
                    
                    {/* Fiyat Bilgisi */}
                    <div className="flex items-baseline gap-3">
                      <span className="text-xl font-bold text-primary">{product.price || "Fiyat bilgisi yok"}</span>
                      {product.basePrice && product.basePrice !== product.price && (
                        <span className="text-sm text-gray-400 line-through">{product.basePrice}</span>
                      )}
                    </div>

                    {/* Ürün Açıklaması */}
                    {product.description && (
                      <div className="bg-gray-900/50 p-3 rounded-md">
                        <h3 className="text-sm font-medium mb-2 text-primary">Ürün Açıklaması</h3>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {product.description.length > 200 
                            ? `${product.description.substring(0, 200)}...` 
                            : product.description
                          }
                        </p>
                      </div>
                    )}

                    {/* Kategori Bilgisi */}
                    {(product.category || product.categories) && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="text-sm text-gray-300">
                          Kategori: {product.category || (Array.isArray(product.categories) ? product.categories.join(' > ') : product.categories)}
                        </span>
                      </div>
                    )}
                    
                    {/* Derecelendirme */}
                    {product.productInfo?.rating && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <span key={i} className={`text-xs ${i < Math.floor(product.productInfo.rating.value) ? 'text-yellow-400' : 'text-gray-600'}`}>
                              ★
                            </span>
                          ))}
                        </div>
                        <span className="text-sm text-gray-300">
                          {product.productInfo.rating.value}/5 ({product.productInfo.rating.count} değerlendirme)
                        </span>
                      </div>
                    )}
                    
                    {/* Yorum Sayısı */}
                    {product.productInfo?.reviewCount > 0 && (
                      <div className="text-sm text-gray-400">
                        {product.productInfo.reviewCount} müşteri yorumu
                      </div>
                    )}
                    
                    {product.preview && product.preview.shopifyReady && (
                      <div className="mt-2 bg-green-900/30 p-2 rounded-md">
                        <span className="text-xs text-green-400">
                          ✓ Shopify CSV oluşturuldu ve dışa aktarıma hazır
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <ImageIcon className="w-4 h-4" />
                      <span>Ürün Görselleri ({(product.images)?.length || 0})</span>
                    </div>
                    <ScrollArea className="h-[250px] rounded-md border border-gray-800 p-4">
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                        {(product.images || [])
                          .filter((image: string) => {
                            if (!image) return false;
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
                          .slice(0, 10)
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
                              <div key={index} className="relative aspect-square group">
                                <img
                                  src={cleanedImage}
                                  alt={`${product.title} - Görsel ${index + 1}`}
                                  className="w-full h-full object-cover rounded-lg transition-transform group-hover:scale-105"
                                  loading="lazy"
                                  onError={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    
                                    // Hata olursa sırasıyla alternatif resim formatlarını dene
                                    const originalSrc = img.src;
                                    const loadStrategies = [
                                      // CDN URL'lerini düzelt
                                      () => {
                                        try {
                                          const urlObj = new URL(originalSrc);
                                          if (urlObj.pathname.startsWith('/ty')) {
                                            return `https://cdn.dsmcdn.com${urlObj.pathname}`;
                                          }
                                          return originalSrc;
                                        } catch {
                                          return originalSrc;
                                        }
                                      },
                                      // _org_zoom'u kaldır
                                      () => originalSrc.replace('_org_zoom', ''),
                                      // Farklı resim formatlarını dene
                                      () => originalSrc.replace(/\.(jpg|jpeg|png|webp)$/, '.jpg'),
                                      () => originalSrc.replace(/\.(jpg|jpeg|png|webp)$/, '.webp'),
                                      // Resize parametrelerini kaldır
                                      () => originalSrc.replace(/\/mnresize\/[^/]+\//, '/'),
                                    ];
                                  
                                    const tryNextStrategy = (strategyIndex = 0) => {
                                      if (strategyIndex >= loadStrategies.length) {
                                        console.warn(`Görsel yüklenemedi: ${originalSrc}`);
                                        img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2' fill='%23222'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E`;
                                        img.style.objectFit = 'contain';
                                        return;
                                      }
                                    
                                      const newSrc = loadStrategies[strategyIndex]();
                                      if (newSrc !== img.src) {
                                        img.onerror = () => tryNextStrategy(strategyIndex + 1);
                                        img.src = newSrc;
                                      } else {
                                        tryNextStrategy(strategyIndex + 1);
                                      }
                                    };
                                    
                                    tryNextStrategy();
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                  <a
                                    href={cleanedImage}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white text-xs hover:underline"
                                  >
                                    Orijinal Görsel
                                  </a>
                                </div>
                                <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                                  {index + 1}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </ScrollArea>
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

                    {/* Product Variants Summary */}
                    {product.variants && (
                      <div className="grid grid-cols-2 gap-3">
                        {product.variants.colors && product.variants.colors.length > 0 && (
                          <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-800">
                            <div className="text-blue-400 text-sm font-medium mb-2">
                              Renkler ({product.variants.colors.length})
                            </div>
                            <div className="text-blue-300 text-xs">
                              {product.variants.colors.slice(0, 3).join(', ')}
                              {product.variants.colors.length > 3 && ` +${product.variants.colors.length - 3} daha`}
                            </div>
                          </div>
                        )}
                        
                        {product.variants.sizes && product.variants.sizes.length > 0 && (
                          <div className="bg-purple-900/20 p-3 rounded-lg border border-purple-800">
                            <div className="text-purple-400 text-sm font-medium mb-2">
                              Bedenler ({product.variants.sizes.length})
                            </div>
                            <div className="text-purple-300 text-xs">
                              {product.variants.sizes.slice(0, 4).join(', ')}
                              {product.variants.sizes.length > 4 && ` +${product.variants.sizes.length - 4} daha`}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Product Attributes Summary */}
                    {product.attributes && Object.keys(product.attributes).length > 0 && (
                      <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                        <div className="text-gray-300 text-sm font-medium mb-2">
                          Ürün Özellikleri ({Object.keys(product.attributes).length})
                        </div>
                        <div className="space-y-1">
                          {Object.entries(product.attributes).slice(0, 3).map(([key, value]: [string, any]) => (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-gray-400">{key}:</span>
                              <span className="text-gray-300">{value}</span>
                            </div>
                          ))}
                          {Object.keys(product.attributes).length > 3 && (
                            <div className="text-xs text-gray-500">
                              +{Object.keys(product.attributes).length - 3} özellik daha
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Categories and Tags */}
                    <div className="grid grid-cols-1 gap-3">
                      {product.categories && product.categories.length > 0 && (
                        <div className="bg-orange-900/20 p-3 rounded-lg border border-orange-800">
                          <div className="text-orange-400 text-sm font-medium mb-2">Kategoriler</div>
                          <div className="text-orange-300 text-xs">
                            {Array.isArray(product.categories) 
                              ? product.categories.join(' > ') 
                              : product.categories}
                          </div>
                        </div>
                      )}

                      {product.tags && product.tags.length > 0 && (
                        <div className="bg-yellow-900/20 p-3 rounded-lg border border-yellow-800">
                          <div className="text-yellow-400 text-sm font-medium mb-2">
                            Etiketler ({product.tags.length})
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {product.tags.slice(0, 5).map((tag: string, index: number) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-yellow-900/30 text-yellow-300 text-xs rounded"
                              >
                                #{tag}
                              </span>
                            ))}
                            {product.tags.length > 5 && (
                              <span className="text-yellow-500 text-xs">+{product.tags.length - 5} daha</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

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

                  <div className="space-y-2">
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="features" className="border-gray-800">
                        <AccordionTrigger className="text-sm hover:no-underline py-3">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-primary" />
                            <span className="font-medium">Ürün Özellikleri</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="bg-gray-900/50 rounded-lg p-4 space-y-3">
                            {product.productInfo?.attributes && Object.keys(product.productInfo.attributes).length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(product.productInfo.attributes).map(([key, value], index) => (
                                  <div key={index} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                                    <span className="text-sm font-medium text-gray-300">{key}:</span>
                                    <span className="text-sm text-white">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : product.attributes && Object.keys(product.attributes).length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(product.attributes).map(([key, value], index) => (
                                  <div key={index} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                                    <span className="text-sm font-medium text-gray-300">{key}:</span>
                                    <span className="text-sm text-white">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400">Ürün özelliği bulunamadı</div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="variants" className="border-gray-800">
                        <AccordionTrigger className="text-sm hover:no-underline py-3">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-primary" />
                            <span className="font-medium">Varyant Seçenekleri</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="bg-gray-900/50 rounded-lg p-4 space-y-4">
                            {/* Variant kombinasyonları direkt olarak göster */}
                            {product.variants && typeof product.variants === 'string' && (
                              <div>
                                <h3 className="text-sm font-medium mb-2 text-primary">Ekstraktlanan Varyantlar</h3>
                                <div className="text-xs text-gray-400 bg-gray-800 p-3 rounded-md font-mono max-h-40 overflow-y-auto">
                                  {product.variants}
                                </div>
                              </div>
                            )}

                            {/* JSON format varyantları parse et ve göster */}
                            {product.variants && typeof product.variants === 'object' && (
                              <div className="space-y-3">
                                {/* Renk Seçenekleri */}
                                {product.variants.colors && product.variants.colors.length > 0 && (
                                  <div>
                                    <h3 className="text-sm font-medium mb-2 text-primary">Renk Seçenekleri ({product.variants.colors.length})</h3>
                                    <div className="flex flex-wrap gap-2">
                                      {product.variants.colors.map((color: string, index: number) => (
                                        <span
                                          key={index}
                                          className="px-3 py-1 bg-gray-800 rounded-full text-xs hover:bg-gray-700 transition-colors border border-gray-700"
                                        >
                                          {color}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Beden Seçenekleri */}
                                {product.variants.sizes && product.variants.sizes.length > 0 && (
                                  <div>
                                    <h3 className="text-sm font-medium mb-2 text-primary">Beden Seçenekleri ({product.variants.sizes.length})</h3>
                                    <div className="flex flex-wrap gap-2">
                                      {product.variants.sizes.map((size: string, index: number) => (
                                        <span
                                          key={index}
                                          className="px-3 py-1 bg-gray-800 rounded-full text-xs hover:bg-gray-700 transition-colors border border-gray-700"
                                        >
                                          {size}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* CSV için oluşturulan toplam kombinasyon sayısı */}
                                {product.preview && product.preview.totalRows && (
                                  <div className="bg-green-900/30 p-3 rounded-md">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                      <span className="text-sm text-green-400 font-medium">
                                        {product.preview.totalRows - 1} renk-beden kombinasyonu CSV'ye aktarıldı
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Öncelikle stokta olan bedenleri göster */}
                            {product.variants?.availableSizes?.length > 0 && (
                              <div>
                                <h3 className="text-sm font-medium mb-2">
                                  {product.categories?.some((cat: string) =>
                                    cat.toLowerCase().includes('ayakkabı') ||
                                    cat.toLowerCase().includes('bot') ||
                                    cat.toLowerCase().includes('çizme')
                                  ) ? 'Stokta Olan Numara Seçenekleri' : 'Stokta Olan Beden Seçenekleri'}
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                  {product.variants.availableSizes.map((size: string, index: number) => (
                                    <span
                                      key={index}
                                      className="w-12 h-12 flex items-center justify-center bg-green-800 rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
                                    >
                                      {size}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Yeni ProductVariants bileşeni ile stok durumu görselleştirme */}
                            {product.variants && (
                              <div className="mt-4">
                                <ProductVariants 
                                  variants={{
                                    size: product.variants.size,
                                    color: product.variants.color,
                                    availableSizes: product.variants.availableSizes,
                                    unavailableSizes: product.variants.unavailableSizes
                                  }} 
                                />
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="csv-preview" className="border-gray-800">
                        <AccordionTrigger className="text-sm hover:no-underline py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="font-medium">CSV Önizleme</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="bg-gray-900/50 rounded-lg p-4 overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-700">
                                  <th className="text-left p-2">Handle</th>
                                  <th className="text-left p-2">Title</th>
                                  <th className="text-left p-2">Description</th>
                                  <th className="text-left p-2">Vendor</th>
                                  <th className="text-left p-2">Price</th>
                                  <th className="text-left p-2">Images</th>
                                  <th className="text-left p-2">Shopify Category</th>
                                  <th className="text-left p-2">Kaynak Kategori</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="p-2">{product?.title?.toLowerCase().replace(/\s+/g, '-')}</td>
                                  <td className="p-2">{product?.title}</td>
                                  <td className="p-2">{product?.description || '-'}</td>
                                  <td className="p-2">turmarkt</td>
                                  <td className="p-2">{product?.price} TL</td>
                                  <td className="p-2">
                                    {product?.images?.length || 0} görsel
                                    <div className="text-xs text-gray-500">
                                      {product?.images?.slice(0, 3).map((url: string, index: number) => (
                                        <div key={index} className="truncate max-w-[200px] hover:text-white transition-colors">
                                          {url}
                                        </div>
                                      ))}
                                      {product?.images?.length > 3 && (
                                        <div className="text-gray-400">+{product.images.length - 3} daha fazla...</div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-2">{categoryConfig.shopifyCategory}</td>
                                  <td className="p-2">
                                    <div className="text-xs">
                                      {product.fullCategoryPath ? 
                                        product.fullCategoryPath.join(' > ') : 
                                        product.categories?.join(' > ')}
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                  <div className="mt-2 px-3 py-2 text-xs bg-gray-800/50 rounded-md space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-3 w-3 text-primary" />
                      <span className="text-gray-400">Kaynak Kategori:</span>
                    </div>
                    <div className="font-medium text-xs">
                      {product.fullCategoryPath ? 
                        product.fullCategoryPath.join(' > ') : 
                        product.categories?.join(' > ')}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
                      <Package className="h-3 w-3 text-primary" />
                      <span className="text-gray-400">Shopify Kategori:</span>
                    </div>
                    <div className="font-medium">{categoryConfig.shopifyCategory}</div>
                    
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-700 mt-2">
                      <Package className="h-3 w-3 text-primary" />
                      <span className="text-gray-400">Oluşturulan Etiketler:</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.isArray(product.tags) ? 
                        product.tags.map((tag: string, idx: number) => {
                          // Özel kategori formatını algıla
                          const isCategory = tag.startsWith('_');
                          const isSubcategory = tag.includes(' ) ');
                          const isAttributeTag = tag.startsWith('@');
                          const isLegacyTag = tag.startsWith('#');
                          const isShopifyCategory = tag.startsWith('$');
                          
                          // Etiket stilini belirle
                          let tagClass = "text-xs px-2 py-1 rounded-full mr-1 mb-1 inline-block";
                          
                          if (isCategory && !isSubcategory) {
                            tagClass += " bg-blue-700"; // Ana kategori (mavi)
                          } else if (isCategory && isSubcategory) {
                            tagClass += " bg-green-700"; // Alt kategori (yeşil)
                          } else if (isShopifyCategory) {
                            tagClass += " bg-pink-700"; // Shopify kategori (pembe)
                          } else if (isAttributeTag) {
                            tagClass += " bg-amber-700"; // Özellik etiketi (turuncu/amber)
                          } else if (isLegacyTag) {
                            tagClass += " bg-purple-700"; // Otomatik etiket (mor)
                          } else {
                            tagClass += " bg-gray-800"; // Normal etiket
                          }
                          
                          return (
                            <span 
                              key={idx} 
                              className={tagClass}
                              title={
                                isCategory 
                                  ? (isSubcategory ? "Alt Kategori" : "Ana Kategori") 
                                  : isAttributeTag 
                                    ? "Ürün Özelliği" 
                                    : isLegacyTag 
                                      ? "Otomatik Etiket" 
                                      : "Etiket"
                              }
                            >
                              {tag}
                            </span>
                          );
                        }) : 
                        <span className="text-xs text-gray-500">Etiket oluşturulmadı</span>
                      }
                    </div>
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