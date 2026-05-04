import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Loader2, Package, X, Home, Trash2, FileText, ShoppingBag,
  CheckCircle, Image as ImageIcon, Tag, DollarSign, ExternalLink
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CSVPreview } from "@/components/CSVPreview";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const scrapeSchema = z.object({
  url: z.string().url("Geçerli bir URL giriniz").refine(
    (url) => url.includes("pttavm.com"),
    "Sadece PttAvm URL'leri desteklenmektedir"
  ),
});

type ScrapeFormData = z.infer<typeof scrapeSchema>;

interface PttAvmProduct {
  success: boolean;
  title: string;
  brand: string;
  price?: {
    original: number;
    withProfit: number;
    formatted: string;
    profitFormatted: string;
  };
  images?: Array<{ url: string; colorName: string }>;
  description?: string;
  features?: Array<{ key: string; value: string }>;
  category?: string;
  variants?: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{ color: string; colorCode: string; size: string; inStock: boolean }>;
  };
  tags?: string[];
  csvContent?: string;
  sourceUrl?: string;
  message?: string;
}

export default function PttAvmScraper() {
  const [product, setProduct] = useState<PttAvmProduct | null>(null);
  const [csvPreviews, setCsvPreviews] = useState<any[]>([]);
  const [, setLocation] = useLocation();

  const form = useForm<ScrapeFormData>({
    resolver: zodResolver(scrapeSchema),
    defaultValues: { url: "" },
  });

  const scrapeMutation = useMutation({
    mutationFn: async (data: ScrapeFormData) => {
      const startResp = await fetch("/api/pttavm-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.url }),
      });
      if (!startResp.ok) {
        const err = await startResp.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${startResp.status}`);
      }
      const startData = await startResp.json();
      if (!startData.jobId) return { ...startData, originalUrl: data.url };

      const { jobId } = startData;
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500));
        const poll = await fetch(`/api/scrape-job/${jobId}`);
        if (!poll.ok) throw new Error(`Polling failed: HTTP ${poll.status}`);
        const pollData = await poll.json();
        if (pollData.status === 'done') {
          if (pollData.result?.success === false) throw new Error(pollData.result.message || 'Extraction failed');
          return { ...pollData.result, originalUrl: data.url };
        }
        if (pollData.status === 'error') throw new Error(pollData.error || 'Scraping failed');
      }
      throw new Error('Zaman aşımı — lütfen tekrar deneyin.');
    },
    onSuccess: (data) => {
      if (data.success) {
        setProduct(data);
        const preview = {
          id: `csv-${Date.now()}`,
          productTitle: data.title || "PttAvm Ürünü",
          productPrice: data.price?.withProfit || data.price?.original || 0,
          productImages: Array.isArray(data.images) ? data.images.length : 0,
          productVariants: data.variants?.allVariants?.length || 1,
          csvContent: data.csvContent || "",
          sourceUrl: data.sourceUrl || data.originalUrl || "",
          productData: data
        };
        setCsvPreviews(prev => [preview, ...prev]);
        toast({ title: "Başarılı!", description: `PttAvm ürünü çıkarıldı ve CSV hazırlandı` });
      } else {
        toast({ title: "Hata", description: data.message || "Ürün çıkarma başarısız", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Hata", description: error.message || "Beklenmedik hata", variant: "destructive" });
    },
  });

  const handleCSVShopifyUpload = async (id: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (!preview) return;
    try {
      const response = await fetch("/api/shopify/upload-csv-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvContent: preview.csvContent,
          productTitle: preview.productTitle,
          sourceUrl: preview.sourceUrl || "",
          productData: preview.productData
        }),
      });
      if (response.ok) {
        const result = await response.json();
        toast({ title: "Shopify'a Yüklendi", description: `${preview.productTitle} başarıyla yüklendi (ID: ${result.shopifyId})` });
      } else {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || err.message || `HTTP ${response.status}`);
      }
    } catch (error) {
      toast({
        title: "Yükleme Hatası",
        description: `Yüklenirken hata: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
        variant: "destructive"
      });
    }
  };

  const handleCSVDownload = (id: string, filename: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (!preview?.csvContent) return;
    const blob = new Blob([preview.csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearAll = () => {
    setProduct(null);
    setCsvPreviews([]);
    form.reset();
    toast({ title: "Temizlendi", description: "Tüm veriler sıfırlandı" });
  };

  const onSubmit = form.handleSubmit((data) => scrapeMutation.mutate(data));

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 40%, #071a2e 100%)' }}>
      {/* Header */}
      <div className="border-b" style={{ borderColor: '#1e3a5f', background: 'rgba(7,26,46,0.95)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
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
                onClick={clearAll}
                variant="outline"
                className="bg-red-600/10 border-red-600/30 text-red-400 hover:bg-red-600/20 px-4 py-2"
                disabled={scrapeMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Temizle
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black"
                  style={{ background: 'linear-gradient(135deg, #e63946, #c1121f)' }}>
                  PT
                </div>
                <div>
                  <h1 className="text-white font-black text-xl tracking-wide">PTTAVM</h1>
                  <p className="text-sm font-thin" style={{ color: '#6cb4ee' }}>Ürün Çıkarıcı & Shopify Aktarım</p>
                </div>
              </div>
            </div>
            <Badge className="px-3 py-1 text-xs font-black" style={{ background: '#16a34a', color: '#fff' }}>
              AKTİF
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* URL Input Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="business-card" style={{ borderColor: '#1e3a5f' }}>
            <CardHeader className="business-header">
              <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" style={{ color: '#6cb4ee' }} />
                PttAvm Ürün Çıkarıcı
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-bold mb-2 block" style={{ color: '#94a3b8' }}>
                    PttAvm Ürün URL'si
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Input
                        placeholder="https://www.pttavm.com/..."
                        {...form.register("url")}
                        className="business-input h-12 text-base pl-4 pr-10"
                        disabled={scrapeMutation.isPending}
                      />
                      {form.watch("url") && (
                        <button
                          type="button"
                          onClick={() => form.setValue("url", "")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="submit"
                      disabled={scrapeMutation.isPending}
                      className="h-12 px-8 font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #e63946, #c1121f)' }}
                    >
                      {scrapeMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Çıkarılıyor...</>
                      ) : (
                        <><Package className="w-4 h-4 mr-2" />Ürün Çıkar</>
                      )}
                    </Button>
                  </div>
                  {form.formState.errors.url && (
                    <p className="text-red-400 text-sm mt-2 flex items-center gap-1">
                      <span>⚠️</span> {form.formState.errors.url.message}
                    </p>
                  )}
                </div>

                {/* Loading State */}
                {scrapeMutation.isPending && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl p-6 text-center space-y-3"
                    style={{ background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.2)' }}
                  >
                    <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: '#e63946' }} />
                    <p className="text-white font-bold">PttAvm ürünü çıkarılıyor...</p>
                    <p className="text-sm" style={{ color: '#94a3b8' }}>
                      Cloudflare koruması nedeniyle 15-30 saniye sürebilir
                    </p>
                  </motion.div>
                )}
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Product Preview */}
        {product && product.success && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="business-card" style={{ borderColor: '#1e3a5f' }}>
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  Ürün Önizleme
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Images */}
                  {product.images && product.images.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" style={{ color: '#6cb4ee' }} />
                        Görseller ({product.images.length})
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {product.images.slice(0, 6).map((img, i) => (
                          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-slate-800">
                            <img
                              src={img.url}
                              alt={`Ürün ${i + 1}`}
                              className="w-full h-full object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Details */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-black text-white text-lg leading-tight">{product.title}</h3>
                      {product.brand && (
                        <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>Marka: <span className="text-white">{product.brand}</span></p>
                      )}
                    </div>

                    {product.price && (
                      <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)' }}>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-green-400" />
                          <span className="text-white font-bold">Fiyat Bilgisi</span>
                        </div>
                        <p className="text-sm" style={{ color: '#94a3b8' }}>
                          Orijinal: <span className="text-white font-bold">{product.price.formatted}</span>
                        </p>
                        <p className="text-sm" style={{ color: '#94a3b8' }}>
                          Shopify Fiyatı (+%10): <span className="text-green-400 font-black text-base">{product.price.profitFormatted}</span>
                        </p>
                      </div>
                    )}

                    {product.tags && product.tags.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-2 flex items-center gap-1" style={{ color: '#94a3b8' }}>
                          <Tag className="w-3 h-3" /> Etiketler
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {product.tags.map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs" style={{ borderColor: '#1e3a5f', color: '#94a3b8' }}>
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {product.features && product.features.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-2" style={{ color: '#94a3b8' }}>Özellikler</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {product.features.slice(0, 8).map((f, i) => (
                            <div key={i} className="flex justify-between text-xs" style={{ color: '#94a3b8' }}>
                              <span>{f.key}</span>
                              <span className="text-white font-medium">{f.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {product.sourceUrl && (
                      <a
                        href={product.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs hover:underline"
                        style={{ color: '#6cb4ee' }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        PttAvm'de görüntüle
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* CSV Previews */}
        {csvPreviews.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="business-card" style={{ borderColor: '#1e3a5f' }}>
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" style={{ color: '#6cb4ee' }} />
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
                      platform="pttavm"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

      </div>
    </div>
  );
}
