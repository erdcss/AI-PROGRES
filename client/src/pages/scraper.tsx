import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Cpu, Download, ShoppingCart, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/BackButton";
import { ProductDisplay } from "@/components/ProductDisplay";
import { toast } from "@/hooks/use-toast";

// Brand logos
const TrendyolBrand = {
  logo: (
    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-900 text-2xl font-bold shadow-2xl">
      T
    </div>
  )
};

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
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-300 via-blue-500 to-blue-800 overflow-x-hidden">
      {/* Background overlay - full coverage */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-400/10 via-blue-600/20 to-blue-900/30 w-full h-full"></div>
      
      {/* Back button */}
      <div className="relative z-10 p-6 w-full">
        <BackButton to="/marketplace-selection" label="Platform Seçimi" />
      </div>

      {/* Simplified content */}
      <div className="relative z-10 w-full flex flex-col items-center px-6">
        {/* Simple URL input */}
        <div className="w-full max-w-2xl mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  placeholder="https://www.trendyol.com/..."
                  {...form.register("url")}
                  className="bg-black/20 border-black/30 text-white placeholder-gray-300 h-12 text-base focus:border-black/50 focus:ring-black/20 backdrop-blur-sm"
                  disabled={scrapeMutation.isPending}
                />
                {/* Copy and clear buttons inside input */}
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-gray-300 hover:text-white hover:bg-white/10"
                    onClick={() => {
                      navigator.clipboard.readText().then(text => {
                        form.setValue('url', text);
                      });
                    }}
                  >
                    📋
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-gray-300 hover:text-white hover:bg-red-500/20"
                    onClick={() => form.setValue('url', '')}
                  >
                    ✕
                  </Button>
                </div>
              </div>
              
              <Button
                type="submit"
                disabled={scrapeMutation.isPending}
                className="w-full bg-black/30 text-white hover:bg-black/40 h-12 text-base font-medium backdrop-blur-sm border border-black/20"
              >
                {scrapeMutation.isPending ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analiz ediliyor...</span>
                  </div>
                ) : (
                  <span>Ürün Çıkar</span>
                )}
              </Button>
            </form>
          </motion.div>
        </div>

        {/* Compact Product Preview */}
        {product && (
          <div className="w-full max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20"
            >
              <div className="flex items-start gap-4">
                {/* Small product image */}
                {product.images && product.images.length > 0 && (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-white/20 flex-shrink-0">
                    <img 
                      src={typeof product.images[0] === 'string' ? product.images[0] : product.images[0]?.url} 
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium text-sm mb-1 truncate">{product.title}</h3>
                  <p className="text-gray-300 text-xs mb-2">{typeof product.price === 'string' ? product.price : typeof product.price === 'number' ? `${product.price} TL` : typeof product.price === 'object' && product.price?.profitFormatted ? product.price.profitFormatted : 'Fiyat bilgisi yok'}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-500/80 hover:bg-green-500 text-white text-xs h-7"
                      onClick={() => {
                        // Export functionality
                        toast({
                          title: "Shopify'a aktarılıyor",
                          description: "Ürün verisi işleniyor..."
                        });
                      }}
                    >
                      Shopify'a Aktar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/30 text-white hover:bg-white/10 text-xs h-7"
                      onClick={() => setProduct(null)}
                    >
                      Temizle
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScraperPage;