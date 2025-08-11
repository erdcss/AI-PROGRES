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
import { CSVPreview } from "@/components/CSVPreview";

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
  const [allImages, setAllImages] = useState<any[]>([]);
  const [productFeatures, setProductFeatures] = useState<any[]>([]);
  
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

  const uploadToShopifyMutation = useMutation({
    mutationFn: async () => {
      if (!product) {
        throw new Error("Önce ürün verisi çekilmelidir");
      }
      
      const response = await fetch("/api/shopify/add-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productData: product }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Başarılı",
        description: "Ürün Shopify'a başarıyla yüklendi"
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

  // All Images extraction mutation
  const extractAllImagesMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/comprehensive-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setAllImages(data.images || []);
      toast({
        title: "Tüm Görseller Çıkarıldı",
        description: `${data.totalImages} görsel bulundu ve kategorize edildi`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Görsel Çıkarma Hatası",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Product features extraction mutation
  const extractFeaturesMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/scenario-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setProductFeatures(data.features || []);
      toast({
        title: "Ürün Özellikleri Çıkarıldı",
        description: `${data.features?.length || 0} özellik bulundu`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Özellik Çıkarma Hatası",
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
    <div className="min-h-screen bg-gradient-to-br from-black via-slate-900 to-cyan-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-black/95 via-slate-900/90 to-cyan-900/80 backdrop-blur-sm border-b border-cyan-800/30">
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
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-800 to-blue-900 rounded-lg flex items-center justify-center">
                  <span className="text-white font-thin text-lg">T</span>
                </div>
                <div>
                  <h1 className="text-white font-thin text-xl tracking-wider">TRENDYOL</h1>
                  <p className="text-cyan-400/80 text-sm font-thin">Ürün Çıkarıcı</p>
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
            {/* Mode Selection - Hidden, only single mode available */}

            {/* Single Mode Form */}
            <div>
              <Card className="business-card">
                <CardHeader className="business-header">
                  <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                    <Package className="w-5 h-5 text-cyan-400/70" />
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
                      <label className="text-white font-thin text-sm">Ürün URL'si</label>
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
                    
                    <div className="flex gap-3">
                      <Button
                        type="submit"
                        disabled={singleScrapeMutation.isPending || uploadToShopifyMutation.isPending}
                        className="business-button flex-1 h-14 text-lg font-thin"
                      >
                        {singleScrapeMutation.isPending ? (
                          <div className="flex items-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Ürün Verisi Çekiliyor...</span>
                          </div>
                        ) : (
                          <span>SHOPIFY'A AKTAR</span>
                        )}
                      </Button>
                      
                      {product && (
                        <Button
                          type="button"
                          disabled={uploadToShopifyMutation.isPending || singleScrapeMutation.isPending}
                          onClick={() => uploadToShopifyMutation.mutate()}
                          className="bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white h-14 px-6 text-lg font-thin transition-all duration-200"
                        >
                          {uploadToShopifyMutation.isPending ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Shopify'a Yükleniyor...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <ShoppingCart className="w-5 h-5" />
                              <span>Shopify'a Yükle</span>
                            </div>
                          )}
                        </Button>
                      )}
                    </div>
                    
                    {/* Additional extraction options */}
                    {singleForm.watch('url') && (
                      <div className="mt-6 pt-6 border-t border-cyan-800/30">
                        <p className="text-white/70 font-thin text-sm mb-4">Gelişmiş Çıkarma Seçenekleri</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={extractAllImagesMutation.isPending}
                            onClick={() => extractAllImagesMutation.mutate(singleForm.getValues('url'))}
                            className="business-button-outline h-12 text-sm"
                          >
                            {extractAllImagesMutation.isPending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Görseller Çıkarılıyor...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Image className="w-4 h-4" />
                                <span>Tüm Görselleri Getir</span>
                              </div>
                            )}
                          </Button>
                          
                          <Button
                            type="button"
                            variant="outline"
                            disabled={extractFeaturesMutation.isPending}
                            onClick={() => extractFeaturesMutation.mutate(singleForm.getValues('url'))}
                            className="business-button-outline h-12 text-sm"
                          >
                            {extractFeaturesMutation.isPending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Özellikler Çıkarılıyor...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                <span>Ürün Özelliklerini Getir</span>
                              </div>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </motion.form>
                </CardContent>
              </Card>
            </div>
          </div>


        </div>

        {/* All Images Display Section */}
        {allImages.length > 0 && (
          <div className="mt-8">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <Image className="w-5 h-5 text-cyan-400/70" />
                  Tüm Ürün Görselleri ({allImages.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {allImages.slice(0, 24).map((image, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={image.url || image}
                        alt={`Ürün görseli ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-cyan-800/30 group-hover:border-cyan-600 transition-colors"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs">{index + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {allImages.length > 24 && (
                  <p className="text-white/60 text-sm mt-4 text-center">
                    ve {allImages.length - 24} görsel daha...
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Product Features Display Section */}
        {productFeatures.length > 0 && (
          <div className="mt-8">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400/70" />
                  Ürün Özellikleri ({productFeatures.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {productFeatures.map((feature, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg border border-cyan-800/20">
                      <span className="text-white/80 font-medium text-sm">{feature.key}</span>
                      <span className="text-cyan-400 text-sm">{feature.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* CSV Preview Section - Single Variant */}
        {product && (
          <div className="mt-8">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-cyan-400/70" />
                  CSV Ön İzleme - Tek Varyant
                </CardTitle>
                <p className="text-cyan-400/70 text-sm font-thin">Shopify için hazırlanmış CSV dosyası ön görünümü</p>
              </CardHeader>
              <CardContent className="p-6">
                <CSVPreview product={product} isVisible={true} />
              </CardContent>
            </Card>
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
  const availableSizes = previewData.variants?.availableSizes || previewData.variants?.sizes || [];
  const outOfStockSizes = previewData.variants?.unavailableSizes || [];
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

            {/* Tüm Bedenler - Stokta olanlar yeşil, olmayanlar gri */}
            {(availableSizes.length > 0 || outOfStockSizes.length > 0) && (
              <div>
                <div className="flex flex-wrap gap-0.5">
                  {/* Stokta olan bedenler - yeşil */}
                  {availableSizes.map((size: string, idx: number) => (
                    <span
                      key={`available-${idx}`}
                      className="bg-green-900 text-green-300 px-1 py-0.5 rounded text-xs font-medium"
                    >
                      {size}
                    </span>
                  ))}
                  {/* Stokta olmayan bedenler - gri */}
                  {outOfStockSizes.map((size: string, idx: number) => (
                    <span
                      key={`out-of-stock-${idx}`}
                      className="bg-gray-800 text-gray-500 px-1 py-0.5 rounded text-xs font-medium opacity-70"
                    >
                      {size}
                    </span>
                  ))}
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