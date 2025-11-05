import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Activity,
  ShoppingCart,
  CheckCircle,
  XCircle,
  ExternalLink,
  AlertCircle,
  Radio,
  Image as ImageIcon,
  History,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  ArrowUpDown
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SyncStatusBadge {
  status: string;
  label: string;
  color: string;
}

interface UrlTracking {
  isTracking: boolean;
  trackingInterval: number;
  lastChecked: string;
  checkCount: number;
  status: string;
}

interface LatestActivity {
  type: string;
  createdAt: string;
  details: {
    color: string;
    size: string;
  };
}

interface TrackedProduct {
  id: number;
  title: string;
  brand: string;
  shopifyProductId: string | null;
  shopifyUrl: string | null;
  shopifyStoreUrl: string | null;
  trendyolUrl: string;
  currentPrice: string;
  originalPrice: string;
  stockStatus: string;
  status: string;
  isActive: boolean;
  syncStatus: SyncStatusBadge;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  variantCount: number;
  priceChangeCount: number;
  stockChangeCount: number;
  urlTracking: UrlTracking | null;
  latestActivity: LatestActivity | null;
  images: string[];
}

interface TrackingSummary {
  totalProducts: number;
  activeProducts: number;
  pausedProducts: number;
  outOfStockProducts: number;
  syncedToShopify: number;
  totalVariants: number;
  totalPriceChanges: number;
  totalStockChanges: number;
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
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'shopify' | 'out_of_stock'>('all');
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'price' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const { toast } = useToast();

  const { data: trackingData, isLoading: trackingLoading, refetch: refetchTracking } = useQuery({
    queryKey: ['/api/tracking'],
    refetchInterval: 30000
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: selectedProduct ? [`/api/tracking/${selectedProduct}`] : [],
    enabled: !!selectedProduct,
    refetchInterval: 15000
  });

  const products: TrackedProduct[] = (trackingData as any)?.products || [];
  const summary: TrackingSummary = (trackingData as any)?.summary || {
    totalProducts: 0,
    activeProducts: 0,
    pausedProducts: 0,
    outOfStockProducts: 0,
    syncedToShopify: 0,
    totalVariants: 0,
    totalPriceChanges: 0,
    totalStockChanges: 0
  };

  const productDetail: ProductDetail | undefined = (detailData as any)?.product;
  const variants: ProductVariant[] = (detailData as any)?.variants || [];
  const priceHistory: PriceHistoryEntry[] = (detailData as any)?.priceHistory || [];

  const pauseMutation = useMutation({
    mutationFn: async ({ productId, pause }: { productId: number, pause: boolean }) => {
      return await apiRequest('POST', `/api/tracking/${productId}/pause`, { pause });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      setSelectedProduct(null);
      toast({
        title: 'Başarılı',
        description: 'Ürün takibi durduruldu'
      });
    }
  });

