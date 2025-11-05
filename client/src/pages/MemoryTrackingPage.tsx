import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Activity,
  Database,
  Package,
  Search,
  ExternalLink,
  ShoppingCart,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ArrowLeft
} from 'lucide-react';
import { useLocation } from 'wouter';
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Shopify ürünleri
  const { data: shopifyData, refetch: refetchShopify, isLoading } = useQuery({
    queryKey: ['/api/memory/shopify-products', selectedCategory, searchQuery, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString(),
        category: selectedCategory,
        search: searchQuery
      });
      const res = await fetch(`/api/memory/shopify-products?${params}`);
      return res.json();
    }
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

  const shopifyProducts: ShopifyProduct[] = shopifyData?.products || [];
  const totalProducts = shopifyData?.pagination?.total || 0;
  const totalPages = Math.ceil(totalProducts / itemsPerPage);
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

  // Sayfa değiştirme
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Pagination butonları
  const renderPagination = () => {
    const pages = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="business-button"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {startPage > 1 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(1)}
              className="business-button"
            >
              1
            </Button>
            {startPage > 2 && <span className="text-white/50">...</span>}
          </>
        )}
        
        {pages.map((page) => (
          <Button
            key={page}
            variant={currentPage === page ? "default" : "outline"}
            size="sm"
            onClick={() => handlePageChange(page)}
            className={currentPage === page ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "business-button"}
          >
            {page}
          </Button>
        ))}
        
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="text-white/50">...</span>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(totalPages)}
              className="business-button"
            >
              {totalPages}
            </Button>
          </>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="business-button"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen business-bg p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => setLocation('/')}
              className="business-button"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Ana Sayfa
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Otomatik Takip Sistemi</h1>
              <p className="text-white/80">Shopify ürünlerinin analizi, takibi ve yönetimi</p>
            </div>
          </div>
          <Button 
            onClick={handleRefresh}
            className="business-button"
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Shopify Ürünleri</CardTitle>
                <Package className="h-5 w-5 text-indigo-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{totalProducts}</div>
              <p className="text-xs text-white/60 mt-1">Toplam takip edilen</p>
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Fiyat Değişimi</CardTitle>
                <Activity className="h-5 w-5 text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{changedStats.priceChanged}</div>
              <p className="text-xs text-white/60 mt-1">Son 24 saat</p>
            </CardContent>
          </Card>

          <Card className="business-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-white/80">Stok Değişimi</CardTitle>
                <Database className="h-5 w-5 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{changedStats.stockChanged}</div>
              <p className="text-xs text-white/60 mt-1">Son 24 saat</p>
            </CardContent>
          </Card>
        </div>

        {/* Ürün Listesi */}
        <Card className="business-card">
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div>
                <CardTitle className="text-white">Shopify Ürünleri</CardTitle>
                <p className="text-sm text-white/70 mt-1">
                  Toplam {totalProducts} ürün • Sayfa {currentPage} / {totalPages}
                </p>
              </div>
              
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                  <Input
                    placeholder="Ürün veya marka ara..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10 business-input"
                    data-testid="input-search"
                  />
                </div>
                
                <Select value={selectedCategory} onValueChange={(val) => {
                  setSelectedCategory(val);
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-full md:w-[200px] business-input" data-testid="select-category">
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
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : shopifyProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/60">
                <Package className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg">Henüz Shopify'da ürün yok</p>
                <p className="text-sm">Trendyol'dan ürün ekleyerek başlayın</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-900/30 border-white/10">
                        <TableHead className="font-semibold text-white/90">Ürün</TableHead>
                        <TableHead className="font-semibold text-white/90">Kategori</TableHead>
                        <TableHead className="font-semibold text-white/90">Fiyat</TableHead>
                        <TableHead className="font-semibold text-white/90">Varyantlar</TableHead>
                        <TableHead className="font-semibold text-white/90">Durum</TableHead>
                        <TableHead className="font-semibold text-white/90">Sync</TableHead>
                        <TableHead className="text-right font-semibold text-white/90">İşlemler</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shopifyProducts.map((product) => (
                        <TableRow key={product.id} className="hover:bg-blue-900/20 border-white/10" data-testid={`row-product-${product.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {product.images[0] && (
                                <img 
                                  src={product.images[0]} 
                                  alt={product.title}
                                  className="w-12 h-12 object-cover rounded border border-white/20"
                                />
                              )}
                              <div>
                                <div className="font-medium text-white max-w-xs truncate">{product.title}</div>
                                <div className="text-sm text-white/60">{product.brand}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {product.category ? (
                              <Badge variant="outline" className="bg-blue-900/30 text-white/80 border-white/20">
                                {product.category}
                              </Badge>
                            ) : (
                              <span className="text-white/40 text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold text-white">
                            {parseFloat(product.currentPrice).toFixed(2)} TL
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Badge variant="secondary" className="text-xs bg-indigo-900/40 text-indigo-200 border-indigo-400/30">
                                {product.colorOptions.length} Renk
                              </Badge>
                              <Badge variant="secondary" className="text-xs bg-emerald-900/40 text-emerald-200 border-emerald-400/30">
                                {product.sizeOptions.length} Beden
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={product.stockStatus === 'in_stock' ? 'default' : 'destructive'}
                              className={product.stockStatus === 'in_stock' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600'}
                            >
                              {product.stockStatus === 'in_stock' ? 'Stokta' : 'Yok'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={product.syncStatus === 'synced' ? 'default' : 'secondary'}
                              className={product.syncStatus === 'synced' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600/80 text-white'}
                            >
                              {product.syncStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLocation(`/product-statistics/${product.id}`)}
                                className="hover:bg-blue-700/50 text-white/80 hover:text-white"
                                data-testid={`button-statistics-${product.id}`}
                                title="İstatistikleri Görüntüle"
                              >
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(product.trendyolUrl, '_blank')}
                                className="hover:bg-amber-700/50 text-white/80 hover:text-white"
                                data-testid={`button-trendyol-${product.id}`}
                                title="Trendyol'da Görüntüle"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              {product.shopifyUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(product.shopifyUrl!, '_blank')}
                                  className="hover:bg-emerald-700/50 text-white/80 hover:text-white"
                                  data-testid={`button-shopify-${product.id}`}
                                  title="Shopify'da Görüntüle"
                                >
                                  <ShoppingCart className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && renderPagination()}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
