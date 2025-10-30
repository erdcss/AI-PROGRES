import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Bell, 
  BellOff, 
  Send, 
  Trash2, 
  Search, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  Clock,
  Filter,
  Database,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';

interface NotificationSetting {
  id: number;
  notificationType: string;
  enabled: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface NotificationHistoryItem {
  id: number;
  notificationType: string;
  message: string;
  productTitle: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  metadata: any;
}

const notificationTypeLabels: Record<string, string> = {
  new_product: 'Yeni Ürün',
  variant_change: 'Varyant Değişikliği',
  price_change: 'Fiyat Değişikliği',
  stock_update: 'Stok Güncelleme',
  shopify_upload: 'Shopify Yükleme',
  test: 'Test Bildirimi'
};

const notificationTypeColors: Record<string, string> = {
  new_product: 'bg-green-500',
  variant_change: 'bg-blue-500',
  price_change: 'bg-orange-500',
  stock_update: 'bg-purple-500',
  shopify_upload: 'bg-pink-500',
  test: 'bg-gray-500'
};

const statusColors: Record<string, string> = {
  sent: 'text-green-500',
  failed: 'text-red-500',
  blocked: 'text-yellow-500',
  pending: 'text-blue-500'
};

export function TelegramNotificationPanel() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Bildirim ayarlarını getir
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['/api/telegram/settings'],
  });

  // Bildirim geçmişini getir
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/telegram/history', { type: filterType, search: searchTerm }],
  });

  // Ayar güncelleme mutation'ı
  const updateSettingMutation = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) => {
      const response = await apiRequest('PUT', `/api/telegram/settings/${type}`, { enabled });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/settings'] });
      toast({
        title: 'Başarılı',
        description: 'Bildirim ayarı güncellendi',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Hata',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Tümünü aç/kapat mutation'ı
  const toggleAllMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('POST', '/api/telegram/settings/toggle-all', { enabled });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/settings'] });
      toast({
        title: 'Başarılı',
        description: 'Tüm bildirim ayarları güncellendi',
      });
    }
  });

  // Test bildirimi gönderme mutation'ı
  const testNotificationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/telegram/test', undefined);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/history'] });
      toast({
        title: 'Başarılı',
        description: 'Test bildirimi gönderildi',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Hata',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Geçmişi temizleme mutation'ı
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/telegram/history', undefined);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/history'] });
      toast({
        title: 'Başarılı',
        description: 'Bildirim geçmişi temizlendi',
      });
    }
  });

  // Hafıza temizleme mutation'ı
  const clearMemoryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/clear-memory', { confirm: true });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Başarılı',
        description: 'Tüm ürün hafızası temizlendi',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Hata',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const settings = settingsData?.settings || [];
  const history = historyData?.history || [];

  const allEnabled = settings.every((s: NotificationSetting) => s.enabled);
  const allDisabled = settings.every((s: NotificationSetting) => !s.enabled);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Sol Panel - Bildirim Ayarları */}
      <Card data-testid="card-telegram-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Telegram Bildirim Ayarları
          </CardTitle>
          <CardDescription>
            Hangi bildirim türlerini almak istediğinizi seçin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toplu İşlem Butonları */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllMutation.mutate(true)}
              disabled={allEnabled || toggleAllMutation.isPending}
              className="w-full"
              data-testid="button-enable-all"
            >
              <Bell className="w-4 h-4 mr-2" />
              Tümünü Aç
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAllMutation.mutate(false)}
              disabled={allDisabled || toggleAllMutation.isPending}
              className="w-full"
              data-testid="button-disable-all"
            >
              <BellOff className="w-4 h-4 mr-2" />
              Tümünü Kapat
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => testNotificationMutation.mutate()}
              disabled={testNotificationMutation.isPending}
              className="w-full"
              data-testid="button-test-notification"
            >
              <Send className="w-4 h-4 mr-2" />
              Test Gönder
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('Tüm ürün hafızası temizlenecek. Emin misiniz?')) {
                  clearMemoryMutation.mutate();
                }
              }}
              disabled={clearMemoryMutation.isPending}
              className="w-full"
              data-testid="button-clear-memory"
            >
              <Database className="w-4 h-4 mr-2" />
              Hafızayı Temizle
            </Button>
          </div>

          <Separator />

          {/* Bildirim Ayarları Listesi */}
          {settingsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Yükleniyor...
            </div>
          ) : (
            <div className="space-y-3">
              {settings.map((setting: NotificationSetting) => (
                <div
                  key={setting.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  data-testid={`setting-${setting.notificationType}`}
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      {notificationTypeLabels[setting.notificationType] || setting.notificationType}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {setting.description}
                    </div>
                  </div>
                  <Switch
                    checked={setting.enabled}
                    onCheckedChange={(checked) => 
                      updateSettingMutation.mutate({
                        type: setting.notificationType,
                        enabled: checked
                      })
                    }
                    disabled={updateSettingMutation.isPending}
                    data-testid={`switch-${setting.notificationType}`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sağ Panel - Bildirim Geçmişi */}
      <Card data-testid="card-telegram-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Bildirim Geçmişi
          </CardTitle>
          <CardDescription>
            Gönderilen bildirimlerin geçmişi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtreleme ve Arama */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-history"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 rounded-md border bg-background"
              data-testid="select-filter-type"
            >
              <option value="all">Tümü</option>
              <option value="new_product">Yeni Ürün</option>
              <option value="variant_change">Varyant</option>
              <option value="price_change">Fiyat</option>
              <option value="stock_update">Stok</option>
              <option value="shopify_upload">Shopify</option>
              <option value="test">Test</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => clearHistoryMutation.mutate()}
              disabled={clearHistoryMutation.isPending}
              data-testid="button-clear-history"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <Separator />

          {/* Geçmiş Listesi */}
          <ScrollArea className="h-[500px]">
            {historyLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Yükleniyor...
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Henüz bildirim yok
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item: NotificationHistoryItem) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border bg-card space-y-2"
                    data-testid={`history-item-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        className={`${notificationTypeColors[item.notificationType]} text-white`}
                        data-testid={`badge-type-${item.notificationType}`}
                      >
                        {notificationTypeLabels[item.notificationType] || item.notificationType}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {item.status === 'sent' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" data-testid="icon-sent" />
                        ) : item.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-red-500" data-testid="icon-failed" />
                        ) : item.status === 'blocked' ? (
                          <AlertCircle className="w-4 h-4 text-yellow-500" data-testid="icon-blocked" />
                        ) : (
                          <Clock className="w-4 h-4 text-blue-500" data-testid="icon-pending" />
                        )}
                        <Badge variant={
                          item.status === 'sent' ? 'default' : 
                          item.status === 'pending' ? 'secondary' :
                          'destructive'
                        }>
                          {item.status === 'sent' ? 'Gönderildi' : 
                           item.status === 'failed' ? 'Başarısız' : 
                           item.status === 'blocked' ? 'Engellendi' :
                           'Hazırlanıyor'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(item.sentAt), 'dd.MM.yyyy HH:mm')}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm">{item.message}</div>
                    {item.productTitle && (
                      <div className="text-xs text-muted-foreground">
                        Ürün: {item.productTitle}
                      </div>
                    )}
                    {item.errorMessage && (
                      <div className="text-xs text-red-500">
                        Hata: {item.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
