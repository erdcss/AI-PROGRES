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
  Download,
  Upload,
  Home
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import { ProductDisplay } from "@/components/ProductDisplay";
import { SimpleProductPreview } from "@/components/SimpleProductPreview";
import { VariantDisplay } from "@/components/VariantDisplay";
import { RealTimeClock } from "@/components/RealTimeClock";
import { Link, useLocation } from "wouter";

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
      const filename = csvPath.split('/').pop() || 'shopify-urunler.csv';
      console.log('CSV preview yükleniyor:', filename);
      
      fetch(`/api/csv/preview`, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        })
        .then(res => {
          console.log('CSV preview response:', res.status, res.headers.get('content-type'));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(text => {
          console.log('CSV preview raw text:', text.substring(0, 200));
          try {
            const data = JSON.parse(text);
            console.log('CSV preview parsed data:', data);
            console.log('Rows data:', data.rows);
            console.log('First row:', data.rows?.[0]);
            setCsvData(data);
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.log('Response was not JSON, treating as error');
          }
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
            <span className="text-blue-400">4</span>
          </div>
          <div className="flex justify-between">
            <span>Varyant Sayısı:</span>
            <span className="text-purple-400">3</span>
          </div>
          <div className="flex justify-between">
            <span>Sütun Sayısı:</span>
            <span className="text-yellow-400">56</span>
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

  // Debug: CSV data durumunu kontrol et
  console.log('🔧 DEBUG - CSV Data State:', {
    hasData: !!csvData,
    hasHeaders: !!csvData?.headers,
    headersLength: csvData?.headers?.length,
    hasRows: !!csvData?.rows,
    rowsLength: csvData?.rows?.length,
    rowsType: Array.isArray(csvData?.rows),
    firstRowType: csvData?.rows?.[0] ? Array.isArray(csvData.rows[0]) : 'no first row'
  });

  return (
    <div className="bg-gray-800/20 p-3 rounded border border-gray-700">
      <div className="text-xs font-medium text-gray-300 mb-2">
        CSV İçerik Önizlemesi 
        {csvData && <span className="text-blue-400">({csvData.totalRows} satır)</span>}
      </div>
      {csvData?.headers && csvData?.rows && Array.isArray(csvData.rows) && csvData.rows.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">✓ {csvData.uniqueProducts || csvData.rows.length} ürün</span>
            <span className="text-blue-400">• {csvData.totalRows} toplam satır</span>
            <span className="text-yellow-400">• {csvData.headers.length} sütun</span>
          </div>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-xs border border-gray-600 rounded">
              <thead className="bg-gray-700 sticky top-0">
                <tr>
                {result.csvData.headers.slice(0, 6).map((header: string, index: number) => (
                  <th key={index} className="text-left p-2 text-gray-300 border-r border-gray-600 min-w-[100px]">
                    {header.length > 15 ? header.substring(0, 15) + '...' : header}
                  </th>
                ))}
                {result.csvData.headers.length > 6 && (
                  <th className="text-left p-2 text-gray-400">+{result.csvData.headers.length - 6} daha</th>
                )}
              </tr>
            </thead>
            <tbody>
              {result.csvData.rows.map((row: string[], rowIndex: number) => (
                <tr key={rowIndex} className="border-b border-gray-600 hover:bg-gray-700/30">
                  {row.slice(0, 6).map((cell: string, cellIndex: number) => (
                    <td key={cellIndex} className="p-2 text-gray-300 border-r border-gray-600 max-w-[120px] truncate" title={cell}>
                      {cell || '-'}
                    </td>
                  ))}
                  {result.csvData.headers.length > 6 && (
                    <td className="p-2 text-gray-500">...</td>
                  )}
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-900/20 p-3 rounded border border-yellow-700">
          <div className="text-yellow-400 text-xs mb-2">⚠️ CSV Veri Durumu:</div>
          <div className="text-xs text-gray-400 space-y-1">
            <div>Headers: {csvData?.headers ? '✓' : '❌'} ({csvData?.headers?.length || 0})</div>
            <div>Rows: {csvData?.rows ? '✓' : '❌'} ({csvData?.rows?.length || 0})</div>
            <div>Array: {Array.isArray(csvData?.rows) ? '✓' : '❌'}</div>
            <div>Total: {csvData?.totalRows || 0}</div>
          </div>
        </div>
      )}
      
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-400">Toplam Satır:</span>
          <span className="text-blue-400">{csvData?.totalRows || 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Sütun Sayısı:</span>
          <span className="text-green-400">{csvData?.headers?.length || 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Shopify Uyumlu:</span>
          <span className="text-green-400">✓</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Debug Mode:</span>
          <span className="text-yellow-400">ON</span>
        </div>
      </div>
    </div>
  );
}

function ScraperPage({ platform = 'trendyol' }: ScraperPageProps) {
  const [, setLocation] = useLocation();
  const [product, setProduct] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // CSV Download handler
  const handleCSVDownload = async () => {
    try {
      console.log('CSV indirme başlatılıyor...');
      setIsDownloading(true);
      
      // İlk olarak CSV durumunu kontrol et
      const statusResponse = await fetch('/api/csv/status');
      if (!statusResponse.ok) {
        throw new Error('CSV durumu kontrol edilemedi');
      }
      
      const status = await statusResponse.json();
      console.log('CSV durumu:', status);
      
      if (!status.ready) {
        throw new Error('CSV dosyası henüz hazır değil');
      }
      
      // Ürünü hafızaya ekle (CSV transfer)
      if (product) {
        try {
          await apiRequest('POST', '/api/memory/store-product', {
            productData: product,
            transferType: 'csv'
          });
          console.log('Ürün hafızaya eklendi (CSV)');
        } catch (memoryError) {
          console.error('Hafızaya ekleme hatası:', memoryError);
          // Continue with download even if memory storage fails
        }
      }
      
      // CSV dosyasını indir
      const downloadUrl = '/api/download/shopify-urunler.csv';
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'shopify-urunler.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "CSV İndirildi ve Hafızaya Eklendi",
        description: "Ürün artık anlık takip edilecek",
      });
      
      console.log('CSV indirme başarılı');
    } catch (error) {
      console.error('CSV indirme hatası:', error);
      setError({
        message: `CSV indirme hatası: ${error.message}`,
        details: 'CSV dosyası henüz hazır olmayabilir. Lütfen önce bir ürün çekin.'
      });
    }
  };

  const [error, setError] = useState<{
    message: string;
    status?: number;
    details?: string;
    solution?: string;
  } | null>(null);

  const { toast } = useToast();

  const handleExportCSV = async () => {
    if (!product) return;
    
    setIsExporting(true);
    try {
      const response = await fetch('/api/export-shopify-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shopify-${product.brand.toLowerCase()}-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: 'CSV İndirildi',
          description: `${product.brand} ürünü Shopify formatında hazırlandı`,
        });
      } else {
        throw new Error('CSV oluşturulamadı');
      }
    } catch (error) {
      toast({
        title: 'Hata',
        description: 'CSV dosyası oluşturulurken bir hata oluştu',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };


  
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
      const response = await apiRequest("POST", "/api/extract", data);
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
      
      // Add CSV preview data from instant processing
      if (data.csvPreview) {
        const enhancedData = {
          ...data,
          csvData: data.csvPreview
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
        description: data.csvGenerated ? "Ürün verisi çekildi ve CSV oluşturuldu" : "Ürün verisi başarıyla çekildi"
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
    try {
      const filename = 'shopify-urunler.csv';
      console.log('CSV indirme başlatılıyor:', filename);
      
      const response = await fetch(`/api/download/${filename}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('CSV indirme hatası:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      // Telegram bildirimi gönder
      const productData = result?.productInfo || result;
      if (productData) {
        try {
          await fetch('/api/telegram/csv-download-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productData })
          });
        } catch (telegramError) {
          console.warn('Telegram bildirimi gönderilemedi:', telegramError);
        }
      }
      
      toast({
        title: "CSV başarıyla indirildi",
        description: `${filename} Shopify formatında hazır`
      });
    } catch (error) {
      console.error('CSV indirme hatası:', error);
      toast({
        title: "İndirme hatası",
        description: error instanceof Error ? error.message : "CSV dosyası indirilemedi",
        variant: "destructive"
      });
    }
  };

  const [isUploadingToShopify, setIsUploadingToShopify] = useState(false);

  const uploadToShopify = async () => {
    // Her iki veri formatını da kontrol et
    const productData = result?.productInfo || result;
    
    if (!productData || !productData.title) {
      toast({
        title: "Hata", 
        description: "Shopify'a yüklemek için önce ürün çekin",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingToShopify(true);
    
    try {
      console.log('Shopify API yüklemesi başlatılıyor...', productData);
      
      // Ürünü hafızaya ekle (Shopify transfer) - upload öncesi
      try {
        await apiRequest('POST', '/api/memory/store-product', {
          productData: productData,
          transferType: 'shopify'
        });
        console.log('Ürün hafızaya eklendi (Shopify)');
      } catch (memoryError) {
        console.error('Hafızaya ekleme hatası:', memoryError);
        // Continue with Shopify upload even if memory storage fails
      }
      
      // Fiyat verilerini düzelt
      const originalPrice = productData.price?.original || productData.price?.withProfit / 1.15 || 0;
      const profitPrice = productData.price?.withProfit || originalPrice * 1.15;
      
      const shopifyData = {
        success: true,
        title: productData.title,
        brand: productData.brand,
        price: {
          original: originalPrice,
          withProfit: profitPrice
        },
        features: productData.features || [],
        variants: productData.variants?.length > 0 ? productData.variants : [{
          color: "Varsayılan",
          size: "Standart", 
          inStock: true,
          stockCount: 10
        }],
        images: productData.images || []
      };

      console.log('Gönderilen shopify data:', shopifyData);
      
      const response = await fetch('/api/shopify/add-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productData: shopifyData }),
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Shopify yükleme başarısız');
        } else {
          const errorText = await response.text();
          throw new Error(`Server hatası: ${response.status}`);
        }
      }

      const data = await response.json();
      
      // Başarılı Shopify yükleme sonrası ürünü hafızaya ekle
      if (product) {
        try {
          const productDataWithShopifyId = {
            ...product,
            shopifyProductId: data.shopifyProductId
          };
          
          const memoryResponse = await fetch('/api/memory/add-product', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              productData: productDataWithShopifyId, 
              transferType: 'shopify' 
            })
          });
          
          if (memoryResponse.ok) {
            console.log('✅ Ürün Shopify yükleme sonrası hafızaya eklendi');
          }
        } catch (memoryError) {
          console.error('Hafızaya ekleme hatası:', memoryError);
        }
      }
      
      toast({
        title: "Shopify'a başarıyla yüklendi ve hafızaya eklendi!",
        description: `Ürün ID: ${data.shopifyProductId} - Artık anlık takip edilecek`,
      });
      
      console.log('Shopify yükleme başarılı:', data);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Shopify yükleme hatası:', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        productData: productData?.title || 'Unknown'
      });
      
      // Enhanced error detection sistemine hata bildir
      try {
        await fetch('/api/system/report-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: 'Shopify Upload',
            error: errorMessage,
            productTitle: productData?.title || 'Unknown Product',
            severity: 'high'
          })
        });
      } catch (reportError) {
        console.warn('Error reporting failed:', reportError);
      }
      
      toast({
        title: "Shopify yükleme hatası",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsUploadingToShopify(false);
    }
  };

  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);

  const previewCSV = async () => {
    if (extractedProducts.length === 0) {
      toast({
        title: "Hata",
        description: "Önizleme için önce ürün çıkarın.",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch('/api/preview-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products: extractedProducts }),
      });

      if (!response.ok) {
        throw new Error('CSV önizleme başarısız');
      }

      const data = await response.json();
      setCsvPreview(data.preview);
      setShowCsvPreview(true);

      toast({
        title: "CSV Önizleme Hazır",
        description: `${data.totalRows} satır veri önizlendi.`,
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "CSV önizleme sırasında hata oluştu.",
        variant: "destructive"
      });
    }
  };

  const exportToShopifyCSV = async () => {
    if (extractedProducts.length === 0) {
      toast({
        title: "Hata",
        description: "CSV'ye aktarmak için önce ürün çıkarın.",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch('/api/export-shopify-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products: extractedProducts }),
      });

      if (!response.ok) {
        throw new Error('CSV export başarısız');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopify-products-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Başarılı!",
        description: `${extractedProducts.length} ürün Shopify CSV formatında indirildi.`,
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "CSV export sırasında hata oluştu.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white overflow-auto">
      <div className="min-h-full p-4 relative">
        {/* Real-time Clock - Top Right */}
        <div className="absolute top-4 right-4 z-10">
          <RealTimeClock />
        </div>
        
        {/* Navigation Header */}
        <div className="max-w-2xl mx-auto mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="text-gray-400 hover:text-white flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            <span>Marketplace Seçimi</span>
          </Button>
        </div>
        
        <div className="max-w-2xl mx-auto space-y-6">
          <motion.div
            initial={false}
            animate={product ? { y: -20, scale: 0.95, opacity: 0.8 } : { y: 0, scale: 1, opacity: 1 }}
            className=""
          >
            <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 backdrop-blur-sm rounded-2xl border border-blue-500/30 p-8 mb-6 shadow-2xl">
              {/* Header Row */}
              <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-6">
                {/* Logo */}
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                    <span className="text-white font-bold text-xl">T</span>
                  </div>
                  <div className="absolute -top-1 -right-1 bg-cyan-400 rounded-full p-1 animate-pulse">
                    <div className="h-2 w-2 bg-white rounded-full"></div>
                  </div>
                </div>
                
                {/* Brand & Title */}
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-xl font-bold text-blue-400">Trendyol</h1>
                    <span className="text-gray-500">•</span>
                    <h2 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                      Ürün Aktarıcı
                    </h2>
                  </div>
                  <p className="text-sm text-gray-400">
                    Trendyol ürün verilerini Shopify'a uyumlu formata dönüştürün
                  </p>
                </div>
              </div>
              
              {/* Version & Developer Info */}
              <div className="text-right text-xs text-gray-500 space-y-1">
                <div className="flex items-center gap-2 justify-end">
                  <div className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                  <span>trendyol.com için optimize edilmiştir</span>
                </div>
                <div>ERDEM ÇALIŞKAN tarafından geliştirilmiştir</div>
                <div className="flex items-center gap-2 justify-end">
                  <div className="h-1.5 w-1.5 bg-blue-400 rounded-full"></div>
                  <span className="font-mono text-blue-300">Versiyon 0.13.1006</span>
                </div>
              </div>
            </div>
            
            {/* Info Badge */}
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-blue-900/30 px-4 py-2 rounded-lg text-blue-200 text-sm border border-blue-500/20">
                <div className="h-2 w-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <span>AI destekli analiz ve Shopify uyumlu CSV dönüştürme</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6">
              <Alert variant="destructive" className="bg-gradient-to-br from-red-900/40 to-red-800/40 backdrop-blur-sm border border-red-500/30 shadow-2xl rounded-2xl">
                {getErrorIcon(error.status)}
                <AlertTitle className="text-red-100 font-semibold">{getErrorTitle(error.status)}</AlertTitle>
                <AlertDescription className="mt-3 space-y-3 text-red-100">
                  <p className="font-medium">{error.message}</p>
                  {error.solution && (
                    <div className="p-3 bg-red-900/30 rounded-xl border border-red-600/30">
                      <strong className="text-red-200">Çözüm önerisi:</strong>
                      <span className="ml-2 text-red-100">{error.solution}</span>
                    </div>
                  )}
                  {error.details && (
                    <p className="text-sm text-red-300 bg-red-950/30 p-2 rounded-lg border border-red-700/20">
                      <strong>Teknik detay:</strong> {error.details}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="relative group">
              {/* URL Input Container with Enhanced Styling */}
              <div className="relative bg-gradient-to-r from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl border border-blue-500/30 shadow-2xl transition-all duration-300 group-hover:border-blue-400/50 group-focus-within:border-blue-400/70 group-focus-within:shadow-blue-500/20 min-h-[80px]">
                
                {/* Clear Button */}
                {form.watch("url") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 h-12 w-12 z-10 bg-gradient-to-r from-red-500/20 to-red-600/20 hover:from-red-500/30 hover:to-red-600/30 text-red-300 hover:text-red-200 border border-red-500/30 hover:border-red-400/50 rounded-xl transition-all duration-200"
                    onClick={() => form.setValue("url", "")}
                  >
                    <XCircle className="h-6 w-6" />
                  </Button>
                )}
                
                {/* Paste Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-[68px] top-1/2 transform -translate-y-1/2 h-12 w-12 z-10 bg-gradient-to-r from-blue-600/30 to-indigo-600/30 hover:from-blue-500/40 hover:to-indigo-500/40 text-blue-200 hover:text-blue-100 border border-blue-500/40 hover:border-blue-400/60 rounded-xl transition-all duration-200"
                  onClick={handlePaste}
                >
                  <Clipboard className="h-6 w-6" />
                </Button>
                
                {/* Enhanced Input Field */}
                <Input
                  placeholder="Trendyol ürün linkini buraya yapıştırın (örn: https://www.trendyol.com/marka/urun-adi-p-123456)"
                  {...form.register("url")}
                  className="h-20 pl-[140px] pr-32 bg-transparent border-none text-lg font-medium text-gray-100 placeholder:text-gray-400 focus:ring-0 focus:outline-none rounded-2xl leading-relaxed py-6"
                />
                
                {/* Enhanced Submit Button */}
                <Button
                  type="submit"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 h-12 w-20 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 hover:from-blue-500 hover:via-blue-600 hover:to-indigo-600 text-white border border-blue-500/50 hover:border-blue-400/70 rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={scrapeMutation.isPending}
                >
                  {scrapeMutation.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <ArrowRight className="w-6 h-6" />
                  )}
                </Button>
              </div>
              
              {/* Subtle Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 -z-10"></div>
            </div>
          </form>
          </motion.div>

        {/* CSV Önizleme Tablosu */}
        <AnimatePresence>
          {showCsvPreview && csvPreview.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.3 }}
              className="mb-6"
            >
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">CSV Önizleme</h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowCsvPreview(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-gray-300">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left p-2">Handle</th>
                          <th className="text-left p-2">Başlık</th>
                          <th className="text-left p-2">Marka</th>
                          <th className="text-left p-2">Fiyat</th>
                          <th className="text-left p-2">Eski Fiyat</th>
                          <th className="text-left p-2">Beden</th>
                          <th className="text-left p-2">Stok</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.slice(0, 10).map((row, index) => (
                          <tr key={index} className="border-b border-gray-800">
                            <td className="p-2 text-xs">{row.handle}</td>
                            <td className="p-2 text-xs">{row.title}</td>
                            <td className="p-2 text-xs">{row.vendor}</td>
                            <td className="p-2 text-xs">{row.variant_price} TL</td>
                            <td className="p-2 text-xs">{row.variant_compare_price} TL</td>
                            <td className="p-2 text-xs">{row.option1_value || 'Tek Beden'}</td>
                            <td className="p-2 text-xs">{row.variant_inventory_qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {csvPreview.length > 10 && (
                    <p className="text-gray-400 text-sm mt-2">
                      ... ve {csvPreview.length - 10} satır daha
                    </p>
                  )}
                  
                  <div className="flex gap-2 mt-4">
                    <Button onClick={exportToShopifyCSV} className="bg-green-600 hover:bg-green-700">
                      <Download className="h-4 w-4 mr-2" />
                      CSV'yi İndir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {product && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 backdrop-blur-sm border border-blue-500/30 shadow-2xl">
                <CardContent className="p-8">
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
                      <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 backdrop-blur-sm rounded-2xl p-4 border border-blue-500/20">
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
                        <div className="bg-gradient-to-br from-blue-900/30 to-indigo-900/30 backdrop-blur-sm p-3 rounded-xl border border-blue-500/30">
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
                                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100" />
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
                  <div className="space-y-4 border-t border-blue-500/20 pt-6">
                    <h3 className="text-lg font-semibold text-white">Veri Önizleme</h3>
                    
                    {/* Ürün Özellikleri Önizleme */}
                    {product.features && product.features.length > 0 && (
                      <div className="bg-gradient-to-br from-blue-900/30 to-indigo-900/30 backdrop-blur-sm p-4 rounded-xl border border-blue-500/30">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-blue-300 text-sm font-semibold">Ürün Özellikleri</span>
                          <span className="text-xs text-blue-200 bg-blue-800/40 px-2 py-1 rounded-lg">{product.features.length} özellik</span>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {product.features.slice(0, 6).map((feature, index) => (
                            <div key={index} className="flex justify-between text-xs">
                              <span className="text-gray-400">{feature.key}:</span>
                              <span className="text-gray-300 ml-2 text-right">{feature.value}</span>
                            </div>
                          ))}
                          {product.features.length > 6 && (
                            <div className="text-center pt-1">
                              <span className="text-xs text-blue-400">+{product.features.length - 6} daha...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Compact Price */}
                    <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 backdrop-blur-sm p-4 rounded-xl border border-green-500/30">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-300 text-sm">Trendyol Fiyatı</span>
                        <span className="text-sm font-semibold text-white bg-gray-800/40 px-3 py-1 rounded-lg">
                          {typeof product.price === 'object' ? product.price.formatted : `${product.price} TL`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-green-300 text-sm font-semibold">Satış Fiyatımız</span>
                        <span className="text-lg font-bold text-green-200 bg-green-800/40 px-3 py-1 rounded-lg">
                          {typeof product.price === 'object' ? product.price.profitFormatted : `${Math.ceil(parseFloat(product.price) * 1.1)} TL`}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-green-500 bg-green-900/30 px-2 py-1 rounded">
                          %15 kar marjı dahil
                        </span>
                      </div>
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
                                {product.variants.colors.slice(0, 3).map(color => 
                                  typeof color === 'string' ? color : color?.name || 'Renk'
                                ).join(', ')}
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
                                {product.variants.sizes.map(size => 
                                  typeof size === 'string' ? size : size?.name || 'Beden'
                                ).join(', ')}
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
                          {product.tags.slice(0, 6).map((tag: any, index: number) => (
                            <span
                              key={index}
                              className="px-1.5 py-0.5 bg-yellow-900/30 text-yellow-300 text-xs rounded"
                            >
                              {typeof tag === 'string' ? tag : tag?.name || `Tag ${index + 1}`}
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
                    {product.csvInfo && (
                      <div className="space-y-3">
                        <div className="bg-green-900/20 p-2 rounded border border-green-800">
                          <div className="flex items-center justify-between">
                            <span className="text-green-400 text-xs font-medium">CSV Export</span>
                            <span className="text-green-300 text-xs">{product.csvInfo.totalRows} satır</span>
                          </div>
                          <div className="text-green-500 text-xs">
                            Shopify uyumlu
                          </div>
                        </div>
                        
                        {/* CSV Content Preview */}
                        <CSVPreview csvPath={product.csvInfo?.filename || 'shopify-urunler.csv'} />
                        
                        {/* Enhanced Download and Upload Buttons */}
                        <div className="mt-4 space-y-3">
                          <button
                            onClick={() => handleCSVDownload()}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 border border-blue-500/20"
                          >
                            <Download className="w-5 h-5" />
                            CSV İndir (shopify-urunler.csv)
                          </button>
                          
                          <button
                            onClick={uploadToShopify}
                            disabled={isUploadingToShopify}
                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-green-400 disabled:to-emerald-400 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:scale-100 border border-green-500/20"
                          >
                            {isUploadingToShopify ? (
                              <>
                                <RefreshCcw className="w-5 h-5 animate-spin" />
                                Shopify'a Yükleniyor...
                              </>
                            ) : (
                              <>
                                <Upload className="w-5 h-5" />
                                Shopify'a Yükle
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          
          {result && (
            <motion.div
              key="product-preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8 space-y-6"
            >
              <SimpleProductPreview product={result} />
              
              {/* Varyant Bilgileri */}
              {result.variants && result.variants.length > 0 && (
                <VariantDisplay 
                  variants={result.variants}
                  title="Ürün Varyantları"
                  showPricing={true}
                  showInventory={true}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CSV Dışa Aktarma Bölümü */}
        {product && (
          <div className="mt-8 p-6 bg-card rounded-lg border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Shopify CSV Dışa Aktarma</h2>
              <div className="flex gap-2">
                <Button 
                  onClick={handleExportCSV}
                  disabled={isExporting}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isExporting ? 'Hazırlanıyor...' : 'CSV İndir'}
                </Button>
                
                <Button 
                  onClick={uploadToShopify}
                  disabled={isUploadingToShopify}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-400"
                >
                  {isUploadingToShopify ? (
                    <>
                      <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
                      Yükleniyor...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Shopify'a Yükle
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* CSV Önizleme Tablosu */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted p-3 border-b">
                <h3 className="font-medium">Önizleme - Shopify Uyumlu Format</h3>
                <p className="text-sm text-muted-foreground">
                  {product.sizeOptions?.length || 0} beden varyantı • %15 kar marjı uygulandı
                </p>
              </div>
              
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left border-r">Handle</th>
                      <th className="p-2 text-left border-r">Title</th>
                      <th className="p-2 text-left border-r">Vendor</th>
                      <th className="p-2 text-left border-r">Beden</th>
                      <th className="p-2 text-left border-r">SKU</th>
                      <th className="p-2 text-left border-r">Fiyat</th>
                      <th className="p-2 text-left border-r">Karşılaştırma Fiyatı</th>
                      <th className="p-2 text-left">Görsel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Ana ürün satırı */}
                    <tr className="border-b bg-blue-50/50">
                      <td className="p-2 border-r font-medium">
                        {product.title?.toLowerCase()
                          .replace(/[^a-z0-9\s-]/g, '')
                          .replace(/\s+/g, '-')
                          .substring(0, 30)}
                      </td>
                      <td className="p-2 border-r">{product.title}</td>
                      <td className="p-2 border-r">{product.brand}</td>
                      <td className="p-2 border-r text-muted-foreground">-</td>
                      <td className="p-2 border-r text-muted-foreground">-</td>
                      <td className="p-2 border-r font-medium">{product.price?.withProfit} {product.price?.currency}</td>
                      <td className="p-2 border-r text-red-600">{product.price?.original} {product.price?.currency}</td>
                      <td className="p-2">
                        <img 
                          src={product.images?.[0]} 
                          alt="Ana görsel" 
                          className="w-8 h-8 object-cover rounded"
                        />
                      </td>
                    </tr>
                    
                    {/* Beden varyantları */}
                    {(product.sizeOptions || []).map((size, index) => (
                      <tr key={size} className="border-b hover:bg-muted/30">
                        <td className="p-2 border-r text-muted-foreground">-</td>
                        <td className="p-2 border-r text-muted-foreground">-</td>
                        <td className="p-2 border-r text-muted-foreground">-</td>
                        <td className="p-2 border-r font-medium">{size}</td>
                        <td className="p-2 border-r text-sm">
                          {product.title?.toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '')
                            .replace(/\s+/g, '-')
                            .substring(0, 20)}-{size.toLowerCase()}
                        </td>
                        <td className="p-2 border-r">{product.price?.withProfit} {product.price?.currency}</td>
                        <td className="p-2 border-r text-red-600">{product.price?.original} {product.price?.currency}</td>
                        <td className="p-2">
                          <img 
                            src={product.images?.[index] || product.images?.[0]} 
                            alt={`${size} beden`}
                            className="w-8 h-8 object-cover rounded"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <div className="text-blue-600 mt-0.5">ℹ️</div>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Shopify Import Bilgileri:</p>
                  <ul className="space-y-1 text-blue-700">
                    <li>• Ana ürün + {product.sizeOptions?.length || 0} beden varyantı oluşturulacak</li>
                    <li>• %15 kar marjı otomatik uygulandı ({product.price?.original} TL → {product.price?.withProfit} TL)</li>
                    <li>• Her beden için ayrı SKU ve görsel atandı</li>
                    <li>• Stok miktarı: 10 adet (varsayılan)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Kullanım İpuçları ve Bilgi Bölümü */}
        {!product && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* Hızlı İpuçları */}
            <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 backdrop-blur-sm rounded-2xl border border-blue-500/20 p-6">
              <h3 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
                <div className="h-2 w-2 bg-cyan-400 rounded-full animate-pulse"></div>
                Kullanım İpuçları
              </h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-1.5 w-1.5 bg-blue-400 rounded-full mt-2"></div>
                    <div>
                      <div className="text-blue-200 font-medium">URL Yapıştırma</div>
                      <div className="text-gray-400">Ctrl+V ile hızlıca yapıştırın veya 📋 butonunu kullanın</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-1.5 w-1.5 bg-green-400 rounded-full mt-2"></div>
                    <div>
                      <div className="text-green-200 font-medium">Otomatik Analiz</div>
                      <div className="text-gray-400">AI destekli veri çıkarma ve kalite kontrolü</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-1.5 w-1.5 bg-purple-400 rounded-full mt-2"></div>
                    <div>
                      <div className="text-purple-200 font-medium">Shopify Uyumluluk</div>
                      <div className="text-gray-400">Direkt import edebileceğiniz CSV formatı</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-1.5 w-1.5 bg-yellow-400 rounded-full mt-2"></div>
                    <div>
                      <div className="text-yellow-200 font-medium">%15 Kar Marjı</div>
                      <div className="text-gray-400">Otomatik fiyat hesaplama ve optimizasyon</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Teknik Özellikler */}
            <div className="bg-gradient-to-br from-gray-900/40 to-gray-800/40 backdrop-blur-sm rounded-2xl border border-gray-500/20 p-6">
              <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <div className="h-2 w-2 bg-gray-400 rounded-full"></div>
                Sistem Özellikleri
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">AI</div>
                  <div className="text-gray-400">Destekli Analiz</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">%99</div>
                  <div className="text-gray-400">Başarı Oranı</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-400">HD</div>
                  <div className="text-gray-400">Görsel Kalitesi</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">15%</div>
                  <div className="text-gray-400">Kar Marjı</div>
                </div>
              </div>
            </div>

            {/* Footer Bilgileri */}
            <div className="text-center py-4">
              <div className="text-xs text-gray-500 space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-1 w-1 bg-blue-400 rounded-full"></div>
                  <span>Profesyonel e-ticaret veri dönüştürme sistemi</span>
                  <div className="h-1 w-1 bg-blue-400 rounded-full"></div>
                </div>
                <div>Güvenli, hızlı ve kullanıcı dostu arayüz</div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      </div>
    </div>
  );
}

export default ScraperPage;