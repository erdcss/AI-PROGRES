import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Mail, Clock, Send, CheckCircle } from 'lucide-react';

export default function EmailSettings() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const { toast } = useToast();

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
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="w-8 h-8" />
          E-posta Ayarları
        </h1>
        <p className="text-muted-foreground mt-2">
          Günlük z raporu bildirimlerini almak için e-posta adresinizi ayarlayın
        </p>
      </div>

      <div className="grid gap-6">
        {/* Email Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              E-posta Adresi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Rapor alacak e-posta adresi</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSetEmail} 
                  disabled={isLoading}
                  className="min-w-24"
                >
                  {isLoading ? "Kaydediliyor..." : "Kaydet"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedule Info */}
        <Card>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Test Raporu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              E-posta sisteminin çalışıp çalışmadığını test etmek için örnek rapor gönderin
            </p>
            <Button 
              onClick={handleTestReport}
              disabled={testLoading}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {testLoading ? "Gönderiliyor..." : "Test Raporu Gönder"}
            </Button>
          </CardContent>
        </Card>

        {/* Gmail Setup Info */}
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="text-orange-800">Gmail Kurulum Durumu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Gmail hesabı yapılandırıldı</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-orange-500" />
                <span>Uygulama şifresi gerekli</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-orange-500" />
                <span>SMTP bağlantısı test ediliyor</span>
              </div>
            </div>
            <div className="bg-orange-100 border border-orange-300 rounded p-3 mt-3">
              <p className="text-xs text-orange-800 font-medium">Gmail Kurulum Adımları:</p>
              <ol className="text-xs text-orange-700 mt-1 space-y-1">
                <li>1. Gmail hesabında 2-adımlı doğrulama açın</li>
                <li>2. Google hesap ayarlarından "Uygulama şifreleri" gidin</li>
                <li>3. "Mail" için 16 haneli şifre oluşturun</li>
                <li>4. Bu şifreyi sistem ayarlarına girin</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}