import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Play, Square, RotateCcw, Eye } from 'lucide-react';

interface TrackingStatus {
  isRunning: boolean;
  intervalMinutes: number;
  lastCheck: string;
}

export default function MemoryTrackingPage() {
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/memory-tracking/status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Status alma hatası:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Her 10 saniyede güncelle
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory-tracking/start', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sistem Başlatıldı",
          description: "Hafıza takip sistemi çalışmaya başladı"
        });
        await fetchStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory-tracking/stop', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sistem Durduruldu",
          description: "Hafıza takip sistemi durduruldu"
        });
        await fetchStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory-tracking/manual-check', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Manuel Kontrol",
          description: "Hafıza kontrolü başlatıldı, sonuçlar Telegram'dan bildirilecek"
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Hafıza Takip Sistemi</h1>
          <p className="text-muted-foreground mt-2">
            Hafızadaki ürünlerin fiyat, stok ve varyant değişikliklerini izler
          </p>
        </div>

        {/* Sistem Durumu */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Sistem Durumu
            </CardTitle>
            <CardDescription>
              Hafıza takip sisteminin anlık durumu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Durum</label>
                <div>
                  {status ? (
                    <Badge variant={status.isRunning ? "default" : "secondary"}>
                      {status.isRunning ? "Çalışıyor" : "Durduruldu"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Bilinmiyor</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kontrol Aralığı</label>
                <div className="text-sm text-muted-foreground">
                  {status ? `${status.intervalMinutes} dakika` : "—"}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Son Kontrol</label>
                <div className="text-sm text-muted-foreground">
                  {status && status.lastCheck 
                    ? new Date(status.lastCheck).toLocaleString('tr-TR')
                    : "—"
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kontroller */}
        <Card>
          <CardHeader>
            <CardTitle>Sistem Kontrolleri</CardTitle>
            <CardDescription>
              Hafıza takip sistemini başlatın, durdurun veya manuel kontrol yapın
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={handleStart}
                disabled={loading || status?.isRunning}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                Sistemi Başlat
              </Button>

              <Button 
                onClick={handleStop}
                disabled={loading || !status?.isRunning}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                Sistemi Durdur
              </Button>

              <Button 
                onClick={handleManualCheck}
                disabled={loading}
                variant="secondary"
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Manuel Kontrol
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Açıklamalar */}
        <Card>
          <CardHeader>
            <CardTitle>Nasıl Çalışır?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">🔄 Otomatik Takip</h4>
                <p className="text-sm text-muted-foreground">
                  Sistem her 30 dakikada bir hafızadaki tüm ürünleri kontrol eder ve değişiklikleri tespit eder.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">📊 İzlenen Değişiklikler</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Fiyat artış/azalışları (%10+ değişimler öncelikli)</li>
                  <li>• Stok durumu değişiklikleri (stoğa girdi/çıktı)</li>
                  <li>• Yeni varyant eklemeleri</li>
                  <li>• Ürünün satıştan kalkması</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">📱 Telegram Bildirimleri</h4>
                <p className="text-sm text-muted-foreground">
                  Önemli değişiklikler anında, düşük öncelikli değişiklikler toplu olarak Telegram'dan bildirilir.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}