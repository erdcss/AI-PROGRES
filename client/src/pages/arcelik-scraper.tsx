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
  Home,
  ShoppingCart,
  ExternalLink
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

// Arçelik brand configuration
const ArcelikBrand = {
  name: "Arçelik",
  logo: (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
        <span className="text-white font-bold text-lg">A</span>
      </div>
      <span className="text-2xl font-bold text-emerald-400">Arçelik</span>
    </div>
  ),
  color: "emerald",
  domain: "arcelik.com.tr"
};

interface ExtractedProduct {
  success: boolean;
  title: string;
  brand: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
    withProfit: number;
    profitFormatted: string;
  };
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
  }>;
  tags: string[];
  extractionDetails: {
    scenario: string;
    confidence: number;
    evidence: string[];
    strategy: string;
  };
  extractionMethod: string;
}

const ArcelikScraper = () => {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [extractedProduct, setExtractedProduct] = useState<ExtractedProduct | null>(null);
  const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
  const [selectedMainImage, setSelectedMainImage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(urlSchema),
    defaultValues: {
      url: "",
    },
  });

  // Arçelik product extraction mutation
  const extractProductMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest('/api/arcelik-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) {
        throw new Error('Ürün çıkarma işlemi başarısız');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setExtractedProduct(data);
        setSelectedMainImage(data.images[0] || null);
        toast({
          title: "Başarılı",
          description: `Arçelik ürünü başarıyla çıkarıldı: ${data.images.length} görsel, ${data.features.length} özellik`,
        });
      } else {
        toast({
          title: "Hata",
          description: data.message || "Ürün çıkarma işlemi başarısız",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Beklenmedik bir hata oluştu",
        variant: "destructive",
      });
    },
  });

  // CSV generation mutation
  const generateCSVMutation = useMutation({
    mutationFn: async (productData: ExtractedProduct) => {
      const response = await apiRequest('/api/comprehensive-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productData })
      });
      
      if (!response.ok) {
        throw new Error('CSV oluşturma başarısız');
      }
      
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arcelik-shopify-products.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "CSV İndirildi",
        description: "Shopify CSV dosyası başarıyla oluşturuldu ve indirildi",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "CSV Hatası",
        description: error.message || "CSV oluşturma işlemi başarısız",
        variant: "destructive",
      });
    },
  });

  // Direct Shopify upload mutation
  const uploadToShopifyMutation = useMutation({
    mutationFn: async (productData: ExtractedProduct) => {
      const response = await apiRequest('/api/shopify-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          productData,
          platform: 'arcelik'
        })
      });
      
      if (!response.ok) {
        throw new Error('Shopify yükleme başarısız');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Shopify'a Yüklendi",
          description: `Ürün başarıyla Shopify'a yüklendi. ID: ${data.productId}`,
        });
      } else {
        toast({
          title: "Yükleme Hatası",
          description: data.message || "Shopify yükleme işlemi başarısız",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Shopify Hatası",
        description: error.message || "Shopify bağlantı hatası",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: { url: string }) => {
    const cleanUrl = data.url.trim();
    
    if (!cleanUrl.includes('arcelik.com.tr')) {
      toast({
        title: "Geçersiz URL",
        description: "Lütfen geçerli bir Arçelik ürün URL'si girin",
        variant: "destructive",
      });
      return;
    }

    extractProductMutation.mutate(cleanUrl);
  };

  const handleCSVGeneration = () => {
    if (extractedProduct) {
      generateCSVMutation.mutate(extractedProduct);
    }
  };

  const handleShopifyUpload = () => {
    if (extractedProduct) {
      uploadToShopifyMutation.mutate(extractedProduct);
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedMainImage(imageUrl);
  };

  const handleImageURLCopy = (imageUrl: string) => {
    navigator.clipboard.writeText(imageUrl);
    toast({
      title: "Kopyalandı",
      description: "Görsel URL'si panoya kopyalandı",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-slate-900 to-green-900">
      {/* Navigation */}
      <div className="bg-slate-800/30 backdrop-blur-sm border-b border-emerald-500/20 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="sm" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                <Home className="w-4 h-4 mr-2" />
                Ana Sayfa
              </Button>
            </Link>
            {ArcelikBrand.logo}
          </div>
          <RealTimeClock />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Arçelik Ürün Çıkarma Sistemi
            </h1>
            <p className="text-gray-300 text-lg">
              Arçelik ürünlerini çıkarın ve Shopify'a aktarın
            </p>
          </div>

          {/* URL Input Form */}
          <Card className="bg-slate-800/30 backdrop-blur-sm border-emerald-500/20 mb-8">
            <CardContent className="p-6">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      {...form.register("url")}
                      placeholder="Arçelik ürün URL'sini buraya yapıştırın... (örn: https://www.arcelik.com.tr/...)"
                      className="bg-slate-700/50 border-emerald-500/30 text-white placeholder-gray-400"
                      disabled={extractProductMutation.isPending}
                    />
                    {form.formState.errors.url && (
                      <p className="text-red-400 text-sm mt-1">
                        {form.formState.errors.url.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={extractProductMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 px-8"
                  >
                    {extractProductMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Çıkarılıyor...
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4 mr-2" />
                        Ürünü Çıkar
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Results Section */}
          <AnimatePresence>
            {extractedProduct && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                className="space-y-6"
              >
                {/* Action Buttons */}
                <div className="flex flex-wrap gap-4 justify-center">
                  <Button
                    onClick={handleCSVGeneration}
                    disabled={generateCSVMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {generateCSVMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    CSV İndir
                  </Button>
                  
                  <Button
                    onClick={handleShopifyUpload}
                    disabled={uploadToShopifyMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {uploadToShopifyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Shopify'a Yükle
                  </Button>
                </div>

                {/* Product Display */}
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Images Section */}
                  <Card className="bg-slate-800/30 backdrop-blur-sm border-emerald-500/20">
                    <CardContent className="p-6">
                      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-emerald-400" />
                        Ürün Görselleri ({extractedProduct.images.length} adet)
                      </h3>
                      
                      {/* Main Image Display */}
                      {selectedMainImage && (
                        <div className="mb-4">
                          <div className="relative bg-slate-700/50 rounded-lg overflow-hidden aspect-square">
                            <img
                              src={selectedMainImage}
                              alt="Ana ürün görseli"
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23374151'/%3E%3Ctext x='200' y='200' text-anchor='middle' fill='%239CA3AF' font-size='14'%3EArçelik Ürün Görseli%3C/text%3E%3C/svg%3E";
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Image Grid */}
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {extractedProduct.images.map((image, index) => (
                          <div
                            key={index}
                            className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all duration-300 ${
                              selectedMainImage === image 
                                ? 'border-emerald-400 scale-105' 
                                : 'border-slate-600 hover:border-emerald-300'
                            }`}
                            onClick={() => handleImageClick(image)}
                          >
                            <img
                              src={image}
                              alt={`Ürün görseli ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23374151'/%3E%3Ctext x='50' y='50' text-anchor='middle' fill='%239CA3AF' font-size='10'%3E${index + 1}%3C/text%3E%3C/svg%3E";
                              }}
                            />
                            <div className="absolute top-1 left-1 bg-black/50 text-white text-xs px-1 rounded">
                              {index + 1}
                            </div>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 hover:bg-black/70"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageURLCopy(image);
                              }}
                            >
                              <Clipboard className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Product Details */}
                  <Card className="bg-slate-800/30 backdrop-blur-sm border-emerald-500/20">
                    <CardContent className="p-6">
                      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <Package className="w-5 h-5 text-emerald-400" />
                        Ürün Detayları
                      </h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-300">Ürün Adı</label>
                          <p className="text-white text-lg font-semibold">{extractedProduct.title}</p>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-gray-300">Marka</label>
                          <p className="text-emerald-400 text-lg font-semibold">{extractedProduct.brand}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-300">Orijinal Fiyat</label>
                            <p className="text-red-400 text-lg font-semibold line-through">
                              {extractedProduct.price.formatted}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-300">Satış Fiyatı (%15 Kar)</label>
                            <p className="text-green-400 text-lg font-semibold">
                              {extractedProduct.price.profitFormatted}
                            </p>
                          </div>
                        </div>

                        {/* Features */}
                        <div>
                          <label className="text-sm font-medium text-gray-300 mb-2 block">
                            Ürün Özellikleri ({extractedProduct.features.length} adet)
                          </label>
                          <ScrollArea className="h-40 bg-slate-700/30 rounded-lg p-3">
                            <div className="space-y-2">
                              {extractedProduct.features.map((feature, index) => (
                                <div key={index} className="text-sm">
                                  <span className="text-emerald-400 font-medium">{feature.key}:</span>
                                  <span className="text-gray-300 ml-2">{feature.value}</span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>

                        {/* Variants */}
                        {extractedProduct.variants.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-gray-300 mb-2 block">
                              Varyantlar ({extractedProduct.variants.length} adet)
                            </label>
                            <div className="space-y-2">
                              {extractedProduct.variants.map((variant, index) => (
                                <div key={index} className="flex items-center gap-2 text-sm">
                                  <div 
                                    className="w-4 h-4 rounded border border-gray-400"
                                    style={{ backgroundColor: variant.colorCode }}
                                  />
                                  <span className="text-white">{variant.color}</span>
                                  {variant.size && (
                                    <span className="text-gray-400">• {variant.size}</span>
                                  )}
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    variant.inStock ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                  }`}>
                                    {variant.inStock ? 'Stokta' : 'Tükendi'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Extraction Info */}
                        <div className="bg-slate-700/30 rounded-lg p-3">
                          <div className="text-sm text-gray-400">
                            <div>Çıkarma Yöntemi: <span className="text-emerald-400">{extractedProduct.extractionMethod}</span></div>
                            <div>Senaryo: <span className="text-emerald-400">{extractedProduct.extractionDetails.scenario}</span></div>
                            <div>Güven: <span className="text-emerald-400">{extractedProduct.extractionDetails.confidence.toFixed(1)}%</span></div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Help Section */}
          <Card className="bg-slate-800/30 backdrop-blur-sm border-emerald-500/20 mt-8">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-emerald-400" />
                Kullanım Kılavuzu
              </h3>
              <div className="text-gray-300 space-y-2 text-sm">
                <p>• Arçelik ürün sayfasından URL'yi kopyalayın ve yukarıdaki alana yapıştırın</p>
                <p>• "Ürünü Çıkar" butonuna tıklayarak ürün bilgilerini çıkarın</p>
                <p>• "CSV İndir" ile Shopify uyumlu CSV dosyasını indirin</p>
                <p>• "Shopify'a Yükle" ile ürünü doğrudan Shopify mağazanıza ekleyin</p>
                <p>• Çıkarılan görsellere tıklayarak büyük görüntüleyebilir, URL'lerini kopyalayabilirsiniz</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default ArcelikScraper;