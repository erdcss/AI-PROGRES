import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, ShoppingBag, Database, ExternalLink, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  handle: string;
  status: string;
  created_at: string;
  updated_at: string;
  tags: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  compare_at_price?: string;
}

interface ShopifyImage {
  id: number;
  src: string;
  alt: string;
  position: number;
}

interface SyncResult {
  matched: number;
  unmatched: number;
  orphaned: number;
  details: {
    matchedProducts: any[];
    unmatchedDb: any[];
    orphanedShopify: ShopifyProduct[];
  };
}

export default function ShopifyProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState('products');
  const isMobile = useIsMobile();

  // Test Shopify connection
  const { data: connectionStatus, isLoading: connectionLoading } = useQuery({
    queryKey: ['shopify', 'connection'],
    queryFn: async () => {
      const response = await fetch('/api/shopify/test-connection');
      return response.json();
    }
  });

  // Fetch Shopify products
  const { data: shopifyData, isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['shopify', 'products'],
    enabled: connectionStatus?.success
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/shopify/sync-database', {
        method: 'POST'
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Eşleştirme Tamamlandı",
        description: `${data.matched} eşleşme, ${data.unmatched} eşleşmeyen, ${data.orphaned} yalnız ürün bulundu`
      });
      queryClient.invalidateQueries({ queryKey: ['shopify', 'products'] });
    },
    onError: (error: any) => {
      toast({
        title: "Eşleştirme Hatası",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Refresh products mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/shopify/refresh-products', {
        method: 'POST'
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Ürünler Güncellendi",
        description: `${data.refresh.updated} ürün güncellendi, ${data.refresh.errors} hata`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Güncelleme Hatası",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Sync results are now managed by mutation state directly
  // No need for a separate disabled query that never refetches

  const formatPrice = (price: string | undefined | null) => {
    if (!price || price === 'undefined' || price === 'null') {
      return 'Fiyat yok';
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) {
      return 'Fiyat yok';
    }
    return numPrice.toFixed(2) + ' TL';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className={`mx-auto space-y-6 ${
      isMobile ? 'px-4 py-4 max-w-full' : 'container px-6 py-6'
    }`}>
      <div className={`flex items-center ${
        isMobile ? 'flex-col gap-4' : 'justify-between'
      }`}>
        <div className={`${isMobile ? 'text-center' : ''}`}>
          <h1 className={`font-bold ${
            isMobile ? 'text-2xl leading-tight' : 'text-3xl'
          }`}>Shopify Ürün Yönetimi</h1>
          <p className={`text-muted-foreground ${
            isMobile ? 'text-sm mt-2' : ''
          }`}>
            Shopify mağazanızdaki ürünleri görüntüleyin ve hafızadaki ürünlerle eşleştirin
          </p>
        </div>
        
        <div className={`flex items-center ${
          isMobile ? 'flex-wrap gap-3 justify-center' : 'gap-3'
        }`}>
          {connectionStatus && (
            <Badge 
              variant={connectionStatus.success ? "default" : "destructive"}
              className="flex items-center gap-1"
            >
              {connectionStatus.success ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              {connectionStatus.success ? 'Bağlı' : 'Bağlantı Hatası'}
            </Badge>
          )}
          
          <Button 
            onClick={() => refetchProducts()}
            disabled={productsLoading}
            size={isMobile ? "default" : "sm"}
            className={isMobile ? 'h-12 px-4' : ''}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${productsLoading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {!connectionStatus?.success && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Shopify bağlantısı kurulamadı. API anahtarlarınızı kontrol edin.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className={`grid w-full ${
          isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-3'
        }`}>
          <TabsTrigger value="products">
            <ShoppingBag className="w-4 h-4 mr-2" />
            Shopify Ürünleri
            {shopifyData?.count && (
              <Badge variant="secondary" className="ml-2">
                {shopifyData.count}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sync">
            <Database className="w-4 h-4 mr-2" />
            Eşleştirme
          </TabsTrigger>
          <TabsTrigger value="refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Güncelleme
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          {productsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Shopify ürünleri yükleniyor...
            </div>
          ) : (
            <div className={`grid gap-4 ${
              isMobile ? 'grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-3'
            }`}>
              {shopifyData?.products?.map((product: ShopifyProduct) => (
                <Card key={product.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className={`${
                    isMobile ? 'pb-3 p-4' : 'pb-3'
                  }`}>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-medium line-clamp-2">
                        {product.title}
                      </CardTitle>
                      <Badge 
                        variant="secondary" 
                        className={`ml-2 ${getStatusColor(product.status)} shrink-0`}
                      >
                        {product.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {product.vendor || 'Vendor yok'}
                      {product.product_type && product.product_type !== '' && ` • ${product.product_type}`}
                      {(!product.product_type || product.product_type === '') && product.tags && product.tags !== '' && ` • ${product.tags.split(',')[0]?.trim() || ''}`}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    {product.images?.[0] && (
                      <img 
                        src={product.images[0].src} 
                        alt={product.images[0].alt}
                        className="w-full h-32 object-cover rounded-md"
                      />
                    )}
                    
                    <div className="space-y-2">
                      {product.product_type && product.product_type !== '' && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Kategori:</span>
                          <span className="font-medium text-xs">{product.product_type}</span>
                        </div>
                      )}
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Varyant:</span>
                        <span>{product.variants?.length || 0} adet</span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Fiyat:</span>
                        <span className="font-medium text-green-600">
                          {formatPrice(product.variants?.[0]?.price)}
                        </span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Güncelleme:</span>
                        <span className="text-xs">{formatDate(product.updated_at)}</span>
                      </div>
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => {
                        const shopDomain = import.meta.env.VITE_SHOPIFY_SHOP_DOMAIN || 'your-shop.myshopify.com';
                        window.open(`https://${shopDomain}/admin/products/${product.id}`, '_blank');
                      }}
                    >
                      <ExternalLink className="w-3 h-3 mr-2" />
                      Shopify'da Aç
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ürün Eşleştirme</CardTitle>
              <CardDescription>
                Shopify ürünlerini hafızadaki ürünlerle eşleştirin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="mb-4"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 mr-2" />
                )}
                Eşleştirme Başlat
              </Button>

              {syncMutation.data && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-green-600">
                        {syncMutation.data.matched}
                      </CardTitle>
                      <CardDescription>Eşleşen Ürün</CardDescription>
                    </CardHeader>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-yellow-600">
                        {syncMutation.data.unmatched}
                      </CardTitle>
                      <CardDescription>Eşleşmeyen DB Ürünü</CardDescription>
                    </CardHeader>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg text-blue-600">
                        {syncMutation.data.orphaned}
                      </CardTitle>
                      <CardDescription>Yalnız Shopify Ürünü</CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refresh" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ürün Güncelleme</CardTitle>
              <CardDescription>
                Eşleştirilen ürünlerin kaynak sitelerinden güncel fiyat ve stok bilgilerini çekin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                className="mb-4"
              >
                {refreshMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Ürünleri Güncelle
              </Button>

              {refreshMutation.data && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-green-600">
                          {refreshMutation.data.refresh.updated}
                        </CardTitle>
                        <CardDescription>Güncellenen Ürün</CardDescription>
                      </CardHeader>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-red-600">
                          {refreshMutation.data.refresh.errors}
                        </CardTitle>
                        <CardDescription>Hata Olan Ürün</CardDescription>
                      </CardHeader>
                    </Card>
                  </div>

                  {refreshMutation.data.refresh.details?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Güncelleme Detayları:</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {refreshMutation.data.refresh.details.map((detail: any, index: number) => (
                          <div 
                            key={index}
                            className="flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                          >
                            <span className="truncate">{detail.product.productTitle}</span>
                            <div className="flex items-center gap-2">
                              {detail.success ? (
                                <>
                                  <Badge variant="outline" className="text-xs">
                                    {detail.newPrice} TL
                                  </Badge>
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                </>
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}