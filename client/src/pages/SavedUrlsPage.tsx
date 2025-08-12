import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, Trash2, Clock, TrendingUp, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface SavedUrl {
  id: number;
  url: string;
  productTitle: string;
  brand: string;
  currentPrice: string;
  currency: string;
  status: string;
  isTracking: boolean;
  lastChecked: string;
  createdAt: string;
  checkCount?: number;
  searchRelevance?: number;
}

interface UrlStats {
  totalUrls: number;
  activeTracking: number;
  priceChangeCount: number;
  averagePrice: number;
  recentUrls: number;
}

export default function SavedUrlsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch saved URLs
  const { data: allUrls, isLoading: allLoading } = useQuery({
    queryKey: ['/api/saved-urls/all'],
    enabled: !debouncedQuery
  });

  // Search URLs
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['/api/saved-urls/search', debouncedQuery],
    enabled: !!debouncedQuery && debouncedQuery.length > 2
  });

  // Recent URLs
  const { data: recentUrls } = useQuery({
    queryKey: ['/api/saved-urls/recent'],
    select: (data) => data?.urls || []
  });

  // Popular URLs
  const { data: popularUrls } = useQuery({
    queryKey: ['/api/saved-urls/popular'],
    select: (data) => data?.urls || []
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['/api/saved-urls/stats'],
    select: (data) => data?.stats || {}
  });

  // Delete URL mutation
  const deleteMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch('/api/saved-urls/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!response.ok) throw new Error('Delete failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-urls'] });
      toast({ title: 'URL başarıyla silindi' });
    },
    onError: () => {
      toast({ title: 'URL silinemedi', variant: 'destructive' });
    }
  });

  const currentUrls = debouncedQuery 
    ? searchResults?.results || []
    : allUrls?.urls || [];

  const isLoading = debouncedQuery ? searchLoading : allLoading;

  const formatPrice = (price: string, currency: string) => {
    return `${parseFloat(price).toFixed(2)} ${currency}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string, isTracking: boolean) => {
    if (!isTracking) return 'secondary';
    switch (status) {
      case 'active': return 'default';
      case 'error': return 'destructive';
      default: return 'secondary';
    }
  };

  const extractProductFromUrl = (product: SavedUrl) => {
    return {
      title: product.productTitle,
      brand: product.brand,
      price: { original: parseFloat(product.currentPrice), currency: product.currency },
      url: product.url
    };
  };

  const handleExtractProduct = async (product: SavedUrl) => {
    try {
      // Extract product data
      const productData = extractProductFromUrl(product);
      
      // Navigate to extract page with URL
      window.location.href = `/?url=${encodeURIComponent(product.url)}`;
    } catch (error) {
      toast({ 
        title: 'Ürün çıkarma hatası', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col space-y-4">
        <h1 className="text-3xl font-bold">Kayıtlı Trendyol URL'leri</h1>
        
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-600">{stats.totalUrls}</div>
                <div className="text-sm text-gray-600">Toplam URL</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-600">{stats.activeTracking}</div>
                <div className="text-sm text-gray-600">Aktif Takip</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-orange-600">{stats.priceChangeCount}</div>
                <div className="text-sm text-gray-600">Fiyat Değişimi</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-purple-600">{stats.averagePrice.toFixed(0)}₺</div>
                <div className="text-sm text-gray-600">Ort. Fiyat</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-teal-600">{stats.recentUrls}</div>
                <div className="text-sm text-gray-600">Son 24 Saat</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Ürün adı, marka veya URL ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">
            Tümü ({allUrls?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="recent">
            <Clock className="w-4 h-4 mr-2" />
            Son Eklenenler
          </TabsTrigger>
          <TabsTrigger value="popular">
            <Star className="w-4 h-4 mr-2" />
            Popüler
          </TabsTrigger>
          <TabsTrigger value="tracking">
            <TrendingUp className="w-4 h-4 mr-2" />
            Takip Edilen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">Yükleniyor...</div>
          ) : currentUrls.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {debouncedQuery ? 'Arama sonucu bulunamadı' : 'Henüz kayıtlı URL yok'}
            </div>
          ) : (
            <div className="grid gap-4">
              {currentUrls.map((url: SavedUrl) => (
                <Card key={url.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-lg line-clamp-1">
                            {url.productTitle}
                          </h3>
                          {debouncedQuery && url.searchRelevance && (
                            <Badge variant="outline" className="text-xs">
                              Uygunluk: {url.searchRelevance}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-3 text-sm text-gray-600">
                          <span className="font-medium">{url.brand}</span>
                          <span className="text-lg font-bold text-green-600">
                            {formatPrice(url.currentPrice, url.currency)}
                          </span>
                          <Badge variant={getStatusColor(url.status, url.isTracking)}>
                            {url.isTracking ? 'Takip Ediliyor' : 'Pasif'}
                          </Badge>
                        </div>
                        
                        <div className="text-xs text-gray-500">
                          Son kontrol: {formatDate(url.lastChecked)} | 
                          Eklenme: {formatDate(url.createdAt)}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtractProduct(url)}
                          className="flex items-center space-x-1"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Çıkar</span>
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(url.url, '_blank')}
                          className="flex items-center space-x-1"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Aç</span>
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMutation.mutate(url.url)}
                          disabled={deleteMutation.isPending}
                          className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          {recentUrls?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Son eklenen URL yok
            </div>
          ) : (
            <div className="grid gap-4">
              {recentUrls?.map((url: SavedUrl) => (
                <Card key={url.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <h3 className="font-semibold text-lg line-clamp-1">
                          {url.productTitle}
                        </h3>
                        <div className="flex items-center space-x-3 text-sm text-gray-600">
                          <span className="font-medium">{url.brand}</span>
                          <span className="text-lg font-bold text-green-600">
                            {formatPrice(url.currentPrice, url.currency)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(url.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtractProduct(url)}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="popular" className="space-y-4">
          {popularUrls?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Popüler URL yok
            </div>
          ) : (
            <div className="grid gap-4">
              {popularUrls?.map((url: SavedUrl) => (
                <Card key={url.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <h3 className="font-semibold text-lg line-clamp-1">
                          {url.productTitle}
                        </h3>
                        <div className="flex items-center space-x-3 text-sm text-gray-600">
                          <span className="font-medium">{url.brand}</span>
                          <span className="text-lg font-bold text-green-600">
                            {formatPrice(url.currentPrice, url.currency)}
                          </span>
                          <Badge variant="secondary">
                            {url.checkCount} kontrol
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExtractProduct(url)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tracking" className="space-y-4">
          {currentUrls.filter((url: SavedUrl) => url.isTracking).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Takip edilen URL yok
            </div>
          ) : (
            <div className="grid gap-4">
              {currentUrls
                .filter((url: SavedUrl) => url.isTracking)
                .map((url: SavedUrl) => (
                  <Card key={url.id} className="hover:shadow-md transition-shadow border-green-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <h3 className="font-semibold text-lg line-clamp-1">
                            {url.productTitle}
                          </h3>
                          <div className="flex items-center space-x-3 text-sm text-gray-600">
                            <span className="font-medium">{url.brand}</span>
                            <span className="text-lg font-bold text-green-600">
                              {formatPrice(url.currentPrice, url.currency)}
                            </span>
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              Aktif Takip
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500">
                            Son kontrol: {formatDate(url.lastChecked)}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtractProduct(url)}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}