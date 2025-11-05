import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Activity,
  Database,
  TrendingUp,
  Package,
  Search,
  ExternalLink,
  ShoppingCart,
  Bell,
  CheckCircle,
  Clock,
  AlertCircle,
  Shield,
  Zap,
  BarChart3,
  RefreshCw
} from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';

interface ShopifyProduct {
  id: number;
  title: string;
  brand: string;
  category: string | null;
  shopifyProductId: string;
  shopifyUrl: string | null;
  trendyolUrl: string;
  currentPrice: string;
  stockStatus: string;
  syncStatus: string;
  lastSyncAt: string | null;
  lastChecked: string | null;
  images: string[];
  colorOptions: string[];
  sizeOptions: string[];
}

export default function MemoryTrackingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { toast } = useToast();

  // Shopify ürünleri
  const { data: shopifyData, refetch: refetchShopify } = useQuery({
    queryKey: ['/api/memory/shopify-products', selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '100',
        category: selectedCategory,
        search: searchQuery
      });
      const res = await fetch(`/api/memory/shopify-products?${params}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 30000 : false
  });

  // Kategoriler
  const { data: categoriesData } = useQuery({
    queryKey: ['/api/memory/categories'],
    queryFn: async () => {
      const res = await fetch('/api/memory/categories');
      return res.json();
    }
  });

  // Değişen ürünler
  const { data: changedData } = useQuery({
    queryKey: ['/api/memory/changed-products'],
    queryFn: async () => {
      const res = await fetch('/api/memory/changed-products?hours=24');
      return res.json();
    },
    refetchInterval: 30000
  });

  // Sync status
  const { data: syncStatusData } = useQuery({
    queryKey: ['/api/memory/sync-status'],
    queryFn: async () => {
      const res = await fetch('/api/memory/sync-status');
      return res.json();
    },
    refetchInterval: 30000
  });

  const shopifyProducts: ShopifyProduct[] = shopifyData?.products || [];
  const categories: string[] = categoriesData?.categories || [];
  const changedStats = changedData?.stats || { totalChanged: 0, priceChanged: 0, stockChanged: 0 };

  // Manuel yenileme
  const handleRefresh = () => {
    refetchShopify();
    toast({
      title: "Yenilendi",
      description: "Veriler güncellendi",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="text-white">
            <h1 className="text-3xl font-bold mb-2">Otomatik Takip Sistemi</h1>
            <p className="text-blue-200">Shopify ürünlerinin analizi, takibi ve yönetimi</p>
          </div>
          <Button 
            onClick={handleRefresh}
            variant="secondary"
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>

        {/* Ana Grid - 2 Kolon */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Panel - Sistem Analiz Alanı */}
          <div className="lg:col-span-2 space-y-4">
            {/* Otomatik Takip Sistemi Card */}
            <Card className="bg-white/95 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Activity className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Otomatik Takip Sistemi</CardTitle>
                      <p className="text-sm text-muted-foreground">Ürün fiyat izleme ve Shopify senkronizasyonu</p>
                    </div>
                  </div>
                  <Badge variant="default" className="bg-green-500">
                    AKTİF
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{shopifyProducts.length}</div>
                    <div className="text-xs text-muted-foreground">Shopify Ürünleri</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{changedStats.priceChanged}</div>
                    <div className="text-xs text-muted-foreground">Fiyat Değişimi</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{changedStats.stockChanged}</div>
                    <div className="text-xs text-muted-foreground">Stok Değişimi</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sistem Durumu Card */}
            <Card className="bg-white/95 backdrop-blur">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Database className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Sistem Durumu</CardTitle>
                    <p className="text-sm text-muted-foreground">Anlık sistem ve veritabanı durumu</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Veritabanı Bağlantısı</span>
                  <Badge variant="default" className="bg-green-500">Aktif</Badge>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Shopify Senkronizasyon</span>
                  <Badge variant="default" className="bg-green-500">Çalışıyor</Badge>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Telegram Bildirimleri</span>
                  <Badge variant="default" className="bg-green-500">Aktif</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sağ Panel - Hızlı Erişim Alanı */}
          <div className="space-y-4">
            <Card className="bg-white/95 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-base">Hızlı Erişim Alanı</CardTitle>
                <p className="text-xs text-muted-foreground">Sık kullanılan sistem araçları</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Shield className="h-4 w-4 mr-2" />
                  Replit Agent
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  S.O.S Kontrol
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Clock className="h-4 w-4 mr-2" />
                  Zamanlı Görevler
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Shopify Ürünleri
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Bell className="h-4 w-4 mr-2" />
                  Telegram Bildirimleri
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Ürün Listesi */}
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div>
                <CardTitle>Shopify Ürünleri</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Toplam {shopifyProducts.length} ürün takip ediliyor
                </p>
              </div>
              
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ürün veya marka ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full md:w-[200px]" data-testid="select-category">
                    <SelectValue placeholder="Kategori Seç" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Kategoriler</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {shopifyProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg">Henüz Shopify'da ürün yok</p>
                <p className="text-sm">Trendyol'dan ürün ekleyerek başlayın</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Fiyat</TableHead>
                      <TableHead>Varyantlar</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Sync</TableHead>
                      <TableHead className="text-right">İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shopifyProducts.map((product) => (
                      <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {product.images[0] && (
                              <img 
                                src={product.images[0]} 
                                alt={product.title}
                                className="w-12 h-12 object-cover rounded"
                              />
                            )}
                            <div>
                              <div className="font-medium max-w-xs truncate">{product.title}</div>
                              <div className="text-sm text-muted-foreground">{product.brand}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {product.category ? (
                            <Badge variant="outline">{product.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {parseFloat(product.currentPrice).toFixed(2)} TL
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Badge variant="secondary" className="text-xs">
                              {product.colorOptions.length} Renk
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {product.sizeOptions.length} Beden
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={product.stockStatus === 'in_stock' ? 'default' : 'destructive'}
                          >
                            {product.stockStatus === 'in_stock' ? 'Stokta' : 'Yok'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={product.syncStatus === 'synced' ? 'default' : 'secondary'}
                            className={product.syncStatus === 'synced' ? 'bg-green-500' : ''}
                          >
                            {product.syncStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {product.shopifyUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(product.shopifyUrl!, '_blank')}
                                data-testid={`button-shopify-${product.id}`}
                              >
                                <ShoppingCart className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(product.trendyolUrl, '_blank')}
                              data-testid={`button-trendyol-${product.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
