import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  Clock,
  Play,
  Pause,
  Plus,
  Trash2,
  Sync,
  ShoppingCart,
  Bell,
  Zap,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function MemoryDashboard() {
  const [newProductUrl, setNewProductUrl] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const queryClient = useQueryClient();

  // Hafıza istatistikleri
  const { data: memoryStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/memory/stats'],
    refetchInterval: 5000 // 5 saniyede bir güncelle
  });

  // Tüm ürünler
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['/api/memory/products'],
    refetchInterval: 10000 // 10 saniyede bir güncelle
  });

  // Shopify bağlantı testi
  const { data: shopifyTest } = useQuery({
    queryKey: ['/api/shopify/test'],
    refetchInterval: 30000 // 30 saniyede bir test et
  });

  // Tracking status (real-time monitoring overview)
  const { data: trackingStatus, isLoading: trackingLoading } = useQuery({
    queryKey: ['/api/monitoring/status'],
    refetchInterval: 3000 // Her 3 saniyede güncelle
  });

  // Telegram status
  const { data: telegramStatus } = useQuery({
    queryKey: ['/api/telegram/status'],
    refetchInterval: 30000
  });

  // Pending changes count
  const { data: pendingChanges } = useQuery({
    queryKey: ['/api/pending-changes/count'],
    refetchInterval: 5000
  });

  // Bulk add all to tracking
  const bulkAddTracking = useMutation({
    mutationFn: () => apiRequest('POST', '/api/tracking/bulk-add-shopify', { scope: 'all' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/monitoring/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/memory/stats'] });
    }
  });

  // Monitoring başlat/durdur
  const startMonitoring = useMutation({
    mutationFn: () => apiRequest('POST', '/api/monitoring/start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/stats'] });
    }
  });

  const stopMonitoring = useMutation({
    mutationFn: () => apiRequest('POST', '/api/monitoring/stop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/stats'] });
    }
  });

  // Ürün izlemeye ekle
  const addToMonitoring = useMutation({
    mutationFn: (url: string) => apiRequest('POST', '/api/monitoring/add', { url }),
    onSuccess: () => {
      setNewProductUrl('');
      queryClient.invalidateQueries({ queryKey: ['/api/memory/products'] });
    }
  });

  // Shopify senkronizasyon
  const syncToShopify = useMutation({
    mutationFn: (productId: number) => apiRequest('POST', `/api/shopify/sync/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/products'] });
    }
  });

  // Tüm ürünleri senkronize et
  const syncAllToShopify = useMutation({
    mutationFn: () => apiRequest('POST', '/api/shopify/sync-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/products'] });
    }
  });

  const handleAddProduct = () => {
    if (newProductUrl.trim()) {
      addToMonitoring.mutate(newProductUrl.trim());
    }
  };

  const products = productsData?.products || [];
  const stats = memoryStats?.memory || {};
  const monitoring = memoryStats?.monitoring || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h1 className="text-4xl font-bold text-white flex items-center justify-center gap-3">
            <Database className="h-8 w-8 text-blue-400" />
            İleri Düzey Hafıza Sistemi
          </h1>
          <p className="text-slate-300 text-lg">
            Gerçek zamanlı ürün takibi ve Shopify senkronizasyonu
          </p>
        </motion.div>

        {/* 🎯 REAL-TIME TRACKING STATUS PANEL */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-r from-emerald-900/50 to-blue-900/50 border-emerald-700/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${trackingStatus?.isRunning ? 'bg-emerald-500/20 animate-pulse' : 'bg-red-500/20'}`}>
                    <Zap className={`h-5 w-5 ${trackingStatus?.isRunning ? 'text-emerald-400' : 'text-red-400'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg">Canlı İzleme Durumu</CardTitle>
                    <CardDescription className="text-slate-300">
                      Fiyat ve stok değişiklikleri anlık takip ediliyor
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {trackingStatus?.isRunning ? (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Aktif
                    </Badge>
                  ) : (
                    <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Durduruldu
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* İzlenen Ürünler */}
                <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="tracking-monitored-count">
                  <div className="text-2xl font-bold text-white">{trackingStatus?.monitoredProducts || 0}</div>
                  <div className="text-xs text-slate-400">İzlenen Ürün</div>
                </div>
                
                {/* Toplam Ürün */}
                <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="tracking-total-count">
                  <div className="text-2xl font-bold text-white">{trackingStatus?.totalProducts || 0}</div>
                  <div className="text-xs text-slate-400">Toplam Ürün</div>
                </div>
                
                {/* Son Fiyat Değişikliği */}
                <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="tracking-price-changes">
                  <div className="text-2xl font-bold text-amber-400">{trackingStatus?.recentPriceChanges || 0}</div>
                  <div className="text-xs text-slate-400">Fiyat Değişikliği</div>
                </div>
                
                {/* Telegram Durumu */}
                <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="tracking-telegram-status">
                  <div className="text-2xl font-bold">
                    {telegramStatus?.status?.connected ? (
                      <Bell className="h-6 w-6 text-emerald-400 mx-auto" />
                    ) : (
                      <Bell className="h-6 w-6 text-red-400 mx-auto" />
                    )}
                  </div>
                  <div className="text-xs text-slate-400">Telegram</div>
                </div>
                
                {/* Bekleyen Değişiklikler */}
                <div className="bg-slate-800/50 rounded-lg p-3 text-center" data-testid="tracking-pending-changes">
                  <div className="text-2xl font-bold text-blue-400">{pendingChanges?.count || 0}</div>
                  <div className="text-xs text-slate-400">Bekleyen</div>
                </div>
              </div>
              
              {/* Progress Bar - Son Kontrol */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Son kontrol: {trackingStatus?.lastCheck ? new Date(trackingStatus.lastCheck).toLocaleTimeString('tr-TR') : 'Henüz yok'}</span>
                  <span>Kontrol aralığı: {trackingStatus?.checkInterval ? `${Math.floor(trackingStatus.checkInterval / 60000)} dakika` : '5 dakika'}</span>
                </div>
                <Progress value={trackingStatus?.isRunning ? 100 : 0} className="h-1" />
              </div>
              
              {/* Hızlı Eylemler */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => bulkAddTracking.mutate()}
                  disabled={bulkAddTracking.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="btn-bulk-add-tracking"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {bulkAddTracking.isPending ? 'Ekleniyor...' : 'Tümünü İzlemeye Ekle'}
                </Button>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/monitoring/status'] })}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  data-testid="btn-refresh-tracking"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Yenile
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* İstatistik Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Toplam Ürün</CardTitle>
              <Package className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.totalProducts || 0}</div>
              <p className="text-xs text-slate-400">{stats.memoryUsage}</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">İzlenen Ürünler</CardTitle>
              <Activity className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{monitoring.monitoredProducts || 0}</div>
              <p className="text-xs text-slate-400">
                {monitoring.isRunning ? (
                  <Badge variant="secondary" className="bg-green-900 text-green-300">Aktif</Badge>
                ) : (
                  <Badge variant="destructive">Durduruldu</Badge>
                )}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Shopify Bağlantısı</CardTitle>
              <ShoppingCart className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {shopifyTest?.connected ? (
                  <Badge variant="secondary" className="bg-green-900 text-green-300">Bağlı</Badge>
                ) : (
                  <Badge variant="destructive">Bağlantısız</Badge>
                )}
              </div>
              <p className="text-xs text-slate-400">API durumu</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Kontrol Aralığı</CardTitle>
              <Clock className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {monitoring.checkInterval ? `${monitoring.checkInterval / 1000}s` : '5dk'}
              </div>
              <p className="text-xs text-slate-400">Son kontrol: {monitoring.lastCheck}</p>
            </CardContent>
          </Card>
        </div>

        {/* Ana Kontroller */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Sistem Kontrolleri</CardTitle>
            <CardDescription className="text-slate-400">
              Monitoring ve senkronizasyon işlemlerini yönetin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => startMonitoring.mutate()}
                disabled={monitoring.isRunning || startMonitoring.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="h-4 w-4 mr-2" />
                Monitoring Başlat
              </Button>

              <Button
                onClick={() => stopMonitoring.mutate()}
                disabled={!monitoring.isRunning || stopMonitoring.isPending}
                variant="destructive"
              >
                <Pause className="h-4 w-4 mr-2" />
                Monitoring Durdur
              </Button>

              <Button
                onClick={() => syncAllToShopify.mutate()}
                disabled={syncAllToShopify.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Sync className="h-4 w-4 mr-2" />
                {syncAllToShopify.isPending ? 'Senkronize Ediliyor...' : 'Tümünü Shopify\'a Sync'}
              </Button>
            </div>

            {/* Yeni ürün ekleme */}
            <div className="flex gap-3">
              <Input
                placeholder="Trendyol ürün URL'si girin..."
                value={newProductUrl}
                onChange={(e) => setNewProductUrl(e.target.value)}
                className="flex-1 bg-slate-700 border-slate-600 text-white"
              />
              <Button
                onClick={handleAddProduct}
                disabled={!newProductUrl.trim() || addToMonitoring.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                İzlemeye Ekle
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Ürün Listesi */}
        <Tabs defaultValue="products" className="space-y-6">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="products" className="text-slate-300">Ürünler ({products.length})</TabsTrigger>
            <TabsTrigger value="history" className="text-slate-300">Değişiklik Geçmişi</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            {productsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto"></div>
                <p className="text-slate-400 mt-2">Ürünler yükleniyor...</p>
              </div>
            ) : products.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="text-center py-8">
                  <Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-400">Henüz izlenen ürün yok</p>
                  <p className="text-slate-500 text-sm">Yukarıdan yeni ürün ekleyebilirsiniz</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {products.map((product: any) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card 
                      className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-colors cursor-pointer"
                      onClick={() => setSelectedProduct(product)}
                      data-testid={`product-card-${product.id}`}
                    >
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-white text-sm leading-5 line-clamp-2">
                              {product.title}
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                              {product.brand}
                            </CardDescription>
                          </div>
                          <Badge 
                            variant={product.isActive ? "secondary" : "destructive"}
                            className={product.isActive ? "bg-green-900 text-green-300" : ""}
                          >
                            {product.isActive ? 'Aktif' : 'Pasif'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Kategori:</span>
                          <span className="text-white">{product.category || 'Genel'}</span>
                        </div>
                        
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Shopify ID:</span>
                          <span className="text-white">
                            {product.shopifyProductId ? (
                              <Badge variant="secondary" className="bg-blue-900 text-blue-300">
                                Senkronize
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-400 border-slate-600">
                                Bekliyor
                              </Badge>
                            )}
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Son Güncelleme:</span>
                          <span className="text-white text-xs">
                            {new Date(product.updatedAt).toLocaleString('tr-TR')}
                          </span>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => syncToShopify.mutate(product.id)}
                            disabled={syncToShopify.isPending}
                            className="bg-blue-600 hover:bg-blue-700 text-xs"
                          >
                            <Sync className="h-3 w-3 mr-1" />
                            Sync
                          </Button>
                          
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs"
                            onClick={() => window.open(product.trendyolUrl, '_blank')}
                          >
                            Trendyol'da Görüntüle
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="text-center py-8">
                <Clock className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-400">Değişiklik geçmişi yakında eklenecek</p>
                <p className="text-slate-500 text-sm">Fiyat ve stok değişikliklerini burada görebileceksiniz</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 🎯 PRODUCT PREVIEW MODAL */}
        {selectedProduct && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedProduct(null)}
            data-testid="product-preview-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto relative"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedProduct(null)}
                className="sticky top-0 right-0 p-3 hover:bg-slate-800 rounded-lg transition-colors float-right z-10"
                data-testid="close-preview-modal"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                {/* Header */}
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{selectedProduct.title}</h2>
                  <p className="text-slate-400">{selectedProduct.brand}</p>
                </div>

                {/* Product Info Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-800/30 p-4 rounded-lg">
                  <div>
                    <span className="text-slate-400 block text-xs mb-1">Kategori:</span>
                    <p className="text-white">{selectedProduct.category || 'Genel'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs mb-1">Durum:</span>
                    <p className={selectedProduct.isActive ? 'text-green-400' : 'text-red-400'}>
                      {selectedProduct.isActive ? 'Aktif' : 'Pasif'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs mb-1">Shopify ID:</span>
                    <p className="text-white text-xs">{selectedProduct.shopifyProductId || 'Bekliyor'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs mb-1">Son Güncelleme:</span>
                    <p className="text-white text-xs">
                      {new Date(selectedProduct.updatedAt).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>

                {/* Ürün Detayları */}
                <div className="border-t border-slate-700 pt-4 space-y-4">
                  <div>
                    <h3 className="text-sm text-slate-400 mb-2">Fiyat</h3>
                    <p className="text-lg text-green-400 font-semibold">
                      {selectedProduct.price ? `₺${selectedProduct.price}` : 'Belirtilmedi'}
                    </p>
                  </div>
                  
                  {selectedProduct.description && (
                    <div>
                      <h3 className="text-sm text-slate-400 mb-2">Açıklama</h3>
                      <p className="text-sm text-slate-300 line-clamp-3">{selectedProduct.description}</p>
                    </div>
                  )}

                  {Array.isArray(selectedProduct.images) && selectedProduct.images.length > 0 && (
                    <div>
                      <h3 className="text-sm text-slate-400 mb-2">Resimler ({selectedProduct.images.length})</h3>
                      <div className="flex gap-2 overflow-x-auto">
                        {selectedProduct.images.slice(0, 5).map((img: string, idx: number) => (
                          <img 
                            key={idx}
                            src={img} 
                            alt={`Product ${idx}`}
                            className="w-16 h-16 rounded object-cover flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect fill="%23333" width="64" height="64"/%3E%3C/svg%3E';
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}