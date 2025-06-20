import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  MapPin, 
  DollarSign, 
  Eye, 
  BarChart3,
  Target,
  Calendar,
  Users
} from "lucide-react";

interface AIAnalysisProps {
  analysis: {
    visualAnalysis: {
      dominantColors: string[];
      colorVariants: string[];
      productStyle: string;
      targetAudience: string;
      seasonality: string;
    };
    salesPrediction: {
      estimatedYearlySales: number;
      salesTrend: string;
      popularityScore: number;
      competitiveAdvantage: string[];
    };
    geographicAnalysis: {
      topSellingCities: Array<{
        city: string;
        percentage: number;
        reason: string;
      }>;
      regionPreferences: {
        marmara: number;
        ege: number;
        akdeniz: number;
        ic_anadolu: number;
        karadeniz: number;
        dogu_anadolu: number;
        guneydogu_anadolu: number;
      };
    };
    priceAnalysis: {
      currentPrice: number;
      priceHistory: Array<{
        month: string;
        price: number;
        change: number;
      }>;
      pricePosition: string;
      recommendedPrice: number;
    };
  };
}

export function AIAnalysisDisplay({ analysis }: AIAnalysisProps) {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'yukselen':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'durgun':
        return <BarChart3 className="h-4 w-4 text-yellow-500" />;
      case 'dusen':
        return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />;
      default:
        return <BarChart3 className="h-4 w-4" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'yukselen':
        return 'text-green-600 bg-green-50';
      case 'durgun':
        return 'text-yellow-600 bg-yellow-50';
      case 'dusen':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-blue-500" />
            AI Destekli Ürün Analizi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sales" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="sales">Satış Analizi</TabsTrigger>
              <TabsTrigger value="geography">Coğrafi Dağılım</TabsTrigger>
              <TabsTrigger value="price">Fiyat Trendi</TabsTrigger>
              <TabsTrigger value="visual">Görsel Analiz</TabsTrigger>
            </TabsList>
            
            <TabsContent value="sales" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Yıllık Satış Tahmini
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {analysis.salesPrediction?.estimatedYearlySales?.toLocaleString() || 'N/A'} adet
                    </div>
                    <div className={`flex items-center gap-1 mt-2 px-2 py-1 rounded text-sm ${getTrendColor(analysis.salesPrediction?.salesTrend || 'durgun')}`}>
                      {getTrendIcon(analysis.salesPrediction?.salesTrend || 'durgun')}
                      {analysis.salesPrediction?.salesTrend === 'yukselen' ? 'Yükselen' : 
                       analysis.salesPrediction?.salesTrend === 'durgun' ? 'Durgun' : 'Düşen'} Trend
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Popülerlik Skoru
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {analysis.salesPrediction?.popularityScore || 0}/100
                    </div>
                    <Progress value={analysis.salesPrediction?.popularityScore || 0} className="mt-2" />
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Rekabet Avantajları</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(analysis.salesPrediction?.competitiveAdvantage || []).map((advantage, index) => (
                      <Badge key={index} variant="secondary">
                        {advantage}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="geography" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    En Çok Satan Şehirler
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(analysis.geographicAnalysis?.topSellingCities || []).map((city, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span className="font-medium">{city.city}</span>
                        <span className="text-sm text-gray-500">({city.reason})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={city.percentage} className="w-20" />
                        <span className="text-sm font-medium">{city.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Bölgesel Dağılım</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(analysis.geographicAnalysis?.regionPreferences || {}).map(([region, percentage]) => (
                    <div key={region} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{region.replace('_', ' ')}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={percentage} className="w-16" />
                        <span className="text-sm w-10 text-right">{percentage}%</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="price" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Fiyat Pozisyonu
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {analysis.priceAnalysis.currentPrice} TL
                    </div>
                    <Badge variant="outline" className="mt-2">
                      {analysis.priceAnalysis.pricePosition === 'ekonomik' ? 'Ekonomik' :
                       analysis.priceAnalysis.pricePosition === 'orta_segment' ? 'Orta Segment' : 'Premium'}
                    </Badge>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Önerilen Fiyat</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-green-600">
                      {analysis.priceAnalysis.recommendedPrice} TL
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      %{Math.round(((analysis.priceAnalysis.recommendedPrice - analysis.priceAnalysis.currentPrice) / analysis.priceAnalysis.currentPrice) * 100)} değişim
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Son 6 Ay Fiyat Değişimi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.priceAnalysis.priceHistory.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span>{entry.month}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.price} TL</span>
                          <span className={`text-xs px-1 py-0.5 rounded ${
                            entry.change > 0 ? 'text-red-600 bg-red-50' : 
                            entry.change < 0 ? 'text-green-600 bg-green-50' : 
                            'text-gray-600 bg-gray-50'
                          }`}>
                            {entry.change > 0 ? '+' : ''}{entry.change}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="visual" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Ürün Stili</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary" className="text-base">
                      {analysis.visualAnalysis.productStyle}
                    </Badge>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Hedef Kitle
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary" className="text-base">
                      {analysis.visualAnalysis.targetAudience}
                    </Badge>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Renk Analizi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium">Dominant Renkler:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {analysis.visualAnalysis.dominantColors.map((color, index) => (
                          <Badge key={index} variant="outline">{color}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Mevcut Varyantlar:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {analysis.visualAnalysis.colorVariants.map((color, index) => (
                          <Badge key={index} variant="secondary">{color}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Mevsimsellik</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-base">
                    {analysis.visualAnalysis.seasonality}
                  </Badge>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}