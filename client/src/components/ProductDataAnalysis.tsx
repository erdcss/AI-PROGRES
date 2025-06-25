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
  Minus
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
  productName: string;
  changeType: 'price_increase' | 'price_decrease' | 'stock_in' | 'stock_out';
  oldValue: string;
  newValue: string;
  timestamp: string;
  percentage?: number;
}

interface Product {
  id: string;
  title: string;
  brand: string;
  currentPrice: string;
  originalPrice: string;
  stockStatus: boolean;
  lastChecked: string;
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
      content: 'Merhaba! Ürün verileriniz hakkında sorularınızı yanıtlayabilirim. Hangi konuda yardım istersiniz?',
      timestamp: new Date().toLocaleTimeString('tr-TR')
    }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Fetch memory statistics
  const { data: memoryStats } = useQuery<MemoryStats>({
    queryKey: ['/api/analysis/memory-stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch daily operations
  const { data: dailyOpsData } = useQuery({
    queryKey: ['/api/analysis/daily-operations'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch recent products
  const { data: productsData } = useQuery({
    queryKey: ['/api/analysis/recent-products'],
    refetchInterval: 60000,
  });

  // Fetch product changes
  const { data: changesData } = useQuery({
    queryKey: ['/api/analysis/product-changes'],
    refetchInterval: 30000,
  });

  // Use real data from API
  const dailyOperations: DailyOperation[] = dailyOpsData?.operations || [];

  const productChanges: ProductChange[] = changesData?.changes || [];

  const recentProducts: Product[] = productsData?.products || [];

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
        content: data.response || 'Üzgünüm, şu anda yanıt veremiyorum.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      
      setChatMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'Bağlantı hatası oluştu. Lütfen tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      };
      setChatMessages(prev => [...prev, errorResponse]);
    }
    
    setIsTyping(false);
  };

  const generateAIResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('kaç') && lowerMessage.includes('ürün')) {
      return `Hafızada toplam ${memoryStats?.totalProducts || 0} ürün ve ${memoryStats?.totalVariants || 0} varyant bulunuyor. Bu ürünler günlük olarak fiyat ve stok kontrolünden geçiyor.`;
    }
    
    if (lowerMessage.includes('fiyat') && lowerMessage.includes('değişim')) {
      return 'Son 24 saatte 2 üründe fiyat değişimi tespit edildi. Nike Air Max 270 %7.69 artış, Adidas Ultraboost 22 %10.53 düşüş gösterdi.';
    }
    
    if (lowerMessage.includes('stok')) {
      return 'Toplam 1,245 ürün içerisinde 1,198 ürün stokta, 47 ürün tükendi. Stok durumu sürekli izleniyor ve Shopify otomatik güncelleniyor.';
    }
    
    if (lowerMessage.includes('shopify')) {
      return 'Shopify entegrasyonu aktif. Fiyat ve stok değişimleri otomatik olarak senkronize ediliyor. Son senkronizasyon 15 dakika önce yapıldı.';
    }
    
    return 'Bu konuda size yardımcı olabilirim. Ürün sayısı, fiyat değişimleri, stok durumu, Shopify senkronizasyonu hakkında sorularınızı yanıtlayabilirim.';
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-7xl mx-auto p-6"
    >
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-bold text-blue-900">
            <BarChart3 className="h-8 w-8" />
            Ürün Veri Analizi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI Chatbot Section */}
          <Card className="border-2 border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-blue-800">
                <Bot className="h-5 w-5" />
                AI Chat Botu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-64 border rounded-lg p-4 bg-white">
                <div className="space-y-3">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-lg ${
                          message.type === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">{message.timestamp}</p>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 p-3 rounded-lg">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="flex gap-2">
                <Input
                  placeholder="Ürün verileriniz hakkında soru sorun..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} size="icon" className="bg-blue-500 hover:bg-blue-600">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Memory Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-blue-600" />
                  Hafıza Bilgisi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Toplam Ürün:</span>
                    <Badge variant="secondary" className="text-lg font-bold">
                      {memoryStats?.totalProducts?.toLocaleString('tr-TR') || '0'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Toplam Varyant:</span>
                    <Badge variant="secondary" className="text-lg font-bold">
                      {memoryStats?.totalVariants?.toLocaleString('tr-TR') || '0'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Son Güncelleme:</span>
                    <span className="text-sm text-gray-600">
                      {new Date().toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <Separator />
                  <div className="text-center">
                    <p className="text-sm text-gray-600">
                      Veriler gerçek zamanlı olarak güncelleniyor
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Daily Operations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-green-600" />
                  Günlük İşlemler
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-3">
                    {dailyOperations.map((operation) => (
                      <div key={operation.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                        <div className={`p-1 rounded ${
                          operation.status === 'completed' ? 'bg-green-100' : 
                          operation.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'
                        }`}>
                          {getOperationIcon(operation.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{operation.details}</p>
                          <p className="text-xs text-gray-500">{operation.timestamp}</p>
                        </div>
                        <Badge variant={
                          operation.status === 'completed' ? 'default' : 
                          operation.status === 'pending' ? 'secondary' : 'destructive'
                        }>
                          {operation.status === 'completed' ? 'Tamamlandı' : 
                           operation.status === 'pending' ? 'Bekliyor' : 'Hata'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5 text-purple-600" />
                  Ürün Listesi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {recentProducts.map((product) => (
                      <div key={product.id} className="p-3 rounded-lg border bg-white">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-sm truncate flex-1">{product.title}</h4>
                          <Badge variant={product.stockStatus ? 'default' : 'destructive'} className="ml-2">
                            {product.stockStatus ? 'Stokta' : 'Tükendi'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{product.brand}</p>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium text-green-600">{product.currentPrice}</span>
                          <span className="text-gray-500">Son kontrol: {product.lastChecked}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Data Changes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-red-600" />
                  Veri Değişimleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {productChanges.map((change) => (
                      <div key={change.id} className="p-3 rounded-lg border bg-white">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm truncate flex-1">{change.productName}</h4>
                          <div className="flex items-center gap-1">
                            {getChangeIcon(change.changeType)}
                            {change.percentage && (
                              <span className={`text-xs font-bold ${
                                change.percentage > 0 ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {change.percentage > 0 ? '+' : ''}{change.percentage.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex gap-2">
                            <span className="text-gray-500">{change.oldValue}</span>
                            <span>→</span>
                            <span className={getChangeColor(change.changeType).split(' ')[0]}>
                              {change.newValue}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{change.timestamp}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};