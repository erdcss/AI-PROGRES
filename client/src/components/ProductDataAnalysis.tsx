import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Send, MessageCircle, Package, TrendingUp, Clock, Database, Zap, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { RealTimeClock } from './RealTimeClock';

interface MemoryStats {
  totalProducts: number;
  totalVariants: number;
  lastUpdate: string;
}

interface DailyOperation {
  id: string;
  type: 'price_check' | 'stock_check' | 'shopify_sync' | 'telegram_report';
  status: 'completed' | 'pending' | 'failed';
  timestamp: string;
  details: string;
}

interface ProductChange {
  id: string;
  productTitle: string;
  brand: string;
  oldPrice: string;
  newPrice: string;
  priceChange: string;
  oldStock: string;
  newStock: string;
  changeType: string;
  timestamp: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  trendyolUrl?: string;
  shopifyUrl?: string;
  shopifyStoreUrl?: string;
}

interface Product {
  id: string;
  title: string;
  brand: string;
  currentPrice: string;
  originalPrice?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  trendyolUrl?: string;
  shopifyProductId?: string;
  shopifyUrl?: string;
  shopifyStoreUrl?: string;
}

interface ScheduledTask {
  name: string;
  description: string;
  time: string;
  isActive: boolean;
  nextRun: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  brand: string;
  currentPrice: string;
  shopifyProductId: string;
  shopifyUrl: string;
  transferDate: string;
  shopifyStatus: string;
  profitMargin: string;
  sourcePlatform: string;
  trendyolUrl?: string;
}

interface ShopifyStats {
  totalProducts: number;
  totalValue: string;
  platformBreakdown: Record<string, number>;
  storeUrl: string | null;
}

