import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Search, BarChart3, TrendingUp, Target } from "lucide-react";
import { PriceComparisonDashboard } from "@/components/PriceComparisonDashboard";
import { PageTransition, AnimatedContainer, cardVariants } from "@/components/PageTransition";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

const searchSchema = z.object({
  productName: z.string().min(3, "Ürün adı en az 3 karakter olmalıdır"),
});

type SearchFormData = z.infer<typeof searchSchema>;

// Mock data generator for demonstration
const generateMockPriceData = (productName: string) => {
  const platforms = ['trendyol', 'hepsiburada', 'amazon', 'n11'];
  const basePrice = Math.floor(Math.random() * 500) + 100;
  
  const marketplaceData = platforms.map((platform, index) => {
    const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
    const price = Math.floor(basePrice * (1 + variation));
    
    return {
      platform,
      price,
      currency: 'TRY',
      availability: ['in_stock', 'low_stock', 'out_of_stock'][Math.floor(Math.random() * 3)] as 'in_stock' | 'low_stock' | 'out_of_stock',
      rating: Number((4 + Math.random()).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 1000) + 10,
      shipping: {
        cost: Math.floor(Math.random() * 30),
        time: ['1-2 gün', '2-3 gün', '3-5 gün'][Math.floor(Math.random() * 3)]
      },
      seller: {
        name: [`${platform} Mağaza`, `Premium ${platform}`, `${platform} Store`][Math.floor(Math.random() * 3)],
        rating: Number((4.2 + Math.random() * 0.8).toFixed(1)),
        verified: Math.random() > 0.3
      },
      lastUpdated: new Date().toISOString()
    };
  });

  const sortedPrices = marketplaceData.map(m => m.price).sort((a, b) => a - b);
  const averagePrice = Math.floor(sortedPrices.reduce((sum, price) => sum + price, 0) / sortedPrices.length);
  
  return {
    productTitle: productName,
    productImage: `https://picsum.photos/400/400?random=${Math.floor(Math.random() * 1000)}`,
    marketplaceData,
    priceHistory: [], // Would be populated with real historical data
    insights: {
      bestDeal: marketplaceData.find(m => m.price === Math.min(...marketplaceData.map(m => m.price)))?.platform || 'trendyol',
      averagePrice,
      priceRange: {
        min: Math.min(...sortedPrices),
        max: Math.max(...sortedPrices)
      },
      trend: ['rising', 'falling', 'stable'][Math.floor(Math.random() * 3)] as 'rising' | 'falling' | 'stable',
      recommendation: `En uygun fiyat için ${marketplaceData.find(m => m.price === Math.min(...marketplaceData.map(m => m.price)))?.platform} platformunu tercih edin. Kargo maliyetlerini de hesaba katın.`
    }
  };
};

export default function PriceComparisonPage() {
  const [comparisonData, setComparisonData] = useState<any>(null);
  const { toast } = useToast();

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      productName: "",
    },
  });

  const searchMutation = useMutation({
    mutationFn: async (data: SearchFormData) => {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // In a real implementation, this would call the backend API
      const mockData = generateMockPriceData(data.productName);
      return mockData;
    },
    onSuccess: (data) => {
      setComparisonData(data);
      toast({
        title: "Fiyat analizi tamamlandı",
        description: `${data.marketplaceData.length} platform için fiyat karşılaştırması hazır`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Arama hatası",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SearchFormData) => {
    searchMutation.mutate(data);
  };

  return (
    <PageTransition>
      <AnimatedContainer className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          
          {/* Header */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="text-center mb-8"
          >
            {/* Navigation */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <Link href="/">
                <Button variant="outline" className="border-blue-500/30 text-blue-200 hover:bg-blue-600/20">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Veri Çıkarma
                </Button>
              </Link>
              <ArrowLeft className="h-4 w-4 text-gray-400 rotate-180" />
              <div className="bg-purple-600/20 text-purple-200 px-4 py-2 rounded-lg border border-purple-500/30">
                Fiyat Karşılaştırma
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Marketplace Fiyat Karşılaştırma
              </h1>
            </div>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Türkiye'nin önde gelen e-ticaret platformlarında ürün fiyatlarını karşılaştırın ve en uygun teklifi bulun
            </p>
          </motion.div>

          {/* Search Form */}
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-slate-800/50 border-slate-700 max-w-2xl mx-auto mb-8">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Ürün Ara
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="productName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-300">Ürün Adı</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Örn: iPhone 15, Samsung TV, Nike Ayakkabı..."
                              className="bg-slate-700 border-slate-600 text-white placeholder-gray-400"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={searchMutation.isPending}
                    >
                      {searchMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Fiyatlar Analiz Ediliyor...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          Fiyat Karşılaştırması Yap
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>

          {/* Features */}
          {!comparisonData && (
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-8"
            >
              <Card className="bg-slate-800/30 border-slate-700">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">En Uygun Fiyat</h3>
                  <p className="text-gray-400 text-sm">
                    4 büyük platformda anlık fiyat karşılaştırması yapın
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/30 border-slate-700">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Fiyat Trendleri</h3>
                  <p className="text-gray-400 text-sm">
                    Geçmiş fiyat verilerini analiz ederek trend tahminleri
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/30 border-slate-700">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg mx-auto mb-4 flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Akıllı Analiz</h3>
                  <p className="text-gray-400 text-sm">
                    AI destekli öneriler ve satın alma tavsiyeleri
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Price Comparison Results */}
          {comparisonData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <PriceComparisonDashboard {...comparisonData} />
            </motion.div>
          )}

        </div>
      </AnimatedContainer>
    </PageTransition>
  );
}