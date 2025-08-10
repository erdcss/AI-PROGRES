import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, Link, Copy, X, Home, Plus, Trash2, Package, Palette } from "lucide-react";

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
      
      // Shopify'a otomatik yükleme ve CSV indirme
      if (data.csvContent) {
        // Önce Shopify'a yükle
        uploadToShopify(data.csvContent, data.title || 'Multi-Variant Product');
        
        // Sonra CSV'yi de indir
        downloadCSV(data.csvContent, `${data.title || 'multi-variant'}-shopify.csv`);
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
      const response = await fetch('/api/shopify-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvContent: csvContent,
          productTitle: productTitle
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Shopify'a Yüklendi!",
          description: `Ürün başarıyla Shopify mağazanıza eklendi. ID: ${result.productId || 'N/A'}`,
          duration: 5000
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Shopify Yükleme Hatası",
          description: errorData.message || "Shopify'a yüklenirken hata oluştu",
          variant: "destructive",
          duration: 5000
        });
      }
    } catch (error) {
      toast({
        title: "Bağlantı Hatası",
        description: "Shopify'a yüklenirken bağlantı hatası oluştu",
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Section */}
          <div className="lg:col-span-2">
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
                              <span>Birleştiriliyor...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>BİRLEŞTİR VE CSV İNDİR</span>
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

          {/* Info Section */}
          <div className="lg:col-span-1">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-black">BİLGİ</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {scrapingMode === 'single' && (
                    <div className="bg-blue-900 p-4 rounded-lg">
                      <h3 className="text-white font-bold text-sm mb-2">TEK VARYANT MODU</h3>
                      <div className="space-y-2 text-sm text-white">
                        <p>• Renk seçeneği olmayan ürünler için</p>
                        <p>• Tek URL ile çalışır</p>
                        <p>• Sadece beden/boyut varyantları</p>
                        <p>• Ürün özellikleri dahil</p>
                        <p>• Hızlı işlem</p>
                      </div>
                    </div>
                  )}
                  
                  {scrapingMode === 'multi-url' && (
                    <div className="bg-blue-900 p-4 rounded-lg">
                      <h3 className="text-white font-bold text-sm mb-2">ÇOKLU VARYANT BİRLEŞTİRME</h3>
                      <div className="space-y-2 text-sm text-white">
                        <p>• Aynı ürünün farklı renk URL'leri</p>
                        <p>• Tek Shopify ürünü olarak birleşir</p>
                        <p>• Ortak: Marka, başlık, özellikler, bedenler</p>
                        <p>• Farklı: Renkler ve görseller</p>
                        <p>• Otomatik CSV oluşturma</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-slate-800 p-4 rounded-lg">
                    <h3 className="text-white font-bold text-sm mb-2">DESTEKLENEN ÖZELLİKLER</h3>
                    <div className="space-y-1 text-sm text-white">
                      <p>✓ Maybelline & L'Oreal renk tespiti</p>
                      <p>✓ Gerçek varyant çıkarma (sahte üretim yok)</p>
                      <p>✓ Yüksek kaliteli görsel çıkarma</p>
                      <p>✓ Shopify uyumlu CSV</p>
                      <p>✓ Türkçe renk isimleri korunur</p>
                    </div>
                  </div>
                  
                  <div className="bg-green-900 p-4 rounded-lg">
                    <h3 className="text-white font-bold text-sm mb-2">KULLANIM KILAVUZU</h3>
                    <div className="space-y-2 text-sm text-white">
                      {scrapingMode === 'single' ? (
                        <>
                          <p>1. Tek Varyant modunu seçin</p>
                          <p>2. Trendyol URL'sini yapıştırın</p>
                          <p>3. "TEK VARYANT ÇIKAR" butonuna tıklayın</p>
                        </>
                      ) : (
                        <>
                          <p>1. İlk renk varyantının URL'sini girin</p>
                          <p>2. "URL Alanı Ekle" ile diğer renkleri ekleyin</p>
                          <p>3. Her URL için renk ismini belirtin</p>
                          <p>4. "BİRLEŞTİR VE CSV İNDİR" butonuna tıklayın</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

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

export default ScraperPage;