import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Play, Square, RotateCcw, Eye, Download, Upload, Search, ExternalLink, Package, ShoppingBag, TrendingUp } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TrackingStatus {
  isRunning: boolean;
  intervalMinutes: number;
  lastCheck: string;
}

interface MemoryProduct {
  id: number;
  title: string;
  brand: string;
  trendyolUrl: string;
  sourcePlatform: string;
  shopifyProductId: string | null;
  shopifyUrl: string | null;
  currentPrice: string;
  originalPrice: string;
  stockStatus: string;
  isActive: boolean;
  createdAt: string;
  lastChecked: string;
  images: string[];
}

export default function MemoryTrackingPage() {
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const limit = 20;

  const { data: productsData, refetch: refetchProducts } = useQuery({
    queryKey: ['/api/memory/all-products', currentPage, limit],
    queryFn: async () => {
      const offset = currentPage * limit;
      const response = await fetch(`/api/memory/all-products?limit=${limit}&offset=${offset}&sortBy=createdAt&sortOrder=desc`);
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    enabled: true
  });

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/memory-tracking/status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Status alma hatası:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory-tracking/start', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sistem Başlatıldı",
          description: "Hafıza takip sistemi çalışmaya başladı"
        });
        await fetchStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory-tracking/stop', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sistem Durduruldu",
          description: "Hafıza takip sistemi durduruldu"
        });
        await fetchStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualCheck = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory-tracking/manual-check', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Manuel Kontrol",
          description: "Hafıza kontrolü başlatıldı, sonuçlar Telegram'dan bildirilecek"
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/memory/export-products');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Başarılı",
        description: "Ürün verileri dışa aktarıldı"
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "Dışa aktarma başarısız",
        variant: "destructive"
      });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const response = await fetch('/api/memory/import-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Başarılı",
          description: `${result.summary.importedProducts} ürün ve ${result.summary.importedVariants} varyant içe aktarıldı`
        });
        refetchProducts();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredProducts = productsData?.products?.filter((product: MemoryProduct) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.title.toLowerCase().includes(query) ||
      product.brand.toLowerCase().includes(query)
    );
  }) || [];

  const totalProducts = productsData?.pagination?.total || 0;
  const hasMore = productsData?.pagination?.hasMore || false;

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Otomatik Takip Sistemi</h1>
          <p className="text-muted-foreground mt-2">
            Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleExport}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-export-products"
          >
            <Download className="h-4 w-4" />
            Dışa Aktar
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-import-products"
          >
            <Upload className="h-4 w-4" />
            İçe Aktar
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalProducts}</div>
                <div className="text-sm text-muted-foreground">Toplam Ürün</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <ShoppingBag className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {filteredProducts.filter((p: MemoryProduct) => p.shopifyProductId).length}
                </div>
                <div className="text-sm text-muted-foreground">Shopify'da</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {status?.isRunning ? 'Aktif' : 'Pasif'}
                </div>
                <div className="text-sm text-muted-foreground">Takip Durumu</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Eye className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-sm font-medium">
                  {status && status.lastCheck 
                    ? new Date(status.lastCheck).toLocaleTimeString('tr-TR')
                    : "—"
                  }
                </div>
                <div className="text-xs text-muted-foreground">Son Kontrol</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sistem Kontrolleri */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Sistem Kontrolleri
          </CardTitle>
          <CardDescription>
            Otomatik takip sistemini başlatın, durdurun veya manuel kontrol yapın
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={handleStart}
              disabled={loading || status?.isRunning}
              className="flex items-center gap-2"
              data-testid="button-start-tracking"
            >
              <Play className="h-4 w-4" />
              Sistemi Başlat
            </Button>

            <Button 
              onClick={handleStop}
              disabled={loading || !status?.isRunning}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-stop-tracking"
            >
              <Square className="h-4 w-4" />
              Sistemi Durdur
            </Button>

            <Button 
              onClick={handleManualCheck}
              disabled={loading}
              variant="secondary"
              className="flex items-center gap-2"
              data-testid="button-manual-check"
            >
              <RotateCcw className="h-4 w-4" />
              Manuel Kontrol
            </Button>
            
            {status && (
              <Badge variant={status.isRunning ? "default" : "secondary"} className="ml-auto">
                {status.isRunning ? "Çalışıyor" : "Durduruldu"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ürün Listesi */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sistem Hafızasındaki Ürünler</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-products"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead>Fiyat</TableHead>
                  <TableHead>Stok</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Shopify</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz ürün yok'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product: MemoryProduct) => (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <TableCell className="font-medium max-w-xs truncate">
                        {product.title}
                      </TableCell>
                      <TableCell>{product.brand}</TableCell>
                      <TableCell className="font-semibold text-green-600">
                        {parseFloat(product.currentPrice).toFixed(2)} TL
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.stockStatus === 'in_stock' ? 'default' : 'secondary'}>
                          {product.stockStatus === 'in_stock' ? 'Stokta' : 'Tükendi'}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{product.sourcePlatform}</TableCell>
                      <TableCell>
                        {product.shopifyProductId ? (
                          <Badge variant="default" className="bg-green-600">Aktarıldı</Badge>
                        ) : (
                          <Badge variant="outline">Bekliyor</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {product.trendyolUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(product.trendyolUrl, '_blank')}
                              data-testid={`link-source-${product.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          {product.shopifyUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(product.shopifyUrl, '_blank')}
                              data-testid={`link-shopify-${product.id}`}
                            >
                              <ShoppingBag className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          
          {/* Pagination */}
          {filteredProducts.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Gösterilen: {filteredProducts.length} / {totalProducts}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  data-testid="button-prev-page"
                >
                  Önceki
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={!hasMore}
                  data-testid="button-next-page"
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
