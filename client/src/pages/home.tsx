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


export default function Home() {
  const [product, setProduct] = useState<any>(null);
  const [error, setError] = useState<{
    message: string;
    status?: number;
    details?: string;
    solution?: string;
  } | null>(null);
  const [categoryConfig, setCategoryConfig] = useState({ shopifyCategory: 'N/A' });

  const { toast } = useToast();

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
    const csvFilename = product.preview.csvPath.split('/').pop();
    
    // Önce önizleme yap
    fetch(`/api/csv-preview/${csvFilename}`)
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('CSV önizleme başarısız oldu');
      })
      .then(previewData => {
        toast({
          title: "CSV dosyası hazır",
          description: `${previewData.totalRows} ürün satırı içeriyor`
        });
        
        // Dosya indirme
        const downloadLink = document.createElement('a');
        downloadLink.href = product.preview.csvPath; // Doğrudan dosya yolunu kullan
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      })
      .catch(error => {
        console.error('CSV önizleme hatası:', error);
        toast({
          title: "CSV önizleme hatası",
          description: error.message || "CSV dosyası oluşturulamadı",
          variant: "destructive"
        });
      });
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
            <Package className="w-10 h-10 mx-auto mb-3 text-primary" />
            <h1 className="text-2xl font-bold mb-2">Ürün Aktarıcı</h1>
            <p className="text-sm text-gray-400">Ürün verilerini Shopify'a uyumlu formata dönüştürün</p>
            <p className="text-xs text-gray-500 mt-2">ERDEM ÇALIŞGAN tarafından geliştirilmiştir</p>
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
                    <h2 className="text-lg font-semibold">{product.title}</h2>
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-bold">{product.price} TL</span>
                    </div>
                    
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
                      <span>Ürün Görselleri ({product.images.length})</span>
                    </div>
                    <ScrollArea className="h-[250px] rounded-md border border-gray-800 p-4">
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                        {product.images
                          .filter((image: string) => {
                            if (!image) return false;
                            
                            // Sadece resim uzantılarını filtrele (css, js vs. hariç)
                            const isValidImage = 
                              /\.(jpg|jpeg|png|webp|gif)($|\?)/.test(image.toLowerCase()) || 
                              /(cdn\.trendyol\.com|cdn\.dsmcdn\.com).*\/(product\/media|products)/.test(image);

                            // CSS, JS ve HTML dosyalarını filtrele
                            const isInvalidFile = 
                              /\.(css|js|html|php)($|\?)/.test(image.toLowerCase()) ||
                              image.includes('sizechart') ||
                              image.includes('main.') ||
                              image.includes('spacer.gif');
                              
                            // ÜRÜNLE İLGİSİZ GÖRSELLERİ FİLTRELE
                            const isIconOrBadge = 
                              image.includes('badge') ||
                              image.includes('icon') ||
                              image.includes('logo') ||
                              image.includes('tick') ||
                              image.includes('check') ||
                              image.includes('marker') ||
                              image.includes('button') ||
                              image.includes('hizli-') ||
                              /[0-9]+(x|X)[0-9]+/.test(image) || // Boyut bilgisi içeren küçük görüntüler
                              image.includes('svg') ||
                              // LOGO VE MARKA GÖRSELLER
                              image.includes('loreal') ||
                              image.includes('oreal') ||
                              image.includes('paris') ||
                              image.includes('kozmetik') ||
                              image.includes('fenerli') ||
                              // Leke ve ticari metin içeren fotoğrafları kaldır
                              image.includes('text') ||
                              image.includes('title') ||
                              image.includes('label');
                            
                            return isValidImage && !isInvalidFile && !isIconOrBadge;
                          })
                          // Maksimum 10 görsel ile sınırla
                          .slice(0, 10)
                          .map((image: string, index: number) => {
                            // URL'i temizle ve düzelt
                            let cleanedImage = image;
                            
                            // URL'deki # işaretlerini temizle
                            if (cleanedImage.includes('#')) {
                              cleanedImage = cleanedImage.split('#')[0];
                            }
                            
                            // URL'deki ? işaretlerini temizle
                            if (cleanedImage.includes('?')) {
                              cleanedImage = cleanedImage.split('?')[0];
                            }
                            
                            // CDN URL'leri düzelt
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
                          <ProductAttributes attributes={product.attributes} />
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
                          <div className="bg-gray-900/50 rounded-lg p-4">
                            {product.variants?.colors?.length > 0 && (
                              <div className="mb-4">
                                <h3 className="text-sm font-medium mb-2">Renk Seçenekleri</h3>
                                <div className="flex flex-wrap gap-2">
                                  {product.variants.colors.map((color: string, index: number) => (
                                    <span
                                      key={index}
                                      className="px-3 py-1 bg-gray-800 rounded-full text-xs hover:bg-gray-700 transition-colors"
                                    >
                                      {color}
                                    </span>
                                  ))}
                                </div>
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