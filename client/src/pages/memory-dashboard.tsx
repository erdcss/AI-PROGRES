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
  ShoppingCart
} from 'lucide-react';

export default function MemoryDashboard() {
  const [newProductUrl, setNewProductUrl] = useState('');
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

  // Monitoring başlat/durdur
  const startMonitoring = useMutation({
    mutationFn: () => apiRequest('/api/monitoring/start', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/stats'] });
    }
  });

  const stopMonitoring = useMutation({
    mutationFn: () => apiRequest('/api/monitoring/stop', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/stats'] });
    }
  });

  // Ürün izlemeye ekle
  const addToMonitoring = useMutation({
    mutationFn: (url: string) => apiRequest('/api/monitoring/add', { 
      method: 'POST',
      body: JSON.stringify({ url }),
      headers: { 'Content-Type': 'application/json' }
    }),
    onSuccess: () => {
      setNewProductUrl('');
      queryClient.invalidateQueries({ queryKey: ['/api/memory/products'] });
    }
  });

  // Shopify senkronizasyon
  const syncToShopify = useMutation({
    mutationFn: (productId: number) => apiRequest(`/api/shopify/sync/${productId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memory/products'] });
    }
  });

  // Tüm ürünleri senkronize et
  const syncAllToShopify = useMutation({
    mutationFn: () => apiRequest('/api/shopify/sync-all', { method: 'POST' }),
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
                    <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-colors">
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
      </div>
    </div>
  );
}