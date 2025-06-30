import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, 
  Database, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Package, 
  Search,
  MessageSquare,
  Send,
  Bot,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  ExternalLink,
  Trash2,
  RefreshCw,
  ShoppingCart,
  Globe,
  Eye
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

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
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch daily operations
  const { data: dailyOpsData, refetch: refetchDailyOps } = useQuery({
    queryKey: ['/api/analysis/daily-operations'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch recent products
  const { data: productsData, refetch: refetchProducts } = useQuery({
    queryKey: ['/api/analysis/recent-products'],
    refetchInterval: 60000,
  });

  // Fetch product changes
  const { data: changesData, refetch: refetchChanges } = useQuery({
    queryKey: ['/api/analysis/product-changes'],
    refetchInterval: 30000,
  });

  // Fetch scheduled tasks
  const { data: schedulerData, refetch: refetchScheduler } = useQuery<{status: ScheduledTask[]}>({
    queryKey: ['/api/scheduler/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
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

    updateDateTime(); // Initial update
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
        const nextRunTime = new Date(nextTask.nextRun);
        const diff = nextRunTime.getTime() - now.getTime();
        
        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeToNext(`${hours}s ${minutes}d ${seconds}sn`);
        } else {
          setTimeToNext('Çalışıyor...');
        }
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [scheduledTasks]);

  // Use real data from API
  const dailyOperations: DailyOperation[] = (dailyOpsData as any)?.operations || [];

  const productChanges: ProductChange[] = (changesData as any)?.changes || [];

  const recentProducts: Product[] = (productsData as any)?.products || [];

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: newMessage,
      timestamp: new Date().toLocaleTimeString('tr-TR')
    };

    setChatMessages(prev => [...prev, userMessage]);
    const messageToSend = newMessage;
    setNewMessage('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/analysis/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messageToSend }),
      });

      const data = await response.json();
      
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: data.response || 'Üzgünüm, bir hata oluştu.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };

      setChatMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'Bağlantı hatası oluştu. Lütfen tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      setChatMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearMemory = async () => {
    if (!confirm('Hafızadaki tüm ürünleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }

    setIsClearingMemory(true);
    try {
      const response = await fetch('/api/memory/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        // Başarılı mesajı chatbot'a ekle
        const successMessage: ChatMessage = {
          id: Date.now().toString(),
          type: 'ai',
          content: '✅ Hafızadaki tüm ürünler başarıyla temizlendi. Sistem yeni ürün transferleri için hazır.',
          timestamp: new Date().toLocaleTimeString('tr-TR')
        };
        setChatMessages(prev => [...prev, successMessage]);
        
        // Verileri yenile
        window.location.reload();
      } else {
        throw new Error('Hafıza temizleme başarısız');
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'ai',
        content: '❌ Hafıza temizlenirken hata oluştu. Lütfen tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsClearingMemory(false);
    }
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'price_increase':
        return <ArrowUp className="h-4 w-4 text-red-500" />;
      case 'price_decrease':
        return <ArrowDown className="h-4 w-4 text-green-500" />;
      case 'stock_in':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'stock_out':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'price_increase':
        return 'text-red-600 bg-red-50';
      case 'price_decrease':
        return 'text-green-600 bg-green-50';
      case 'stock_in':
        return 'text-green-600 bg-green-50';
      case 'stock_out':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'price_check':
        return <TrendingUp className="h-4 w-4" />;
      case 'stock_check':
        return <Package className="h-4 w-4" />;
      case 'shopify_sync':
        return <Database className="h-4 w-4" />;
      case 'telegram_report':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="w-full space-y-8 relative">
      {/* Refresh Button - Top Right Corner */}
      <div className="absolute top-0 right-0 z-10">
        <Button
          onClick={handleRefreshAll}
          disabled={isRefreshing}
          className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Yenileniyor...' : 'Sayfayı Yenile'}
        </Button>
      </div>
      
      {/* Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
          <BarChart3 className="h-8 w-8 text-blue-400" />
          <h1 className="text-3xl font-bold text-white tracking-tight">Sistem Hafıza Durumu</h1>
        </div>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
          Gerçek zamanlı ürün takibi, AI destekli analiz ve otomatik Shopify senkronizasyonu
        </p>
        
        {/* Current Date and Time */}
        <div className="flex justify-center gap-4 mt-4">
          <Badge variant="secondary" className="bg-white/10 text-white border-white/20 px-4 py-2">
            <Clock className="h-4 w-4 mr-2" />
            {currentDateTime}
          </Badge>
        </div>
      </motion.div>

      {/* Stats Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <Card className="bg-white/5 backdrop-blur-md border-white/10">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
              <Database className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {memoryStats?.totalProducts?.toLocaleString('tr-TR') || '0'}
            </h3>
            <p className="text-gray-300 font-medium">Toplam Ürün</p>
            <p className="text-sm text-gray-400 mt-1">Hafızada kayıtlı</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 backdrop-blur-md border-white/10">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center">
              <TrendingUp className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {productChanges?.length || 0}
            </h3>
            <p className="text-gray-300 font-medium">Değişen Ürünler</p>
            <p className="text-sm text-gray-400 mt-1">Fiyat/stok değişiklikleri</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 backdrop-blur-md border-white/10">
          <CardContent className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center">
              <Clock className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              {(() => {
                const nextTask = scheduledTasks
                  .filter(task => task.isActive)
                  .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())[0];
                
                if (nextTask) {
                  return new Date(nextTask.nextRun).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                }
                return '12:00';
              })()}
            </h3>
            <p className="text-gray-300 font-medium">Sonraki Görev</p>
            <p className="text-sm text-gray-400 mt-1">
              {(() => {
                const nextTask = scheduledTasks
                  .filter(task => task.isActive)
                  .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime())[0];
                
                if (nextTask) {
                  const taskName = nextTask.name === 'morning-analysis' ? 'Sabah Analizi' :
                                  nextTask.name === 'daily-updates' ? 'Günlük Güncelleme' :
                                  nextTask.name === 'evening-reports' ? 'Akşam Raporu' : nextTask.description;
                  return taskName;
                }
                return 'Günlük Güncelleme';
              })()}
            </p>
            {timeToNext && (
              <p className="text-xs text-green-400 mt-2 font-medium">
                Kalan: {timeToNext}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* AI Chatbot Section */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Card className="bg-white/5 backdrop-blur-md border-white/10 h-full">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-xl font-bold text-white">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                AI Veri Asistanı
              </CardTitle>
              <p className="text-gray-400 text-sm">Ürün verileriniz hakkında soru sorun</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-80 bg-black/20 rounded-lg p-4 border border-white/10">
                <div className="space-y-4">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] p-4 rounded-2xl ${
                          message.type === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                            : 'bg-white/10 backdrop-blur-sm text-gray-100 border border-white/10'
                        }`}
                      >
                        <p className="text-sm leading-relaxed font-medium">{message.content}</p>
                        <p className="text-xs opacity-70 mt-2 font-normal">{message.timestamp}</p>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                        <div className="flex space-x-2">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex gap-3">
                <Input
                  placeholder="Örnek: Hafızada kaç ürün var? Fiyat değişimleri nasıl?"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder-gray-400 font-medium"
                />
                <Button 
                  onClick={handleSendMessage} 
                  size="icon" 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 border-none"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Scheduled Tasks */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Card className="bg-white/5 backdrop-blur-md border-white/10 h-full">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-xl font-bold text-white">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                  <Clock className="h-5 w-5 text-white" />
                </div>
                Zamanlı Görevler
              </CardTitle>
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-sm">Otomatik zamanlama ve sistem görevleri</p>
                {timeToNext && (
                  <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    <Clock className="h-3 w-3 mr-1" />
                    Sonraki: {timeToNext}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                <div className="space-y-4">
                  {/* Fixed 3 programmed tasks */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                          <TrendingUp className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">Günlük Ürün İzleme</h4>
                          <p className="text-sm text-gray-400">Fiyat ve stok değişikliklerini kontrol eder</p>
                        </div>
                      </div>
                      <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                        Aktif
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">Zamanlama: Her gün 12:00</span>
                      <span className="text-blue-400">Otomatik Shopify Sync</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">Z Raporu Gönderimi</h4>
                          <p className="text-sm text-gray-400">Günlük satış ve sistem raporu</p>
                        </div>
                      </div>
                      <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                        Aktif
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">Zamanlama: Her gün 23:00</span>
                      <span className="text-orange-400">Telegram + Email</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">Sistem Sağlık Kontrolü</h4>
                          <p className="text-sm text-gray-400">API bağlantıları ve sistem durumu</p>
                        </div>
                      </div>
                      <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                        Aktif
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">Zamanlama: Her gün 06:00</span>
                      <span className="text-purple-400">Telegram Bildirimi</span>
                    </div>
                  </div>

                  {/* Dynamic tasks from API if any */}
                  {scheduledTasks && scheduledTasks.length > 0 && scheduledTasks.map((task, index) => (
                    <div key={index} className="p-4 rounded-xl bg-white/5 border border-white/10 opacity-75">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            task.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            <Clock className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-white">{task.name}</h4>
                            <p className="text-sm text-gray-400">{task.description}</p>
                          </div>
                        </div>
                        <Badge variant={task.isActive ? "default" : "secondary"} className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                          {task.isActive ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">Zamanlama: {task.time}</span>
                        <span className="text-gray-300">Sonraki: {task.nextRun}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* System Operations Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <Card className="bg-white/5 backdrop-blur-md border-white/10">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl font-bold text-white">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              Günlük Sistem İşlemleri
            </CardTitle>
            <p className="text-gray-400 text-sm">Otomatik monitoring ve senkronizasyon durumu</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dailyOperations.length > 0 ? dailyOperations.map((operation) => (
                <div key={operation.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className={`p-2 rounded-lg ${
                    operation.status === 'completed' ? 'bg-green-500/20 text-green-400' : 
                    operation.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {getOperationIcon(operation.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{operation.details}</p>
                    <p className="text-xs text-gray-400 mt-1">{operation.timestamp}</p>
                  </div>
                  <Badge variant={
                    operation.status === 'completed' ? 'default' : 
                    operation.status === 'pending' ? 'secondary' : 'destructive'
                  } className="font-medium">
                    {operation.status === 'completed' ? 'Tamamlandı' : 
                     operation.status === 'pending' ? 'Bekliyor' : 'Hata'}
                  </Badge>
                </div>
              )) : (
                <div className="text-center py-8 col-span-2">
                  <Clock className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">Henüz günlük işlem kaydı yok</p>
                  <p className="text-sm text-gray-500 mt-1">İlk monitoring 12:00'da başlayacak</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Product List and Changes */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Recent Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Card className="bg-white/5 backdrop-blur-md border-white/10">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-xl font-bold text-white">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Package className="h-5 w-5 text-white" />
                </div>
                Son 3 Ürün
              </CardTitle>
              <p className="text-gray-400 text-sm">En son eklenen 3 ürün</p>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                <div className="space-y-4">
                  {recentProducts.length > 0 ? recentProducts.slice(0, 3).map((product) => (
                    <div key={product.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-white truncate flex-1">{product.title}</h4>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-300">{product.brand}</span>
                          <span className="text-green-400 font-medium">{product.currentPrice}</span>
                        </div>
                        {product.originalPrice && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Alış Fiyatı:</span>
                            <span className="text-blue-400 font-medium">{product.originalPrice}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          {/* Trendyol Product View Button */}
                          {(product.sourceUrl || product.sourcePlatform === 'trendyol') && (
                            <Button
                              size="sm"
                              className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30"
                              onClick={() => window.open(product.sourceUrl || `https://www.trendyol.com/sr?q=${encodeURIComponent(product.title)}`, '_blank')}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Trendyol'da Gör
                            </Button>
                          )}
                          
                          <div className="flex items-center gap-1">
                            {product.sourceUrl && (
                              <a 
                                href={product.sourceUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={`transition-colors p-1 rounded ${
                                  product.sourcePlatform === 'trendyol' ? 'text-orange-400 hover:text-orange-300' :
                                  product.sourcePlatform === 'hepsiburada' ? 'text-red-400 hover:text-red-300' :
                                  product.sourcePlatform === 'n11' ? 'text-purple-400 hover:text-purple-300' :
                                  'text-blue-400 hover:text-blue-300'
                                }`}
                                title={`${
                                  product.sourcePlatform === 'trendyol' ? 'Trendyol' :
                                  product.sourcePlatform === 'hepsiburada' ? 'Hepsiburada' :
                                  product.sourcePlatform === 'n11' ? 'N11' :
                                  'Kaynak Platform'
                                }'da Görüntüle`}
                              >
                                <Globe className="h-4 w-4" />
                              </a>
                            )}
                            {product.shopifyUrl && (
                              <a 
                                href={product.shopifyUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-green-400 hover:text-green-300 transition-colors p-1 rounded"
                                title="Shopify Admin'de Görüntüle"
                              >
                                <ShoppingCart className="h-4 w-4" />
                              </a>
                            )}
                            {product.shopifyStoreUrl && (
                              <a 
                                href={product.shopifyStoreUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 transition-colors p-1 rounded"
                                title="Shopify Mağaza'da Görüntüle"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-8">
                      <Package className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">Henüz ürün kaydı yok</p>
                      <p className="text-sm text-gray-500 mt-1">Ana sayfadan ürün ekleyerek başlayın</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Product Changes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Card className="bg-white/5 backdrop-blur-md border-white/10">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-xl font-bold text-white">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                Fiyat & Stok Değişimleri
              </CardTitle>
              <p className="text-gray-400 text-sm">Gerçek zamanlı takip ve değişiklikler</p>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                <div className="space-y-4">
                  {productChanges.length > 0 ? productChanges.map((change) => (
                    <div key={change.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                          <TrendingUp className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-white text-sm truncate flex-1">{change.productTitle}</h4>
                            <div className="flex items-center gap-1 ml-2">
                              {change.sourceUrl && (
                                <a 
                                  href={change.sourceUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className={`transition-colors p-1 rounded ${
                                    change.sourcePlatform === 'trendyol' ? 'text-orange-400 hover:text-orange-300' :
                                    change.sourcePlatform === 'hepsiburada' ? 'text-red-400 hover:text-red-300' :
                                    change.sourcePlatform === 'n11' ? 'text-purple-400 hover:text-purple-300' :
                                    'text-blue-400 hover:text-blue-300'
                                  }`}
                                  title={`${
                                    change.sourcePlatform === 'trendyol' ? 'Trendyol' :
                                    change.sourcePlatform === 'hepsiburada' ? 'Hepsiburada' :
                                    change.sourcePlatform === 'n11' ? 'N11' :
                                    'Kaynak Platform'
                                  }'da Görüntüle`}
                                >
                                  <Globe className="h-4 w-4" />
                                </a>
                              )}
                              {change.shopifyUrl && (
                                <a 
                                  href={change.shopifyUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-green-400 hover:text-green-300 transition-colors p-1 rounded"
                                  title="Shopify Admin'de Görüntüle"
                                >
                                  <ShoppingCart className="h-4 w-4" />
                                </a>
                              )}
                              {change.shopifyStoreUrl && (
                                <a 
                                  href={change.shopifyStoreUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 transition-colors p-1 rounded"
                                  title="Shopify Mağaza'da Görüntüle"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-gray-300 mb-2">{change.brand}</div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-xs">Fiyat:</span>
                              <span className="text-gray-400 text-xs">{change.oldPrice}</span>
                              <span className="text-gray-500">→</span>
                              <span className="text-green-400 text-xs font-medium">{change.newPrice}</span>
                              {change.priceChange !== 'Hesaplanamadı' && (
                                <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                                  {change.priceChange}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-xs">Stok:</span>
                              <span className="text-gray-400 text-xs">{change.oldStock}</span>
                              <span className="text-gray-500">→</span>
                              <span className={`text-xs font-medium ${change.newStock === 'Stokta' ? 'text-green-400' : 'text-red-400'}`}>
                                {change.newStock}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">{change.timestamp}</p>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-8">
                      <TrendingUp className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">Henüz değişiklik kaydı yok</p>
                      <p className="text-sm text-gray-500 mt-1">Monitoring başladığında görünecek</p>
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