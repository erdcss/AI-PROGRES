import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, Link, Copy, X, Home, Plus, Trash2, Package, Palette, Eye, Image, FileText, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CSVPreview } from "@/components/CSVPreview";
import { CSVDrawerPreview } from "@/components/CSVDrawerPreview";

import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const scrapeSchema = z.object({
  url: z.string().url("Geçerli bir URL giriniz").refine(
    (url) => url.includes("arcelik.com.tr"),
    "Sadece Arçelik URL'leri desteklenmektedir"
  ),
});

type ScrapeFormData = z.infer<typeof scrapeSchema>;

interface Product {
  id?: string;
  title: string;
  price?: number | { profitFormatted?: string; formatted?: string; original?: number; withProfit?: number };
  images?: Array<string | { url: string; alt?: string }>;
  description?: string;
  brand?: string;
  variants?: {
    colors?: string[];
    sizes?: string[];
    allVariants?: Array<{
      color: string;
      colorCode?: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features?: Array<{ key: string; value: string }>;
  tags?: string[];
  category?: string;
  success?: boolean;
  extractionMethod?: string;
  csvContent?: string;
}

function ArcelikScraper() {
  const [product, setProduct] = useState<Product | null>(null);
  const [, setLocation] = useLocation();
  const [allImages, setAllImages] = useState<any[]>([]);
  const [productFeatures, setProductFeatures] = useState<any[]>([]);
  const [persistentTags, setPersistentTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [draggedUrls, setDraggedUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvPreviews, setCsvPreviews] = useState<any[]>([]);
  
  const singleForm = useForm<ScrapeFormData>({
    resolver: zodResolver(scrapeSchema),
    defaultValues: {
      url: "",
    },
  });

  const singleScrapeMutation = useMutation({
    mutationFn: async (data: ScrapeFormData & { persistentTags?: string[]; onlyExtractData?: boolean }) => {
      // Arçelik URL'leri için scenario-scrape (async job pattern)
      const startResp = await fetch("/api/scenario-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: data.url, 
          persistentTags: data.persistentTags || [],
          platform: 'arcelik'
        }),
      });
      if (!startResp.ok) {
        const errorData = await startResp.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${startResp.status}`);
      }
      const startData = await startResp.json();
      if (!startData.jobId) {
        return { ...startData, originalUrl: data.url };
      }
      const { jobId } = startData;
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500));
        const pollResp = await fetch(`/api/scrape-job/${jobId}`);
        if (!pollResp.ok) throw new Error(`Polling failed: HTTP ${pollResp.status}`);
        const pollData = await pollResp.json();
        if (pollData.status === 'done') {
          const result = pollData.result;
          if (result?.success === false) throw new Error(result.message || 'Extraction failed');
          return { ...result, originalUrl: data.url };
        }
        if (pollData.status === 'error') throw new Error(pollData.error || 'Scraping failed');
      }
      throw new Error('Zaman aşımı — lütfen tekrar deneyin.');
    },
    onSuccess: (data) => {
      if (data.success) {
        setProduct(data);
        setAllImages(data.images || []);
        setProductFeatures(data.features || []);
        
        // CSV Preview Ekleme Sistemi - Trendyol ile aynı
        const csvPreview = {
          id: Date.now().toString(),
          productTitle: data.title || "Arçelik Ürünü",
          productPrice: data.price?.withProfit || data.price?.original || 0,
          productImages: Array.isArray(data.images) ? data.images.length : 0,
          productVariants: data.variants?.allVariants?.length || 0,
          csvContent: data.csvContent || "",
          sourceUrl: data.sourceUrl || data.originalUrl || "",
          productData: data
        };
        
        setCsvPreviews(prev => [csvPreview, ...prev]);
        
        toast({
          title: "Başarılı!",
          description: `Arçelik ürünü başarıyla çıkarıldı ve CSV eklendi`,
        });
      } else {
        toast({
          title: "Hata",
          description: data.message || "Arçelik ürün çıkarma başarısız",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Beklenmedik hata",
        variant: "destructive",
      });
    },
  });

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const text = e.dataTransfer.getData('text');
    const urls = text.split('\n').filter(url => url.trim() && url.includes('arcelik.com.tr'));
    
    if (urls.length > 0) {
      setDraggedUrls(prev => [...prev, ...urls]);
      toast({
        title: "URL'ler Eklendi",
        description: `${urls.length} Arçelik URL'si toplu işlem listesine eklendi`
      });
    }
  };

  const onSingleSubmit = singleForm.handleSubmit((data) => {
    singleScrapeMutation.mutate({ ...data, persistentTags });
  });

