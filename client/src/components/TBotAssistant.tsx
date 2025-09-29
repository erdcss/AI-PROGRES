import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocation } from 'wouter';
import { useIsMobile } from '@/hooks/use-mobile';
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
  Download,
  Bookmark
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
  const isMobile = useIsMobile();
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
    { name: 'Kayıtlı URL\'ler', path: '/saved-urls', icon: Bookmark, description: 'Trendyol URL arama' },
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
            className={`fixed z-50 ${isMobile ? 'bottom-4 right-4' : 'bottom-6 right-6'}`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="relative">
              <Button
                onClick={() => setIsOpen(true)}
                className={`business-button rounded-full shadow-2xl hover:shadow-3xl border-2 border-blue-400 active:scale-95 transition-transform duration-200 ${isMobile ? 'w-14 h-14' : 'w-16 h-16'}`}
                size="sm"
                data-testid="button-tbot-assistant"
              >
                <div className="relative flex flex-col items-center">
                  <Bot className={`text-white ${isMobile ? 'w-7 h-7' : 'w-8 h-8'}`} />
                  <div className={`absolute -top-1 -right-1 bg-green-500 rounded-full animate-ping ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`}></div>
                  <div className={`absolute -top-1 -right-1 bg-green-400 rounded-full ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`}></div>
                </div>
              </Button>
              
              {/* Floating indicators */}
              <div className="absolute -top-1 -left-1 sm:-top-2 sm:-left-2 w-2 h-2 sm:w-3 sm:h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="absolute -bottom-1 -left-1 sm:-bottom-2 sm:-left-2 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></div>
              <div className="absolute -top-1 right-6 sm:-top-2 sm:right-8 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '1s' }}></div>
              
              {/* T Bot Label */}
              <div className="absolute -left-16 sm:-left-20 top-1/2 transform -translate-y-1/2 bg-blue-900 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-full text-xs font-bold opacity-90 hidden sm:block">
                T Bot AI
              </div>
              <div className="absolute -left-12 top-1/2 transform -translate-y-1/2 bg-blue-900 text-white px-2 py-1 rounded-full text-xs font-bold opacity-90 sm:hidden">
                T Bot
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
            className={`fixed z-50 ${isMobile ? 'inset-4 bottom-4' : 'bottom-6 right-6'}`}
          >
            <Card className={`business-card shadow-2xl border-2 border-blue-500 ${
              isMobile ? 
                (isMinimized ? 'h-16 w-72' : 'h-[calc(100vh-8rem)] w-full') : 
                (isMinimized ? 'h-16 w-[300px]' : 'h-[600px] w-[480px]')
            }`}>
              {/* Modern Header */}
              <CardHeader className="business-header p-2 sm:p-4 cursor-pointer bg-gradient-to-r from-blue-800 to-blue-900 border-b-2 border-blue-500" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <div className="relative">
                      <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-white to-blue-100 rounded-xl flex items-center justify-center shadow-lg">
                        <span className="text-blue-800 font-black text-sm sm:text-lg">T</span>
                      </div>
                      <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
                    </div>
                    <div>
                      <CardTitle className="text-sm sm:text-lg font-black text-white flex items-center gap-1 sm:gap-2">
                        T Bot AI
                        <Badge variant="secondary" className="bg-green-500 text-white text-xs font-bold px-1 sm:px-2 hidden sm:inline-flex">
                          PRO
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-1 sm:gap-2 text-xs text-blue-200 font-bold">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-ping"></div>
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full"></div>
                          <span className="hidden sm:inline">Aktif & Hazır</span>
                          <span className="sm:hidden">Online</span>
                        </div>
                        <span className="text-blue-300 hidden sm:inline">|</span>
                        <span className="flex items-center gap-1 hidden sm:flex">
                          <Sparkles className="w-3 h-3" />
                          AI Güçlü
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMinimized(!isMinimized);
                      }}
                      className="text-white hover:bg-blue-700 p-1 sm:p-2 h-auto rounded-lg"
                    >
                      {isMinimized ? <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                      }}
                      className="text-white hover:bg-red-600 p-1 sm:p-2 h-auto rounded-lg"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Advanced Chat Content */}
              {!isMinimized && (
                <CardContent className={`p-0 flex flex-col ${
                  isMobile ? 'h-[calc(100vh-12rem)]' : 'h-[540px]'
                }`}>
                  {/* Modern Tab System */}
                  <Tabs value={currentTab} onValueChange={setCurrentTab} className="h-full">
                    <div className={`border-b business-border ${isMobile ? 'p-3' : 'p-3'}`}>
                      <TabsList className="grid w-full grid-cols-3 bg-blue-900">
                        <TabsTrigger 
                          value="chat" 
                          className={`font-bold text-white data-[state=active]:bg-blue-600 transition-all duration-200 active:scale-95 ${isMobile ? 'text-xs px-2 py-3' : 'text-xs px-3'}`}
                          data-testid="tab-chat"
                        >
                          <MessageCircle className={`mr-1 ${isMobile ? 'w-4 h-4' : 'w-3 h-3'}`} />
                          {isMobile ? 'Sohbet' : <><span className="hidden sm:inline">Sohbet</span><span className="sm:hidden">Chat</span></>}
                        </TabsTrigger>
                        <TabsTrigger 
                          value="navigation" 
                          className={`font-bold text-white data-[state=active]:bg-blue-600 transition-all duration-200 active:scale-95 ${isMobile ? 'text-xs px-2 py-3' : 'text-xs px-3'}`}
                          data-testid="tab-navigation"
                        >
                          <Navigation className={`mr-1 ${isMobile ? 'w-4 h-4' : 'w-3 h-3'}`} />
                          {isMobile ? 'Navigasyon' : <><span className="hidden sm:inline">Sayfa Geçiş</span><span className="sm:hidden">Nav</span></>}
                        </TabsTrigger>
                        <TabsTrigger 
                          value="actions" 
                          className={`font-bold text-white data-[state=active]:bg-blue-600 transition-all duration-200 active:scale-95 ${isMobile ? 'text-xs px-2 py-3' : 'text-xs px-3'}`}
                          data-testid="tab-actions"
                        >
                          <Zap className={`mr-1 ${isMobile ? 'w-4 h-4' : 'w-3 h-3'}`} />
                          {isMobile ? 'İşlemler' : <><span className="hidden sm:inline">Hızlı İşlem</span><span className="sm:hidden">Aksiyon</span></>}
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    {/* Chat Tab */}
                    <TabsContent value="chat" className="flex-1 m-0">
                      <ScrollArea className={`p-3 ${isMobile ? 'h-[calc(100vh-20rem)]' : 'h-[420px]'}`}>
                        <div className="space-y-2 sm:space-y-3">
                          {messages.map((message) => (
                            <motion.div 
                              key={message.id} 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
                            >
                              <div className={`rounded-xl shadow-lg ${
                                isMobile ? 'max-w-[95%] p-3' : 'max-w-[85%] p-4'
                              } ${
                                message.isBot 
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white' 
                                  : 'bg-gradient-to-r from-gray-700 to-gray-800 text-white'
                              }`}>
                                {message.isBot && (
                                  <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                                    <div className="w-4 h-4 sm:w-6 sm:h-6 bg-white rounded-full flex items-center justify-center">
                                      <span className="text-blue-600 text-xs font-bold">T</span>
                                    </div>
                                    <span className="text-xs text-blue-200 font-bold hidden sm:inline">T Bot AI Assistant</span>
                                    <span className="text-xs text-blue-200 font-bold sm:hidden">T Bot</span>
                                    <Badge variant="secondary" className="text-xs bg-green-500 text-white hidden sm:inline-flex">Online</Badge>
                                  </div>
                                )}
                                <p className={`font-bold text-white leading-relaxed ${isMobile ? 'text-sm' : 'text-sm'}`}>{message.text}</p>
                                <p className="text-xs text-white/60 mt-1 sm:mt-2 flex items-center gap-1">
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
                      <ScrollArea className={`p-3 ${isMobile ? 'h-[calc(100vh-20rem)]' : 'h-[420px]'}`}>
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
                                  className={`w-full h-auto text-left bg-blue-900 hover:bg-blue-800 border-blue-600 justify-start business-border active:scale-95 transition-all duration-200 ${isMobile ? 'p-4' : 'p-4'}`}
                                  variant="outline"
                                  data-testid={`button-nav-${page.name.toLowerCase().replace(/\s+/g, '-')}`}
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
                      <ScrollArea className={`p-3 ${isMobile ? 'h-[calc(100vh-20rem)]' : 'h-[420px]'}`}>
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
                                  className={`w-full h-auto text-left justify-start text-white font-bold border-0 hover:opacity-90 active:scale-95 transition-all duration-200 ${cmd.color} ${isMobile ? 'p-4' : 'p-4'}`}
                                  data-testid={`button-quick-${cmd.text.toLowerCase().replace(/\s+/g, '-')}`}
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
                  <div className={`border-t border-blue-600 bg-blue-950 ${isMobile ? 'p-3' : 'p-3'}`}>
                    {currentTab === 'chat' && (
                      <div className={`${isMobile ? 'space-y-3' : 'space-y-2'}`}>
                        <div className={`flex ${isMobile ? 'gap-3' : 'gap-2'}`}>
                          <Input
                            placeholder="T Bot ile sohbet edin... 💬"
                            value={currentMessage}
                            onChange={(e) => setCurrentMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            className={`business-input flex-1 ${isMobile ? 'text-base h-12 rounded-xl' : 'text-sm'}`}
                            inputMode="text"
                            autoComplete="off"
                            autoCapitalize="sentences"
                            data-testid="input-chat-message"
                          />
                          <Button
                            onClick={handleSendMessage}
                            disabled={!currentMessage.trim() || isTyping}
                            className={`business-button active:scale-95 transition-transform duration-200 ${isMobile ? 'px-4 h-12 rounded-xl' : 'px-4'}`}
                            size="sm"
                            data-testid="button-send-message"
                          >
                            <Send className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-white/60">
                          <span className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="hidden sm:inline">T Bot AI Aktif</span>
                            <span className="sm:hidden">Aktif</span>
                          </span>
                          <span className="hidden sm:inline">{messages.length} mesaj</span>
                          <span className="sm:hidden">{messages.length}</span>
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