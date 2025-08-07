import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageCircle, 
  X, 
  Send, 
  Bot, 
  Sparkles, 
  Minimize2,
  Maximize2,
  HelpCircle,
  Zap
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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Merhaba! Ben T Bot, sizin AI asistanınızım. Size nasıl yardımcı olabilirim?',
      isBot: true,
      timestamp: new Date()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const quickCommands = [
    { text: 'Trendyol ürün nasıl çıkarırım?', icon: '🛍️' },
    { text: 'Shopify CSV nasıl oluştururum?', icon: '📊' },
    { text: 'Fiyat karşılaştırması nasıl yaparım?', icon: '💰' },
    { text: 'Sistem durumunu kontrol et', icon: '⚡' }
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

  const handleQuickCommand = (command: string) => {
    setCurrentMessage(command);
    handleSendMessage();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('tr-TR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <>
      {/* T Bot Float Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={() => setIsOpen(true)}
              className="business-button w-14 h-14 rounded-full shadow-lg hover:shadow-xl"
              size="sm"
            >
              <div className="relative">
                <Bot className="w-6 h-6" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              </div>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* T Bot Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Card className={`business-card w-96 shadow-2xl ${isMinimized ? 'h-16' : 'h-[500px]'}`}>
              {/* Header */}
              <CardHeader className="business-header p-4 cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">T</span>
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-white">T Bot AI Assistant</CardTitle>
                      <div className="flex items-center gap-1 text-xs business-accent">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Online
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMinimized(!isMinimized);
                      }}
                      className="text-white hover:bg-blue-800 p-1 h-auto"
                    >
                      {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                      }}
                      className="text-white hover:bg-red-600 p-1 h-auto"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Chat Content */}
              {!isMinimized && (
                <CardContent className="p-0 flex flex-col h-[420px]">
                  {/* Quick Commands */}
                  <div className="p-3 border-b business-border">
                    <div className="text-xs text-white/70 mb-2 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Hızlı Komutlar:
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {quickCommands.map((cmd, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickCommand(cmd.text)}
                          className="text-xs h-auto p-2 business-border text-white hover:bg-blue-900"
                        >
                          <span className="mr-1">{cmd.icon}</span>
                          <span className="truncate">{cmd.text.split(' ').slice(0, 2).join(' ')}</span>
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <div key={message.id} className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[80%] rounded-lg p-3 ${
                            message.isBot 
                              ? 'bg-blue-900 text-white' 
                              : 'bg-gray-800 text-white'
                          }`}>
                            {message.isBot && (
                              <div className="flex items-center gap-2 mb-1">
                                <Bot className="w-3 h-3 business-accent" />
                                <span className="text-xs business-accent font-bold">T Bot</span>
                              </div>
                            )}
                            <p className="text-sm font-bold text-white">{message.text}</p>
                            <p className="text-xs text-white/50 mt-1">{formatTime(message.timestamp)}</p>
                          </div>
                        </div>
                      ))}
                      
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="bg-blue-900 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <Bot className="w-3 h-3 business-accent" />
                              <span className="text-xs business-accent font-bold">T Bot</span>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  <div className="p-3 border-t business-border">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Sorunuzu yazın..."
                        value={currentMessage}
                        onChange={(e) => setCurrentMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="business-input text-sm"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!currentMessage.trim() || isTyping}
                        className="business-button px-3"
                        size="sm"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}