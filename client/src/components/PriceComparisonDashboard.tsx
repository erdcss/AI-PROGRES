import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart, 
  Target, 
  DollarSign,
  ShoppingCart,
  Eye,
  Calendar,
  MapPin,
  Users,
  Star,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { motion } from "framer-motion";
import { cardVariants, imageVariants } from "@/components/PageTransition";

interface MarketplaceData {
  platform: string;
  price: number;
  currency: string;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock';
  rating: number;
  reviewCount: number;
  shipping: {
    cost: number;
    time: string;
  };
  seller: {
    name: string;
    rating: number;
    verified: boolean;
  };
  lastUpdated: string;
}

interface PriceComparisonProps {
  productTitle: string;
  productImage: string;
  marketplaceData: MarketplaceData[];
  priceHistory: Array<{
    date: string;
    prices: Record<string, number>;
  }>;
  insights: {
    bestDeal: string;
    averagePrice: number;
    priceRange: {
      min: number;
      max: number;
    };
    trend: 'rising' | 'falling' | 'stable';
    recommendation: string;
  };
}

const marketplaceIcons = {
  trendyol: '🛒',
  hepsiburada: '🛍️',
  amazon: '📦',
  n11: '🏪',
  default: '🛒'
};

const getAvailabilityColor = (availability: string) => {
  switch (availability) {
    case 'in_stock': return 'text-green-600 bg-green-50';
    case 'low_stock': return 'text-yellow-600 bg-yellow-50';
    case 'out_of_stock': return 'text-red-600 bg-red-50';
    default: return 'text-gray-600 bg-gray-50';
  }
};

const getAvailabilityText = (availability: string) => {
  switch (availability) {
    case 'in_stock': return 'Stokta';
    case 'low_stock': return 'Az Stok';
    case 'out_of_stock': return 'Tükendi';
    default: return 'Bilinmiyor';
  }
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'rising': return <TrendingUp className="h-4 w-4 text-red-500" />;
    case 'falling': return <TrendingDown className="h-4 w-4 text-green-500" />;
    case 'stable': return <BarChart3 className="h-4 w-4 text-yellow-500" />;
    default: return <BarChart3 className="h-4 w-4" />;
  }
};

