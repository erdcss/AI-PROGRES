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
  Loader2,
  ArrowRight,
  Download,
  Upload,
  Home,
  ShoppingCart
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

function ScraperPage() {
  const [product, setProduct] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(urlSchema),
    defaultValues: {
      url: ""
    }
  });

  // Basic CSV Download
  const handleCSVDownload = async () => {
    if (!product) {
      toast({
        title: "Hata",
        description: "Önce bir ürün çekin",
        variant: "destructive"
      });
      return;
    }

    setIsDownloading(true);
    try {
      const downloadUrl = '/api/download/shopify-urunler.csv';
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'shopify-urunler.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "CSV İndirildi",
        description: "Shopify formatında hazır",
      });
    } catch (error) {
      toast({
        title: "İndirme Hatası",
        description: "CSV dosyası indirilemedi",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Basic Shopify Upload
  const handleShopifyUpload = async () => {
    if (!product) {
      toast({
        title: "Hata",
        description: "Önce bir ürün çekin",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch('/api/shopify/add-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productData: product })
      });

      if (!response.ok) {
        throw new Error('Shopify yükleme başarısız');
      }

      const data = await response.json();
      
      toast({
        title: "Başarılı!",
        description: `Ürün Shopify'a yüklendi - ID: ${data.shopifyProductId}`,
      });
    } catch (error) {
      toast({
        title: "Yükleme Hatası",
        description: "Shopify'a yüklenirken hata oluştu",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const scrapeMutation = useMutation({
    mutationFn: async (data: { url: string }) => {
      // Use scenario-based scraping for Trendyol URLs
      if (data.url.includes('trendyol.com')) {
        const response = await apiRequest("POST", "/api/scenario-scrape", data);
        if (response.ok) {
          return response.json();
        }
      }
      
      // Fallback to regular scraper
      const response = await apiRequest("POST", "/api/scrape", data);
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
        description: "Ürün verisi çekildi"
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

  const onSubmit = form.handleSubmit((data) => {
    scrapeMutation.mutate(data);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <Home className="h-5 w-5" />
            Ana Sayfa
          </Link>
        </div>

        {/* Title */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">T</span>
            </div>
            <h1 className="text-3xl font-bold text-blue-400">Trendyol Aktarıcı</h1>
          </div>
          <p className="text-gray-400">Trendyol ürünlerini Shopify'a uyumlu formata dönüştürün</p>
        </div>

        {/* URL Input */}
        <Card className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border-blue-500/30">
          <CardContent className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Trendyol ürün linkini buraya yapıştırın..."
                  {...form.register("url")}
                  className="flex-1 bg-gray-800/50 border-gray-600 text-white placeholder:text-gray-400"
                />
                <Button
                  type="submit"
                  disabled={scrapeMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 px-8"
                >
                  {scrapeMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-5 h-5" />
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Product Display */}
        {product && (
          <Card className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border-blue-500/30">
            <CardContent className="p-6">
              <div className="space-y-6">
                
                {/* Product Info */}
                <div className="text-center border-b border-gray-700 pb-6">
                  <h2 className="text-xl font-bold text-blue-400 mb-2">
                    {product.brand?.toUpperCase() || 'MARKA'}
                  </h2>
                  <h3 className="text-lg text-white mb-4">{product.title}</h3>
                  
                  {/* Price */}
                  <div className="inline-flex items-center gap-4 bg-green-900/20 border border-green-600/30 rounded-lg p-3">
                    <div className="text-center">
                      <div className="text-sm text-green-300">Satış Fiyatı</div>
                      <div className="text-lg font-bold text-green-200">
                        {typeof product.price === 'object' ? product.price.profitFormatted : `${product.price} TL`}
                      </div>
                    </div>
                    {product.variants && (
                      <div className="text-center">
                        <div className="text-sm text-blue-300">Varyant Sayısı</div>
                        <div className="text-lg font-bold text-blue-200">
                          {product.variants.length}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Product Images */}
                {product.images && product.images.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">Ürün Görselleri ({product.images.length} adet)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {product.images.slice(0, 8).map((image: string, index: number) => (
                        <img
                          key={index}
                          src={image}
                          alt={`Ürün görseli ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg border border-gray-600"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ))}
                      {product.images.length > 8 && (
                        <div className="w-full h-32 bg-gray-800/50 rounded-lg border border-gray-600 flex items-center justify-center">
                          <span className="text-gray-400">+{product.images.length - 8} daha</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Variants */}
                {product.variants && product.variants.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">Ürün Varyantları</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {product.variants.slice(0, 6).map((variant: any, index: number) => (
                        <div key={index} className="bg-gray-800/30 rounded-lg p-3 border border-gray-600">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-blue-300 font-medium">{variant.color}</span>
                              <span className="text-gray-400 mx-2">•</span>
                              <span className="text-green-300">{variant.size}</span>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded ${
                              variant.inStock ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                            }`}>
                              {variant.inStock ? 'Stokta' : 'Tükendi'}
                            </span>
                          </div>
                        </div>
                      ))}
                      {product.variants.length > 6 && (
                        <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-600 flex items-center justify-center">
                          <span className="text-gray-400">+{product.variants.length - 6} varyant daha</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-4 pt-6 border-t border-gray-700">
                  <Button
                    onClick={handleCSVDownload}
                    disabled={isDownloading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    CSV İndir
                  </Button>
                  
                  <Button
                    onClick={handleShopifyUpload}
                    disabled={isUploading}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Shopify'a Yükle
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!product && !scrapeMutation.isPending && (
          <Card className="bg-gradient-to-br from-gray-900/40 to-gray-800/40 border-gray-600/30">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2">Ürün Bekleniyor</h3>
              <p className="text-gray-400">Yukarıdaki alana Trendyol ürün linkini yapıştırın ve başlayın</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 py-4">
          <p>ERDEM ÇALIŞKAN tarafından geliştirilmiştir • Versiyon 0.14.0</p>
        </div>
      </div>
    </div>
  );
}

export default ScraperPage;