import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Send, 
  Clock, 
  AlertCircle,
  CheckCircle,
  RefreshCw,
  MessageCircle,
  XCircle,
  Activity
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TelegramNotification {
  id: number;
  message: string;
  type: string;
  productId: number;
  variantId: number;
  productTitle: string;
  userId: number;
  status: string;
  sentAt: string;
  failedAt: string;
  errorMessage: string;
  retryCount: number;
  lastRetryAt: string;
  createdAt: string;
}

interface TelegramStats {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  successRate: number;
}

export default function TelegramManagementPage() {
  const [activeTab, setActiveTab] = useState<'live' | 'pending' | 'failed'>('live');
  const { toast } = useToast();

  const { data: liveData, isLoading: liveLoading, refetch: refetchLive } = useQuery({
    queryKey: ['/api/telegram/live'],
    refetchInterval: 10000,
    enabled: activeTab === 'live'
  });

  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['/api/telegram/pending'],
    refetchInterval: 5000,
    enabled: activeTab === 'pending'
  });

  const { data: failedData, isLoading: failedLoading, refetch: refetchFailed } = useQuery({
    queryKey: ['/api/telegram/failed'],
    refetchInterval: 15000,
    enabled: activeTab === 'failed'
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['/api/telegram/stats'],
    refetchInterval: 30000
  });

  const liveNotifications: TelegramNotification[] = (liveData as any)?.notifications || [];
  const pendingNotifications: TelegramNotification[] = (pendingData as any)?.notifications || [];
  const failedNotifications: TelegramNotification[] = (failedData as any)?.notifications || [];
  const stats: TelegramStats = (statsData as any)?.stats || {
    total: 0,
    sent: 0,
    pending: 0,
    failed: 0,
    successRate: 0
  };

  const resendMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      return await apiRequest('POST', `/api/telegram/manual-send/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/failed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/live'] });
      queryClient.invalidateQueries({ queryKey: ['/api/telegram/stats'] });
      toast({
        title: 'Başarılı',
        description: 'Bildirim yeniden gönderildi'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Hata',
        description: error.message || 'Bildirim gönderilemedi',
        variant: 'destructive'
      });
    }
  });

  const handleRefreshAll = () => {
    refetchLive();
    refetchPending();
    refetchFailed();
    refetchStats();
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'price_increase':
      case 'price_decrease':
        return 'bg-blue-500';
      case 'variant_added':
        return 'bg-green-500';
      case 'variant_removed':
        return 'bg-red-500';
      case 'variant_oos':
        return 'bg-orange-500';
      case 'variant_back_in_stock':
        return 'bg-emerald-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      price_increase: 'Fiyat Artışı',
      price_decrease: 'Fiyat Düşüşü',
      variant_added: 'Yeni Varyant',
      variant_removed: 'Varyant Kaldırıldı',
      variant_oos: 'Stok Tükendi',
      variant_back_in_stock: 'Stok Geldi',
      stock_change: 'Stok Değişimi'
    };
    return labels[type] || type;
  };

  const renderNotificationsTable = (notifications: TelegramNotification[], showResend: boolean, isLoading: boolean) => {
    if (isLoading) {
      return <div className="text-center py-8">Yükleniyor...</div>;
    }

    if (notifications.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          Henüz bildirim yok
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ürün</TableHead>
            <TableHead>Tip</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead>Tarih</TableHead>
            {showResend && <TableHead className="text-right">İşlemler</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {notifications.map((notification) => (
            <TableRow key={notification.id} data-testid={`row-notification-${notification.id}`}>
              <TableCell>
                <div>
                  <div className="font-medium text-sm max-w-xs truncate">{notification.productTitle}</div>
                  <div className="text-xs text-muted-foreground">ID: {notification.productId}</div>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={getTypeColor(notification.type)}>
                  {getTypeLabel(notification.type)}
                </Badge>
              </TableCell>
              <TableCell>
                {notification.status === 'sent' && (
                  <Badge className="bg-green-500">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Gönderildi
                  </Badge>
                )}
                {notification.status === 'pending' && (
                  <Badge variant="secondary">
                    <Clock className="w-3 h-3 mr-1" />
                    Bekliyor
                  </Badge>
                )}
                {notification.status === 'failed' && (
                  <Badge variant="destructive">
                    <XCircle className="w-3 h-3 mr-1" />
                    Başarısız {notification.retryCount > 0 && `(${notification.retryCount})`}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {notification.sentAt && formatDate(notification.sentAt)}
                  {notification.failedAt && formatDate(notification.failedAt)}
                  {!notification.sentAt && !notification.failedAt && formatDate(notification.createdAt)}
                </div>
                {notification.errorMessage && (
                  <div className="text-xs text-red-500 mt-1 max-w-xs truncate">
                    {notification.errorMessage}
                  </div>
                )}
              </TableCell>
              {showResend && (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => resendMutation.mutate(notification.id)}
                    disabled={resendMutation.isPending}
                    data-testid={`button-resend-${notification.id}`}
                  >
                    <Send className="w-4 h-4 mr-1" />
                    Yeniden Gönder
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-telegram-management">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Telegram Bildirim Yönetimi</h1>
            <p className="text-muted-foreground mt-1">Tüm Telegram bildirimlerini yönetin</p>
          </div>
          <Button 
            onClick={handleRefreshAll} 
            variant="outline"
            data-testid="button-refresh-all"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Yenile
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Toplam</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-notifications">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Tüm bildirimler</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gönderildi</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-sent-notifications">{stats.sent}</div>
              <p className="text-xs text-muted-foreground">Başarılı</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bekliyor</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-pending-notifications">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Kuyrukt a</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Başarısız</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-failed-notifications">{stats.failed}</div>
              <p className="text-xs text-muted-foreground">Hata</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Başarı Oranı</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-success-rate">{stats.successRate}%</div>
              <p className="text-xs text-muted-foreground">Başarılı / Toplam</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bildirim Geçmişi</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="live" data-testid="tab-live">
                  Canlı Feed ({stats.sent})
                </TabsTrigger>
                <TabsTrigger value="pending" data-testid="tab-pending">
                  Bekleyen ({stats.pending})
                </TabsTrigger>
                <TabsTrigger value="failed" data-testid="tab-failed">
                  Başarısız ({stats.failed})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="live" className="mt-4">
                {renderNotificationsTable(liveNotifications, false, liveLoading)}
              </TabsContent>

              <TabsContent value="pending" className="mt-4">
                {renderNotificationsTable(pendingNotifications, true, pendingLoading)}
              </TabsContent>

              <TabsContent value="failed" className="mt-4">
                {renderNotificationsTable(failedNotifications, true, failedLoading)}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
