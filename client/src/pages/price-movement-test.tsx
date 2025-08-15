import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart3, Clock, TestTube } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PriceHistoryItem {
  price: number;
  previousPrice: number;
  changeAmount: number;
  changePercentage: number;
  recordedAt: string;
}

interface PriceStats {
  currentPrice: number;
  oldestPrice: number;
  highestPrice: number;
  lowestPrice: number;
  averagePrice: number;
  totalChange: string;
  trend7Days: 'up' | 'down' | 'stable';
  trend30Days: 'up' | 'down' | 'stable';
  volatility: 'low' | 'medium' | 'high';
  avgVolatility: string;
  totalRecords: number;
  trackingPeriod: {
    from: string;
    to: string;
  };
}

export default function PriceMovementTest() {
  const [testUrl, setTestUrl] = useState("");
  const [testPrice, setTestPrice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([]);
  const [priceStats, setPriceStats] = useState<PriceStats | null>(null);

  const handlePriceTest = async () => {
    if (!testUrl || !testPrice) {
      alert("URL ve fiyat giriniz");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/price-movement/test', {
        url: testUrl,
        newPrice: testPrice
      });
      
      const result = await response.json();
      setTestResult(result);
      
      // Also fetch updated history
      await fetchPriceHistory();
      
    } catch (error) {
      console.error('Test error:', error);
      alert('Test başarısız');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPriceHistory = async () => {
    if (!testUrl) return;
    
    try {
      const encodedUrl = encodeURIComponent(testUrl);
      const response = await apiRequest('GET', `/api/price-movement/history/${encodedUrl}`);
      const result = await response.json();
      
      if (result.success) {
        setPriceHistory(result.data.history);
      }
    } catch (error) {
      console.error('History fetch error:', error);
    }
  };

  const fetchPriceStats = async () => {
    if (!testUrl) return;
    
    try {
      const encodedUrl = encodeURIComponent(testUrl);
      const response = await apiRequest('GET', `/api/price-movement/stats/${encodedUrl}`);
      const result = await response.json();
      
      if (result.success && result.data.stats) {
        setPriceStats(result.data.stats);
      }
    } catch (error) {
      console.error('Stats fetch error:', error);
    }
  };

  const simulateMultiplePriceChanges = async () => {
    if (!testUrl) {
      alert("URL giriniz");
      return;
    }

    setIsLoading(true);
    try {
      // Simulate some realistic price changes
      const priceChanges = [
        parseFloat(testPrice) * 0.95, // 5% decrease
        parseFloat(testPrice) * 1.03, // 3% increase
        parseFloat(testPrice) * 0.98, // 2% decrease
        parseFloat(testPrice) * 1.07, // 7% increase
        parseFloat(testPrice) * 0.92  // 8% decrease
      ];

      const response = await apiRequest('POST', '/api/price-movement/simulate', {
        url: testUrl,
        priceChanges
      });
      
      const result = await response.json();
      setTestResult(result);
      
      // Fetch updated data
      await fetchPriceHistory();
      await fetchPriceStats();
      
    } catch (error) {
      console.error('Simulation error:', error);
      alert('Simulasyon başarısız');
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-400" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-400" />;
      default: return <BarChart3 className="h-4 w-4 text-gray-400" />;
    }
  };

  const getVolatilityColor = (volatility: string) => {
    switch (volatility) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      default: return 'text-green-400';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <TestTube className="h-8 w-8 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">Enhanced Price Movement Test</h1>
            <BarChart3 className="h-8 w-8 text-blue-400" />
          </div>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Gelişmiş fiyat hareketi takip sistemi test arayüzü. Telegram bildirimlerini ve detaylı analiz özelliklerini test edin.
          </p>
        </motion.div>

        {/* Test Controls */}
        <Card className="bg-slate-800/30 backdrop-blur-sm border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TestTube className="h-5 w-5 text-purple-400" />
              Fiyat Hareketi Test Kontrolü
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Test URL</label>
                <Input
                  placeholder="Trendyol ürün URL'si girin..."
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Yeni Fiyat (TL)</label>
                <Input
                  type="number"
                  placeholder="123.45"
                  value={testPrice}
                  onChange={(e) => setTestPrice(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={handlePriceTest}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isLoading ? 'Test Ediliyor...' : 'Tek Fiyat Değişikliği Test Et'}
              </Button>
              
              <Button
                onClick={simulateMultiplePriceChanges}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? 'Simülasyon...' : 'Çoklu Değişiklik Simülasyonu'}
              </Button>
              
              <Button
                onClick={fetchPriceHistory}
                disabled={isLoading}
                variant="outline"
                className="border-slate-600 text-white hover:bg-slate-700"
              >
                Fiyat Geçmişini Yükle
              </Button>
              
              <Button
                onClick={fetchPriceStats}
                disabled={isLoading}
                variant="outline"
                className="border-slate-600 text-white hover:bg-slate-700"
              >
                İstatistikleri Yükle
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Result */}
        {testResult && (
          <Card className="bg-slate-800/30 backdrop-blur-sm border-green-500/30">
            <CardHeader>
              <CardTitle className="text-white">Test Sonucu</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-green-400 text-sm bg-slate-900/50 p-4 rounded overflow-auto">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Price Stats */}
        {priceStats && (
          <Card className="bg-slate-800/30 backdrop-blur-sm border-blue-500/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-400" />
                Fiyat İstatistikleri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="text-white font-semibold">Fiyat Analizi</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Mevcut Fiyat:</span>
                      <span className="text-white font-medium">{priceStats.currentPrice.toFixed(2)} TL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">En Yüksek:</span>
                      <span className="text-green-400 font-medium">{priceStats.highestPrice.toFixed(2)} TL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">En Düşük:</span>
                      <span className="text-red-400 font-medium">{priceStats.lowestPrice.toFixed(2)} TL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Ortalama:</span>
                      <span className="text-blue-400 font-medium">{priceStats.averagePrice.toFixed(2)} TL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Toplam Değişim:</span>
                      <span className={`font-medium ${parseFloat(priceStats.totalChange) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {priceStats.totalChange}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-white font-semibold">Trend Analizi</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">7 Günlük Trend:</span>
                      <div className="flex items-center gap-2">
                        {getTrendIcon(priceStats.trend7Days)}
                        <span className="text-white capitalize">{priceStats.trend7Days}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">30 Günlük Trend:</span>
                      <div className="flex items-center gap-2">
                        {getTrendIcon(priceStats.trend30Days)}
                        <span className="text-white capitalize">{priceStats.trend30Days}</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Volatilite:</span>
                      <span className={`font-medium capitalize ${getVolatilityColor(priceStats.volatility)}`}>
                        {priceStats.volatility} ({priceStats.avgVolatility}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-white font-semibold">Takip Bilgileri</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Toplam Kayıt:</span>
                      <span className="text-white font-medium">{priceStats.totalRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Başlangıç:</span>
                      <span className="text-gray-300 text-xs">
                        {new Date(priceStats.trackingPeriod.from).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Son Güncelleme:</span>
                      <span className="text-gray-300 text-xs">
                        {new Date(priceStats.trackingPeriod.to).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Price History */}
        {priceHistory.length > 0 && (
          <Card className="bg-slate-800/30 backdrop-blur-sm border-yellow-500/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-400" />
                Fiyat Geçmişi ({priceHistory.length} kayıt)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {priceHistory.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="text-white font-medium">
                        {item.price.toFixed(2)} TL
                      </div>
                      <div className={`text-sm ${item.changeAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.changeAmount >= 0 ? '+' : ''}{item.changeAmount.toFixed(2)} TL 
                        ({item.changePercentage.toFixed(1)}%)
                      </div>
                    </div>
                    <div className="text-gray-400 text-sm">
                      {new Date(item.recordedAt).toLocaleString('tr-TR')}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="bg-slate-800/30 backdrop-blur-sm border-slate-600">
          <CardHeader>
            <CardTitle className="text-white">Kullanım Talimatları</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-medium mb-2">Test Özellikleri</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Tek fiyat değişikliği testi</li>
                  <li>• Çoklu fiyat değişikliği simülasyonu</li>
                  <li>• Detaylı Telegram bildirimleri</li>
                  <li>• Fiyat geçmişi analizi</li>
                  <li>• Trend ve volatilite hesaplaması</li>
                  <li>• Satın alma önerileri</li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-white font-medium mb-2">Telegram Bildirimi İçeriği</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Fiyat değişiklik analizi</li>
                  <li>• Tarihsel karşılaştırma</li>
                  <li>• 7 ve 30 günlük trend analizi</li>
                  <li>• Volatilite değerlendirmesi</li>
                  <li>• Son fiyat hareketleri</li>
                  <li>• AI tabanlı satın alma önerileri</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}