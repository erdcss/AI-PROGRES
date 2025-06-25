import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Play, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TaskStatus {
  name: string;
  description: string;
  time: string;
  isActive: boolean;
  nextRun: string;
}

interface SchedulerData {
  totalTasks: number;
  activeTasks: number;
  status: TaskStatus[];
}

export default function SchedulerPage() {
  const [schedulerData, setSchedulerData] = useState<SchedulerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);

  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch('/api/scheduler/status');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSchedulerData(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch scheduler status:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeTask = async (taskName: string) => {
    setExecuting(taskName);
    try {
      const response = await fetch(`/api/scheduler/execute/${taskName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Görev Çalıştırıldı",
          description: data.message,
        });
      } else {
        toast({
          title: "Hata",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Görev çalıştırılırken bir hata oluştu",
        variant: "destructive",
      });
    } finally {
      setExecuting(null);
    }
  };

  const getTaskDisplayName = (taskName: string) => {
    const names = {
      'daily-monitoring': 'Günlük İzleme',
      'daily-summary': 'Günlük Özet',
      'health-check': 'Sistem Kontrolü'
    };
    return names[taskName] || taskName;
  };

  const getTaskIcon = (taskName: string) => {
    switch (taskName) {
      case 'daily-monitoring':
        return <CheckCircle className="h-4 w-4" />;
      case 'daily-summary':
        return <Clock className="h-4 w-4" />;
      case 'health-check':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  useEffect(() => {
    fetchSchedulerStatus();
    const interval = setInterval(fetchSchedulerStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Zamanlı görevler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Zamanlı Görevler</h1>
          <p className="text-muted-foreground">
            Otomatik çalışan görevlerin durumunu izleyin ve manuel olarak çalıştırın
          </p>
        </div>
        <Button onClick={fetchSchedulerStatus} variant="outline">
          <Clock className="h-4 w-4 mr-2" />
          Yenile
        </Button>
      </div>

      {schedulerData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Toplam Görev</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{schedulerData.totalTasks}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aktif Görev</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{schedulerData.activeTasks}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sistem Durumu</CardTitle>
                <AlertCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">Çalışıyor</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4">
            <h2 className="text-xl font-semibold">Görev Listesi</h2>
            {schedulerData.status.map((task) => (
              <Card key={task.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getTaskIcon(task.name)}
                      <div>
                        <CardTitle className="text-lg">{getTaskDisplayName(task.name)}</CardTitle>
                        <CardDescription>{task.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={task.isActive ? "default" : "secondary"}>
                        {task.isActive ? "Aktif" : "Devre Dışı"}
                      </Badge>
                      <Button
                        onClick={() => executeTask(task.name)}
                        disabled={executing === task.name}
                        variant="outline"
                        size="sm"
                      >
                        {executing === task.name ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-1 border-current"></div>
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        <span className="ml-1">
                          {executing === task.name ? "Çalıştırılıyor..." : "Manuel Çalıştır"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Çalışma Saati:</span>
                      <span className="ml-2">{task.time}</span>
                    </div>
                    <div>
                      <span className="font-medium">Sonraki Çalışma:</span>
                      <span className="ml-2">{task.nextRun}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Görev Açıklamaları</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium">Günlük İzleme (12:00)</h4>
            <p className="text-sm text-muted-foreground">
              Ürün fiyatları ve stok durumlarını kontrol eder, Shopify'da gerekli güncellemeleri yapar
            </p>
          </div>
          <div>
            <h4 className="font-medium">Günlük Özet (23:00)</h4>
            <p className="text-sm text-muted-foreground">
              Günlük Z raporu hazırlar ve Telegram üzerinden detaylı özet gönderir
            </p>
          </div>
          <div>
            <h4 className="font-medium">Sistem Kontrolü (06:00)</h4>
            <p className="text-sm text-muted-foreground">
              Sistem bileşenlerinin sağlığını kontrol eder ve durum raporu gönderir
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}