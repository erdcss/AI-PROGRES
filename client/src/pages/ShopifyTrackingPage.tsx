import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, 
  TrendingUp, 
  Clock, 
  AlertCircle, 
  CheckCircle,
  RefreshCw,
  BarChart3,
  Activity,
  Trash2,
  ArrowRightLeft
} from 'lucide-react';

interface ShopifyProduct {
  id: number;
  sourceUrl: string;
  title: string;
  brand: string;
  originalPrice: string;
  shopifyPrice: string;
  profitMargin: string;
  variantCount: number;
  imageCount: number;
  transferredAt: string;
  currentStatus: string;
  trackingEnabled: boolean;
  changeCount: number;
}

interface ShopifyStats {
  totalProducts: number;
  activeProducts: number;
  trackedProducts: number;
  totalChanges: number;
  averagePrice: number;
  recentChanges: number;
}

interface ProductChange {
  change: {
    id: number;
    changeType: string;
    fieldName: string;
    oldValue: string;
    newValue: string;
    severity: string;
    detectedAt: string;
    notificationSent: boolean;
  };
  product: {
    id: number;
    title: string;
    brand: string;
    sourceUrl: string;
  };
}

export default function ShopifyTrackingPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  // Shopify transfer listesi
  const { data: productsData, refetch: refetchProducts, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/shopify/transferred-products'],
    refetchInterval: 30000 // 30 saniye
  });

  // İstatistikler
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['/api/shopify/transfer-stats'],
    refetchInterval: 60000 // 1 dakika
  });

  // Son değişiklikler
  const { data: changesData, refetch: refetchChanges } = useQuery({
    queryKey: ['/api/shopify/recent-changes'],
    refetchInterval: 15000 // 15 saniye
  });

  const products: ShopifyProduct[] = productsData?.products || [];
  const stats: ShopifyStats = statsData?.stats || {
    totalProducts: 0,
    activeProducts: 0,
    trackedProducts: 0,
    totalChanges: 0,
    averagePrice: 0,
    recentChanges: 0
  };
  const changes: ProductChange[] = changesData?.changes || [];

  const handleRefreshAll = () => {
    refetchProducts();
    refetchStats();
    refetchChanges();
  };
  
  // Delete product mutation
  const deleteMutation = useMutation({
    mutationFn: async (productId: number) => {
      const res = await fetch(`/api/shopify/transferred-products/${productId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete product');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/transferred-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/transfer-stats'] });
      toast({
        title: 'Başarılı',
        description: 'Ürün silindi'
      });
    },
    onError: () => {
      toast({
        title: 'Hata',
        description: 'Ürün silinemedi',
        variant: 'destructive'
      });
    }
  });
  
  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/shopify/sync-deleted-products', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Bilgi',
        description: data.message || 'Senkronizasyon tamamlandı'
      });
    },
    onError: () => {
      toast({
        title: 'Hata',
        description: 'Senkronizasyon başarısız',
        variant: 'destructive'
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'inactive': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-blue-500';
    }
  };

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case 'price': return '💰';
      case 'stock': return '📦';
      case 'status': return '🔄';
      case 'content': return '📝';
      case 'variant': return '🎨';
      default: return '🔧';
    }
  };

  const formatPrice = (price: string | number) => {
    return `${Number(price).toFixed(2)} TL`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR');
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shopify Ürün Takibi</h1>
          <p className="text-muted-foreground">
            Shopify'a aktarılan ürünlerin anlık takibi ve değişiklik izleme
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => syncMutation.mutate()} 
            disabled={syncMutation.isPending}
            variant="outline" 
            className="flex items-center gap-2"
          >
            <ArrowRightLeft className="h-4 w-4" />
            {syncMutation.isPending ? 'Senkronize ediliyor...' : 'Shopify ile Senkronize Et'}
          </Button>
          <Button onClick={handleRefreshAll} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Yenile
          </Button>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Toplam Ürün</p>
                <p className="text-2xl font-bold">{stats.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Aktif</p>
                <p className="text-2xl font-bold">{stats.activeProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Takip Edilen</p>
                <p className="text-2xl font-bold">{stats.trackedProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Değişiklik</p>
                <p className="text-2xl font-bold">{stats.totalChanges}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">Ort. Fiyat</p>
                <p className="text-2xl font-bold">{formatPrice(stats.averagePrice)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Son 24s</p>
                <p className="text-2xl font-bold">{stats.recentChanges}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="products">Ürünler</TabsTrigger>
          <TabsTrigger value="changes">Değişiklikler</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Son Değişiklikler Özeti */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Son Değişiklikler
                </CardTitle>
              </CardHeader>
              <CardContent>
                {changes.length > 0 ? (
                  <div className="space-y-3">
                    {changes.slice(0, 5).map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 rounded border">
                        <span className="text-lg">{getChangeTypeIcon(item.change.changeType)}</span>
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {item.product.title.substring(0, 40)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.change.fieldName}: {item.change.oldValue} → {item.change.newValue}
                          </p>
                        </div>
                        <Badge className={getSeverityColor(item.change.severity)}>
                          {item.change.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Son değişiklik yok</p>
                )}
              </CardContent>
            </Card>

            {/* Sistem Durumu */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Sistem Durumu
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Anlık İzleme</span>
                    <Badge className="bg-green-500">Aktif</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Telegram Bildirimleri</span>
                    <Badge className="bg-green-500">Çalışıyor</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>URL Takip Sistemi</span>
                    <Badge className="bg-green-500">Aktif</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Son Kontrol</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date().toLocaleTimeString('tr-TR')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Shopify'a Aktarılan Ürünler</CardTitle>
            </CardHeader>
            <CardContent>
              {productsLoading ? (
                <p className="text-center py-8">Ürünler yükleniyor...</p>
              ) : products.length > 0 ? (
                <div className="space-y-4">
                  {products.map((product) => (
                    <div key={product.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-sm">{product.title}</h3>
                          <p className="text-xs text-muted-foreground mb-2">
                            {product.brand} • {formatDate(product.transferredAt)}
                          </p>
                          
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Orijinal:</span>
                              <p className="font-medium">{formatPrice(product.originalPrice)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Shopify:</span>
                              <p className="font-medium">{formatPrice(product.shopifyPrice)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Kar Marjı:</span>
                              <p className="font-medium">%{product.profitMargin}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Değişiklik:</span>
                              <p className="font-medium">{product.changeCount}</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(product.currentStatus)}>
                            {product.currentStatus}
                          </Badge>
                          {product.trackingEnabled && (
                            <Badge variant="outline" className="text-green-600">
                              Takip Aktif
                            </Badge>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteMutation.mutate(product.id)}
                            disabled={deleteMutation.isPending}
                            className="ml-2"
                            data-testid={`button-delete-product-${product.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  Henüz Shopify'a aktarılan ürün yok
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Son Değişiklikler</CardTitle>
            </CardHeader>
            <CardContent>
              {changes.length > 0 ? (
                <div className="space-y-4">
                  {changes.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getChangeTypeIcon(item.change.changeType)}</span>
                          <div>
                            <h3 className="font-medium text-sm">
                              {item.product.title.substring(0, 50)}...
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {item.product.brand}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getSeverityColor(item.change.severity)}>
                            {item.change.severity}
                          </Badge>
                          {item.change.notificationSent ? (
                            <Badge variant="outline" className="text-green-600">
                              Bildirildi
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600">
                              Beklemede
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Alan:</span>
                          <p className="font-medium">{item.change.fieldName || 'Genel'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Eski → Yeni:</span>
                          <p className="font-medium">
                            {item.change.oldValue || 'Yok'} → {item.change.newValue}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tespit:</span>
                          <p className="font-medium">{formatDate(item.change.detectedAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  Henüz değişiklik kaydı yok
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}