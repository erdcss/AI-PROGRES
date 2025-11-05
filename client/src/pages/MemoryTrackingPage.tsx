import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Layers
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
import { queryClient } from '@/lib/queryClient';

interface ShopifyMemoryProduct {
  id: number;
  shopifyId: string;
  title: string;
  handle: string;
  vendor: string | null;
  productType: string | null;
  category: string | null;
  tags: string | null;
  status: string;
  totalVariants: number;
  totalImages: number;
  minPrice: string;
  maxPrice: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  totalPages: number;
  currentPage: number;
}

interface ShopifyStatistics {
  totalProducts: number;
  averagePrice: string;
  minPrice: string;
  maxPrice: string;
  topCategories: Array<{ category: string; count: number }>;
  topVendors: Array<{ vendor: string; count: number }>;
}

export default function MemoryTrackingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Shopify ürünlerini çek
  const { data: productsData, refetch: refetchProducts, isLoading } = useQuery<{
    success: boolean;
    products: ShopifyMemoryProduct[];
    pagination: PaginationInfo;
  }>({
    queryKey: ['/api/shopify/products', selectedCategory, searchQuery, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString()
      });
      
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      
      if (searchQuery && searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const res = await fetch(`/api/shopify/products?${params}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    staleTime: 30000
  });

  // Kategorileri çek
  const { data: categoriesData } = useQuery<{
    success: boolean;
    categories: string[];
  }>({
    queryKey: ['/api/shopify/categories'],
    queryFn: async () => {
      const res = await fetch('/api/shopify/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    }
  });

  // İstatistikleri çek
  const { data: statisticsData } = useQuery<{
    success: boolean;
    statistics: ShopifyStatistics;
  }>({
    queryKey: ['/api/shopify/statistics'],
    queryFn: async () => {
      const res = await fetch('/api/shopify/statistics');
      if (!res.ok) throw new Error('Failed to fetch statistics');
      return res.json();
    }
  });

  // Shopify senkronizasyon mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/shopify/sync-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/statistics'] });
      
      toast({
        title: "Shopify Senkronizasyonu Tamamlandı",
        description: `${data.totalProducts} ürün senkronize edildi`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Senkronizasyon Hatası",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const products = productsData?.products || [];
  const pagination = productsData?.pagination || { total: 0, totalPages: 0, currentPage: 1 };
  const categories = categoriesData?.categories || [];
  const statistics = statisticsData?.statistics;

  // Manuel yenileme
  const handleRefresh = () => {
    refetchProducts();
    toast({
      title: "Yenilendi",
      description: "Ürünler güncellendi",
    });
  };

  // Shopify senkronizasyonu
  const handleShopifySync = () => {
    syncMutation.mutate();
  };

  // Sayfa değiştirme
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Arama
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  // Kategori değiştirme
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  // Pagination butonları
  const renderPagination = () => {
    const pages = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxVisible - 1);
    
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
          data-testid="button-prev-page"
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
              data-testid="button-page-1"
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
            data-testid={`button-page-${page}`}
          >
            {page}
          </Button>
        ))}
        
        {endPage < pagination.totalPages && (
          <>
            {endPage < pagination.totalPages - 1 && <span className="text-white/50">...</span>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.totalPages)}
              className="business-button"
              data-testid={`button-page-${pagination.totalPages}`}
            >
              {pagination.totalPages}
            </Button>
          </>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === pagination.totalPages}
          className="business-button"
          data-testid="button-next-page"
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
              <h1 className="text-3xl font-bold text-white mb-2">Shopify Ürün Yönetimi</h1>
              <p className="text-white/80">Shopify mağazanızdaki tüm ürünler ve istatistikler</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleShopifySync}
              disabled={syncMutation.isPending}
              className="business-button bg-green-600 hover:bg-green-700"
              data-testid="button-sync-shopify"
            >
              {syncMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Senkronize ediliyor...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Shopify'dan Çek
                </>
              )}
            </Button>
            <Button 
              onClick={handleRefresh}
              className="business-button"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Yenile
            </Button>
          </div>
        </div>

        {/* İstatistik Kartları */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="business-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-white/80">Toplam Ürün</CardTitle>
                  <Package className="h-5 w-5 text-indigo-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white" data-testid="text-total-products">
                  {statistics.totalProducts}
                </div>
                <p className="text-xs text-white/60 mt-1">Shopify mağazasında</p>
              </CardContent>
            </Card>

            <Card className="business-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-white/80">Ortalama Fiyat</CardTitle>
                  <DollarSign className="h-5 w-5 text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white" data-testid="text-avg-price">
                  {statistics.averagePrice} TL
                </div>
                <p className="text-xs text-white/60 mt-1">{statistics.minPrice} - {statistics.maxPrice} TL arası</p>
              </CardContent>
            </Card>

            <Card className="business-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-white/80">En Çok Kategori</CardTitle>
                  <Layers className="h-5 w-5 text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-white" data-testid="text-top-category">
                  {statistics.topCategories[0]?.category || 'N/A'}
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {statistics.topCategories[0]?.count || 0} ürün
                </p>
              </CardContent>
            </Card>

            <Card className="business-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-white/80">En Çok Marka</CardTitle>
                  <TrendingUp className="h-5 w-5 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-white" data-testid="text-top-vendor">
                  {statistics.topVendors[0]?.vendor || 'N/A'}
                </div>
                <p className="text-xs text-white/60 mt-1">
                  {statistics.topVendors[0]?.count || 0} ürün
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filtreleme ve Arama */}
        <Card className="business-card">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                <Input
                  placeholder="Ürün ara..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-white/50"
                  data-testid="input-search"
                />
              </div>
              <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-full md:w-[250px] bg-slate-800/50 border-slate-700 text-white" data-testid="select-category">
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kategoriler</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Ürün Listesi */}
        <Card className="business-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">
                Shopify Ürünleri
                {selectedCategory !== 'all' && (
                  <Badge className="ml-2 bg-indigo-600">{selectedCategory}</Badge>
                )}
              </CardTitle>
              <div className="text-sm text-white/60">
                {pagination.total} ürün • Sayfa {currentPage}/{pagination.totalPages}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-12 w-12 mx-auto mb-4 text-indigo-400 animate-spin" />
                <p className="text-white/80">Ürünler yükleniyor...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-16 w-16 mx-auto mb-4 text-white/30" />
                <p className="text-white/80 text-lg mb-2">Ürün bulunamadı</p>
                <p className="text-white/60 text-sm">
                  {searchQuery ? 'Farklı bir arama terimi deneyin' : 'Shopify\'dan ürün çekmek için yukarıdaki butonu kullanın'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-900/30 border-white/10 hover:bg-blue-900/30">
                        <TableHead className="font-semibold text-white/90">Ürün</TableHead>
                        <TableHead className="font-semibold text-white/90">Marka</TableHead>
                        <TableHead className="font-semibold text-white/90">Kategori</TableHead>
                        <TableHead className="font-semibold text-white/90">Fiyat</TableHead>
                        <TableHead className="font-semibold text-white/90">Varyant</TableHead>
                        <TableHead className="font-semibold text-white/90">Durum</TableHead>
                        <TableHead className="font-semibold text-white/90 text-right">İşlemler</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product) => (
                        <TableRow key={product.id} className="hover:bg-blue-900/20 border-white/10">
                          <TableCell className="font-medium text-white max-w-xs truncate" data-testid={`text-product-${product.id}`}>
                            {product.title}
                          </TableCell>
                          <TableCell className="text-white/80">{product.vendor || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-indigo-500/50 text-indigo-300">
                              {product.productType || product.category || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-white font-semibold">
                            {product.minPrice === product.maxPrice 
                              ? `${product.minPrice} TL`
                              : `${product.minPrice} - ${product.maxPrice} TL`
                            }
                          </TableCell>
                          <TableCell className="text-white/70">{product.totalVariants} adet</TableCell>
                          <TableCell>
                            <Badge className={product.status === 'active' ? 'bg-emerald-600' : 'bg-gray-600'}>
                              {product.status === 'active' ? 'Aktif' : product.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(`https://${process.env.SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '')}/admin/products/${product.shopifyId}`, '_blank')}
                                className="text-white/70 hover:text-white hover:bg-blue-900/30"
                                data-testid={`button-view-${product.id}`}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Shopify
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && renderPagination()}
              </>
            )}
          </CardContent>
        </Card>

        {/* Kategori ve Marka Detayları */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="business-card">
              <CardHeader>
                <CardTitle className="text-white">En Çok Ürün İçeren Kategoriler</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {statistics.topCategories.slice(0, 5).map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-white/80">{cat.category}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500"
                            style={{ width: `${(cat.count / statistics.totalProducts) * 100}%` }}
                          />
                        </div>
                        <span className="text-white font-semibold w-12 text-right">{cat.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="business-card">
              <CardHeader>
                <CardTitle className="text-white">En Çok Ürün Sunan Markalar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {statistics.topVendors.slice(0, 5).map((vendor, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-white/80">{vendor.vendor}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500"
                            style={{ width: `${(vendor.count / statistics.totalProducts) * 100}%` }}
                          />
                        </div>
                        <span className="text-white font-semibold w-12 text-right">{vendor.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
