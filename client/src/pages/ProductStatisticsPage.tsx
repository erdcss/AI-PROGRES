import { useState } from 'react';
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
  Activity,
  Sparkles,
  Calendar,
  DollarSign
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PriceHistory {
  date: string;
  price: number;
  change: number;
}

interface VariantChange {
  variantId: number;
  color: string;
  size: string;
  changeType: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
}

interface AIInsights {
  salesEstimate: string;
  popularVariants: string[];
  priceStrategy: string;
  competitiveAnalysis: string;
  recommendations: string[];
}

interface ProductStatistics {
  productId: number;
  title: string;
  brand: string;
  category: string;
  currentPrice: string;
  priceHistory: PriceHistory[];
  variantChanges: VariantChange[];
  aiInsights: AIInsights | null;
}

export default function ProductStatisticsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | 'all'>('30d');

  const { data: statistics, isLoading } = useQuery<ProductStatistics>({
    queryKey: ['/api/products', id, 'statistics'],
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen business-bg p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="min-h-screen business-bg p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="business-card">
            <CardContent className="py-12 text-center">
              <Package className="h-16 w-16 mx-auto mb-4 text-white/40" />
              <p className="text-white/80 text-lg">Ürün bulunamadı</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const filteredPriceHistory = statistics.priceHistory.filter((item) => {
    if (selectedPeriod === 'all') return true;
    const days = selectedPeriod === '7d' ? 7 : 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return new Date(item.date) >= cutoffDate;
  });

  const priceChange = statistics.priceHistory.length > 0 
    ? statistics.priceHistory[statistics.priceHistory.length - 1].change 
    : 0;

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
              <h1 className="text-3xl font-bold text-white">{statistics.title}</h1>
              <p className="text-white/70 mt-1">{statistics.brand} • {statistics.category}</p>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Güncel Fiyat</CardTitle>
                <DollarSign className="h-5 w-5 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{parseFloat(statistics.currentPrice).toFixed(2)} TL</div>
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Fiyat Değişimi</CardTitle>
                {priceChange > 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                ) : priceChange < 0 ? (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                ) : (
                  <Activity className="h-5 w-5 text-white/40" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${priceChange > 0 ? 'text-emerald-400' : priceChange < 0 ? 'text-red-400' : 'text-white/60'}`}>
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
              <p className="text-xs text-white/60 mt-1">Son 30 gün</p>
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Fiyat Güncellemeleri</CardTitle>
                <BarChart3 className="h-5 w-5 text-indigo-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{statistics.priceHistory.length}</div>
              <p className="text-xs text-white/60 mt-1">Toplam değişiklik</p>
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Varyant Değişimi</CardTitle>
                <Activity className="h-5 w-5 text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{statistics.variantChanges.length}</div>
              <p className="text-xs text-white/60 mt-1">Son 30 gün</p>
            </CardContent>
          </Card>
        </div>

        {/* Price History Chart */}
        <Card className="business-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">Fiyat Geçmişi</CardTitle>
                <p className="text-sm text-white/70 mt-1">Ürünün zaman içindeki fiyat değişimleri</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedPeriod === '7d' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPeriod('7d')}
                  className={selectedPeriod === '7d' ? 'bg-indigo-600 hover:bg-indigo-700' : 'business-button'}
                  data-testid="button-period-7d"
                >
                  7 Gün
                </Button>
                <Button
                  variant={selectedPeriod === '30d' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPeriod('30d')}
                  className={selectedPeriod === '30d' ? 'bg-indigo-600 hover:bg-indigo-700' : 'business-button'}
                  data-testid="button-period-30d"
                >
                  30 Gün
                </Button>
                <Button
                  variant={selectedPeriod === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPeriod('all')}
                  className={selectedPeriod === 'all' ? 'bg-indigo-600 hover:bg-indigo-700' : 'business-button'}
                  data-testid="button-period-all"
                >
                  Tümü
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredPriceHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={filteredPriceHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="rgba(255,255,255,0.6)"
                    tick={{ fill: 'rgba(255,255,255,0.6)' }}
                  />
                  <YAxis 
                    stroke="rgba(255,255,255,0.6)"
                    tick={{ fill: 'rgba(255,255,255,0.6)' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(30, 41, 59, 0.95)', 
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.8)' }} />
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Fiyat (TL)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center py-12 text-white/60">
                <p>Seçilen dönem için veri yok</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Insights */}
        {statistics.aiInsights && (
          <Card className="business-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-purple-400" />
                <CardTitle className="text-white">AI Analiz ve Öneriler</CardTitle>
              </div>
              <p className="text-sm text-white/70 mt-1">OpenAI tarafından oluşturulan satış analizi ve stratejik öneriler</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                  <h4 className="font-semibold text-white mb-2">Satış Tahmini</h4>
                  <p className="text-white/80 text-sm">{statistics.aiInsights.salesEstimate}</p>
                </div>
                <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                  <h4 className="font-semibold text-white mb-2">Fiyat Stratejisi</h4>
                  <p className="text-white/80 text-sm">{statistics.aiInsights.priceStrategy}</p>
                </div>
              </div>

              <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                <h4 className="font-semibold text-white mb-2">Popüler Varyantlar</h4>
                <div className="flex flex-wrap gap-2 mt-2">
                  {statistics.aiInsights.popularVariants.map((variant, idx) => (
                    <Badge key={idx} className="bg-purple-600/80 text-white">
                      {variant}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                <h4 className="font-semibold text-white mb-2">Rekabet Analizi</h4>
                <p className="text-white/80 text-sm">{statistics.aiInsights.competitiveAnalysis}</p>
              </div>

              <div className="bg-blue-900/20 p-4 rounded-lg border border-white/10">
                <h4 className="font-semibold text-white mb-3">AI Önerileri</h4>
                <ul className="space-y-2">
                  {statistics.aiInsights.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-white/80 text-sm">
                      <span className="text-emerald-400 mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Variant Changes */}
        <Card className="business-card">
          <CardHeader>
            <CardTitle className="text-white">Varyant Değişiklikleri</CardTitle>
            <p className="text-sm text-white/70 mt-1">Ürün varyantlarında yapılan güncellemeler</p>
          </CardHeader>
          <CardContent>
            {statistics.variantChanges.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-blue-900/30 border-white/10">
                      <TableHead className="font-semibold text-white/90">Varyant</TableHead>
                      <TableHead className="font-semibold text-white/90">Değişiklik Türü</TableHead>
                      <TableHead className="font-semibold text-white/90">Eski Değer</TableHead>
                      <TableHead className="font-semibold text-white/90">Yeni Değer</TableHead>
                      <TableHead className="font-semibold text-white/90">Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statistics.variantChanges.map((change, idx) => (
                      <TableRow key={idx} className="hover:bg-blue-900/20 border-white/10">
                        <TableCell className="text-white">
                          <div className="font-medium">{change.color}</div>
                          <div className="text-sm text-white/60">{change.size}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-indigo-900/40 text-indigo-200 border-indigo-400/30">
                            {change.changeType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-white/80">{change.oldValue}</TableCell>
                        <TableCell className="text-white/80">{change.newValue}</TableCell>
                        <TableCell className="text-white/70">
                          {new Date(change.changedAt).toLocaleDateString('tr-TR')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-white/60">
                <Calendar className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg">Henüz varyant değişikliği yok</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
