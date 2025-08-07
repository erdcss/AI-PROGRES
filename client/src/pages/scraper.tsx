import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, Link, Copy, X, Home } from "lucide-react";

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

type ScrapeFormData = z.infer<typeof scrapeSchema>;

interface Product {
  id: string;
  title: string;
  price: number | { profitFormatted: string };
  images: Array<{ url: string; alt?: string }>;
  description: string;
  brand?: string;
  variants?: Array<{
    id: string;
    title: string;
    price: number;
    sku?: string;
    inventory_quantity?: number;
    option1?: string;
    option2?: string;
    option3?: string;
  }>;
  features?: Array<{ name: string; value: string }>;
  tags?: string[];
  category?: string;
}

function ScraperPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [, setLocation] = useLocation();
  
  const form = useForm<ScrapeFormData>({
    resolver: zodResolver(scrapeSchema),
    defaultValues: {
      url: "",
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: async (data: ScrapeFormData) => {
      const response = await fetch("/api/scenario-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: data.url }),
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
          
          {/* URL Input Section */}
          <div className="lg:col-span-2">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-black flex items-center gap-2">
                  <Link className="w-5 h-5 text-blue-400" />
                  Trendyol URL Girin
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <motion.form 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onSubmit={onSubmit} 
                  className="space-y-4"
                >
                  <div className="space-y-3">
                    <label className="text-white font-bold text-sm">Ürün URL'si</label>
                    <div className="relative">
                      <Input
                        placeholder="https://www.trendyol.com/..."
                        {...form.register("url")}
                        className="business-input h-14 text-base pl-4 pr-24"
                        disabled={scrapeMutation.isPending}
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-white hover:bg-blue-800"
                          onClick={() => {
                            navigator.clipboard.readText().then(text => {
                              form.setValue('url', text);
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
                            form.setValue('url', '');
                            toast({
                              title: "Temizlendi",
                              description: "URL alanı temizlendi"
                            });
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={scrapeMutation.isPending}
                    className="business-button w-full h-14 text-lg font-black"
                  >
                    {scrapeMutation.isPending ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Ürün Analiz Ediliyor...</span>
                      </div>
                    ) : (
                      <span>ÜRÜN ÇIKAR</span>
                    )}
                  </Button>
                </motion.form>
              </CardContent>
            </Card>
          </div>

          {/* Info Section */}
          <div className="lg:col-span-1">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-black">BİLGİ</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="bg-blue-900 p-4 rounded-lg">
                    <h3 className="text-white font-bold text-sm mb-2">NASIL KULLANILIR?</h3>
                    <div className="space-y-2 text-sm text-white">
                      <p>1. Trendyol ürün URL'sini kopyalayın</p>
                      <p>2. Yukarıdaki alana yapıştırın</p>
                      <p>3. "ÜRÜN ÇIKAR" butonuna tıklayın</p>
                      <p>4. Sonucu inceleyin ve Shopify'a aktarın</p>
                    </div>
                  </div>
                  
                  <div className="bg-blue-900 p-4 rounded-lg">
                    <h3 className="text-white font-bold text-sm mb-2">DESTEKLENENLER</h3>
                    <div className="space-y-1 text-sm text-white">
                      <p>✓ Tüm Trendyol ürünleri</p>
                      <p>✓ Çoklu varyantlar</p>
                      <p>✓ Fiyat bilgileri</p>
                      <p>✓ Ürün görselleri</p>
                      <p>✓ Shopify uyumlu CSV</p>
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
                variants: {
                  colors: [],
                  sizes: [],
                  allVariants: [],
                  totalVariants: 0
                },
                features: product.features?.map(f => ({ key: f.name, value: f.value })) || [],
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