  const filteredProducts = products
    .filter(p => {
      if (filter === 'active') return p.status === 'active';
      if (filter === 'paused') return p.status === 'paused';
      if (filter === 'shopify') return p.shopifyProductId !== null;
      if (filter === 'out_of_stock') return p.status === 'out_of_stock';
      return true;
    })
    .filter(p => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'title') {
        return sortOrder === 'asc' 
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
      if (sortBy === 'price') {
        const priceA = parseFloat(a.currentPrice);
        const priceB = parseFloat(b.currentPrice);
        return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
      }
      // Sort by date (createdAt)
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
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
    refetchTracking();
    toast({
      title: 'Yenileniyor',
      description: 'Veriler güncelleniyor...'
    });
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

  const getSyncStatusBadge = (syncStatus: SyncStatusBadge) => {
    const colorMap: Record<string, string> = {
      green: 'bg-green-500 hover:bg-green-600',
      red: 'bg-red-500 hover:bg-red-600',
      yellow: 'bg-yellow-500 hover:bg-yellow-600'
    };
    
    return (
      <Badge className={colorMap[syncStatus.color] || 'bg-gray-500'}>
        {syncStatus.label}
      </Badge>
    );
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'variant_added': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'price_increase': return <ArrowUpCircle className="w-4 h-4 text-red-500" />;
      case 'price_decrease': return <ArrowDownCircle className="w-4 h-4 text-green-500" />;
      case 'variant_out_of_stock': return <XCircle className="w-4 h-4 text-orange-500" />;
      case 'variant_back_in_stock': return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

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
              <div className="text-2xl font-bold" data-testid="text-total-products">{summary.totalProducts}</div>
              <p className="text-xs text-muted-foreground">
                {summary.activeProducts} aktif, {summary.pausedProducts} duraklatılmış
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Shopify'a Aktarılan</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-synced-shopify">{summary.syncedToShopify}</div>
              <p className="text-xs text-muted-foreground">
                {summary.totalVariants} toplam varyant
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fiyat Değişimi (30 gün)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-price-changes">{summary.totalPriceChanges}</div>
              <p className="text-xs text-muted-foreground">Son 30 gün</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stok Değişimi (30 gün)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stock-changes">{summary.totalStockChanges}</div>
              <p className="text-xs text-muted-foreground">Son 30 gün</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <CardTitle>Takip Edilen Ürünler</CardTitle>
              </div>
              
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ürün adı veya marka ile ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                    <SelectTrigger className="w-[180px]" data-testid="select-sort-by">
                      <SelectValue placeholder="Sıralama" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Tarih</SelectItem>
                      <SelectItem value="title">Başlık</SelectItem>
                      <SelectItem value="price">Fiyat</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    data-testid="button-toggle-sort-order"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="all" data-testid="filter-all">
                    Tümü ({products.length})
                  </TabsTrigger>
                  <TabsTrigger value="active" data-testid="filter-active">
                    Aktif ({products.filter(p => p.status === 'active').length})
                  </TabsTrigger>
                  <TabsTrigger value="shopify" data-testid="filter-shopify">
                    Shopify ({products.filter(p => p.shopifyProductId !== null).length})
                  </TabsTrigger>
                  <TabsTrigger value="out_of_stock" data-testid="filter-out-of-stock">
                    Stok Yok ({products.filter(p => p.status === 'out_of_stock').length})
                  </TabsTrigger>
                  <TabsTrigger value="paused" data-testid="filter-paused">
                    Durduruldu ({products.filter(p => p.status === 'paused').length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {trackingLoading ? (
              <div className="text-center py-8">Yükleniyor...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {filter === 'all' ? 'Henüz takip edilen ürün yok' : 'Bu filtre için ürün bulunamadı'}
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Görsel</TableHead>
                      <TableHead>Ürün Bilgisi</TableHead>
                      <TableHead>Fiyat</TableHead>
                      <TableHead>Varyantlar</TableHead>
                      <TableHead>Shopify</TableHead>
                      <TableHead>URL Takip</TableHead>
                      <TableHead>Son Aktivite</TableHead>
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
                          {product.images.length > 0 ? (
                            <img 
                              src={product.images[0]} 
                              alt={product.title}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                              <ImageIcon className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium max-w-md truncate">{product.title}</div>
                            <div className="text-sm text-muted-foreground">{product.brand}</div>
                            <div className="flex gap-1 mt-1">
                              {product.status === 'active' && (
                                <Badge variant="outline" className="text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Aktif
                                </Badge>
                              )}
                              {product.status === 'paused' && (
                                <Badge variant="secondary" className="text-xs">
                                  <Pause className="w-3 h-3 mr-1" />
                                  Durduruldu
                                </Badge>
                              )}
                              {product.status === 'out_of_stock' && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Stokta Yok
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-semibold">{formatPrice(product.currentPrice)}</div>
                            {product.priceChangeCount > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {product.priceChangeCount} değişim (30g)
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{product.variantCount} varyant</div>
                            {product.stockChangeCount > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {product.stockChangeCount} stok değişimi
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getSyncStatusBadge(product.syncStatus)}
                            {product.shopifyProductId && (
                              <a 
                                href={`https://admin.shopify.com/store/${product.shopifyProductId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" />
                                Shopify'da Aç
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {product.urlTracking ? (
                            <div className="text-xs">
                              <div className="flex items-center gap-1">
                                <Radio className="w-3 h-3 text-green-500" />
                                <span className="font-medium">Aktif</span>
                              </div>
                              <div className="text-muted-foreground mt-1">
                                {product.urlTracking.checkCount} kontrol
                              </div>
                              <div className="text-muted-foreground">
                                Son: {formatDate(product.urlTracking.lastChecked)}
                              </div>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Takip Yok
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.latestActivity ? (
                            <div className="flex items-center gap-2 text-xs">
                              {getActivityIcon(product.latestActivity.type)}
                              <div>
                                <div className="font-medium">{product.latestActivity.type.replace(/_/g, ' ')}</div>
                                <div className="text-muted-foreground">
                                  {product.latestActivity.details.color} / {product.latestActivity.details.size}
                                </div>
                                <div className="text-muted-foreground">
                                  {formatDate(product.latestActivity.createdAt)}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
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
              </ScrollArea>
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
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Fiyat Geçmişi (Son 30 Gün)
                  </h3>
                  <div className="max-h-64 overflow-y-auto">
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
                        {priceHistory.slice(0, 20).map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs">{formatDate(entry.createdAt)}</TableCell>
                            <TableCell className="text-sm">{entry.color} / {entry.size}</TableCell>
                            <TableCell className="text-sm">{formatPrice(entry.oldPrice)}</TableCell>
                            <TableCell className="text-sm font-semibold">{formatPrice(entry.newPrice)}</TableCell>
                            <TableCell>
                              {entry.changeType === 'increase' ? (
                                <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                  <ArrowUpCircle className="w-3 h-3" />
                                  +{entry.changePercentage}%
                                </Badge>
                              ) : (
                                <Badge className="bg-green-500 flex items-center gap-1 w-fit">
                                  <ArrowDownCircle className="w-3 h-3" />
                                  {entry.changePercentage}%
                                </Badge>
                              )}
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
