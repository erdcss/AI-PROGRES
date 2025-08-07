import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocation } from 'wouter';
import { 
  MessageCircle, 
  X, 
  Send, 
  Bot, 
  Sparkles, 
  Minimize2,
  Maximize2,
  HelpCircle,
  Zap,
  Home,
  ShoppingCart,
  BarChart3,
  Settings,
  Database,
  Mail,
  Calendar,
  Cpu,
  Shield,
  Globe,
  ArrowRight,
  Star,
  Navigation,
  ChevronRight,
  Mic,
  Camera,
  FileText,
  Download
} from 'lucide-react';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
}

export function TBotAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentTab, setCurrentTab] = useState('chat');
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: '🚀 Merhaba! Ben T Bot, sizin gelişmiş AI asistanınızım. Size nasıl yardımcı olabilirim?',
      isBot: true,
      timestamp: new Date()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const navigationPages = [
    { name: 'Ana Sayfa', path: '/', icon: Home, description: 'Platform seçimi' },
    { name: 'Trendyol', path: '/trendyol', icon: ShoppingCart, description: 'Ürün çıkarma' },
    { name: 'Arçelik', path: '/arcelik', icon: Cpu, description: 'Beyaz eşya ürünleri' },
    { name: 'Fiyat Karşılaştırma', path: '/price-comparison', icon: BarChart3, description: 'Fiyat analizi' },
    { name: 'Sistem Durumu', path: '/system-status', icon: Shield, description: 'Sistem kontrolü' },
    { name: 'E-posta Ayarları', path: '/email', icon: Mail, description: 'Bildirim ayarları' },
    { name: 'Zamanlayıcı', path: '/scheduler', icon: Calendar, description: 'Otomatik görevler' },
    { name: 'Veri Analizi', path: '/data-analysis', icon: Database, description: 'Ürün analizi' },
    { name: 'Telegram', path: '/telegram', icon: MessageCircle, description: 'Telegram botu' }
  ];

  const quickCommands = [
    { text: 'Trendyol ürün çıkar', action: () => setLocation('/trendyol'), icon: '🛍️', color: 'bg-orange-600' },
    { text: 'Arçelik ürün çıkar', action: () => setLocation('/arcelik'), icon: '🏠', color: 'bg-green-600' },
    { text: 'Fiyat karşılaştır', action: () => setLocation('/price-comparison'), icon: '💰', color: 'bg-blue-600' },
    { text: 'Sistem durumu', action: () => setLocation('/system-status'), icon: '⚡', color: 'bg-purple-600' },
    { text: 'E-posta ayarla', action: () => setLocation('/email'), icon: '📧', color: 'bg-red-600' },
    { text: 'Veri analizi', action: () => setLocation('/data-analysis'), icon: '📊', color: 'bg-indigo-600' }
  ];

  const botResponses: Record<string, string> = {
    'trendyol': 'Trendyol ürün çıkarmak için: 1) Ana menüden Trendyol seçin 2) Ürün URL\'sini yapıştırın 3) "Ürün Çıkar" butonuna tıklayın. Sistem otomatik olarak ürün bilgilerini analiz edecektir.',
    'shopify': 'Shopify CSV oluşturmak için: 1) Ürünü başarıyla çıkardıktan sonra 2) "Shopify\'a Aktar" butonuna tıklayın 3) CSV dosyası otomatik olarak indirilecektir.',
    'fiyat': 'Fiyat karşılaştırması için: 1) Fiyat Karşılaştırması sayfasına gidin 2) Karşılaştırmak istediğiniz ürünlerin URL\'lerini ekleyin 3) Sistem otomatik analiz yapacaktır.',
    'sistem': 'Sistem durumu için: 1) Sistem Durumu sayfasına gidin 2) Tüm servislerin çalışma durumunu görebilirsiniz 3) Herhangi bir sorun varsa raporlanacaktır.',
    'default': 'Size daha iyi yardımcı olabilmek için sorunuzu daha detaylı açıklayabilir misiniz? Ayrıca hızlı komutları da kullanabilirsiniz.'
  };

  const handleSendMessage = () => {
    if (!currentMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: currentMessage,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setIsTyping(true);

    // Bot response logic
    setTimeout(() => {
      const messageKey = currentMessage.toLowerCase();
      let response = botResponses.default;

      for (const [key, value] of Object.entries(botResponses)) {
        if (messageKey.includes(key)) {
          response = value;
          break;
        }
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        isBot: true,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleQuickCommand = (command: { text: string; action: () => void }) => {
    // Add message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      text: command.text,
      isBot: false,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Execute action
    setTimeout(() => {
      command.action();
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `✅ ${command.text} sayfasına yönlendiriliyor...`,
        isBot: true,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
    }, 500);
  };

  const handleNavigate = (path: string, name: string) => {
    setLocation(path);
    const botMessage: Message = {
      id: Date.now().toString(),
      text: `🚀 ${name} sayfasına yönlendirildiniz!`,
      isBot: true,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, botMessage]);
    setIsOpen(false);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('tr-TR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <>
      {/* Modern T Bot Float Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -180 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0, rotate: 180 }}
            className="fixed bottom-6 right-6 z-50"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="relative">
              <Button
                onClick={() => setIsOpen(true)}
                className="business-button w-16 h-16 rounded-full shadow-2xl hover:shadow-3xl border-2 border-blue-400"
                size="sm"
              >
                <div className="relative flex flex-col items-center">
                  <Bot className="w-8 h-8 text-white" />
                  <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-ping"></div>
                  <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-400 rounded-full"></div>
                </div>
              </Button>
              
              {/* Floating indicators */}
              <div className="absolute -top-2 -left-2 w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="absolute -bottom-2 -left-2 w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></div>
              <div className="absolute -top-2 right-8 w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '1s' }}></div>
              
              {/* T Bot Label */}
              <div className="absolute -left-20 top-1/2 transform -translate-y-1/2 bg-blue-900 text-white px-3 py-1 rounded-full text-xs font-bold opacity-90">
                T Bot AI
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced T Bot Interface */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3, y: 50, x: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.3, y: 50, x: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Card className={`business-card w-[480px] shadow-2xl border-2 border-blue-500 ${isMinimized ? 'h-20' : 'h-[600px]'}`}>
              {/* Modern Header */}
              <CardHeader className="business-header p-4 cursor-pointer bg-gradient-to-r from-blue-800 to-blue-900 border-b-2 border-blue-500" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-white to-blue-100 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-blue-800 font-black text-lg">T</span>
                      </div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black text-white flex items-center gap-2">
                        T Bot AI Assistant
                        <Badge variant="secondary" className="bg-green-500 text-white text-xs font-bold px-2">
                          PRO
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-2 text-xs text-blue-200 font-bold">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span>Aktif & Hazır</span>
                        </div>
                        <span className="text-blue-300">|</span>
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI Güçlü
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMinimized(!isMinimized);
                      }}
                      className="text-white hover:bg-blue-700 p-2 h-auto rounded-lg"
                    >
                      {isMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                      }}
                      className="text-white hover:bg-red-600 p-2 h-auto rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Advanced Chat Content */}
              {!isMinimized && (
                <CardContent className="p-0 flex flex-col h-[540px]">
                  {/* Modern Tab System */}
                  <Tabs value={currentTab} onValueChange={setCurrentTab} className="h-full">
                    <div className="p-3 border-b business-border">
                      <TabsList className="grid w-full grid-cols-3 bg-blue-900">
                        <TabsTrigger value="chat" className="text-xs font-bold text-white data-[state=active]:bg-blue-600">
                          <MessageCircle className="w-3 h-3 mr-1" />
                          Sohbet
                        </TabsTrigger>
                        <TabsTrigger value="navigation" className="text-xs font-bold text-white data-[state=active]:bg-blue-600">
                          <Navigation className="w-3 h-3 mr-1" />
                          Sayfa Geçiş
                        </TabsTrigger>
                        <TabsTrigger value="actions" className="text-xs font-bold text-white data-[state=active]:bg-blue-600">
                          <Zap className="w-3 h-3 mr-1" />
                          Hızlı İşlem
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    {/* Chat Tab */}
                    <TabsContent value="chat" className="flex-1 m-0">
                      <ScrollArea className="h-[420px] p-3">
                        <div className="space-y-3">
                          {messages.map((message) => (
                            <motion.div 
                              key={message.id} 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
                            >
                              <div className={`max-w-[85%] rounded-xl p-4 shadow-lg ${
                                message.isBot 
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white' 
                                  : 'bg-gradient-to-r from-gray-700 to-gray-800 text-white'
                              }`}>
                                {message.isBot && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                      <span className="text-blue-600 text-xs font-bold">T</span>
                                    </div>
                                    <span className="text-xs text-blue-200 font-bold">T Bot AI Assistant</span>
                                    <Badge variant="secondary" className="text-xs bg-green-500 text-white">Online</Badge>
                                  </div>
                                )}
                                <p className="text-sm font-bold text-white leading-relaxed">{message.text}</p>
                                <p className="text-xs text-white/60 mt-2 flex items-center gap-1">
                                  <div className="w-1 h-1 bg-white/60 rounded-full"></div>
                                  {formatTime(message.timestamp)}
                                </p>
                              </div>
                            </motion.div>
                          ))}
                          
                          {isTyping && (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex justify-start"
                            >
                              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 shadow-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                    <span className="text-blue-600 text-xs font-bold">T</span>
                                  </div>
                                  <span className="text-xs text-blue-200 font-bold">T Bot düşünüyor...</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
                                  <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                  <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Navigation Tab */}
                    <TabsContent value="navigation" className="flex-1 m-0">
                      <ScrollArea className="h-[420px] p-3">
                        <div className="space-y-3">
                          <div className="text-center mb-4">
                            <h3 className="text-sm font-bold text-white mb-1">🚀 Sayfa Navigasyonu</h3>
                            <p className="text-xs text-white/70">Tıklayarak hızlıca sayfa değiştirin</p>
                          </div>
                          {navigationPages.map((page, index) => {
                            const Icon = page.icon;
                            return (
                              <motion.div
                                key={index}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                <Button
                                  onClick={() => handleNavigate(page.path, page.name)}
                                  className="w-full h-auto p-4 business-border text-left bg-blue-900 hover:bg-blue-800 border-blue-600 justify-start"
                                  variant="outline"
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                        <Icon className="w-4 h-4 text-white" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-white">{page.name}</p>
                                        <p className="text-xs text-white/60">{page.description}</p>
                                      </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-white/60" />
                                  </div>
                                </Button>
                              </motion.div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* Quick Actions Tab */}
                    <TabsContent value="actions" className="flex-1 m-0">
                      <ScrollArea className="h-[420px] p-3">
                        <div className="space-y-3">
                          <div className="text-center mb-4">
                            <h3 className="text-sm font-bold text-white mb-1">⚡ Hızlı İşlemler</h3>
                            <p className="text-xs text-white/70">Tek tıkla işlem yapın</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {quickCommands.map((cmd, index) => (
                              <motion.div
                                key={index}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                <Button
                                  onClick={() => handleQuickCommand(cmd)}
                                  className={`w-full h-auto p-4 text-left justify-start text-white font-bold border-0 ${cmd.color} hover:opacity-90`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-2xl">{cmd.icon}</span>
                                    <div>
                                      <p className="text-sm font-bold">{cmd.text}</p>
                                      <p className="text-xs opacity-80">Hızlı erişim</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 ml-auto" />
                                  </div>
                                </Button>
                              </motion.div>
                            ))}
                          </div>
                          
                          {/* Additional Actions */}
                          <div className="mt-6 pt-4 border-t border-blue-700">
                            <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              Gelişmiş Özellikler
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              <Button variant="outline" size="sm" className="business-border text-white hover:bg-blue-800 text-xs">
                                <Download className="w-3 h-3 mr-1" />
                                Rapor Al
                              </Button>
                              <Button variant="outline" size="sm" className="business-border text-white hover:bg-blue-800 text-xs">
                                <FileText className="w-3 h-3 mr-1" />
                                Geçmiş
                              </Button>
                              <Button variant="outline" size="sm" className="business-border text-white hover:bg-blue-800 text-xs">
                                <Camera className="w-3 h-3 mr-1" />
                                Ekran Al
                              </Button>
                              <Button variant="outline" size="sm" className="business-border text-white hover:bg-blue-800 text-xs">
                                <Mic className="w-3 h-3 mr-1" />
                                Sesli
                              </Button>
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                    </TabsContent>

                  {/* Modern Input Section */}
                  <div className="p-3 border-t border-blue-600 bg-blue-950">
                    {currentTab === 'chat' && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder="T Bot ile sohbet edin... 💬"
                            value={currentMessage}
                            onChange={(e) => setCurrentMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            className="business-input text-sm flex-1"
                          />
                          <Button
                            onClick={handleSendMessage}
                            disabled={!currentMessage.trim() || isTyping}
                            className="business-button px-4"
                            size="sm"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-white/60">
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            T Bot AI Aktif
                          </span>
                          <span>{messages.length} mesaj</span>
                        </div>
                      </div>
                    )}
                    
                    {currentTab === 'navigation' && (
                      <div className="text-center text-xs text-white/70">
                        <Globe className="w-4 h-4 mx-auto mb-1" />
                        Sayfa navigasyonu aktif - Tıklayarak geçiş yapın
                      </div>
                    )}
                    
                    {currentTab === 'actions' && (
                      <div className="text-center text-xs text-white/70">
                        <Sparkles className="w-4 h-4 mx-auto mb-1" />
                        Hızlı işlemler hazır - Tek tıkla erişim
                      </div>
                    )}
                  </div>
                  </Tabs>
                </CardContent>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}