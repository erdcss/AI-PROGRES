import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Mail, Clock, Send, CheckCircle } from 'lucide-react';
import PageLayout from "@/components/PageLayout";
import { useIsMobile } from '@/hooks/use-mobile';

export default function EmailSettings() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleSetEmail = async () => {
    if (!email || !email.includes('@')) {
      toast({
        title: "Hata",
        description: "Geçerli bir e-posta adresi girin",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/email/set-recipient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Başarılı",
          description: data.message,
        });
      } else {
        toast({
          title: "Hata",
          description: data.message || "E-posta ayarlanamadı",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Bağlantı hatası",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestReport = async () => {
    setTestLoading(true);
    try {
      const response = await fetch('/api/email/test-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Test Başarılı",
          description: "Test raporu gönderildi. E-postanızı kontrol edin.",
        });
      } else {
        toast({
          title: "Test Hatası",
          description: data.message || "Test raporu gönderilemedi",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Test raporu gönderilirken hata oluştu",
        variant: "destructive"
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <PageLayout
      title="E-posta Ayarları"
      subtitle="Günlük raporu bildirimlerini almak için e-posta adresinizi ayarlayın"
      backTo="/"
      backLabel="Ana Sayfa"
    >
        <div className={`w-full ${isMobile ? 'px-4' : 'max-w-4xl mx-auto'}`}>
          <div className={`grid ${isMobile ? 'gap-8' : 'gap-6'}`}>
          {/* Email Configuration */}
          <Card className="glassmorphism-card border-0 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              E-posta Adresi
            </CardTitle>
          </CardHeader>
          <CardContent className={`${isMobile ? 'space-y-6' : 'space-y-4'}`}>
            <div className={`${isMobile ? 'space-y-4' : 'space-y-2'}`}>
              <Label htmlFor="email" className={`${isMobile ? 'text-base font-semibold' : ''}`}>
                Rapor alacak e-posta adresi
              </Label>
              <div className={`flex ${isMobile ? 'flex-col gap-4' : 'gap-2'}`}>
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${isMobile ? 'w-full' : 'flex-1'}`}
                  data-testid="input-email-address"
                />
                <Button 
                  onClick={handleSetEmail} 
                  disabled={isLoading}
                  className={`transition-all duration-200 active:scale-95 ${
                    isMobile 
                      ? 'w-full h-12 text-base font-semibold' 
                      : 'min-w-24'
                  }`}
                  data-testid="button-save-email"
                >
                  {isLoading ? "Kaydediliyor..." : "Kaydet"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedule Info */}
        <Card className="glassmorphism-card border-0 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Rapor Zamanlaması
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary" className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Aktif
              </Badge>
              <span className="text-sm text-muted-foreground">
                Her gün 23:30'da otomatik gönderilir
              </span>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Rapor İçeriği:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Günlük toplam ürün sayısı</li>
                <li>• Toplam ciro ve kar miktarı</li>
                <li>• En çok satan ürünler listesi</li>
                <li>• Stok uyarıları (düşük stok)</li>
                <li>• Detaylı HTML formatında rapor</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Test Email */}
        <Card className="glassmorphism-card border-0 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Test Raporu
            </CardTitle>
          </CardHeader>
          <CardContent className={`${isMobile ? 'space-y-6' : ''}`}>
            <p className={`text-muted-foreground mb-4 ${isMobile ? 'text-base' : 'text-sm'}`}>
              E-posta sisteminin çalışıp çalışmadığını test etmek için örnek rapor gönderin
            </p>
            <Button 
              onClick={handleTestReport}
              disabled={testLoading}
              variant="outline"
              className={`transition-all duration-200 active:scale-95 ${
                isMobile 
                  ? 'w-full h-12 text-base font-semibold' 
                  : 'w-full sm:w-auto'
              }`}
              data-testid="button-send-test-report"
            >
              {testLoading ? "Gönderiliyor..." : "Test Raporu Gönder"}
            </Button>
          </CardContent>
        </Card>

        {/* SendGrid Setup Info */}
        <Card className="glassmorphism-card border-0 shadow-2xl bg-blue-500/10">
          <CardHeader>
            <CardTitle className="text-blue-800">SendGrid Email Sistemi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                <span>SendGrid entegrasyonu hazır</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                <span>Günlük 100 email limiti</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                <span>Gmail alternatif sistemi</span>
              </div>
            </div>
            <div className="bg-blue-100 border border-blue-300 rounded p-3 mt-3">
              <p className="text-xs text-blue-800 font-medium">🚀 SendGrid Avantajları:</p>
              <ul className="text-xs text-blue-700 mt-1 space-y-1">
                <li>• Daha güvenilir email teslimatı</li>
                <li>• Uygulama şifresi gerektirmez</li>
                <li>• Profesyonel email altyapısı</li>
                <li>• Gmail alternatif desteği</li>
              </ul>
            </div>
          </CardContent>
        </Card>
          </div>
        </div>
    </PageLayout>
  );
}