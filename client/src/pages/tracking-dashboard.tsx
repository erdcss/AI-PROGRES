import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  Trash2, RefreshCw, Clock, TrendingUp, TrendingDown, 
  Package, AlertCircle, CheckCircle, ChevronDown, ChevronUp,
  Play, Pause, Filter, Database, ArrowUpDown, Minus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RealTimeClock } from "@/components/RealTimeClock";

interface ProductWithChanges {
  id: number;
  title: string;
  brand: string;
  trendyolUrl: string;
  shopifyProductId: string | null;
  currentPrice: string;
  originalPrice: string;
  stockStatus: string;
  lastChecked: string;
  updatedAt: string;
  variantCount: number;
  variants: Array<{
    id: number;
    color: string;
    size: string;
    trendyolPrice: string;
    shopifyPrice: string;
    stockCount: number;
    inStock: boolean;
  }>;
  tracking: any;
  schedule: any;
  changes: {
    price: {
      hasChanged: boolean;
      latestChange: any;
      changeCount: number;
      oldPrice: string;
      newPrice: string;
      changeType: string;
      changePercentage: string;
    } | null;
    stock: {
      hasChanged: boolean;
      latestChange: any;
      changeCount: number;
      oldStock: number;
      newStock: number;
      changeType: string;
    } | null;
    variants: {
      hasChanged: boolean;
      changes: Array<{
        changeType: string;
        color: string;
        size: string;
        oldStockCount: number;
        newStockCount: number;
        createdAt: string;
      }>;
      addedCount: number;
      removedCount: number;
      stockChangedCount: number;
    } | null;
    hasAnyChanges: boolean;
  };
}

