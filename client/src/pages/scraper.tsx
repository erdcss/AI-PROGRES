import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, Link, Copy, X, Home, Plus, Trash2, Package, Palette, Eye, Image } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductDisplay } from "@/components/ProductDisplay";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";


const scrapeSchema = z.object({
  url: z.string().url("Geçerli bir URL giriniz").refine(
    (url) => url.includes("trendyol.com"),
    "Sadece Trendyol URL'leri desteklenmektedir"
  ),
});

const multiUrlSchema = z.object({
  urls: z.array(z.object({
    url: z.string().url("Geçerli bir URL giriniz").refine(
      (url) => url.includes("trendyol.com"),
      "Sadece Trendyol URL'leri desteklenmektedir"
    )
  })).min(1, "En az bir URL gerekli")
});

type ScrapeFormData = z.infer<typeof scrapeSchema>;
type MultiUrlFormData = z.infer<typeof multiUrlSchema>;

type ScrapingMode = 'single' | 'multi-url';

interface Product {
  id: string;
  title: string;
  price: number | { profitFormatted: string };
  images: Array<{ url: string; alt?: string }>;
  description: string;
  brand?: string;
  variants?: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features?: Array<{ key: string; value: string }>;
  tags?: string[];
  category?: string;
}

function ScraperPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [, setLocation] = useLocation();
  const [scrapingMode, setScrapingMode] = useState<ScrapingMode>('single');
  
  const singleForm = useForm<ScrapeFormData>({
    resolver: zodResolver(scrapeSchema),
    defaultValues: {
      url: "",
    },
  });

  const multiForm = useForm<MultiUrlFormData>({
    resolver: zodResolver(multiUrlSchema),
    defaultValues: {
      urls: [{ url: "" }]
    },
  });

  const singleScrapeMutation = useMutation({
    mutationFn: async (data: ScrapeFormData) => {
      const response = await fetch("/api/scenario-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: data.url, mode: 'single' }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setProduct(data);
      toast({
        title: "Başarılı",
        description: "Tek varyant ürün verisi çekildi"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const multiUrlScrapeMutation = useMutation({
    mutationFn: async (data: MultiUrlFormData) => {
      const response = await fetch("/api/multi-url-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: data.urls, mode: 'multi-url' }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setProduct(data);
      toast({
        title: "Başarılı",
        description: `${data.variants?.colors?.length || 0} renk varyantı birleştirildi`
      });
      
      // Sadece Shopify'a yükleme - CSV indirme kaldırıldı
      if (data.csvContent) {
        uploadToShopify(data.csvContent, data.title || 'Multi-Variant Product');
      }
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const onSingleSubmit = singleForm.handleSubmit((data) => {
    singleScrapeMutation.mutate(data);
  });

  const onMultiSubmit = multiForm.handleSubmit((data) => {
    multiUrlScrapeMutation.mutate(data);
  });

  const addUrlField = () => {
    const currentUrls = multiForm.getValues('urls');
    multiForm.setValue('urls', [...currentUrls, { url: '' }]);
  };

  const removeUrlField = (index: number) => {
    const currentUrls = multiForm.getValues('urls');
    if (currentUrls.length > 1) {
      multiForm.setValue('urls', currentUrls.filter((_, i) => i !== index));
    }
  };

  // CSV indirme fonksiyonu
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Shopify'a yükleme fonksiyonu
  const uploadToShopify = async (csvContent: string, productTitle: string) => {
    try {
      console.log('🛒 Shopify upload başlatılıyor...');
      console.log('CSV Content length:', csvContent?.length);
      console.log('Product title:', productTitle);
      
      if (!csvContent || csvContent.trim().length === 0) {
        throw new Error('CSV içeriği bulunamadı veya boş');
      }
      
      const response = await fetch('/api/shopify-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvContent: csvContent,
          productTitle: productTitle || 'Multi-Color Product'
        })
      });

      const result = await response.json();
      console.log('📤 Shopify response:', result);

      if (response.ok && result.success) {
        toast({
          title: "Shopify'a Yüklendi!",
          description: `Ürün başarıyla Shopify mağazanıza eklendi. ID: ${result.productId || 'N/A'}`,
          duration: 5000
        });
      } else {
        throw new Error(result.error || result.message || "Shopify'a yüklenirken hata oluştu");
      }
    } catch (error) {
      console.error('❌ Shopify yükleme hatası:', error);
      toast({
        title: "Shopify Yükleme Hatası",
        description: error instanceof Error ? error.message : "Shopify'a yüklenirken bağlantı hatası oluştu",
        variant: "destructive",
        duration: 5000
      });
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="bg-black border-b-2 border-blue-900">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => setLocation('/')}
                variant="outline"
                className="business-button px-4 py-2"
              >
                <Home className="w-4 h-4 mr-2" />
                Ana Sayfa
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-lg">T</span>
                </div>
                <div>
                  <h1 className="text-white font-black text-xl">TRENDYOL</h1>
                  <p className="text-blue-400 text-sm font-bold">Ürün Çıkarıcı</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 gap-8">
          
          {/* Main Content Section */}
          <div>
            {/* Mode Selection */}
            <Card className="business-card mb-6">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-black flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-blue-400" />
                  Çıkarma Modu Seçin
                </CardTitle>
                <p className="text-blue-400 text-sm font-medium">
                  🎨 Renkler otomatik tespit edilir • 🛒 Shopify'a direkt yüklenir
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button
                    variant={scrapingMode === 'single' ? 'default' : 'outline'}
                    className={scrapingMode === 'single' 
                      ? "business-button h-16 text-base font-black flex flex-col gap-1" 
                      : "border-slate-600 hover:bg-slate-800 h-16 text-base font-bold flex flex-col gap-1"
                    }
                    onClick={() => setScrapingMode('single')}
                  >
                    <Package className="w-5 h-5" />
                    <span>Tek Varyant</span>
                    <span className="text-xs opacity-80">Renksiz ürünler için</span>
                  </Button>
                  <Button
                    variant={scrapingMode === 'multi-url' ? 'default' : 'outline'}
                    className={scrapingMode === 'multi-url' 
                      ? "business-button h-16 text-base font-black flex flex-col gap-1" 
                      : "border-slate-600 hover:bg-slate-800 h-16 text-base font-bold flex flex-col gap-1"
                    }
                    onClick={() => setScrapingMode('multi-url')}
                  >
                    <Palette className="w-5 h-5" />
                    <span>Multi Renk</span>
                    <span className="text-xs opacity-80">Farklı renk URL'leri için</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Single Mode Form */}
            {scrapingMode === 'single' && (
              <Card className="business-card">
                <CardHeader className="business-header">
                  <CardTitle className="text-white font-black flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-400" />
                    Tek Varyant Ürün
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <motion.form 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onSingleSubmit} 
                    className="space-y-4"
                  >
                    <div className="space-y-3">
                      <label className="text-white font-bold text-sm">Ürün URL'si</label>
                      <div className="relative">
                        <Input
                          placeholder="https://www.trendyol.com/..."
                          {...singleForm.register("url")}
                          className="business-input h-14 text-base pl-4 pr-24"
                          disabled={singleScrapeMutation.isPending}
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-white hover:bg-blue-800"
                            onClick={() => {
                              navigator.clipboard.readText().then(text => {
                                singleForm.setValue('url', text);
                                toast({
                                  title: "Yapıştırıldı",
                                  description: "URL panodan alındı"
                                });
                              });
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-white hover:bg-blue-800"
                            onClick={() => {
                              singleForm.setValue('url', '');
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      type="submit"
                      disabled={singleScrapeMutation.isPending}
                      className="business-button w-full h-14 text-lg font-black"
                    >
                      {singleScrapeMutation.isPending ? (
                        <div className="flex items-center gap-3">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Ürün Verisi Çekiliyor...</span>
                        </div>
                      ) : (
                        <span>TEK VARYANT ÇIKAR</span>
                      )}
                    </Button>
                  </motion.form>
                </CardContent>
              </Card>
            )}

            {/* Multi-URL Mode Form */}
            {scrapingMode === 'multi-url' && (
              <Card className="business-card">
                <CardHeader className="business-header">
                  <CardTitle className="text-white font-black flex items-center gap-2">
                    <Palette className="w-5 h-5 text-blue-400" />
                    Çoklu Varyant Birleştirme
                  </CardTitle>
                  <div className="text-sm text-slate-400 mt-2">
                    Her renk varyantı için ayrı URL girin. Sistem otomatik olarak tek Shopify ürününde birleştirecek.
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <motion.form 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onMultiSubmit} 
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      {multiForm.watch('urls').map((urlItem, index) => (
                        <div key={index} className="p-4 border border-slate-600 rounded-lg bg-slate-900/50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                {index + 1}
                              </div>
                              <span className="text-white font-bold text-sm">Renk Varyantı</span>
                            </div>
                            {multiForm.watch('urls').length > 1 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-400 hover:bg-red-900/50"
                                onClick={() => removeUrlField(index)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="text-slate-300 font-semibold text-xs mb-2 block">
                                Ürün URL'si
                              </label>
                              <div className="relative">
                                <Input
                                  placeholder="https://www.trendyol.com/..."
                                  {...multiForm.register(`urls.${index}.url` as const)}
                                  className="business-input text-sm pr-20"
                                  disabled={multiUrlScrapeMutation.isPending}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-slate-400 hover:bg-slate-700"
                                  onClick={() => {
                                    navigator.clipboard.readText().then(text => {
                                      multiForm.setValue(`urls.${index}.url`, text);
                                      toast({
                                        title: "Yapıştırıldı",
                                        description: `${index + 1}. URL yapıştırıldı`
                                      });
                                    });
                                  }}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            
                            <div className="text-center py-2 px-3 bg-slate-800/50 rounded text-xs text-slate-400">
                              🎨 Renk otomatik tespit edilecek
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="border-t border-slate-600 pt-4">
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-slate-600 hover:bg-slate-800 text-slate-300 flex-1 h-11"
                          onClick={addUrlField}
                          disabled={multiUrlScrapeMutation.isPending}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          URL Alanı Ekle
                        </Button>
                        
                        <Button
                          type="submit"
                          disabled={multiUrlScrapeMutation.isPending || multiForm.watch('urls').length === 0}
                          className="business-button flex-2 h-11 text-base font-black"
                        >
                          {multiUrlScrapeMutation.isPending ? (
                            <div className="flex items-center gap-3">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Shopify'a yükleniyor...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>🛒 SHOPIFY'A YÜKLE</span>
                              <span className="text-xs bg-blue-800 px-2 py-1 rounded">
                                {multiForm.watch('urls').length} renk
                              </span>
                            </div>
                          )}
                        </Button>
                      </div>
                      
                      <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <span>💡</span>
                        <span>Aynı ürünün farklı renklerine ait URL'leri girin - sistem otomatik birleştirecek</span>
                      </div>
                    </div>
                  </motion.form>
                </CardContent>
              </Card>
            )}
          </div>


        </div>

        {/* Multi-URL Preview Section */}
        {scrapingMode === 'multi-url' && multiForm.watch('urls').some(url => url.url) && (
          <div className="mt-8">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-black flex items-center gap-2">
                  <Palette className="w-5 h-5 text-blue-400" />
                  Ürün Önizlemesi
                </CardTitle>
                <p className="text-blue-400 text-sm">URL'lerden çekilen ürün bilgilerinin ön görünümü</p>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {multiForm.watch('urls').map((urlItem, index) => (
                    urlItem.url && (
                      <UrlPreviewCard key={index} url={urlItem.url} index={index} />
                    )
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Product Display */}
        {product && (
          <div className="mt-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <ProductDisplay data={{
                title: product.title,
                brand: product.brand,
                price: product.price,
                description: product.description,
                images: product.images?.map(img => typeof img === 'string' ? img : img.url) || [],
                variants: (product as any).variants || {
                  colors: [],
                  sizes: [],
                  allVariants: []
                },
                features: product.features?.map(f => ({ key: f.key, value: f.value })) || [],
                tags: product.tags || [],
                shopifyCompatible: true
              }} />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

// URL Önizleme Kartı Komponenti
function UrlPreviewCard({ url, index }: { url: string; index: number }) {
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPreview = async () => {
    if (!url || isLoading) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/scenario-scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url })
      });
      
      if (response.ok) {
        const data = await response.json();
        setPreviewData(data);
      }
    } catch (error) {
      console.error('Preview fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (url) {
        fetchPreview();
      }
    }, 500); // Debounce URL changes

    return () => clearTimeout(timer);
  }, [url]);

  if (isLoading) {
    return (
      <Card className="business-card h-25">
        <CardContent className="p-4 h-full flex items-center justify-center">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span className="text-slate-400 text-xs">Yükleniyor...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!previewData) {
    return (
      <Card className="business-card h-25">
        <CardContent className="p-4 h-full flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-500">
            <Eye className="w-6 h-6" />
            <span className="text-xs">Önizleme bekleniyor...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const primaryImage = previewData.images?.[0];
  const imageUrl = typeof primaryImage === 'string' ? primaryImage : primaryImage?.url;
  const detectedColor = previewData.detectedColor || previewData.extractedColor || 'Renk Tespit Edilmedi';
  const availableSizes = previewData.variants?.sizes || [];
  const features = previewData.features || [];

  return (
    <Card className="business-card h-25 overflow-hidden">
      <CardContent className="p-0 h-full">
        {/* 300x100 Yatay Layout - Görsel Sol, Bilgiler Sağ */}
        <div className="flex h-full">
          {/* Sol Taraf - Görsel Alanı */}
          <div className="w-32 h-25 bg-slate-800 relative overflow-hidden flex-shrink-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={previewData.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder-image.jpg';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="w-6 h-6 text-slate-600" />
              </div>
            )}
            {/* Sıra Numarası */}
            <div className="absolute top-1 left-1 bg-blue-600 text-white px-1 py-0.5 rounded text-xs font-bold">
              #{index + 1}
            </div>
          </div>

          {/* Sağ Taraf - Ürün Bilgileri */}
          <div className="flex-1 p-2 space-y-1 overflow-hidden">
            {/* Marka ve Başlık */}
            <div>
              {previewData.brand && (
                <p className="text-blue-400 text-xs font-semibold uppercase">
                  {previewData.brand}
                </p>
              )}
              <h3 className="text-white text-xs font-bold line-clamp-2 leading-tight">
                {previewData.title || 'Başlık bulunamadı'}
              </h3>
            </div>

            {/* Tespit Edilen Renkler */}
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
              <span className="text-slate-300 text-xs font-medium truncate">
                {previewData.variants?.colors?.length > 0 
                  ? `${previewData.variants.colors.length} Renk: ${previewData.variants.colors.slice(0, 2).join(', ')}${previewData.variants.colors.length > 2 ? '...' : ''}`
                  : detectedColor
                }
              </span>
            </div>

            {/* Stokta Olan Bedenler - Kompakt */}
            {availableSizes.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-0.5">
                  {availableSizes.slice(0, 3).map((size: string, idx: number) => (
                    <span
                      key={idx}
                      className="bg-green-900 text-green-300 px-1 py-0.5 rounded text-xs font-medium"
                    >
                      {size}
                    </span>
                  ))}
                  {availableSizes.length > 3 && (
                    <span className="text-green-400 text-xs">
                      +{availableSizes.length - 3}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Fiyat */}
            {previewData.price && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 text-xs font-semibold">
                  {previewData.price.formatted || previewData.price.profitFormatted || ''}
                </span>
              </div>
            )}

            {/* Özellikler - Tek Satır */}
            {features.length > 0 && (
              <div className="text-xs text-slate-400 truncate">
                {features[0]?.key}: {features[0]?.value}
                {features.length > 1 && ` +${features.length - 1}`}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScraperPage;