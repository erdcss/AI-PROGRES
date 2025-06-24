import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Bot, MessageCircle, CheckCircle, XCircle, Send } from 'lucide-react';

interface TelegramStatus {
  connected: boolean;
  chatId: string | null;
  botConfigured: boolean;
  connectionTest: boolean;
}

export function TelegramPage() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/telegram/status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
      } else {
        toast({
          title: "Hata",
          description: "Telegram durumu alınamadı",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Telegram status error:', error);
      toast({
        title: "Bağlantı Hatası",
        description: "Telegram durumu kontrol edilemedi",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const sendTestMessage = async () => {
    setTestLoading(true);
    try {
      const response = await fetch('/api/telegram/test', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Test Başarılı!",
          description: "Telegram'a test mesajı gönderildi"
        });
      } else {
        toast({
          title: "Test Başarısız",
          description: data.error || "Test mesajı gönderilemedi",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Test mesajı gönderilemedi",
        variant: "destructive"
      });
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Bot className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Telegram Integration</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Telegram durumu kontrol ediliyor...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Bot className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Telegram Integration</h1>
      </div>

      <div className="grid gap-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Bot Durumu
            </CardTitle>
            <CardDescription>
              Telegram bot bağlantı durumu ve yapılandırması
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span className="text-sm font-medium">Bot Yapılandırması</span>
                <Badge variant={status?.botConfigured ? "default" : "destructive"}>
                  {status?.botConfigured ? (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <XCircle className="h-3 w-3 mr-1" />
                  )}
                  {status?.botConfigured ? 'Aktif' : 'Pasif'}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span className="text-sm font-medium">Bağlantı Testi</span>
                <Badge variant={status?.connectionTest ? "default" : "destructive"}>
                  {status?.connectionTest ? (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <XCircle className="h-3 w-3 mr-1" />
                  )}
                  {status?.connectionTest ? 'Başarılı' : 'Başarısız'}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span className="text-sm font-medium">Chat Bağlantısı</span>
                <Badge variant={status?.chatId ? "default" : "secondary"}>
                  {status?.chatId ? (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <XCircle className="h-3 w-3 mr-1" />
                  )}
                  {status?.chatId ? 'Bağlı' : 'Bekliyor'}
                </Badge>
              </div>
            </div>

            {status?.chatId && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>Chat ID:</strong> {status.chatId}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Bot bu chat'e bildirim gönderecek
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Setup Instructions */}
        {!status?.chatId && (
          <Card>
            <CardHeader>
              <CardTitle>Kurulum Talimatları</CardTitle>
              <CardDescription>
                Telegram bot'unuzla iletişim kurmak için aşağıdaki adımları takip edin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">1</span>
                  <div>
                    <p className="font-medium">Telegram'da bot'unuzu bulun</p>
                    <p className="text-sm text-gray-600">Bot'unuzun kullanıcı adını kullanarak Telegram'da arayın</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">2</span>
                  <div>
                    <p className="font-medium">/start komutunu gönderin</p>
                    <p className="text-sm text-gray-600">Bot ile konuşmaya başlamak için /start yazın</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">3</span>
                  <div>
                    <p className="font-medium">Bildirimleri bekleyin</p>
                    <p className="text-sm text-gray-600">Stok ve fiyat değişiklikleri otomatik olarak size bildirilecek</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Section */}
        {status?.botConfigured && (
          <Card>
            <CardHeader>
              <CardTitle>Test Mesajı</CardTitle>
              <CardDescription>
                Telegram entegrasyonunun çalışıp çalışmadığını test edin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={sendTestMessage}
                disabled={testLoading || !status?.chatId}
                className="w-full md:w-auto"
              >
                <Send className="h-4 w-4 mr-2" />
                {testLoading ? 'Test Mesajı Gönderiliyor...' : 'Test Mesajı Gönder'}
              </Button>
              {!status?.chatId && (
                <p className="text-sm text-gray-500 mt-2">
                  Önce bot ile /start komutunu kullanarak bağlantı kurmalısınız
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle>Otomatik Bildirimler</CardTitle>
            <CardDescription>
              Sistem bu durumlarla otomatik olarak bildirim gönderecek
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <div>
                  <p className="font-medium text-sm">Stok Tükendi</p>
                  <p className="text-xs text-gray-600">Bir ürün varyantı stoktan çıktığında</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="font-medium text-sm">Stok Geldi</p>
                  <p className="text-xs text-gray-600">Stokta olmayan ürün tekrar stoğa girdiğinde</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div>
                  <p className="font-medium text-sm">Fiyat Değişikliği</p>
                  <p className="text-xs text-gray-600">Ürün fiyatları değiştiğinde</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <div>
                  <p className="font-medium text-sm">Shopify Senkronizasyonu</p>
                  <p className="text-xs text-gray-600">Shopify güncellemeleri tamamlandığında</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}