const TrackingDashboard = () => {
  const { toast } = useToast();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());

  // Fetch products with changes
  const { data: productsData, isLoading, refetch } = useQuery<{
    success: boolean;
    products: ProductWithChanges[];
    total: number;
    withChanges: number;
  }>({
    queryKey: ['/api/tracking/products-with-changes'],
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchIntervalInBackground: true
  });

  // Change summary
  const { data: summaryData } = useQuery<{
    success: boolean;
    summary: {
      last24Hours: {
        priceChanges: number;
        stockChanges: number;
        variantChanges: number;
      };
    };
  }>({
    queryKey: ['/api/tracking/change-summary'],
    refetchInterval: autoRefresh ? refreshInterval : false
  });

  // Clear memory mutation
  const clearMemory = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/memory/clear-products', {
        method: 'POST'
      });
    },
    onSuccess: () => {
      toast({
        title: "Hafıza Temizlendi",
        description: "Tüm ürün cache verileri başarıyla temizlendi.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/products-with-changes'] });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Hafıza temizlenirken bir hata oluştu.",
        variant: "destructive"
      });
    }
  });

  const toggleExpand = (productId: number) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const filteredProducts = showOnlyChanges
    ? productsData?.products.filter(p => p.changes.hasAnyChanges)
    : productsData?.products;

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return 'Hiç kontrol edilmedi';
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dakika önce`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} saat önce`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} gün önce`;
  };

  const formatPrice = (price: string) => {
    return `${parseFloat(price).toFixed(2)} TL`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Otomatik Takip Sistemi
                </h1>
                <p className="text-sm text-slate-400">
                  Hafızadaki ürünler ve değişim takibi
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Clear Memory Button */}
              <Button
                onClick={() => clearMemory.mutate()}
                disabled={clearMemory.isPending}
                variant="destructive"
                size="sm"
                className="gap-2"
                data-testid="button-clear-memory"
              >
                <Trash2 className="w-4 h-4" />
                {clearMemory.isPending ? 'Temizleniyor...' : 'Hafıza Temizle'}
              </Button>

              {/* Manual Refresh */}
              <Button
                onClick={() => refetch()}
                variant="outline"
                size="sm"
                className="gap-2 bg-slate-700/50 border-slate-600 hover:bg-slate-600/50"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4" />
                Yenile
              </Button>

              {/* Clock */}
              <div className="flex items-center gap-2 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-200 font-medium">
                  <RealTimeClock />
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-400">Toplam Ürün</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {productsData?.total || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-400">Değişen Ürün (24s)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">
                {productsData?.withChanges ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-400">Fiyat Değişimi (24s)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-400">
                {summaryData?.summary?.last24Hours?.priceChanges ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-400">Varyant Değişimi (24s)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-400">
                {summaryData?.summary?.last24Hours?.variantChanges ?? 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <Card className="bg-slate-800/50 border-slate-700 mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Show Only Changes Filter */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={showOnlyChanges}
                  onCheckedChange={setShowOnlyChanges}
                  data-testid="toggle-show-changes"
                />
                <label className="text-sm text-slate-300 cursor-pointer" onClick={() => setShowOnlyChanges(!showOnlyChanges)}>
                  Sadece Değişenleri Göster
                </label>
              </div>

              {/* Auto Refresh */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={autoRefresh}
                    onCheckedChange={setAutoRefresh}
                    data-testid="toggle-auto-refresh"
                  />
                  <label className="text-sm text-slate-300 cursor-pointer" onClick={() => setAutoRefresh(!autoRefresh)}>
                    Otomatik Yenileme
                  </label>
                </div>

                {/* Refresh Interval */}
                <Select
                  value={refreshInterval.toString()}
                  onValueChange={(value) => setRefreshInterval(parseInt(value))}
                  disabled={!autoRefresh}
                >
                  <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-slate-200" data-testid="select-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30000">30 saniye</SelectItem>
                    <SelectItem value="60000">1 dakika</SelectItem>
                    <SelectItem value="300000">5 dakika</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        {isLoading ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-8 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p>Ürünler yükleniyor...</p>
            </CardContent>
          </Card>
        ) : filteredProducts && filteredProducts.length > 0 ? (
          <div className="space-y-3">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-all" data-testid={`card-product-${product.id}`}>
                <CardContent className="p-4">
                  {/* Main Product Row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title and Brand */}
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-white truncate" data-testid={`text-product-title-${product.id}`}>
                          {product.title}
                        </h3>
                        <Badge variant="outline" className="text-xs">
                          {product.brand}
                        </Badge>
                        {product.changes.hasAnyChanges && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                            Değişim Var
                          </Badge>
                        )}
                      </div>

                      {/* Price and Stock Status */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-400">Fiyat:</span>
                          <span className="text-lg font-bold text-green-400" data-testid={`text-price-${product.id}`}>
                            {formatPrice(product.currentPrice)}
                          </span>
                          
                          {/* Price Change Indicator */}
                          {product.changes.price && (
                            <div className="flex items-center gap-1">
                              {product.changes.price.changeType === 'increase' ? (
                                <>
                                  <TrendingUp className="w-4 h-4 text-red-400" />
                                  <span className="text-xs text-red-400">
                                    +{product.changes.price.changePercentage}%
                                  </span>
                                </>
                              ) : product.changes.price.changeType === 'decrease' ? (
                                <>
                                  <TrendingDown className="w-4 h-4 text-green-400" />
                                  <span className="text-xs text-green-400">
                                    {product.changes.price.changePercentage}%
                                  </span>
                                </>
                              ) : (
                                <Minus className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-400">Stok:</span>
                          {product.stockStatus === 'in_stock' ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Mevcut
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Tükendi
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-300">
                            {product.variantCount} varyant
                          </span>
                        </div>
                      </div>

                      {/* Last Checked */}
                      <div className="mt-2 text-xs text-slate-500">
                        Son kontrol: {formatTimeAgo(product.lastChecked)}
                      </div>
                    </div>

                    {/* Expand Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(product.id)}
                      className="text-slate-400 hover:text-white"
                      data-testid={`button-expand-${product.id}`}
                    >
                      {expandedProducts.has(product.id) ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </Button>
                  </div>

                  {/* Expanded Details */}
                  {expandedProducts.has(product.id) && (
                    <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                      {/* Price Changes */}
                      {product.changes.price && (
                        <div className="bg-slate-700/30 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-amber-400 mb-2">💰 Fiyat Değişimi</h4>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-slate-400">Eski Fiyat:</span>
                              <div className="text-slate-300 font-medium">{formatPrice(product.changes.price.oldPrice)}</div>
                            </div>
                            <div>
                              <span className="text-slate-400">Yeni Fiyat:</span>
                              <div className="text-green-400 font-medium">{formatPrice(product.changes.price.newPrice)}</div>
                            </div>
                            <div>
                              <span className="text-slate-400">Değişim:</span>
                              <div className={`font-medium ${product.changes.price.changeType === 'increase' ? 'text-red-400' : 'text-green-400'}`}>
                                {product.changes.price.changePercentage}%
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Stock Changes */}
                      {product.changes.stock && (
                        <div className="bg-slate-700/30 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-blue-400 mb-2">📦 Stok Değişimi</h4>
                          <div className="text-sm">
                            <span className="text-slate-400">
                              {product.changes.stock.oldStock} → {product.changes.stock.newStock}
                            </span>
                            <Badge className="ml-2 text-xs">
                              {product.changes.stock.changeType}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* Variant Changes */}
                      {product.changes.variants && (
                        <div className="bg-slate-700/30 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-purple-400 mb-2">🎨 Varyant Değişimleri</h4>
                          <div className="flex gap-4 text-sm mb-2">
                            {product.changes.variants.addedCount > 0 && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                +{product.changes.variants.addedCount} Eklendi
                              </Badge>
                            )}
                            {product.changes.variants.removedCount > 0 && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                                -{product.changes.variants.removedCount} Çıkarıldı
                              </Badge>
                            )}
                            {product.changes.variants.stockChangedCount > 0 && (
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                {product.changes.variants.stockChangedCount} Stok Değişti
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            {product.changes.variants.changes.slice(0, 5).map((change, idx) => (
                              <div key={idx} className="text-xs text-slate-300">
                                {change.changeType === 'variant_added' && '➕ '}
                                {change.changeType === 'variant_removed' && '➖ '}
                                {change.changeType === 'variant_stock_changed' && '🔄 '}
                                {change.color} / {change.size}
                                {change.changeType === 'variant_stock_changed' && ` (${change.oldStockCount} → ${change.newStockCount})`}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Current Variants */}
                      {product.variants.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-300 mb-2">Mevcut Varyantlar</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {product.variants.map((variant) => (
                              <div key={variant.id} className="bg-slate-700/20 rounded p-2 text-xs">
                                <div className="font-medium text-slate-200">
                                  {variant.color} / {variant.size}
                                </div>
                                <div className="text-slate-400 mt-1">
                                  {formatPrice(variant.trendyolPrice)}
                                </div>
                                <div className={`mt-1 ${variant.inStock ? 'text-green-400' : 'text-red-400'}`}>
                                  {variant.inStock ? '✓ Stokta' : '✗ Tükendi'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-12 text-center">
              <Database className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">
                {showOnlyChanges ? 'Değişiklik olan ürün bulunamadı' : 'Henüz takip edilen ürün yok'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TrackingDashboard;
