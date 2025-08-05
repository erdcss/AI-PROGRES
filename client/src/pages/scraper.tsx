import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { urlSchema } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  Loader2,
  ArrowRight,
  Download,
  Upload,
  Home,
  ShoppingCart,
  Zap,
  Globe,
  Cpu,
  Sparkles
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import PageLayout from "@/components/PageLayout";

// Trendyol brand configuration
const TrendyolBrand = {
  name: "Trendyol",
  logo: (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
        <span className="text-white font-bold text-lg">T</span>
      </div>
      <span className="text-2xl font-bold text-orange-400">Trendyol</span>
    </div>
  ),
  color: "orange",
  domain: "trendyol.com"
};

function ScraperPage() {
  const [product, setProduct] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

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
    <PageLayout
      title="Trendyol Aktarıcı"
      subtitle="Trendyol ürünlerini yapay zeka destekli teknoloji ile Shopify'a uyumlu formata dönüştürün"
      backTo="/marketplace-selection"
      backLabel="Platform Seçimi"
    >
      <div className="w-full space-y-8">
        {/* Brand Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="flex justify-center mb-4">
            {TrendyolBrand.logo}
          </div>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto">
            Türkiye'nin en büyük online alışveriş sitesinden ürünleri Shopify mağazanıza kolayca aktarın
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <div className="bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium">
              🏆 Türkiye'nin 1 Numarası
            </div>
            <div className="bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium">
              ✨ Premium Kalite
            </div>
            <div className="bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium">
              🔧 Güvenilir Teknoloji
            </div>
          </div>
        </motion.div>

        {/* Status Indicators */}
        <div className="flex items-center justify-center gap-8 mb-8">
          <div className="flex items-center gap-2 text-sm glassmorphism-card px-4 py-2 rounded-full">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-green-400 font-medium">ONLINE</span>
          </div>
          <div className="flex items-center gap-2 text-sm glassmorphism-card px-4 py-2 rounded-full">
            <Cpu className="h-4 w-4 text-blue-400 animate-pulse" />
            <span className="text-blue-400 font-medium">AI READY</span>
          </div>
          <div className="flex items-center gap-2 text-sm glassmorphism-card px-4 py-2 rounded-full">
            <Zap className="h-4 w-4 text-purple-400" />
            <span className="text-purple-400 font-medium">&lt; 2s Response</span>
          </div>
        </div>

        {/* URL Input */}
        <Card className="bg-white/10 backdrop-blur-sm border border-white/20 shadow-2xl mb-8">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white mb-2">Trendyol Ürün Linki</h3>
              <p className="text-gray-300 text-sm">trendyol.com'dan herhangi bir ürün linkini yapıştırın</p>
            </div>
            
            <form onSubmit={onSubmit} className="space-y-6">
                
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Input
                        placeholder="https://www.trendyol.com/..."
                        {...form.register("url")}
                        className="bg-white/5 border-white/30 text-white placeholder-gray-400 pl-10 h-12"
                        disabled={scrapeMutation.isPending}
                      />
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                        <span className="text-white text-sm font-bold">T</span>
                      </div>
                    </div>
                    
                    {/* Trendyol Kategori Örnekleri */}
                    <div className="mt-4 space-y-3">
                      <p className="text-xs text-gray-400 font-medium">Desteklenen Trendyol Ürün Kategorileri:</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          👗 Moda & Giyim
                        </div>
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          📱 Elektronik & Teknoloji
                        </div>
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          🏠 Ev & Yaşam
                        </div>
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          👶 Anne & Bebek
                        </div>
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          ⚽ Spor & Outdoor
                        </div>
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          💄 Kozmetik & Bakım
                        </div>
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          🎮 Oyuncak & Hobi
                        </div>
                        <div className="text-xs text-white bg-white/10 px-3 py-2 rounded-lg text-center">
                          🍕 Market & Gıda
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={scrapeMutation.isPending}
                    className="bg-white text-slate-900 hover:bg-gray-100 px-8 h-12 disabled:bg-gray-600"
                  >
                    {scrapeMutation.isPending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Trendyol Ürünü Çıkar</span>
                      </div>
                    ) : (
                      <span>🎯 Trendyol Ürünü Çıkar</span>
                    )}
                  </Button>
                </div>
                
                {/* Loading Animation */}
                {scrapeMutation.isPending && (
                  <div className="mt-4">
                    <div className="flex items-center justify-center gap-2 text-white mb-2">
                      <Cpu className="h-4 w-4 animate-pulse" />
                      <span className="text-sm font-medium">AI ile ürün analiz ediliyor...</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-white to-gray-200 rounded-full animate-pulse" style={{width: '70%'}}></div>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Sistem Özellikleri */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <Card className="bg-white/10 backdrop-blur-sm border border-white/20 shadow-2xl">
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                  <Sparkles className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Sistem Özellikleri</h3>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <span className="text-green-400 font-bold text-lg">AI</span>
                    </div>
                    <div>
                      <div className="text-white font-medium">Yapay Zeka</div>
                      <div className="text-gray-400 text-sm">Otomatik Analiz</div>
                    </div>
                  </div>
                  <div className="text-green-400 font-bold text-xl">%99</div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <span className="text-blue-400 font-bold text-lg">HD</span>
                    </div>
                    <div>
                      <div className="text-white font-medium">Görsel Kalitesi</div>  
                      <div className="text-gray-400 text-sm">Yüksek Çözünürlük</div>
                    </div>
                  </div>
                  <div className="text-blue-400 font-bold text-xl">15%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border border-white/20 shadow-2xl">
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-4">
                  <Globe className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Trendyol Kullanım Kılavuzu</h3>
              </div>
              
              <div className="space-y-3 text-gray-300 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">1</span>
                  </div>
                  <p>trendyol.com'den istediğiniz ürününün linkini kopyalayın</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">2</span>
                  </div>
                  <p>Linki yukarıdaki alana yapıştırın ve "Trendyol Ürünü Çıkar" butonuna tıklayın</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">3</span>
                  </div>
                  <p>Ürün bilgileri ve görselleri otomatik olarak çıkarılacak</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">4</span>
                  </div>
                  <p>"CSV İndir" ile Shopify formatında dosya indirin</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">5</span>
                  </div>
                  <p>"Shopify'a Yükle" ile doğrudan mağazanıza aktarın</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trendyol Özel Avantajları */}
        <Card className="bg-white/10 backdrop-blur-sm border border-white/20 shadow-2xl mb-8">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-4">Trendyol Özel Avantajları</h3>
              <p className="text-gray-300">Türkiye'nin en büyük e-ticaret platformu için özel geliştirilmiş sistem</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                  <Zap className="w-8 h-8 text-green-400" />
                </div>
                <h4 className="text-white font-medium mb-2">Otomatik teknik özellik çıkarma</h4>
                <p className="text-gray-400 text-sm">Ürün detayları tam otomatikleştirme</p>
              </div>
              
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
                  <Download className="w-8 h-8 text-blue-400" />
                </div>
                <h4 className="text-white font-medium mb-2">Enerji sınıfı tanıma sistemi</h4>
                <p className="text-gray-400 text-sm">A++, A+ enerji etiketleri otomatik tespit</p>
              </div>
              
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-500/20 rounded-full mb-4">
                  <ShoppingCart className="w-8 h-8 text-purple-400" />
                </div>
                <h4 className="text-white font-medium mb-2">Kapasite ve boyut analizi</h4>
                <p className="text-gray-400 text-sm">Litre, kg, ölçü bilgileri tam otomatik</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Display */}
        {product && (
          <div className="animate-fade-in-up" style={{animationDelay: '0.1s'}}>
            <Card className="relative group overflow-hidden">
              {/* Enhanced Glassmorphism Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-cyan-500/5 to-blue-600/10 backdrop-blur-2xl"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-cyan-500/5 to-blue-600/5"></div>
              
              {/* Success Border Animation */}
              <div className="absolute inset-0 bg-gradient-to-r from-green-400 via-cyan-500 to-blue-500 rounded-lg p-[1px]">
                <div className="h-full w-full bg-black/90 rounded-lg"></div>
              </div>
              
              <CardContent className="relative z-10 p-8">
                <div className="space-y-8">
                
                {/* Success Header */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-full mb-6 animate-pulse">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="font-medium">Ürün Başarıyla Analiz Edildi</span>
                  </div>
                </div>

                {/* Product Info */}
                <div className="text-center border-b border-gray-700/50 pb-8">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-3">
                      {product.brand?.toUpperCase() || 'MARKA'}
                    </h2>
                    <h3 className="text-xl text-white leading-relaxed max-w-3xl mx-auto">{product.title}</h3>
                  </div>
                  
                  {/* Enhanced Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                    <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/10 border border-green-500/30 rounded-xl p-4 hover:scale-105 transition-all duration-300">
                      <div className="text-sm text-green-300 mb-1">Satış Fiyatı</div>
                      <div className="text-2xl font-bold text-green-200">
                        {typeof product.price === 'object' ? product.price.profitFormatted : `${product.price} TL`}
                      </div>
                    </div>
                    
                    {product.variants && (
                      <div className="bg-gradient-to-br from-blue-500/10 to-cyan-600/10 border border-blue-500/30 rounded-xl p-4 hover:scale-105 transition-all duration-300">
                        <div className="text-sm text-blue-300 mb-1">Varyant Sayısı</div>
                        <div className="text-2xl font-bold text-blue-200">
                          {product.variants.length}
                        </div>
                      </div>
                    )}
                    
                    {product.images && (
                      <div className="bg-gradient-to-br from-purple-500/10 to-pink-600/10 border border-purple-500/30 rounded-xl p-4 hover:scale-105 transition-all duration-300">
                        <div className="text-sm text-purple-300 mb-1">Görsel Sayısı</div>
                        <div className="text-2xl font-bold text-purple-200">
                          {product.images.length}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Product Images */}
                {product.images && product.images.length > 0 && (
                  <div className="animate-fade-in-up" style={{animationDelay: '0.3s'}}>
                    <h4 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                      <div className="w-1 h-6 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-full"></div>
                      Ürün Görselleri
                      <span className="text-sm text-cyan-400 bg-cyan-500/20 px-2 py-1 rounded-full">
                        {product.images.length} adet
                      </span>
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {product.images.slice(0, 12).map((image: string, index: number) => (
                        <div
                          key={index}
                          className="group relative overflow-hidden rounded-xl border border-gray-700/50 hover:border-cyan-500/50 transition-all duration-300 hover:scale-105"
                          style={{animationDelay: `${index * 0.1}s`}}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          <img
                            src={image}
                            alt={`Ürün görseli ${index + 1}`}
                            className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-110"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"></div>
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            #{index + 1}
                          </div>
                        </div>
                      ))}
                      {product.images.length > 12 && (
                        <div className="w-full h-32 bg-gradient-to-br from-gray-800/30 to-gray-900/50 rounded-xl border border-gray-700/50 flex flex-col items-center justify-center hover:scale-105 transition-transform duration-300">
                          <span className="text-2xl font-bold text-gray-400">+{product.images.length - 12}</span>
                          <span className="text-xs text-gray-500">daha fazla</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Variants */}
                {product.variants && product.variants.length > 0 && (
                  <div className="animate-fade-in-up" style={{animationDelay: '0.5s'}}>
                    <h4 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                      <div className="w-1 h-6 bg-gradient-to-b from-purple-400 to-pink-600 rounded-full"></div>
                      Ürün Varyantları
                      <span className="text-sm text-purple-400 bg-purple-500/20 px-2 py-1 rounded-full">
                        {product.variants.length} adet
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {product.variants.slice(0, 9).map((variant: any, index: number) => (
                        <div 
                          key={index} 
                          className="group relative bg-gradient-to-br from-gray-800/20 to-gray-900/40 rounded-xl p-4 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 hover:scale-105"
                          style={{animationDelay: `${index * 0.1}s`}}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"></div>
                          <div className="relative z-10">
                            <div className="flex justify-between items-start mb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"></div>
                                  <span className="text-cyan-300 font-medium">{variant.color}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"></div>
                                  <span className="text-green-300 font-medium">{variant.size}</span>
                                </div>
                              </div>
                              <span className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-300 ${
                                variant.inStock 
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/30 group-hover:bg-green-500/30' 
                                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
                              }`}>
                                {variant.inStock ? '✓ Stokta' : '✗ Tükendi'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400">
                              Varyant #{index + 1}
                            </div>
                          </div>
                        </div>
                      ))}
                      {product.variants.length > 9 && (
                        <div className="bg-gradient-to-br from-gray-800/20 to-gray-900/40 rounded-xl p-4 border border-gray-700/50 flex flex-col items-center justify-center hover:scale-105 transition-transform duration-300">
                          <span className="text-2xl font-bold text-gray-400 mb-1">+{product.variants.length - 9}</span>
                          <span className="text-xs text-gray-500">varyant daha</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="animate-fade-in-up pt-8 border-t border-gray-700/50" style={{animationDelay: '0.7s'}}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Button
                      onClick={handleCSVDownload}
                      disabled={isDownloading}
                      className="group relative h-16 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 border-0 text-white font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="relative z-10 flex items-center justify-center gap-3">
                        {isDownloading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>İndiriliyor...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-5 h-5 group-hover:animate-bounce" />
                            <span>CSV İndir</span>
                          </>
                        )}
                      </div>
                    </Button>
                    
                    <Button
                      onClick={handleShopifyUpload}
                      disabled={isUploading}
                      className="group relative h-16 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 border-0 text-white font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-green-500/25"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="relative z-10 flex items-center justify-center gap-3">
                        {isUploading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Yükleniyor...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-5 h-5 group-hover:animate-bounce" />
                            <span>Shopify'a Yükle</span>
                          </>
                        )}
                      </div>
                    </Button>
                  </div>
                  
                  {/* Action Stats */}
                  <div className="mt-6 grid grid-cols-2 gap-4 text-center">
                    <div className="text-sm">
                      <div className="text-blue-400 font-medium">CSV Format</div>
                      <div className="text-gray-400">Shopify Uyumlu</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-green-400 font-medium">Otomatik Yükleme</div>
                      <div className="text-gray-400">Tek Tıkla</div>
                    </div>
                  </div>
                </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty State */}
        {!product && !scrapeMutation.isPending && (
          <div className="animate-fade-in-up" style={{animationDelay: '0.6s'}}>
            <Card className="relative group overflow-hidden">
              {/* Subtle Glassmorphism Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-gray-500/5 to-black/10 backdrop-blur-xl"></div>
              
              {/* Subtle Border */}
              <div className="absolute inset-0 bg-gradient-to-r from-gray-600 via-gray-500 to-gray-600 rounded-lg p-[1px]">
                <div className="h-full w-full bg-black/80 rounded-lg"></div>
              </div>
              
              <CardContent className="relative z-10 p-16 text-center">
                <div className="relative group-hover:scale-105 transition-transform duration-500">
                  <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="relative w-24 h-24 bg-gradient-to-br from-gray-700/30 to-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShoppingCart className="w-12 h-12 text-gray-400 group-hover:text-cyan-400 transition-colors duration-300" />
                  </div>
                </div>
                
                <h3 className="text-2xl font-semibold text-gray-300 mb-3">AI Ürün Analizine Hazır</h3>
                <p className="text-gray-400 text-lg max-w-md mx-auto leading-relaxed">Yukarıdaki alana Trendyol ürün linkini yapıştırın ve yapay zeka destekli analizi başlatın</p>
                
                {/* Feature Highlights */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 max-w-2xl mx-auto">
                  <div className="text-center p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                    <Zap className="h-6 w-6 text-cyan-400 mx-auto mb-2" />
                    <div className="text-sm text-cyan-300 font-medium">Hızlı Analiz</div>
                    <div className="text-xs text-gray-400">&lt; 2 saniye</div>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                    <Cpu className="h-6 w-6 text-green-400 mx-auto mb-2" />
                    <div className="text-sm text-green-300 font-medium">AI Powered</div>
                    <div className="text-xs text-gray-400">Gelişmiş Algılama</div>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <Globe className="h-6 w-6 text-purple-400 mx-auto mb-2" />
                    <div className="text-sm text-purple-300 font-medium">Shopify Ready</div>
                    <div className="text-xs text-gray-400">Anında Uyumlu</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-8 animate-fade-in" style={{animationDelay: '0.8s'}}>
          <div className="bg-gradient-to-r from-transparent via-gray-800/30 to-transparent h-[1px] mb-6"></div>
          <p className="text-gray-400 text-sm mb-2">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent font-medium">ERDEM ÇALIŞKAN</span> 
            tarafından geliştirilmiştir
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
            <span>Versiyon 0.14.0</span>
            <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
            <span>AI Enhanced</span>
            <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
            <span>Modern UI</span>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default ScraperPage;