import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Package, 
  TrendingUp, 
  Clock, 
  Pause,
  Play,
  Trash2,
  RefreshCw,
  BarChart3,
  Activity,
  ShoppingCart,
  CheckCircle,
  XCircle
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
import { Line } from 'recharts';
import { LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TrackedProduct {
  id: number;
  title: string;
  brand: string;
  currentPrice: string;
  category: string;
  trendyolUrl: string;
  shopifyProductId: string;
  lastChecked: string;
  isActive: boolean;
  stockStatus: string;
  createdAt: string;
  totalVariants: number;
  variantsInStock: number;
}

interface TrackingStats {
  totalProducts: number;
  activeTracking: number;
  pausedTracking: number;
  totalVariants: number;
  variantsInStock: number;
  priceChangesLast24h: number;
  stockChangesLast24h: number;
}

interface ProductVariant {
  id: number;
  productId: number;
  shopifyVariantId: string;
  color: string;
  size: string;
  sku: string;
  trendyolPrice: string;
  shopifyPrice: string;
  stockCount: number;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PriceHistoryEntry {
  id: number;
  variantId: number;
  oldPrice: string;
  newPrice: string;
  changeType: string;
  changeAmount: string;
  changePercentage: string;
  createdAt: string;
  color: string;
  size: string;
}

interface ProductDetail {
  id: number;
  title: string;
  brand: string;
  currentPrice: string;
  category: string;
  description: string;
  images: string[];
  trendyolUrl: string;
  shopifyProductId: string;
  lastChecked: string;
  isActive: boolean;
}

export default function ProductTrackingPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['/api/tracking/all'],
    refetchInterval: 30000
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['/api/tracking/stats'],
    refetchInterval: 60000
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: selectedProduct ? [`/api/tracking/${selectedProduct}`] : [],
    enabled: !!selectedProduct,
    refetchInterval: 15000
  });

  const products: TrackedProduct[] = (productsData as any)?.products || [];
  const stats: TrackingStats = (statsData as any)?.stats || {
    totalProducts: 0,
    activeTracking: 0,
    pausedTracking: 0,
    totalVariants: 0,
    variantsInStock: 0,
    priceChangesLast24h: 0,
    stockChangesLast24h: 0
  };

  const productDetail: ProductDetail | undefined = (detailData as any)?.product;
  const variants: ProductVariant[] = (detailData as any)?.variants || [];
  const priceHistory: PriceHistoryEntry[] = (detailData as any)?.priceHistory || [];

  const pauseMutation = useMutation({
    mutationFn: async ({ productId, pause }: { productId: number, pause: boolean }) => {
      return await apiRequest('POST', `/api/tracking/${productId}/pause`, { pause });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/stats'] });
      if (selectedProduct === variables.productId) {
        queryClient.invalidateQueries({ queryKey: [`/api/tracking/${variables.productId}`] });
      }
      toast({
        title: 'Başarılı',
        description: 'Takip durumu güncellendi'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: number) => {
      return await apiRequest('DELETE', `/api/tracking/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/stats'] });
      setSelectedProduct(null);
      toast({
        title: 'Başarılı',
        description: 'Ürün takibi durduruldu'
      });
    }
  });

  const filteredProducts = products.filter(p => {
    if (filter === 'active') return p.isActive;
    if (filter === 'paused') return !p.isActive;
    return true;
  });

  const handlePauseToggle = (productId: number, currentStatus: boolean) => {
    pauseMutation.mutate({ productId, pause: currentStatus });
  };

  const handleDelete = (productId: number) => {
    if (confirm('Bu ürünün takibini durdurmak istediğinizden emin misiniz?')) {
      deleteMutation.mutate(productId);
    }
  };

  const handleRefreshAll = () => {
    refetchProducts();
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

  const formatPrice = (price: string) => {
    if (!price) return '0.00 TL';
    return `${parseFloat(price).toFixed(2)} TL`;
  };

  const priceChartData = priceHistory.map(entry => ({
    date: new Date(entry.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
    price: parseFloat(entry.newPrice),
    variant: `${entry.color} / ${entry.size}`
  }));

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-product-tracking">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Merkezi Ürün Takip Sistemi</h1>
            <p className="text-muted-foreground mt-1">Tüm takip edilen ürünleri yönetin</p>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Toplam Ürün</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-products">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeTracking} aktif, {stats.pausedTracking} duraklatılmış
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Toplam Varyant</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-variants">{stats.totalVariants}</div>
              <p className="text-xs text-muted-foreground">
                {stats.variantsInStock} stokta
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fiyat Değişimi (24s)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-price-changes-24h">{stats.priceChangesLast24h}</div>
              <p className="text-xs text-muted-foreground">Son 24 saat</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stok Değişimi (24s)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stock-changes-24h">{stats.stockChangesLast24h}</div>
              <p className="text-xs text-muted-foreground">Son 24 saat</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Takip Edilen Ürünler</CardTitle>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="filter-all">Tümü ({products.length})</TabsTrigger>
                  <TabsTrigger value="active" data-testid="filter-active">Aktif ({products.filter(p => p.isActive).length})</TabsTrigger>
                  <TabsTrigger value="paused" data-testid="filter-paused">Duraklatılmış ({products.filter(p => !p.isActive).length})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="text-center py-8">Yükleniyor...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Henüz takip edilen ürün yok
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Fiyat</TableHead>
                    <TableHead>Varyantlar</TableHead>
                    <TableHead>Son Kontrol</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow 
                      key={product.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedProduct(product.id)}
                      data-testid={`row-product-${product.id}`}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{product.title}</div>
                          <div className="text-sm text-muted-foreground">{product.brand}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatPrice(product.currentPrice)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{product.totalVariants} toplam</div>
                          <div className="text-muted-foreground">{product.variantsInStock} stokta</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          {formatDate(product.lastChecked)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.isActive ? (
                          <Badge className="bg-green-500" data-testid={`badge-active-${product.id}`}>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-paused-${product.id}`}>
                            <Pause className="w-3 h-3 mr-1" />
                            Duraklatılmış
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePauseToggle(product.id, product.isActive)}
                            data-testid={`button-pause-${product.id}`}
                          >
                            {product.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(product.id)}
                            data-testid={`button-delete-${product.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-detail-title">{productDetail?.title || 'Yükleniyor...'}</DialogTitle>
            <div className="text-sm text-muted-foreground">{productDetail?.brand}</div>
          </DialogHeader>
          
          {detailLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="mt-4 text-muted-foreground">Ürün detayları yükleniyor...</p>
            </div>
          ) : productDetail && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Kategori</div>
                  <div>{productDetail.category || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Güncel Fiyat</div>
                  <div className="text-lg font-bold">{formatPrice(productDetail.currentPrice)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Trendyol Ürün ID</div>
                  <div className="text-xs">{productDetail.trendyolUrl.split('/').pop()?.split('?')[0]}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Shopify Ürün ID</div>
                  <div className="text-xs">{productDetail.shopifyProductId || 'N/A'}</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Varyantlar ({variants.length})</h3>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Renk</TableHead>
                        <TableHead>Beden</TableHead>
                        <TableHead>Trendyol Fiyat</TableHead>
                        <TableHead>Shopify Fiyat</TableHead>
                        <TableHead>Stok</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variants.map((variant) => (
                        <TableRow key={variant.id} data-testid={`row-variant-${variant.id}`}>
                          <TableCell>{variant.color}</TableCell>
                          <TableCell>{variant.size}</TableCell>
                          <TableCell>{formatPrice(variant.trendyolPrice)}</TableCell>
                          <TableCell>{formatPrice(variant.shopifyPrice)}</TableCell>
                          <TableCell>
                            {variant.inStock ? (
                              <Badge className="bg-green-500">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Stokta
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="w-3 h-3 mr-1" />
                                Tükendi
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {priceHistory.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Fiyat Geçmişi (Son 30 Gün)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={priceChartData}>
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="price" stroke="#8884d8" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tarih</TableHead>
                          <TableHead>Varyant</TableHead>
                          <TableHead>Eski Fiyat</TableHead>
                          <TableHead>Yeni Fiyat</TableHead>
                          <TableHead>Değişim</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {priceHistory.slice(0, 10).map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{formatDate(entry.createdAt)}</TableCell>
                            <TableCell>{entry.color} / {entry.size}</TableCell>
                            <TableCell>{formatPrice(entry.oldPrice)}</TableCell>
                            <TableCell>{formatPrice(entry.newPrice)}</TableCell>
                            <TableCell>
                              <Badge variant={entry.changeType === 'increase' ? 'destructive' : 'default'}>
                                {entry.changePercentage}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
