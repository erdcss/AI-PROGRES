import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Package,
  TrendingUp,
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
  ArrowUpDown,
  Radar,
  Edit,
  Check,
  X,
  Plus,
  Zap,
  Timer,
  ScanLine,
  Clock,
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [newPriceValue, setNewPriceValue] = useState('');
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addUrlValue, setAddUrlValue] = useState('');
  const [addUrlInterval, setAddUrlInterval] = useState('300');
  const [checkingProductId, setCheckingProductId] = useState<number | null>(null);
  const [editingIntervalId, setEditingIntervalId] = useState<number | null>(null);
  const [newIntervalValue, setNewIntervalValue] = useState('');
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
      toast({ title: 'Başarılı', description: 'Takip durumu güncellendi' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: number) => {
      return await apiRequest('DELETE', `/api/tracking/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      setSelectedProduct(null);
      toast({ title: 'Başarılı', description: 'Ürün takibi durduruldu' });
    }
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ shopifyProductId, newPrice }: { shopifyProductId: string, newPrice: string }) => {
      return await apiRequest('POST', '/api/shopify/update-price', { shopifyProductId, newPrice });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      setEditingPriceId(null);
      setNewPriceValue('');
      toast({ title: 'Başarılı', description: 'Fiyat güncellendi' });
    },
    onError: (error: any) => {
      toast({ title: 'Hata', description: error?.message || 'Fiyat güncellenirken bir hata oluştu', variant: 'destructive' });
    }
  });

  const bulkTrackMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/tracking/bulk-add-shopify', { scope: 'all' });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/stats'] });
      toast({
        title: 'Tümü İzlemeye Eklendi',
        description: `${data?.added || 0} ürün izlemeye alındı.`
      });
    },
    onError: () => {
      toast({ title: 'Hata', description: 'İzleme eklenirken bir hata oluştu', variant: 'destructive' });
    }
  });

  const addUrlMutation = useMutation({
    mutationFn: async ({ url, trackingInterval }: { url: string; trackingInterval: number }) => {
      return await apiRequest('POST', '/api/tracking/add', { url, trackingInterval });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      setAddUrlOpen(false);
      setAddUrlValue('');
      setAddUrlInterval('300');
      toast({ title: 'Eklendi', description: 'URL izlemeye alındı ve ürün verileri çekildi.' });
    },
    onError: (error: any) => {
      toast({ title: 'Hata', description: error?.message || 'URL eklenirken hata oluştu', variant: 'destructive' });
    }
  });

  const checkNowMutation = useMutation({
    mutationFn: async (productId: number) => {
      setCheckingProductId(productId);
      return await apiRequest('POST', `/api/tracking/${productId}/check-now`, {});
    },
    onSuccess: (_, productId) => {
      setCheckingProductId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      toast({ title: 'Kontrol Tamamlandı', description: 'Ürün bilgileri güncellendi.' });
    },
    onError: (error: any, productId) => {
      setCheckingProductId(null);
      toast({ title: 'Hata', description: error?.message || 'Kontrol sırasında hata oluştu', variant: 'destructive' });
    }
  });

  const scanAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/tracking/scan', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      toast({ title: 'Tarama Tamamlandı', description: `${data?.checked || 0} URL kontrol edildi.` });
    },
    onError: () => {
      toast({ title: 'Hata', description: 'Tarama sırasında hata oluştu', variant: 'destructive' });
    }
  });

  const setIntervalMutation = useMutation({
    mutationFn: async ({ productId, intervalSeconds }: { productId: number; intervalSeconds: number }) => {
      return await apiRequest('POST', `/api/tracking/${productId}/set-interval`, { intervalSeconds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tracking'] });
      setEditingIntervalId(null);
      setNewIntervalValue('');
      toast({ title: 'Güncellendi', description: 'Takip aralığı değiştirildi.' });
    },
    onError: (error: any) => {
      toast({ title: 'Hata', description: error?.message || 'Aralık güncellenirken hata oluştu', variant: 'destructive' });
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
    toast({ title: 'Yenileniyor', description: 'Veriler güncelleniyor...' });
  };

  const handlePriceUpdate = (product: TrackedProduct) => {
    if (!product.shopifyProductId) {
      toast({ title: 'Hata', description: "Bu ürün Shopify'a aktarılmamış", variant: 'destructive' });
      return;
    }
    if (!newPriceValue || parseFloat(newPriceValue) <= 0) {
      toast({ title: 'Hata', description: 'Geçerli bir fiyat giriniz', variant: 'destructive' });
      return;
    }
    updatePriceMutation.mutate({ shopifyProductId: product.shopifyProductId, newPrice: newPriceValue });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatPrice = (price: string) => {
    if (!price) return '0.00 TL';
    return `${parseFloat(price).toFixed(2)} TL`;
  };

  const formatInterval = (seconds: number) => {
    if (!seconds) return '5 dk';
    if (seconds < 60) return `${seconds} sn`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} dk`;
    return `${Math.round(mins / 60)} sa`;
  };

  const getActivityLabel = (type: string) => {
    const labels: Record<string, string> = {
      variant_added: 'Varyant Eklendi',
      variant_removed: 'Varyant Çıkarıldı',
      price_increase: 'Fiyat Arttı',
      price_decrease: 'Fiyat Düştü',
      variant_out_of_stock: 'Stok Tükendi',
      variant_back_in_stock: 'Stok Geldi',
      stock_change: 'Stok Değişti',
    };
    return labels[type] || type.replace(/_/g, ' ');
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
      case 'variant_added': return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'price_increase': return <ArrowUpCircle className="w-3 h-3 text-red-500" />;
      case 'price_decrease': return <ArrowDownCircle className="w-3 h-3 text-green-500" />;
      case 'variant_out_of_stock': return <XCircle className="w-3 h-3 text-orange-500" />;
      case 'variant_back_in_stock': return <CheckCircle className="w-3 h-3 text-green-500" />;
      default: return <Activity className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getShopifyAdminUrl = (product: TrackedProduct) => {
    if (product.shopifyStoreUrl) return product.shopifyStoreUrl;
    if (product.shopifyUrl) return product.shopifyUrl;
    if (product.shopifyProductId) {
      return `https://admin.shopify.com/products/${product.shopifyProductId}`;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold">Merkezi Ürün Takip Sistemi</h1>
            <p className="text-muted-foreground mt-1">Tüm takip edilen ürünleri yönetin</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAddUrlOpen(true)}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              URL Ekle
            </Button>
            <Button
              onClick={() => scanAllMutation.mutate()}
              disabled={scanAllMutation.isPending}
              variant="outline"
            >
              <ScanLine className="w-4 h-4 mr-2" />
              {scanAllMutation.isPending ? 'Taranıyor...' : 'Tümünü Şimdi Tara'}
            </Button>
            <Button
              onClick={() => bulkTrackMutation.mutate()}
              disabled={bulkTrackMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Radar className="w-4 h-4 mr-2" />
              {bulkTrackMutation.isPending ? 'Ekleniyor...' : 'Tümünü İzlemeye Ekle'}
            </Button>
            <Button onClick={handleRefreshAll} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Yenile
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Toplam Ürün</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalProducts}</div>
              <p className="text-xs text-muted-foreground">
                {summary.activeProducts} aktif, {summary.pausedProducts} durdurulmuş
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Shopify'a Aktarılan</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.syncedToShopify}</div>
              <p className="text-xs text-muted-foreground">{summary.totalVariants} toplam varyant</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fiyat Değişimi (30g)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalPriceChanges}</div>
              <p className="text-xs text-muted-foreground">Son 30 gün</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stok Değişimi (30g)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalStockChanges}</div>
              <p className="text-xs text-muted-foreground">Son 30 gün</p>
            </CardContent>
          </Card>
        </div>

        {/* Product List */}
        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <CardTitle>Takip Edilen Ürünler</CardTitle>
                <span className="text-sm text-muted-foreground">{filteredProducts.length} ürün gösteriliyor</span>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ürün adı veya marka ile ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                    <SelectTrigger className="w-[160px]">
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
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="all">Tümü ({products.length})</TabsTrigger>
                  <TabsTrigger value="active">Aktif ({products.filter(p => p.status === 'active').length})</TabsTrigger>
                  <TabsTrigger value="shopify">Shopify ({products.filter(p => p.shopifyProductId !== null).length})</TabsTrigger>
                  <TabsTrigger value="out_of_stock">Stok Yok ({products.filter(p => p.status === 'out_of_stock').length})</TabsTrigger>
                  <TabsTrigger value="paused">Durduruldu ({products.filter(p => p.status === 'paused').length})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {trackingLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
                <p className="text-muted-foreground">Yükleniyor...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">
                  {filter === 'all' ? 'Henüz takip edilen ürün yok' : 'Bu filtre için ürün bulunamadı'}
                </p>
                {filter === 'all' && (
                  <p className="text-sm mt-2">
                    "URL Ekle" butonuyla Trendyol URL'si ekleyebilirsiniz
                  </p>
                )}
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
                      >
                        {/* Image */}
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

                        {/* Product Info */}
                        <TableCell>
                          <div>
                            <div className="font-medium max-w-xs truncate">{product.title}</div>
                            <div className="text-sm text-muted-foreground">{product.brand}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {product.status === 'active' && (
                                <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                                  <CheckCircle className="w-3 h-3 mr-1" />Aktif
                                </Badge>
                              )}
                              {product.status === 'paused' && (
                                <Badge variant="secondary" className="text-xs">
                                  <Pause className="w-3 h-3 mr-1" />Durduruldu
                                </Badge>
                              )}
                              {product.status === 'out_of_stock' && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="w-3 h-3 mr-1" />Stokta Yok
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Price */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {editingPriceId === product.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={newPriceValue}
                                onChange={(e) => setNewPriceValue(e.target.value)}
                                className="w-20 h-7 text-xs"
                                placeholder="Fiyat"
                              />
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => handlePriceUpdate(product)}
                                disabled={updatePriceMutation.isPending}>
                                <Check className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => { setEditingPriceId(null); setNewPriceValue(''); }}>
                                <X className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <div>
                                <div className="font-semibold text-sm">{formatPrice(product.currentPrice)}</div>
                                {product.priceChangeCount > 0 && (
                                  <div className="text-xs text-muted-foreground">{product.priceChangeCount} değişim</div>
                                )}
                              </div>
                              {product.shopifyProductId && (
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                  onClick={() => { setEditingPriceId(product.id); setNewPriceValue(product.currentPrice); }}>
                                  <Edit className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* Variants */}
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{product.variantCount} varyant</div>
                            {product.stockChangeCount > 0 && (
                              <div className="text-xs text-muted-foreground">{product.stockChangeCount} stok değişimi</div>
                            )}
                          </div>
                        </TableCell>

                        {/* Shopify */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {getSyncStatusBadge(product.syncStatus)}
                            {product.shopifyProductId && (() => {
                              const url = getShopifyAdminUrl(product);
                              return url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Shopify'da Aç
                                </a>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>

                        {/* URL Tracking */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {product.urlTracking ? (
                            <div className="text-xs space-y-1">
                              <div className="flex items-center gap-1">
                                <Radio className="w-3 h-3 text-green-500" />
                                <span className="font-medium text-green-600">İzleniyor</span>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Timer className="w-3 h-3" />
                                {editingIntervalId === product.id ? (
                                  <div className="flex items-center gap-1">
                                    <Select value={newIntervalValue} onValueChange={setNewIntervalValue}>
                                      <SelectTrigger className="h-6 w-20 text-xs">
                                        <SelectValue placeholder="Aralık" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="60">1 dk</SelectItem>
                                        <SelectItem value="300">5 dk</SelectItem>
                                        <SelectItem value="600">10 dk</SelectItem>
                                        <SelectItem value="1800">30 dk</SelectItem>
                                        <SelectItem value="3600">1 sa</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                      onClick={() => setIntervalMutation.mutate({ productId: product.id, intervalSeconds: parseInt(newIntervalValue) })}
                                      disabled={!newIntervalValue || setIntervalMutation.isPending}>
                                      <Check className="h-3 w-3 text-green-600" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                      onClick={() => setEditingIntervalId(null)}>
                                      <X className="h-3 w-3 text-red-600" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span
                                    className="cursor-pointer hover:underline"
                                    onClick={() => { setEditingIntervalId(product.id); setNewIntervalValue(String(product.urlTracking!.trackingInterval || 300)); }}
                                  >
                                    Her {formatInterval(product.urlTracking.trackingInterval || 300)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {formatDate(product.urlTracking.lastChecked)}
                              </div>
                              <div className="text-muted-foreground">{product.urlTracking.checkCount} kontrol</div>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">Takip Yok</Badge>
                          )}
                        </TableCell>

                        {/* Latest Activity */}
                        <TableCell>
                          {product.latestActivity ? (
                            <div className="flex items-start gap-1 text-xs">
                              {getActivityIcon(product.latestActivity.type)}
                              <div>
                                <div className="font-medium">{getActivityLabel(product.latestActivity.type)}</div>
                                <div className="text-muted-foreground">
                                  {product.latestActivity.details.color} / {product.latestActivity.details.size}
                                </div>
                                <div className="text-muted-foreground">{formatDate(product.latestActivity.createdAt)}</div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              title="Şimdi Kontrol Et"
                              onClick={() => checkNowMutation.mutate(product.id)}
                              disabled={checkingProductId === product.id}
                            >
                              {checkingProductId === product.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Zap className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              onClick={() => handlePauseToggle(product.id, product.isActive)}
                            >
                              {product.isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 px-2"
                              onClick={() => handleDelete(product.id)}
                            >
                              <Trash2 className="w-3 h-3" />
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

      {/* URL Ekle Dialog */}
      <Dialog open={addUrlOpen} onOpenChange={setAddUrlOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>URL İzlemeye Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Trendyol Ürün URL'si</Label>
              <Input
                placeholder="https://www.trendyol.com/..."
                value={addUrlValue}
                onChange={(e) => setAddUrlValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Kontrol Aralığı</Label>
              <Select value={addUrlInterval} onValueChange={setAddUrlInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">Her 1 dakika</SelectItem>
                  <SelectItem value="300">Her 5 dakika</SelectItem>
                  <SelectItem value="600">Her 10 dakika</SelectItem>
                  <SelectItem value="1800">Her 30 dakika</SelectItem>
                  <SelectItem value="3600">Her 1 saat</SelectItem>
                  <SelectItem value="21600">Her 6 saat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              URL eklendiğinde ürün verileri otomatik olarak çekilecek ve belirtilen aralıkta fiyat/stok takibi yapılacaktır.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUrlOpen(false)}>İptal</Button>
            <Button
              onClick={() => addUrlMutation.mutate({ url: addUrlValue, trackingInterval: parseInt(addUrlInterval) })}
              disabled={!addUrlValue.trim() || addUrlMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {addUrlMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Ekleniyor...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  İzlemeye Ekle
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{productDetail?.title || 'Yükleniyor...'}</DialogTitle>
            <div className="text-sm text-muted-foreground">{productDetail?.brand}</div>
          </DialogHeader>

          {detailLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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
                  <div className="text-sm font-medium text-muted-foreground">Trendyol URL</div>
                  <a href={productDetail.trendyolUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Trendyol'da Aç
                  </a>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Shopify Ürün ID</div>
                  <div className="text-xs font-mono">{productDetail.shopifyProductId || 'N/A'}</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Varyantlar ({variants.length})</h3>
                <div className="max-h-64 overflow-y-auto border rounded-md">
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
                        <TableRow key={variant.id}>
                          <TableCell>{variant.color}</TableCell>
                          <TableCell>{variant.size}</TableCell>
                          <TableCell>{formatPrice(variant.trendyolPrice)}</TableCell>
                          <TableCell>{formatPrice(variant.shopifyPrice)}</TableCell>
                          <TableCell>
                            {variant.inStock ? (
                              <Badge className="bg-green-500 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />Stokta
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                <XCircle className="w-3 h-3 mr-1" />Tükendi
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
                  <div className="max-h-64 overflow-y-auto border rounded-md">
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
                            <TableCell className="text-xs">{entry.color} / {entry.size}</TableCell>
                            <TableCell className="text-sm">{formatPrice(entry.oldPrice)}</TableCell>
                            <TableCell className="text-sm font-semibold">{formatPrice(entry.newPrice)}</TableCell>
                            <TableCell>
                              {entry.changeType === 'increase' ? (
                                <Badge variant="destructive" className="flex items-center gap-1 w-fit text-xs">
                                  <ArrowUpCircle className="w-3 h-3" />
                                  +{entry.changePercentage}%
                                </Badge>
                              ) : (
                                <Badge className="bg-green-500 flex items-center gap-1 w-fit text-xs">
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
