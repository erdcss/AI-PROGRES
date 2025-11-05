import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Database, 
  TrendingUp, 
  DollarSign, 
  Package, 
  Trash2, 
  RefreshCw,
  Clock,
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Product {
  id: number;
  title: string;
  brand: string;
  trendyolUrl: string;
  shopifyProductId: string | null;
  currentPrice: string;
  stockStatus: string;
  lastChecked: string;
}

interface Stats {
  totalChanged: number;
  priceChanged: number;
  stockChanged: number;
}

export default function MemoryTrackingPage() {
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState('30');
  const [currentTime, setCurrentTime] = useState(new Date());
  const { toast } = useToast();

  // Saat güncelleme
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Toplam ürünleri al
  const { data: totalData, refetch: refetchTotal } = useQuery({
    queryKey: ['/api/memory/all-products'],
    queryFn: async () => {
      const res = await fetch('/api/memory/all-products?limit=1000');
      return res.json();
    },
    refetchInterval: autoRefresh && !showOnlyChanged ? parseInt(refreshInterval) * 1000 : false
  });

  // Değişen ürünleri al (stats için her zaman güncelle)
  const { data: changedData, refetch: refetchChanged } = useQuery({
    queryKey: ['/api/memory/changed-products'],
    queryFn: async () => {
      const res = await fetch('/api/memory/changed-products?hours=24');
      return res.json();
    },
    refetchInterval: autoRefresh ? parseInt(refreshInterval) * 1000 : false
  });

  const totalProducts = totalData?.pagination?.total || 0;
  const products: Product[] = showOnlyChanged 
    ? (changedData?.products || [])
    : (totalData?.products || []);
  const stats: Stats = changedData?.stats || { totalChanged: 0, priceChanged: 0, stockChanged: 0 };

  // Hafızayı temizle
  const handleClearMemory = async () => {
    try {
      // Double confirmation - "DELETE_ALL_DATA" gönder
      const response = await fetch('/api/memory/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirmation: 'DELETE_ALL_DATA' })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Clear failed');
      }
      
      toast({
        title: "Başarılı",
        description: "Hafıza başarıyla temizlendi",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/memory/all-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/memory/changed-products'] });
    } catch (error) {
      toast({
        title: "Hata",
        description: "Hafıza temizlenirken hata oluştu",
        variant: "destructive"
      });
    }
  };

  // Manuel yenileme
  const handleManualRefresh = () => {
    refetchTotal();
    refetchChanged();
    toast({
      title: "Yenilendi",
      description: "Veriler güncellendi",
    });
  };

  // Otomatik yenileme değiştiğinde
  useEffect(() => {
    if (autoRefresh) {
      toast({
        title: "Otomatik Yenileme Açık",
        description: `Her ${refreshInterval} saniyede bir yenilenecek`,
      });
    }
  }, [autoRefresh, refreshInterval]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Otomatik Takip Sistemi</h1>
          <p className="text-muted-foreground">Hafızadaki ürünler ve değişim takibi</p>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                data-testid="button-clear-memory"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Hafıza Temizle
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hafızayı Temizle</AlertDialogTitle>
                <AlertDialogDescription>
                  Tüm ürünler ve varyantlar silinecek. Bu işlem geri alınamaz!
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearMemory}>
                  Temizle
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button 
            variant="outline"
            onClick={handleManualRefresh}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>

          <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-md">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              {currentTime.toLocaleTimeString('tr-TR')}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-products">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Ürün</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-changed-products">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Değişen Ürün</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalChanged}</div>
            <p className="text-xs text-muted-foreground">Son 24 saat</p>
          </CardContent>
        </Card>

        <Card data-testid="card-price-changes">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fiyat Değişimi</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.priceChanged}</div>
            <p className="text-xs text-muted-foreground">Son 24 saat</p>
          </CardContent>
        </Card>

        <Card data-testid="card-variant-changes">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Varyant Değişimi</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.stockChanged}</div>
            <p className="text-xs text-muted-foreground">Son 24 saat</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Switch 
            id="show-changed" 
            checked={showOnlyChanged}
            onCheckedChange={setShowOnlyChanged}
            data-testid="switch-show-only-changed"
          />
          <Label htmlFor="show-changed" className="cursor-pointer">
            Sadece Değişenleri Göster
          </Label>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch 
              id="auto-refresh" 
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              data-testid="switch-auto-refresh"
            />
            <Label htmlFor="auto-refresh" className="cursor-pointer">
              Otomatik Yenileme
            </Label>
          </div>

          {autoRefresh && (
            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
              <SelectTrigger className="w-[130px]" data-testid="select-refresh-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 saniye</SelectItem>
                <SelectItem value="60">60 saniye</SelectItem>
                <SelectItem value="300">5 dakika</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Products Table */}
      <Card>
        <CardContent className="pt-6">
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Database className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">
                {showOnlyChanged 
                  ? "Son 24 saatte değişiklik yok" 
                  : "Henüz takip edilen ürün yok"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead>Fiyat</TableHead>
                  <TableHead>Stok Durumu</TableHead>
                  <TableHead>Shopify</TableHead>
                  <TableHead>Son Kontrol</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                    <TableCell className="font-medium max-w-xs truncate">
                      {product.title}
                    </TableCell>
                    <TableCell>{product.brand}</TableCell>
                    <TableCell className="font-semibold">
                      {parseFloat(product.currentPrice).toFixed(2)} TL
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={product.stockStatus === 'in_stock' ? 'default' : 'destructive'}
                      >
                        {product.stockStatus === 'in_stock' ? 'Stokta' : 'Stok Yok'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {product.shopifyProductId ? (
                        <Badge variant="outline">Aktarıldı</Badge>
                      ) : (
                        <Badge variant="secondary">Beklemede</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(product.lastChecked).toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(product.trendyolUrl, '_blank')}
                        data-testid={`button-open-${product.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