export function PriceComparisonDashboard({ 
  productTitle, 
  productImage, 
  marketplaceData, 
  priceHistory, 
  insights 
}: PriceComparisonProps) {
  
  const sortedMarketplaces = [...marketplaceData].sort((a, b) => a.price - b.price);
  const cheapestPrice = sortedMarketplaces[0]?.price || 0;
  
  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      {/* Header Section */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
          <CardHeader>
            <div className="flex items-start gap-6">
              <motion.div 
                className="w-32 h-32 rounded-lg overflow-hidden border border-purple-500/30"
                variants={imageVariants}
                initial="hidden"
                animate="visible"
              >
                <img 
                  src={productImage} 
                  alt={productTitle}
                  className="w-full h-full object-cover"
                />
              </motion.div>
              <div className="flex-1">
                <CardTitle className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                  <PieChart className="h-6 w-6 text-purple-400" />
                  Marketplace Fiyat Karşılaştırması
                </CardTitle>
                <p className="text-lg text-gray-300 mb-4">{productTitle}</p>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="secondary" className="bg-purple-600/20 text-purple-200">
                    {marketplaceData.length} Platform
                  </Badge>
                  <Badge variant="secondary" className="bg-blue-600/20 text-blue-200">
                    ₺{insights.priceRange.min} - ₺{insights.priceRange.max}
                  </Badge>
                  <Badge variant="secondary" className={`${
                    insights.trend === 'falling' ? 'bg-green-600/20 text-green-200' :
                    insights.trend === 'rising' ? 'bg-red-600/20 text-red-200' :
                    'bg-yellow-600/20 text-yellow-200'
                  }`}>
                    {getTrendIcon(insights.trend)}
                    <span className="ml-1">
                      {insights.trend === 'falling' ? 'Düşüş Trendi' :
                       insights.trend === 'rising' ? 'Yükseliş Trendi' : 'Sabit Fiyat'}
                    </span>
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      <Tabs defaultValue="comparison" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800">
          <TabsTrigger value="comparison" className="text-white">Fiyat Karşılaştırma</TabsTrigger>
          <TabsTrigger value="trends" className="text-white">Fiyat Trendleri</TabsTrigger>
          <TabsTrigger value="insights" className="text-white">Akıllı Öneriler</TabsTrigger>
          <TabsTrigger value="analytics" className="text-white">Detaylı Analiz</TabsTrigger>
        </TabsList>

        <TabsContent value="comparison" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedMarketplaces.map((marketplace, index) => {
              const savingsAmount = marketplace.price - cheapestPrice;
              const savingsPercentage = cheapestPrice > 0 ? ((savingsAmount / cheapestPrice) * 100) : 0;
              
              return (
                <motion.div
                  key={marketplace.platform}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className={`relative ${index === 0 ? 'ring-2 ring-green-500 bg-green-900/10' : 'bg-slate-800'}`}>
                    {index === 0 && (
                      <div className="absolute -top-2 -right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                        EN UYGUN
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">
                            {marketplaceIcons[marketplace.platform as keyof typeof marketplaceIcons] || marketplaceIcons.default}
                          </span>
                          <div>
                            <h3 className="font-semibold text-white capitalize">{marketplace.platform}</h3>
                            <p className="text-sm text-gray-400">{marketplace.seller.name}</p>
                          </div>
                        </div>
                        {marketplace.seller.verified && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-white">
                          ₺{marketplace.price.toLocaleString()}
                        </div>
                        {savingsAmount > 0 && (
                          <div className="text-sm text-red-400">
                            +₺{savingsAmount.toFixed(2)} ({savingsPercentage.toFixed(1)}% daha pahalı)
                          </div>
                        )}
                        {index === 0 && (
                          <div className="text-sm text-green-400 font-medium">
                            En uygun fiyat!
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Durum:</span>
                        <Badge className={getAvailabilityColor(marketplace.availability)}>
                          {getAvailabilityText(marketplace.availability)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Değerlendirme:</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-400 fill-current" />
                          <span className="text-white">{marketplace.rating.toFixed(1)}</span>
                          <span className="text-gray-400">({marketplace.reviewCount})</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Kargo:</span>
                        <div className="text-right">
                          <div className="text-white">₺{marketplace.shipping.cost}</div>
                          <div className="text-gray-400">{marketplace.shipping.time}</div>
                        </div>
                      </div>
                      
                      <Button 
                        className="w-full mt-3" 
                        variant={index === 0 ? "default" : "outline"}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        {marketplace.platform} 'a Git
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card className="bg-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Fiyat Trend Analizi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Price History Chart Placeholder */}
                <div className="h-64 bg-slate-700 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2" />
                    <p>Fiyat geçmişi grafiği</p>
                    <p className="text-sm">Son 30 günlük fiyat değişimleri</p>
                  </div>
                </div>
                
                {/* Trend Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-slate-700">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-white">₺{insights.averagePrice}</div>
                      <div className="text-sm text-gray-400">Ortalama Fiyat</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-700">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-green-400">₺{insights.priceRange.min}</div>
                      <div className="text-sm text-gray-400">En Düşük Fiyat</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-700">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-red-400">₺{insights.priceRange.max}</div>
                      <div className="text-sm text-gray-400">En Yüksek Fiyat</div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 border-green-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-400" />
                  En İyi Teklif
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-lg font-semibold text-green-300">
                    {insights.bestDeal}
                  </div>
                  <p className="text-gray-300">
                    En uygun fiyat ve güvenilir satıcı kombinasyonu
                  </p>
                  <div className="bg-green-900/30 p-3 rounded-lg">
                    <div className="text-sm text-green-200">
                      💡 Bu platformda satın alarak ₺{(insights.priceRange.max - insights.priceRange.min).toFixed(2)} tasarruf edebilirsiniz!
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-400" />
                  Akıllı Öneri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-gray-300">
                    {insights.recommendation}
                  </p>
                  <div className="bg-blue-900/30 p-3 rounded-lg">
                    <div className="text-sm text-blue-200">
                      🎯 AI tabanlı analiz sonucu
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                Önemli Notlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-yellow-900/20 rounded-lg border border-yellow-500/30">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                  <div>
                    <div className="font-medium text-yellow-200">Kargo Maliyetlerini Unutmayın</div>
                    <div className="text-sm text-gray-300">Toplam maliyet hesaplarken kargo ücretlerini de dahil edin.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <CheckCircle className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div>
                    <div className="font-medium text-blue-200">Satıcı Güvenilirliği</div>
                    <div className="text-sm text-gray-300">Doğrulanmış satıcıları tercih edin ve yorumları okuyun.</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Platform Dağılımı
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {marketplaceData.map((marketplace, index) => {
                    const percentage = ((marketplace.price / insights.averagePrice) * 100) - 100;
                    return (
                      <div key={marketplace.platform} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300 capitalize">{marketplace.platform}</span>
                          <span className={`${percentage > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {percentage > 0 ? '+' : ''}{percentage.toFixed(1)}%
                          </span>
                        </div>
                        <Progress 
                          value={Math.abs(percentage) + 50} 
                          className="h-2"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Satıcı Analizi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {marketplaceData.map((marketplace, index) => (
                    <div key={marketplace.platform} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {marketplace.seller.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white">{marketplace.seller.name}</div>
                          <div className="text-sm text-gray-400">{marketplace.platform}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-400 fill-current" />
                          <span className="text-white text-sm">{marketplace.seller.rating}</span>
                        </div>
                        {marketplace.seller.verified && (
                          <div className="text-xs text-green-400">Doğrulanmış</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}