import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  BarChart3,
  Sparkles,
  DollarSign,
  ShoppingBag,
  Target,
  Zap,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Star
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface VariantInfo {
  color: string;
  size: string;
  price: number;
  stock: string;
  sku: string;
}

interface AIAnalysis {
  salesEstimate: {
    daily: string;
    monthly: string;
    trend: string;
  };
  priceAnalysis: {
    currentPrice: number;
    marketPosition: string;
    priceStrategy: string;
    competitiveAdvantage: string;
  };
  variantAnalysis: {
    totalVariants: number;
    popularColors: string[];
    popularSizes: string[];
    stockStatus: string;
    variantDiversity: string;
  };
  competitiveInsights: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  recommendations: {
    pricing: string[];
    inventory: string[];
    marketing: string[];
    general: string[];
  };
}

interface StatisticsResponse {
  success: boolean;
  productInfo: {
    title: string;
    brand: string;
    category: string;
    trendyolUrl: string;
    currentPrice: number;
    images: string[];
  };
  variants: VariantInfo[];
  aiAnalysis: AIAnalysis | null;
}

export default function ProductStatisticsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: statistics, isLoading, error } = useQuery<StatisticsResponse>({
    queryKey: ['/api/products', id, 'statistics'],
    enabled: !!id,
    retry: 1,
    staleTime: 5 * 60 * 1000 // 5 dakika
  });

  if (isLoading) {
    return (
      <div className="min-h-screen business-bg p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-400 mx-auto mb-4"></div>
          <p className="text-white/80 text-lg">Trendyol'dan veri çekiliyor ve AI analizi yapılıyor...</p>
          <p className="text-white/60 text-sm mt-2">Bu işlem 10-15 saniye sürebilir</p>
        </div>
      </div>
    );
  }

  if (error || !statistics || !statistics.success) {
    return (
      <div className="min-h-screen business-bg p-6">
        <div className="max-w-7xl mx-auto">
          <Button
            onClick={() => setLocation('/memory-tracking')}
            className="business-button mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Geri Dön
          </Button>
          <Card className="business-card">
            <CardContent className="py-12 text-center">
              <Package className="h-16 w-16 mx-auto mb-4 text-red-400" />
              <p className="text-white/80 text-lg">Ürün verisi alınamadı</p>
              <p className="text-white/60 text-sm mt-2">Trendyol bağlantısı kontrol ediliyor...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { productInfo, variants, aiAnalysis } = statistics;

  return (
    <div className="min-h-screen business-bg p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setLocation('/memory-tracking')}
              className="business-button"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Geri
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white">{productInfo.title}</h1>
              <p className="text-white/70 mt-1">{productInfo.brand} • {productInfo.category}</p>
            </div>
          </div>
        </div>

        {/* Ana Bilgiler */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Güncel Fiyat</CardTitle>
                <DollarSign className="h-5 w-5 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{productInfo.currentPrice.toFixed(2)} TL</div>
              {aiAnalysis && (
                <p className="text-xs text-white/60 mt-1">{aiAnalysis.priceAnalysis.marketPosition}</p>
              )}
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Varyantlar</CardTitle>
                <Package className="h-5 w-5 text-indigo-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{variants.length}</div>
              <p className="text-xs text-white/60 mt-1">Renk × Beden</p>
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Günlük Satış</CardTitle>
                <TrendingUp className="h-5 w-5 text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {aiAnalysis?.salesEstimate.daily || 'N/A'}
              </div>
              <p className="text-xs text-white/60 mt-1">Tahmini</p>
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Aylık Satış</CardTitle>
                <BarChart3 className="h-5 w-5 text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {aiAnalysis?.salesEstimate.monthly || 'N/A'}
              </div>
              <p className="text-xs text-white/60 mt-1">Tahmini</p>
            </CardContent>
          </Card>
        </div>

        {/* Ürün Görselleri */}
        {productInfo.images.length > 0 && (
          <Card className="business-card">
            <CardHeader>
              <CardTitle className="text-white">Ürün Görselleri</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {productInfo.images.slice(0, 12).map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`${productInfo.title} - ${idx + 1}`}
                    className="w-full h-32 object-cover rounded-lg border border-white/20 hover:scale-105 transition-transform cursor-pointer"
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Varyant Listesi */}
        <Card className="business-card">
          <CardHeader>
            <CardTitle className="text-white">Ürün Varyantları</CardTitle>
            <p className="text-sm text-white/70 mt-1">Tüm renk ve beden kombinasyonları</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-900/30 border-white/10">
                    <TableHead className="font-semibold text-white/90">Renk</TableHead>
                    <TableHead className="font-semibold text-white/90">Beden</TableHead>
                    <TableHead className="font-semibold text-white/90">Fiyat</TableHead>
                    <TableHead className="font-semibold text-white/90">Stok</TableHead>
                    <TableHead className="font-semibold text-white/90">SKU</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((variant, idx) => (
                    <TableRow key={idx} className="hover:bg-blue-900/20 border-white/10">
                      <TableCell className="text-white">{variant.color}</TableCell>
                      <TableCell className="text-white">{variant.size}</TableCell>
                      <TableCell className="text-white font-semibold">{variant.price.toFixed(2)} TL</TableCell>
                      <TableCell>
                        <Badge className={variant.stock === 'in_stock' ? 'bg-emerald-600' : 'bg-red-600'}>
                          {variant.stock === 'in_stock' ? 'Stokta' : 'Yok'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white/70 text-sm">{variant.sku}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* AI Analizi */}
        {aiAnalysis && (
          <>
            {/* Fiyat Analizi */}
            <Card className="business-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-purple-400" />
                  <CardTitle className="text-white">AI Fiyat Analizi</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Pazar Konumu
                    </h4>
                    <p className="text-white/80">{aiAnalysis.priceAnalysis.marketPosition}</p>
                  </div>
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Fiyat Stratejisi
                    </h4>
                    <p className="text-white/80">{aiAnalysis.priceAnalysis.priceStrategy}</p>
                  </div>
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10 md:col-span-2">
                    <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Rekabetçi Avantaj
                    </h4>
                    <p className="text-white/80">{aiAnalysis.priceAnalysis.competitiveAdvantage}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Varyant Analizi */}
            <Card className="business-card">
              <CardHeader>
                <CardTitle className="text-white">Varyant Analizi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-3">Popüler Renkler (Tahmini)</h4>
                    <div className="flex flex-wrap gap-2">
                      {aiAnalysis.variantAnalysis.popularColors.map((color, idx) => (
                        <Badge key={idx} className="bg-purple-600/80 text-white">
                          {color}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-3">Popüler Bedenler (Tahmini)</h4>
                    <div className="flex flex-wrap gap-2">
                      {aiAnalysis.variantAnalysis.popularSizes.map((size, idx) => (
                        <Badge key={idx} className="bg-indigo-600/80 text-white">
                          {size}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                  <h4 className="font-semibold text-white mb-2">Çeşitlilik Analizi</h4>
                  <p className="text-white/80">{aiAnalysis.variantAnalysis.variantDiversity}</p>
                </div>
              </CardContent>
            </Card>

            {/* SWOT Analizi */}
            <Card className="business-card">
              <CardHeader>
                <CardTitle className="text-white">SWOT Analizi</CardTitle>
                <p className="text-sm text-white/70 mt-1">Güçlü yönler, zayıf yönler, fırsatlar ve tehditler</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Strengths */}
                  <div className="bg-emerald-900/20 p-4 rounded-lg border border-emerald-500/30">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-emerald-400" />
                      Güçlü Yönler
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.competitiveInsights.strengths.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-emerald-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Weaknesses */}
                  <div className="bg-red-900/20 p-4 rounded-lg border border-red-500/30">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                      Zayıf Yönler
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.competitiveInsights.weaknesses.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-red-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Opportunities */}
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-500/30">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-blue-400" />
                      Fırsatlar
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.competitiveInsights.opportunities.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-blue-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Threats */}
                  <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-500/30">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-amber-400" />
                      Tehditler
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.competitiveInsights.threats.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-amber-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Öneriler */}
            <Card className="business-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-6 w-6 text-yellow-400" />
                  <CardTitle className="text-white">AI Önerileri ve Stratejiler</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Fiyatlandırma */}
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Fiyatlandırma Önerileri
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.recommendations.pricing.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-emerald-400 mt-1">✓</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Envanter */}
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Envanter Yönetimi
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.recommendations.inventory.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-emerald-400 mt-1">✓</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Pazarlama */}
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4" />
                      Pazarlama Stratejileri
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.recommendations.marketing.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-emerald-400 mt-1">✓</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Genel */}
                  <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Genel Stratejik Öneriler
                    </h4>
                    <ul className="space-y-2">
                      {aiAnalysis.recommendations.general.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                          <span className="text-emerald-400 mt-1">✓</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
