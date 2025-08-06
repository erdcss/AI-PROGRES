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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-x-hidden">
      {/* Background overlay - full coverage */}
      <div className="fixed inset-0 bg-black/20 w-full h-full"></div>
      
      {/* Back button */}
      <div className="relative z-10 p-6 w-full">
        <BackButton to="/marketplace-selection" label="Platform Seçimi" />
      </div>

      {/* Full page content */}
      <div className="relative z-10 w-full min-h-[calc(100vh-120px)] flex flex-col">
        {/* Top section with form - centered */}
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="w-full max-w-4xl">
          {/* Brand Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <div className="flex justify-center mb-6">
              {TrendyolBrand.logo}
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">Trendyol Ürün Aktarıcısı</h1>
            <p className="text-gray-300 text-lg">
              Trendyol ürünlerini Shopify mağazanıza kolayca aktarın
            </p>
          </motion.div>

          {/* URL Input Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="bg-white/10 backdrop-blur-sm border border-white/20 shadow-2xl">
              <CardContent className="p-8">
                <form onSubmit={onSubmit} className="space-y-6">
                  <div className="relative">
                    <Input
                      placeholder="https://www.trendyol.com/..."
                      {...form.register("url")}
                      className="bg-white/5 border-white/30 text-white placeholder-gray-400 pl-12 h-14 text-lg"
                      disabled={scrapeMutation.isPending}
                    />
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                      <span className="text-white text-lg font-bold">T</span>
                    </div>
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={scrapeMutation.isPending}
                    className="w-full bg-white text-slate-900 hover:bg-gray-100 h-14 text-lg font-medium"
                  >
                    {scrapeMutation.isPending ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Ürün analiz ediliyor...</span>
                      </div>
                    ) : (
                      <span>🎯 Trendyol Ürününü Çıkar</span>
                    )}
                  </Button>
                  
                  {/* Loading Progress */}
                  {scrapeMutation.isPending && (
                    <div className="mt-6">
                      <div className="flex items-center justify-center gap-2 text-white mb-3">
                        <Cpu className="h-5 w-5 animate-pulse" />
                        <span className="font-medium">AI ile ürün analiz ediliyor...</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-white to-gray-200 rounded-full animate-pulse transition-all duration-1000" style={{width: '75%'}}></div>
                      </div>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </motion.div>
          </div>
        </div>

        {/* Product Display - below the input */}
        {product && (
          <div className="relative z-10 w-full px-6 pb-12">
            <ProductDisplay data={product} />
          </div>
        )}
      </div>
    </div>
  );
}

export default ScraperPage;