export const ProductDataAnalysis: React.FC = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'ai',
      content: 'Merhaba! Sistem hafızasındaki ürün verileriniz hakkında sorularınızı yanıtlayabilirim. Fiyat değişimleri, stok durumu, Shopify senkronizasyonu gibi konularda yardımcı olabilirim.',
      timestamp: new Date().toLocaleTimeString('tr-TR')
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [timeToNext, setTimeToNext] = useState('');
  const [isClearingMemory, setIsClearingMemory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState('');

  // Refresh all data function
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchMemoryStats(),
        refetchDailyOps(),
        refetchProducts(),
        refetchChanges(),
        refetchShopifyProducts(),
        refetchShopifyStats(),
        refetchScheduler()
      ]);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch memory statistics
  const { data: memoryStats, refetch: refetchMemoryStats } = useQuery<MemoryStats>({
    queryKey: ['/api/memory/stats'],
    refetchInterval: 30000,
  });

  // Fetch daily operations
  const { data: dailyOpsData, refetch: refetchDailyOps } = useQuery({
    queryKey: ['/api/analysis/daily-operations'],
    refetchInterval: 60000,
  });

  // Fetch recent products
  const { data: productsData, refetch: refetchProducts } = useQuery({
    queryKey: ['/api/analysis/recent-products'],
    refetchInterval: 60000,
  });

  const products = Array.isArray(productsData) ? productsData : ((productsData as any)?.products || []);

  // Fetch product changes
  const { data: changesData, refetch: refetchChanges } = useQuery({
    queryKey: ['/api/analysis/product-changes'],
    refetchInterval: 30000,
  });

  // Fetch Shopify transferred products
  const { data: shopifyProducts, refetch: refetchShopifyProducts } = useQuery<{success: boolean, products: ShopifyProduct[], summary: any}>({
    queryKey: ['/api/shopify/transferred-products'],
    refetchInterval: 60000,
  });

  // Fetch Shopify store stats
  const { data: shopifyStats, refetch: refetchShopifyStats } = useQuery<{success: boolean, stats: ShopifyStats}>({
    queryKey: ['/api/shopify/store-stats'],
    refetchInterval: 60000,
  });

  // Fetch scheduled tasks
  const { data: schedulerData, refetch: refetchScheduler } = useQuery<{status: ScheduledTask[]}>({
    queryKey: ['/api/scheduler/status'],
    refetchInterval: 30000,
  });
  
  const scheduledTasks = schedulerData?.status || [];
  
  // Update current date and time every second
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('tr-TR');
      const timeStr = now.toLocaleTimeString('tr-TR');
      setCurrentDateTime(`${dateStr} ${timeStr}`);
    };

    updateDateTime();
    const dateTimeInterval = setInterval(updateDateTime, 1000);

    return () => clearInterval(dateTimeInterval);
  }, []);

  // Live countdown for next scheduled task
  useEffect(() => {
    const updateCountdown = () => {
      if (!scheduledTasks || scheduledTasks.length === 0) return;
      
      const now = new Date();
      const nextTask = scheduledTasks
        .filter(task => task.isActive)
        .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())[0];
      
      if (nextTask) {
        const nextRun = new Date(nextTask.nextRun);
        const diff = nextRun.getTime() - now.getTime();
        
        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          if (hours > 0) {
            setTimeToNext(`Sıradaki görevin başlamasına ${hours}:${minutes.toString().padStart(2, '0')} saat kaldı`);
          } else {
            setTimeToNext(`Sıradaki görevin başlamasına ${minutes} dakika kaldı`);
          }
        } else {
          setTimeToNext('Yakında başlayacak');
        }
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);

    return () => clearInterval(interval);
  }, [scheduledTasks]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: newMessage,
      timestamp: new Date().toLocaleTimeString('tr-TR')
    };

    setChatMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/analysis/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: newMessage }),
      });

      const data = await response.json();

      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: data.response || 'Özür dilerim, şu anda yanıt veremiyorum. Lütfen daha sonra tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };

      setChatMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'Bağlantı hatası oluştu. Lütfen daha sonra tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      setChatMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearMemory = async () => {
    setIsClearingMemory(true);
    try {
      const response = await fetch('/api/memory/clear-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.success) {
        const successMessage: ChatMessage = {
          id: Date.now().toString(),
          type: 'ai',
          content: `✅ Hafıza başarıyla temizlendi. ${result.deletedProducts} ürün ve ${result.deletedVariants} varyant silindi.`,
          timestamp: new Date().toLocaleTimeString('tr-TR')
        };
        setChatMessages(prev => [...prev, successMessage]);
        
        // Refresh all data after clearing
        await handleRefreshAll();
      } else {
        throw new Error(result.error || 'Hafıza temizlenirken hata oluştu');
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'ai',
        content: `❌ Hafıza temizlenirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsClearingMemory(false);
    }
  };

  const getPlatformLinkColor = (platform?: string) => {
    switch (platform?.toLowerCase()) {
      case 'trendyol':
        return 'text-orange-400 hover:text-orange-300';
      case 'hepsiburada':
        return 'text-red-400 hover:text-red-300';
      case 'n11':
        return 'text-purple-400 hover:text-purple-300';
      default:
        return 'text-blue-400 hover:text-blue-300';
    }
  };

  const getPlatformName = (url?: string) => {
    if (!url) return 'Bilinmiyor';
    if (url.includes('trendyol.com')) return 'trendyol';
    if (url.includes('hepsiburada.com')) return 'hepsiburada';
    if (url.includes('n11.com')) return 'n11';
    return 'diğer';
  };

  const totalProducts = memoryStats?.totalProducts || 0;
  const shopifyProductsData = shopifyProducts?.products || [];
  const shopifyStatsData = shopifyStats?.stats;
  const changesCount = Array.isArray(changesData) ? changesData.length : ((changesData as any)?.changes?.length || 0);
  const changes = Array.isArray(changesData) ? changesData : ((changesData as any)?.changes || []);
  const nextTask = scheduledTasks.filter(task => task.isActive)
    .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header with Real-time Clock */}
        <div className="text-center space-y-4">
          <motion.h1 
            className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Ürün Veri Analizi
          </motion.h1>
          <RealTimeClock />
        </div>

        {/* Refresh Button */}
        <div className="flex justify-center">
          <Button
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Yenileniyor...' : 'Tüm Verileri Yenile'}
          </Button>
        </div>

        {/* Main Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Products Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-slate-800/50 to-blue-900/30 border-blue-500/30 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Toplam Ürün</CardTitle>
                <Package className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{totalProducts}</div>
                <p className="text-xs text-gray-400">
                  Hafızadaki toplam ürün sayısı
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Shopify Products Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="bg-gradient-to-br from-slate-800/50 to-emerald-900/30 border-emerald-500/30 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Shopify Ürünleri</CardTitle>
                <ExternalLink className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{shopifyStatsData?.totalProducts || 0}</div>
                <p className="text-xs text-gray-400">
                  Aktarılan ürün sayısı
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Shopify Store Value Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card className="bg-gradient-to-br from-slate-800/50 to-yellow-900/30 border-yellow-500/30 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Mağaza Değeri</CardTitle>
                <TrendingUp className="h-4 w-4 text-yellow-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{shopifyStatsData?.totalValue || '0.00'} TL</div>
                <p className="text-xs text-gray-400">
                  Toplam ürün değeri
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Price/Stock Changes Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card className="bg-gradient-to-br from-slate-800/50 to-green-900/30 border-green-500/30 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Fiyat & Stok Değişimleri</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{changesCount}</div>
                <p className="text-xs text-gray-400">
                  Güncel değişiklik sayısı
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Next Scheduled Task Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card className="bg-gradient-to-br from-slate-800/50 to-purple-900/30 border-purple-500/30 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-300">Sıradaki Görev</CardTitle>
                <Clock className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{timeToNext || 'Yükleniyor...'}</div>
                <p className="text-xs text-gray-400">
                  {nextTask ? `${nextTask.time} - ${nextTask.description}` : 'Görev bekleniyor'}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Products */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Card className="bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-400" />
                  Son 3 Ürün
                </CardTitle>
                <CardDescription className="text-gray-400">
                  En son eklenen ürünler
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-4">
                    {products?.slice(0, 3).map((product: Product) => (
                      <div key={product.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-600/30">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-white text-sm leading-tight">{product.title}</h4>
                          <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-300">
                            {product.brand}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {product.originalPrice && (
                              <span className="text-blue-400 font-medium">
                                Alış: {product.originalPrice}
                              </span>
                            )}
                            <span className="text-green-400 font-bold">
                              {product.currentPrice}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            {product.sourceUrl && (
                              <a
                                href={product.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-xs px-2 py-1 rounded ${getPlatformLinkColor(getPlatformName(product.sourceUrl))} bg-slate-700/50 hover:bg-slate-600/50 transition-colors`}
                              >
                                {getPlatformName(product.sourceUrl) === 'trendyol' ? 'Trendyol\'da Gör' : 
                                 getPlatformName(product.sourceUrl) === 'hepsiburada' ? 'Hepsiburada\'da Gör' :
                                 getPlatformName(product.sourceUrl) === 'n11' ? 'N11\'de Gör' : 'Kaynak'}
                                <ExternalLink className="w-3 h-3 ml-1 inline" />
                              </a>
                            )}
                            {product.shopifyUrl && (
                              <a
                                href={product.shopifyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-2 py-1 rounded text-green-400 hover:text-green-300 bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
                              >
                                Shopify Admin
                                <ExternalLink className="w-3 h-3 ml-1 inline" />
                              </a>
                            )}
                            {product.shopifyStoreUrl && (
                              <a
                                href={product.shopifyStoreUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-2 py-1 rounded text-purple-400 hover:text-purple-300 bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
                              >
                                Mağaza
                                <ExternalLink className="w-3 h-3 ml-1 inline" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )) || (
                      <div className="text-center text-gray-500 py-8">
                        Henüz ürün bulunmuyor
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>

          {/* AI Chat Interface */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Card className="bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-cyan-400" />
                  AI Asistan
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Sistem hakkında soru sorun
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-48 border border-slate-600/30 rounded-lg p-3 bg-slate-900/50">
                  <div className="space-y-3">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] p-3 rounded-lg ${
                            message.type === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-gray-100'
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                          <p className="text-xs opacity-70 mt-1">{message.timestamp}</p>
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-slate-700 p-3 rounded-lg">
                          <p className="text-sm text-gray-300">AI yazıyor...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Sorunuzu yazın..."
                    className="bg-slate-800/50 border-slate-600/50 text-white"
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || isTyping}
                    className="bg-cyan-600 hover:bg-cyan-700"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Product Changes Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Card className="bg-gradient-to-br from-slate-800/50 to-slate-700/30 border-slate-600/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-yellow-400" />
                Fiyat & Stok Değişimleri
              </CardTitle>
              <CardDescription className="text-gray-400">
                Son değişiklikler
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-4">
                  {changes && changes.length > 0 ? (
                    changes.map((change: ProductChange) => (
                        <div key={change.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-600/30">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-medium text-white text-sm">{change.productTitle}</h4>
                              <p className="text-xs text-gray-400">{change.brand}</p>
                            </div>
                            <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-300">
                              {change.changeType}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-400">Fiyat:</p>
                              <p className="text-white">
                                <span className="text-red-400">{change.oldPrice}</span>
                                <span className="text-gray-500 mx-2">→</span>
                                <span className="text-green-400">{change.newPrice}</span>
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-400">Stok:</p>
                              <p className="text-white">
                                <span className="text-gray-300">{change.oldStock}</span>
                                <span className="text-gray-500 mx-2">→</span>
                                <span className="text-cyan-400">{change.newStock}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-600/30">
                            <p className="text-xs text-gray-500">{change.timestamp}</p>
                            <div className="flex gap-2">
                              {change.sourceUrl && (
                                <a
                                  href={change.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-xs px-2 py-1 rounded ${getPlatformLinkColor(getPlatformName(change.sourceUrl))} bg-slate-700/50 hover:bg-slate-600/50 transition-colors`}
                                >
                                  {getPlatformName(change.sourceUrl) === 'trendyol' ? 'Trendyol' : 
                                   getPlatformName(change.sourceUrl) === 'hepsiburada' ? 'Hepsiburada' :
                                   getPlatformName(change.sourceUrl) === 'n11' ? 'N11' : 'Kaynak'}
                                  <ExternalLink className="w-3 h-3 ml-1 inline" />
                                </a>
                              )}
                              {change.shopifyUrl && (
                                <a
                                  href={change.shopifyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 rounded text-green-400 hover:text-green-300 bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
                                >
                                  Shopify
                                  <ExternalLink className="w-3 h-3 ml-1 inline" />
                                </a>
                              )}
                              {change.shopifyStoreUrl && (
                                <a
                                  href={change.shopifyStoreUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 rounded text-purple-400 hover:text-purple-300 bg-slate-700/50 hover:bg-slate-600/50 transition-colors"
                                >
                                  Mağaza
                                  <ExternalLink className="w-3 h-3 ml-1 inline" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        Fiyat veya stok değişikliği bulunmuyor
                      </div>
                    )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};