  const clearAllData = () => {
    setProduct(null);
    setCsvPreviews([]);
    setAllImages([]);
    setProductFeatures([]);
    setPersistentTags([]);
    setNewTag('');
    setDraggedUrls([]);
    
    toast({
      title: "Sayfa Temizlendi",
      description: "Tüm veriler ve formlar sıfırlandı"
    });
  };

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

  const handleCSVDownload = (id: string, filename: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      downloadCSV(preview.csvContent, filename);
    }
  };

  const handleCSVShopifyUpload = async (id: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      try {
        const response = await fetch("/api/shopify/upload-csv-product", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            csvContent: preview.csvContent,
            productTitle: preview.productTitle,
            sourceUrl: preview.sourceUrl || "",
            productData: preview.productData
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          toast({
            title: "Shopify'a Yüklendi",
            description: `${preview.productTitle} başarıyla yüklendi (ID: ${result.shopifyId})`
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }
      } catch (error) {
        toast({
          title: "Yükleme Hatası",
          description: `${preview.productTitle} yüklenirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
          variant: "destructive"
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-slate-900 to-emerald-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-black/95 via-slate-900/90 to-emerald-900/80 backdrop-blur-sm border-b border-emerald-800/30">
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
              <Button
                onClick={clearAllData}
                variant="outline"
                className="bg-red-600/10 border-red-600/30 text-red-400 hover:bg-red-600/20 hover:border-red-600/50 px-4 py-2"
                disabled={singleScrapeMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Tümünü Sil
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center">
                  <span className="text-4xl">📦</span>
                </div>
                <div>
                  <h1 className="text-white font-thin text-xl tracking-wider">ARÇELİK</h1>
                  <p className="text-emerald-400/80 text-sm font-thin">Ürün Çıkarıcı</p>
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
            {/* Single Mode Form */}
            <div>
              <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-emerald-800/30">
                <CardHeader className="business-header">
                  <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                    <Package className="w-5 h-5 text-emerald-400/70" />
                    Arçelik Ürün Çıkarıcı
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <motion.form 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onSingleSubmit} 
                    className="space-y-4"
                  >
                    {/* Sürükle-Bırak Alanı */}
                    <div className="space-y-3">
                      <label className="text-white font-thin text-sm">Arçelik URL'leri - Sürükle Bırak veya Manuel Ekle</label>
                      
                      {/* Sürükle-Bırak Alanı */}
                      <div 
                        className={`border-2 border-dashed transition-all duration-200 rounded-lg p-8 text-center ${
                          isDragOver 
                            ? 'border-emerald-400 bg-emerald-900/20' 
                            : 'border-slate-600 bg-slate-800/50'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <Package className="w-8 h-8 text-emerald-400/70" />
                          <div>
                            <p className="text-white font-medium">
                              Arçelik URL'lerini buraya sürükleyin
                            </p>
                            <p className="text-slate-400 text-sm mt-1">
                              Veya aşağıdaki alandan manuel olarak ekleyin
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Manuel URL Ekleme */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            placeholder="https://www.arcelik.com.tr/..."
                            {...singleForm.register("url")}
                            className="business-input h-12 text-base pl-4 pr-20"
                            disabled={singleScrapeMutation.isPending}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => singleForm.setValue("url", "")}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button
                          type="submit"
                          disabled={singleScrapeMutation.isPending}
                          className="bg-emerald-600 hover:bg-emerald-700 px-6 h-12"
                        >
                          {singleScrapeMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Çıkarılıyor...
                            </>
                          ) : (
                            <>
                              <Package className="w-4 h-4 mr-2" />
                              Ürün Verilerini Çıkar
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {/* Form validation error */}
                      {singleForm.formState.errors.url && (
                        <div className="text-red-400 text-sm flex items-center gap-2">
                          <span>⚠️</span>
                          {singleForm.formState.errors.url.message}
                        </div>
                      )}
                    </div>
                  </motion.form>
                </CardContent>
              </Card>
            </div>

            {/* CSV Previews Section */}
            {csvPreviews.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8"
              >
                <Card className="business-card">
                  <CardHeader className="business-header">
                    <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-400/70" />
                      CSV Önizlemeleri ({csvPreviews.length} adet)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid gap-4">
                      {csvPreviews.map((preview) => (
                        <CSVPreview
                          key={preview.id}
                          id={preview.id}
                          productTitle={preview.productTitle}
                          productPrice={preview.productPrice}
                          productImages={preview.productImages}
                          productVariants={preview.productVariants}
                          onDownload={(filename) => handleCSVDownload(preview.id, filename)}
                          onShopifyUpload={() => handleCSVShopifyUpload(preview.id)}
                          platform="arcelik"
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArcelikScraper;