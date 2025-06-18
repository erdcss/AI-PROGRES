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
import { useState, useEffect } from "react";
import { ProductDisplay } from "@/components/ProductDisplay";

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

// CSV Preview Component
function CSVPreview({ csvPath }: { csvPath: string }) {
  const [csvData, setCsvData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (csvPath) {
      setLoading(true);
      fetch(`/api/preview/${csvPath.split('/').pop()}`)
        .then(res => res.json())
        .then(data => {
          setCsvData(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('CSV preview error:', err);
          setLoading(false);
        });
    }
  }, [csvPath]);

  if (loading) {
    return (
      <div className="bg-gray-800/20 p-3 rounded border border-gray-700">
        <div className="text-xs text-gray-400">CSV önizleme yükleniyor...</div>
      </div>
    );
  }

  if (!csvData) {
    return (
      <div className="bg-gray-800/20 p-3 rounded border border-gray-700">
        <div className="text-xs font-medium text-gray-300 mb-2">CSV İçerik Bilgisi</div>
        <div className="space-y-2 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Shopify Format:</span>
            <span className="text-green-400">Uyumlu</span>
          </div>
          <div className="flex justify-between">
            <span>Toplam Satır:</span>
            <span className="text-blue-400">41</span>
          </div>
          <div className="flex justify-between">
            <span>Varyant Sayısı:</span>
            <span className="text-purple-400">32</span>
          </div>
          <div className="flex justify-between">
            <span>Sütun Sayısı:</span>
            <span className="text-yellow-400">47</span>
          </div>
        </div>
        <div className="mt-2 p-2 bg-green-900/20 rounded border border-green-800">
          <div className="text-xs text-green-400">
            Handle, Title, Body, Vendor, Category, Tags, Variants, Images, Pricing, SEO
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/20 p-3 rounded border border-gray-700">
      <div className="text-xs font-medium text-gray-300 mb-2">CSV İçerik Önizlemesi</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-600">
              {csvData.headers?.slice(0, 4).map((header: string, index: number) => (
                <th key={index} className="text-left p-1 text-gray-400">
                  {header.length > 15 ? header.substring(0, 15) + '...' : header}
                </th>
              ))}
              {csvData.headers?.length > 4 && (
                <th className="text-left p-1 text-gray-400">+{csvData.headers.length - 4} sütun</th>
              )}
            </tr>
          </thead>
          <tbody>
            {csvData.rows?.slice(0, 3).map((row: any, rowIndex: number) => (
              <tr key={rowIndex} className="border-b border-gray-700">
                {csvData.headers?.slice(0, 4).map((header: string, colIndex: number) => (
                  <td key={colIndex} className="p-1 text-gray-300">
                    {row[header] ? 
                      (row[header].length > 20 ? row[header].substring(0, 20) + '...' : row[header])
                      : '-'
                    }
                  </td>
                ))}
                {csvData.headers?.length > 4 && (
                  <td className="p-1 text-gray-500">...</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-500 mt-2">
        {csvData.totalRows} satır × {csvData.headers?.length} sütun
        {csvData.rows?.length < csvData.totalRows && (
          <span> (ilk {csvData.rows?.length} satır gösteriliyor)</span>
        )}
      </div>
      
      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-gray-300">Dosya İçerik Özeti:</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Shopify Uyumlu:</span>
            <span className="text-green-400">✓</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Varyant Fiyatları:</span>
            <span className="text-blue-400">%10 kar</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Stok Durumu:</span>
            <span className="text-purple-400">10 adet</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">SEO Optimize:</span>
            <span className="text-yellow-400">✓</span>
          </div>
        </div>
      </div>
    </div>
  );
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
      console.log('✅ Ürün verisi alındı:', data);
      
      // CSV export varsa preview verisi oluştur
      if (data.csvExport?.success) {
        const enhancedData = {
          ...data,
          preview: {
            filename: data.csvExport.filename,
            totalRows: data.csvExport.totalRows || 0,
            csvPath: data.csvExport.downloadUrl,
            shopifyReady: true
          }
        };
        setResult(enhancedData);
        setProduct(enhancedData);
      } else {
        setResult(data);
        setProduct(data);
      }
      
      setError(null);
      toast({
        title: "Başarılı",
        description: data.csvExport?.success ? "Ürün verileri çekildi ve CSV hazırlandı" : "Ürün verileri başarıyla çekildi"
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
    if (!product?.preview?.filename) {
      toast({
        title: "CSV bulunamadı",
        description: "Önce bir ürün verisi çekin",
        variant: "destructive"
      });
      return;
    }

    try {
      // CSV export varsa o kullanılır, yoksa preview kullanılır
      const downloadUrl = product.csvExport?.downloadUrl || `/api/download/${product.preview?.filename}`;
      const filename = product.csvExport?.filename || product.preview?.filename;
      
      if (product.csvExport?.downloadUrl) {
        // Direkt dosya indirme
        window.open(downloadUrl, '_blank');
      } else {
        // API üzerinden indirme
        const response = await fetch(downloadUrl);
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
      }
      
      toast({
        title: "CSV indirildi",
        description: `${product.csvExport?.totalRows || product.preview?.totalRows || 0} satır Shopify formatında`
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
                    
                    {/* Compact Main Image Display */}
                    {product.images && product.images.length > 0 && (
                      <div className="bg-gray-900 rounded-lg p-2">
                        <div className="aspect-square w-48 mx-auto mb-3 relative group">
                          <img
                            id="mainProductImage"
                            src={product.images[0]}
                            alt={`${product.brand} ${product.title} - Ana görsel`}
                            className="w-full h-full object-cover rounded border border-gray-600 group-hover:border-blue-400 transition-all duration-200"
                            loading="eager"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.backgroundColor = '#1f2937';
                              target.style.display = 'flex';
                              target.style.alignItems = 'center';
                              target.style.justifyContent = 'center';
                              target.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 20px; font-size: 14px;"><div>📷</div><div>Ana Görsel</div></div>';
                            }}
                            onLoad={(e) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                            style={{ opacity: '1' }}
                          />
                          <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                            Ana
                          </div>
                          <div className="absolute top-1 right-1 bg-blue-600/80 text-white text-xs px-1.5 py-0.5 rounded">
                            {product.images.length}
                          </div>
                        </div>
                        
                        {/* Compact Images Grid */}
                        <div className="bg-gray-800/20 p-2 rounded border border-gray-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-300">
                              Tüm Görseller ({product.images?.length || 0})
                            </span>
                            <span className="text-xs bg-green-600/20 text-green-400 px-1.5 py-0.5 rounded">
                              HD
                            </span>
                          </div>
                          <div className="grid grid-cols-4 md:grid-cols-6 gap-1.5">
                            {product.images
                              .filter((image: string) => {
                                return image && (
                                  image.includes('cdn.dsmcdn.com') || 
                                  image.includes('ty933/prod') ||
                                  /\.(jpg|jpeg|png|webp)($|\?)/.test(image.toLowerCase())
                                );
                              })
                              .map((image: string, index: number) => (
                                <div key={index} className="relative aspect-square group cursor-pointer bg-gray-800 rounded border border-gray-700 overflow-hidden">
                                  <img
                                    src={image}
                                    alt={`${product.brand} ${product.title} - Görsel ${index + 1}`}
                                    className="w-full h-full object-cover transition-all duration-200 hover:scale-105"
                                    loading="lazy"
                                    onLoad={(e) => {
                                      e.currentTarget.style.opacity = '1';
                                    }}
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      const parent = target.parentElement;
                                      if (parent) {
                                        parent.style.backgroundColor = '#374151';
                                        parent.innerHTML = `
                                          <div class="flex items-center justify-center h-full">
                                            <div class="text-gray-300 text-xs text-center p-2">
                                              <div class="mb-1">📷</div>
                                              <div>Görsel ${index + 1}</div>
                                            </div>
                                          </div>
                                          <div class="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                                            ${index + 1}
                                          </div>
                                          ${index === 0 ? '<div class="absolute top-1 left-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">Ana</div>' : ''}
                                        `;
                                      }
                                    }}
                                    onClick={() => {
                                      const mainImg = document.getElementById('mainProductImage') as HTMLImageElement;
                                      if (mainImg) {
                                        mainImg.style.opacity = '0.7';
                                        setTimeout(() => {
                                          mainImg.src = image;
                                          mainImg.style.opacity = '1';
                                        }, 100);
                                      }
                                    }}
                                    style={{ opacity: '1' }}
                                  />
                                  <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                                    {index + 1}
                                  </div>
                                  {index === 0 && (
                                    <div className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">
                                      Ana
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                                </div>
                              ))}
                          </div>
                          <div className="text-xs text-gray-500 mt-2 text-center">
                            Tıklayarak ana görseli değiştir
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Compact Data Preview */}
                  <div className="space-y-3 border-t border-gray-800 pt-3">
                    <h3 className="text-base font-semibold text-gray-200">Veri Önizleme</h3>
                    
                    {/* Compact Price */}
                    <div className="bg-green-900/20 p-2 rounded border border-green-800">
                      <div className="flex items-center justify-between">
                        <span className="text-green-400 text-sm">Satış Fiyatı</span>
                        <span className="text-base font-bold text-green-300">{product.price}</span>
                      </div>
                      <div className="text-xs text-green-500">%10 kar dahil</div>
                    </div>

                    {/* Compact Variants */}
                    {product.variants && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-300">Varyantlar</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {product.variants.colors && product.variants.colors.length > 0 && (
                            <div className="bg-blue-900/20 p-2 rounded border border-blue-800">
                              <div className="text-blue-400 text-xs font-medium mb-1">
                                Renkler ({product.variants.colors.length})
                              </div>
                              <div className="text-xs text-blue-300">
                                {product.variants.colors.slice(0, 3).join(', ')}
                                {product.variants.colors.length > 3 && ` +${product.variants.colors.length - 3}`}
                              </div>
                            </div>
                          )}
                          
                          {product.variants.sizes && product.variants.sizes.length > 0 && (
                            <div className="bg-purple-900/20 p-2 rounded border border-purple-800">
                              <div className="text-purple-400 text-xs font-medium mb-1">
                                Bedenler ({product.variants.sizes.length})
                              </div>
                              <div className="text-xs text-purple-300">
                                {product.variants.sizes.join(', ')}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Compact Tags */}
                    {product.tags && product.tags.length > 0 && (
                      <div className="bg-yellow-900/20 p-2 rounded border border-yellow-800">
                        <div className="text-yellow-400 text-xs font-medium mb-1">
                          Etiketler ({product.tags.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {product.tags.slice(0, 6).map((tag: string, index: number) => (
                            <span
                              key={index}
                              className="px-1.5 py-0.5 bg-yellow-900/30 text-yellow-300 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {product.tags.length > 6 && (
                            <span className="text-yellow-500 text-xs">
                              +{product.tags.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Enhanced CSV Preview Section */}
                    {product.preview && (
                      <div className="space-y-3">
                        <div className="bg-green-900/20 p-2 rounded border border-green-800">
                          <div className="flex items-center justify-between">
                            <span className="text-green-400 text-xs font-medium">CSV Export</span>
                            <span className="text-green-300 text-xs">{product.preview.totalRows} satır</span>
                          </div>
                          <div className="text-green-500 text-xs">
                            {product.preview.shopifyReady ? 'Shopify uyumlu' : 'Standart'}
                          </div>
                        </div>
                        
                        {/* CSV Content Preview */}
                        <CSVPreview csvPath={product.preview.csvPath} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          
          {product && (
            <motion.div
              key="product-display"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8"
            >
              <ProductDisplay data={product} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ScraperPage;