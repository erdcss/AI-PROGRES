import { useState, useEffect, useMemo } from 'react';
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
  Layers,
  Wifi,
  WifiOff,
  Edit,
  Save,
  X,
  Trash2,
  Link2,
  Bell,
  BellOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useLocation } from 'wouter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { queryClient, handleApiResponse, APIRequestError, apiRequest } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PendingChangesPanel } from '@/components/PendingChangesPanel';
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
} from '@/components/ui/alert-dialog';

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
  sourceUrl: string | null;
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
  const [editingPrice, setEditingPrice] = useState<{ [key: number]: string }>({});
  const [tempPrices, setTempPrices] = useState<{ [key: number]: string }>({});
  const [editingUrl, setEditingUrl] = useState<{ [key: number]: boolean }>({});
  const [tempUrls, setTempUrls] = useState<{ [key: number]: string }>({});
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);

  const { isConnected, subscribe, unsubscribe } = useWebSocket({ autoConnect: true });

  // Shop domain for Shopify admin links
  const { data: shopifyConfig } = useQuery<{ shopDomain: string }>({
    queryKey: ['/api/shopify/config'],
    queryFn: async () => {
      const res = await fetch('/api/shopify/config');
      if (!res.ok) return { shopDomain: '' };
      return res.json();
    },
    staleTime: Infinity,
  });
  const shopDomain = shopifyConfig?.shopDomain || '';

  // Products
  const { data: productsData, refetch: refetchProducts, isLoading } = useQuery<{
    success: boolean;
    products: ShopifyMemoryProduct[];
    pagination: PaginationInfo;
  }>({
    queryKey: ['/api/shopify/products', selectedCategory, searchQuery, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString(),
      });
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);
      if (searchQuery?.trim()) params.append('search', searchQuery.trim());
      const res = await fetch(`/api/shopify/products?${params}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    staleTime: 30000,
  });

  // Categories
  const { data: categoriesData } = useQuery<{ success: boolean; categories: string[] }>({
    queryKey: ['/api/shopify/categories'],
    queryFn: async () => {
      const res = await fetch('/api/shopify/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
  });

  // Statistics
  const { data: statisticsData } = useQuery<{ success: boolean; statistics: ShopifyStatistics }>({
    queryKey: ['/api/shopify/statistics'],
    queryFn: async () => {
      const res = await fetch('/api/shopify/statistics');
      if (!res.ok) throw new Error('Failed to fetch statistics');
      return res.json();
    },
  });

  // Failover stats
  const { data: failoverStats } = useQuery<{
    success: boolean;
    statistics: { total: number; healthy: number; degraded: number; unhealthy: number; failover: number };
  }>({
    queryKey: ['/api/failover/statistics'],
    queryFn: async () => {
      const res = await fetch('/api/failover/statistics');
      if (!res.ok) throw new Error('Failed to fetch failover stats');
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Tracking status - build Set of tracked shopifyProductIds
  const { data: trackingData } = useQuery<{
    success: boolean;
    tracked: Array<{ shopifyProductId: string | null; isTracking: boolean; url: string }>;
    stats: { total: number; active: number; paused: number };
  }>({
    queryKey: ['/api/tracking/all'],
    queryFn: async () => {
      const res = await fetch('/api/tracking/all');
      if (!res.ok) throw new Error('Failed to fetch tracking data');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const trackedShopifyIds = useMemo(() => {
    const set = new Set<string>();
    trackingData?.tracked?.forEach((t) => {
      if (t.shopifyProductId && t.isTracking) set.add(t.shopifyProductId);
    });
    return set;
  }, [trackingData]);

  const trackingStats = trackingData?.stats;

  // ─── Mutations ────────────────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/shopify/sync-products', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/statistics'] });
      const parts: string[] = [];
      if (data.newProducts > 0) parts.push(`${data.newProducts} yeni`);
      if (data.updatedProducts > 0) parts.push(`${data.updatedProducts} güncellenen`);
      if (data.deletedProducts > 0) parts.push(`${data.deletedProducts} silinen`);
      toast({ title: '✅ Senkronizasyon Tamamlandı', description: parts.length ? parts.join(', ') + ' ürün' : `${data.totalProducts} ürün senkronize edildi` });
    },
    onError: (error: any) => toast({ title: 'Senkronizasyon Hatası', description: error.message, variant: 'destructive' }),
  });

  const comprehensiveCleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/pending-changes/comprehensive-cleanup', {});
      return res.json();
    },
    onSuccess: (data: any) => {
      const s = data.stats;
      if (s.error) { toast({ title: '⚠️ Temizlik İptal', description: s.error, variant: 'destructive' }); return; }
      const parts = [`${s.deletedProducts} ürün`, `${s.deletedVariants} varyant`, `${s.deletedPendingChanges} değişiklik silindi`];
      if (s.disabledTrackers > 0) parts.push(`${s.disabledTrackers} takip durduruldu`);
      if (s.reEnabledTrackers > 0) parts.push(`${s.reEnabledTrackers} takip yeniden başlatıldı`);
      toast({ title: '✅ Temizlik Tamamlandı', description: parts.join(', ') });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/statistics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pending-changes'] });
    },
    onError: (error: any) => toast({ title: '❌ Temizlik Hatası', description: error.message, variant: 'destructive' }),
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ shopifyProductId, newPrice }: { shopifyProductId: string; newPrice: string }) => {
      const res = await fetch('/api/shopify/update-price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopifyProductId, newPrice }) });
      if (!res.ok) throw new Error('Price update failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      toast({ title: 'Fiyat Güncellendi', description: data.message });
      setEditingPrice({});
      setTempPrices({});
    },
    onError: (error: any) => toast({ title: 'Güncelleme Hatası', description: error.message, variant: 'destructive' }),
  });

  const updateUrlMutation = useMutation({
    mutationFn: async ({ shopifyProductId, sourceUrl }: { shopifyProductId: string; sourceUrl: string }) => {
      try {
        const res = await fetch('/api/shopify/update-source-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopifyProductId, sourceUrl: sourceUrl.trim() }) });
        return await handleApiResponse(res);
      } catch (error) {
        if (error instanceof APIRequestError) throw error;
        throw new APIRequestError('Bağlantı hatası.', undefined, 'network');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      toast({ title: 'URL Güncellendi', description: data.message || 'URL başarıyla güncellendi' });
      setEditingUrl({});
      setTempUrls({});
    },
    onError: (error: any) => toast({ title: 'Güncelleme Hatası', description: error instanceof APIRequestError ? error.message : 'Beklenmeyen hata', variant: 'destructive' }),
  });

  const bulkTrackingMutation = useMutation({
    mutationFn: async (productIds: number[]) => {
      const res = await fetch('/api/tracking/bulk-add-shopify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds }) });
      if (!res.ok) throw new Error('Bulk tracking failed');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: '✅ İzleme Başlatıldı', description: `${data.successCount} ürün izlemeye eklendi` });
      setSelectedProducts([]);
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/all'] });
    },
    onError: (error: any) => toast({ title: 'İzleme Hatası', description: error.message, variant: 'destructive' }),
  });

  const bulkTrackingAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tracking/bulk-add-shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all', filters: { category: selectedCategory !== 'all' ? selectedCategory : undefined, search: searchQuery.trim() || undefined } }),
      });
      if (!res.ok) throw new Error('Bulk tracking all failed');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: '✅ Toplu İzleme Başlatıldı', description: `${data.successCount} ürün izlemeye eklendi${data.errorCount > 0 ? ` (${data.errorCount} hata)` : ''}`, duration: 8000 });
      setSelectedProducts([]);
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/all'] });
    },
    onError: (error: any) => toast({ title: 'İzleme Hatası', description: error.message, variant: 'destructive' }),
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tracking/reconcile-shopify-ids', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error('Reconcile failed');
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: '✅ Takip Bağlantısı Tamamlandı', description: data.message || `${data.fixed} takip Shopify ile eşleştirildi`, duration: 8000 });
      queryClient.invalidateQueries({ queryKey: ['/api/tracking/all'] });
    },
    onError: (error: any) => toast({ title: 'Bağlantı Hatası', description: error.message, variant: 'destructive' }),
  });

  // ─── Derived state ────────────────────────────────────────────────────────
  const products = productsData?.products || [];
  const pagination = productsData?.pagination || { total: 0, totalPages: 0, currentPage: 1 };
  const categories = categoriesData?.categories || [];
  const statistics = statisticsData?.statistics;

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const toggleProductSelection = (productId: number) =>
    setSelectedProducts((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));

  const toggleSelectAll = () =>
    setSelectedProducts(selectedProducts.length === products.length ? [] : products.map((p) => p.id));

  const handleBulkTracking = () => {
    if (selectedProducts.length === 0) { toast({ title: 'Uyarı', description: 'Lütfen izlenecek ürünleri seçin', variant: 'destructive' }); return; }
    bulkTrackingMutation.mutate(selectedProducts);
  };

  const handleRefresh = () => { refetchProducts(); toast({ title: 'Yenilendi', description: 'Ürünler güncellendi' }); };
  const handleSearch = (value: string) => { setSearchQuery(value); setCurrentPage(1); };
  const handleCategoryChange = (value: string) => { setSelectedCategory(value); setCurrentPage(1); };
  const handlePageChange = (page: number) => { if (page >= 1 && page <= pagination.totalPages) { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  const openShopifyAdmin = (shopifyId: string) => {
    const url = shopDomain
      ? `https://${shopDomain}/admin/products/${shopifyId}`
      : `https://admin.shopify.com/products/${shopifyId}`;
    window.open(url, '_blank');
  };

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    subscribe('shopify:new-product', (d) => {
      if (d?.product?.title) {
        toast({ title: '🆕 Yeni Ürün Eklendi', description: `${d.product.title} - ${d.product.price || ''} TL`, duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
        queryClient.invalidateQueries({ queryKey: ['/api/shopify/statistics'] });
      }
    });
    subscribe('shopify:price-change', (d) => {
      if (d?.title) {
        const emoji = (d.change || 0) > 0 ? '📈' : '📉';
        toast({ title: `${emoji} Fiyat Değişimi`, description: `${d.title}: ${d.oldPrice} → ${d.newPrice} TL (${(d.changePercent || 0) > 0 ? '+' : ''}${d.changePercent || 0}%)`, duration: 7000 });
        queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tracking/all'] });
      }
    });
    subscribe('shopify:stock-change', (d) => {
      if (d?.title) {
        const emoji = d.newStock === 0 ? '🚫' : '📦';
        toast({ title: `${emoji} Stok Değişimi`, description: `${d.title}: ${d.oldStock} → ${d.newStock} (${(d.change || 0) > 0 ? '+' : ''}${d.change || 0})`, duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      }
    });
    subscribe('shopify:status-change', (d) => {
      if (d?.title && d?.oldStatus && d?.newStatus) {
        toast({ title: '🔄 Durum Değişimi', description: `${d.title}: ${d.oldStatus} → ${d.newStatus}`, duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      }
    });
    subscribe('shopify:sync-complete', (d) => {
      const hasChanges = (d?.newProducts || 0) > 0 || (d?.changes || 0) > 0;
      toast({ title: '✅ Senkronizasyon Tamamlandı', description: hasChanges ? `${d.newProducts} yeni, ${d.changes} değişiklik` : 'Tüm ürünler güncel', duration: 5000 });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shopify/statistics'] });
    });
    subscribe('shopify:failover-activated', (d) => {
      toast({ title: '🔄 Yedek Sistem Devrede', description: `Ana sistem sorun yaşadı - ${d?.newStrategy || 'alternatif'} stratejisine geçildi`, duration: 8000 });
      queryClient.invalidateQueries({ queryKey: ['/api/failover/statistics'] });
    });
    subscribe('shopify:failover-recovered', () => {
      toast({ title: '✅ Ana Sistem Geri Döndü', description: 'Sistem normal moda döndü', duration: 6000 });
      queryClient.invalidateQueries({ queryKey: ['/api/failover/statistics'] });
    });
    return () => {
      ['shopify:new-product', 'shopify:price-change', 'shopify:stock-change', 'shopify:status-change',
        'shopify:sync-complete', 'shopify:failover-activated', 'shopify:failover-recovered'].forEach(unsubscribe);
    };
  }, [subscribe, unsubscribe, toast]);

  // ─── Pagination ────────────────────────────────────────────────────────────
  const renderPagination = () => {
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
    const pages: number[] = [];
    for (let i = startPage; i <= endPage; i++) pages.push(i);

    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="business-button">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {startPage > 1 && (<><Button variant="outline" size="sm" onClick={() => handlePageChange(1)} className="business-button">1</Button>{startPage > 2 && <span className="text-white/50">...</span>}</>)}
        {pages.map((page) => (
          <Button key={page} variant={currentPage === page ? 'default' : 'outline'} size="sm" onClick={() => handlePageChange(page)} className={currentPage === page ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'business-button'}>
            {page}
          </Button>
        ))}
        {endPage < pagination.totalPages && (<>{endPage < pagination.totalPages - 1 && <span className="text-white/50">...</span>}<Button variant="outline" size="sm" onClick={() => handlePageChange(pagination.totalPages)} className="business-button">{pagination.totalPages}</Button></>)}
        <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === pagination.totalPages} className="business-button">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  // ─── Category display helper ────────────────────────────────────────────────
  const getCategoryDisplay = (product: ShopifyMemoryProduct) => {
    const cat = product.productType || product.category;
    if (!cat || cat === 'Kategorisiz' || cat === 'N/A') return null;
    return cat;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen business-bg p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button onClick={() => setLocation('/')} className="business-button" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Ana Sayfa
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Shopify Ürün Yönetimi</h1>
              <p className="text-white/60 text-sm">Shopify mağazanızdaki tüm ürünler ve istatistikler</p>
            </div>
          </div>

          {/* Action buttons — right side */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Seçili ürünler için izleme */}
            {selectedProducts.length > 0 && (
              <Button onClick={handleBulkTracking} disabled={bulkTrackingMutation.isPending} className="bg-green-600 hover:bg-green-700" size="sm">
                <Bell className="h-4 w-4 mr-1" />
                {bulkTrackingMutation.isPending ? 'Ekleniyor...' : `İzle (${selectedProducts.length})`}
              </Button>
            )}

            {/* Tümünü izlemeye ekle */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={bulkTrackingAllMutation.isPending || (pagination?.total || 0) === 0} className="bg-blue-600 hover:bg-blue-700" size="sm">
                  <Layers className="h-4 w-4 mr-1" />
                  {bulkTrackingAllMutation.isPending ? 'Ekleniyor...' : 'Tümünü İzle'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-800 border-slate-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Tüm Ürünleri İzlemeye Ekle</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-300">
                    <span className="font-semibold text-blue-400">{pagination?.total || 0} ürün</span> izlemeye eklenecek.
                    {selectedCategory !== 'all' && <span className="block mt-1 text-sm">📁 Kategori: <span className="font-medium">{selectedCategory}</span></span>}
                    {searchQuery && <span className="block mt-1 text-sm">🔍 Arama: <span className="font-medium">{searchQuery}</span></span>}
                    <span className="block mt-3 text-sm text-amber-400">⚡ Fiyat/stok değişimlerinde Telegram bildirimi gönderilecek.</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600">İptal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => bulkTrackingAllMutation.mutate()} className="bg-blue-600 hover:bg-blue-700">Onayla</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Takipleri Bağla */}
            <Button onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending} className="bg-purple-600 hover:bg-purple-700" size="sm" title="Eksik Shopify ID bağlantılarını düzelt">
              <Link2 className="h-4 w-4 mr-1" />
              {reconcileMutation.isPending ? 'Bağlanıyor...' : 'Takip Bağla'}
            </Button>

            {/* Senkronize Et */}
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700" size="sm">
              {syncMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Database className="h-4 w-4 mr-1" />}
              {syncMutation.isPending ? 'Senkronize...' : 'Senkronize Et'}
            </Button>

            {/* Temizle */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={comprehensiveCleanupMutation.isPending} className="bg-red-600 hover:bg-red-700" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Temizle
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-800 border-slate-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Kapsamlı Temizlik</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-300">
                    Shopify'da OLMAYAN tüm ürünler veritabanından silinecek. Varyantlar, fiyat geçmişi ve değişiklikler de silinecek.
                    <br /><br /><span className="font-semibold text-red-400">Bu işlem geri alınamaz!</span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600">İptal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => comprehensiveCleanupMutation.mutate()} className="bg-red-600 hover:bg-red-700">Temizle</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Yenile */}
            <Button onClick={handleRefresh} className="business-button" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Yenile
            </Button>

            {/* Bağlantı durumu */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm font-medium ${isConnected ? 'bg-green-900/30 border-green-500/40 text-green-400' : 'bg-red-900/30 border-red-500/40 text-red-400'}`}>
              {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isConnected ? 'Canlı' : 'Offline'}
            </div>
          </div>
        </div>

        {/* ── İzleme Durumu Özeti ── */}
        {trackingStats && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-700">
            <Bell className="h-4 w-4 text-indigo-400 shrink-0" />
            <span className="text-white/80 text-sm">
              <span className="font-semibold text-white">{trackingStats.active}</span> ürün aktif olarak izleniyor
              <span className="text-white/40 mx-2">•</span>
              <span className="text-white/60">{trackingStats.total} toplam takip kaydı</span>
              {trackingStats.paused > 0 && <><span className="text-white/40 mx-2">•</span><span className="text-amber-400">{trackingStats.paused} duraklatılmış</span></>}
            </span>
            <span className="ml-auto text-xs text-white/40">Fiyat/stok değişimlerinde Telegram bildirimi gönderilir</span>
          </div>
        )}

        {/* ── İstatistik Kartları ── */}
        {statistics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="business-card">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-white/70">Toplam Ürün</CardTitle>
                  <Package className="h-4 w-4 text-indigo-400" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-bold text-white">{statistics.totalProducts}</div>
                <p className="text-xs text-white/50 mt-0.5">Shopify mağazasında</p>
              </CardContent>
            </Card>

            <Card className="business-card">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-white/70">Envanter Değeri</CardTitle>
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-bold text-white">
                  {products.reduce((sum, p) => sum + ((parseFloat(p.minPrice) + parseFloat(p.maxPrice)) / 2) * p.totalVariants, 0)
                    .toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TL
                </div>
                <p className="text-xs text-white/50 mt-0.5">{products.reduce((s, p) => s + p.totalVariants, 0)} varyant</p>
              </CardContent>
            </Card>

            <Card className="business-card">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-white/70">En Çok Kategori</CardTitle>
                  <Layers className="h-4 w-4 text-purple-400" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-lg font-bold text-white truncate">
                  {statistics.topCategories[0]?.category && statistics.topCategories[0].category !== 'Kategorisiz'
                    ? statistics.topCategories[0].category
                    : statistics.topCategories[1]?.category || '—'}
                </div>
                <p className="text-xs text-white/50 mt-0.5">{statistics.topCategories[0]?.count || 0} ürün</p>
              </CardContent>
            </Card>

            <Card className="business-card">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-white/70">En Çok Marka</CardTitle>
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-lg font-bold text-white truncate">{statistics.topVendors[0]?.vendor || '—'}</div>
                <p className="text-xs text-white/50 mt-0.5">{statistics.topVendors[0]?.count || 0} ürün</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Yedek İzleme Sistemi ── */}
        {failoverStats?.statistics && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-white/80 flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              Yedek İzleme Sistemi Durumu
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Sağlıklı', value: failoverStats.statistics.healthy, color: 'text-green-400', border: 'border-green-500/30', icon: <Wifi className="h-4 w-4 text-green-400" />, desc: 'Ana sistem aktif' },
                { label: 'Yavaş', value: failoverStats.statistics.degraded, color: 'text-yellow-400', border: 'border-yellow-500/30', icon: <Activity className="h-4 w-4 text-yellow-400" />, desc: 'Performans düşük' },
                { label: 'Sorunlu', value: failoverStats.statistics.unhealthy, color: 'text-orange-400', border: 'border-orange-500/30', icon: <AlertCircle className="h-4 w-4 text-orange-400" />, desc: 'Hata alıyor' },
                { label: 'Yedek Mod', value: failoverStats.statistics.failover, color: 'text-blue-400', border: 'border-blue-500/30', icon: <RefreshCw className="h-4 w-4 text-blue-400" />, desc: 'Alternatif strateji' },
              ].map((item) => (
                <Card key={item.label} className={`business-card ${item.border}`}>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-medium text-white/70">{item.label}</CardTitle>
                      {item.icon}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                    <p className="text-xs text-white/50 mt-0.5">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {failoverStats.statistics.failover > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-sm text-blue-300 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  <strong>{failoverStats.statistics.failover}</strong> ürün yedek sistemi kullanıyor. Ana sistem sorununda otomatik geçiş yapıldı.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Arama & Filtre ── */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              placeholder="Ürün ara..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 bg-slate-800/60 border-slate-700 text-white placeholder:text-white/40 h-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-full md:w-56 bg-slate-800/60 border-slate-700 text-white h-10">
              <SelectValue placeholder="Kategori seçin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Kategoriler</SelectItem>
              {categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* ── Ürün Tablosu ── */}
        <Card className="business-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-400" />
                Shopify Ürünleri
                {selectedCategory !== 'all' && <Badge className="bg-indigo-600 text-xs">{selectedCategory}</Badge>}
              </CardTitle>
              <span className="text-sm text-white/50">{pagination.total} ürün · Sayfa {currentPage}/{pagination.totalPages || 1}</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
                <span className="text-white/60">Ürünler yükleniyor...</span>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Package className="h-12 w-12 text-white/20" />
                <p className="text-white/60">{searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz ürün yok — Senkronize Et butonuna tıklayın'}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-800/80 border-white/10 hover:bg-slate-800/80">
                        <TableHead className="w-10 pl-4">
                          <input type="checkbox" checked={products.length > 0 && selectedProducts.length === products.length} onChange={toggleSelectAll} className="rounded accent-indigo-500" />
                        </TableHead>
                        <TableHead className="text-white/80 font-semibold">Ürün</TableHead>
                        <TableHead className="text-white/80 font-semibold">Marka</TableHead>
                        <TableHead className="text-white/80 font-semibold">Kategori</TableHead>
                        <TableHead className="text-white/80 font-semibold">Fiyat (TL)</TableHead>
                        <TableHead className="text-white/80 font-semibold">Varyant</TableHead>
                        <TableHead className="text-white/80 font-semibold">Durum</TableHead>
                        <TableHead className="text-white/80 font-semibold">İzleme</TableHead>
                        <TableHead className="text-white/80 font-semibold">Trendyol URL</TableHead>
                        <TableHead className="text-white/80 font-semibold text-right pr-4">İşlemler</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product) => {
                        const isTracked = trackedShopifyIds.has(product.shopifyId);
                        const catDisplay = getCategoryDisplay(product);
                        return (
                          <TableRow key={product.id} className="hover:bg-slate-800/40 border-white/5 transition-colors">
                            <TableCell className="w-10 pl-4">
                              <input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={() => toggleProductSelection(product.id)} className="rounded accent-indigo-500" />
                            </TableCell>

                            {/* Ürün adı */}
                            <TableCell className="font-medium text-white max-w-[200px]">
                              <span className="truncate block" title={product.title}>{product.title}</span>
                            </TableCell>

                            {/* Marka */}
                            <TableCell className="text-white/70 text-sm">{product.vendor || '—'}</TableCell>

                            {/* Kategori */}
                            <TableCell>
                              {catDisplay ? (
                                <Badge variant="outline" className="border-indigo-500/50 text-indigo-300 text-xs">{catDisplay}</Badge>
                              ) : (
                                <span className="text-white/30 text-xs italic">—</span>
                              )}
                            </TableCell>

                            {/* Fiyat (düzenlenebilir) */}
                            <TableCell>
                              {editingPrice[product.id] ? (
                                <div className="flex items-center gap-1">
                                  <Input type="number" step="0.01" value={tempPrices[product.id] || product.minPrice} onChange={(e) => setTempPrices((p) => ({ ...p, [product.id]: e.target.value }))} className="w-20 h-7 bg-slate-800 border-slate-600 text-white text-sm px-2" />
                                  <Button size="sm" variant="ghost" onClick={() => updatePriceMutation.mutate({ shopifyProductId: product.shopifyId, newPrice: tempPrices[product.id] || product.minPrice })} disabled={updatePriceMutation.isPending} className="h-7 w-7 p-0 text-green-400 hover:text-green-300"><Save className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setEditingPrice((p) => { const n = { ...p }; delete n[product.id]; return n; }); setTempPrices((p) => { const n = { ...p }; delete n[product.id]; return n; }); }} className="h-7 w-7 p-0 text-red-400 hover:text-red-300"><X className="h-3.5 w-3.5" /></Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span className="text-white font-semibold text-sm">{product.minPrice === product.maxPrice ? product.minPrice : `${product.minPrice}–${product.maxPrice}`}</span>
                                  <Button size="sm" variant="ghost" onClick={() => { setEditingPrice((p) => ({ ...p, [product.id]: 'editing' })); setTempPrices((p) => ({ ...p, [product.id]: product.minPrice })); }} className="h-6 w-6 p-0 text-blue-400/60 hover:text-blue-300"><Edit className="h-3 w-3" /></Button>
                                </div>
                              )}
                            </TableCell>

                            {/* Varyant sayısı */}
                            <TableCell className="text-white/60 text-sm">{product.totalVariants}</TableCell>

                            {/* Durum */}
                            <TableCell>
                              <Badge className={product.status === 'active' ? 'bg-emerald-700/80 text-emerald-200 text-xs' : 'bg-gray-700 text-gray-300 text-xs'}>
                                {product.status === 'active' ? 'Aktif' : product.status}
                              </Badge>
                            </TableCell>

                            {/* İzleme durumu */}
                            <TableCell>
                              {isTracked ? (
                                <div className="flex items-center gap-1 text-xs text-green-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>İzleniyor</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-xs text-white/30">
                                  <BellOff className="h-3.5 w-3.5" />
                                  <span>Pasif</span>
                                </div>
                              )}
                            </TableCell>

                            {/* Trendyol URL (düzenlenebilir) */}
                            <TableCell>
                              {editingUrl[product.id] ? (
                                <div className="flex items-center gap-1">
                                  <Input type="text" placeholder="https://www.trendyol.com/..." value={tempUrls[product.id] ?? product.sourceUrl ?? ''} onChange={(e) => setTempUrls((p) => ({ ...p, [product.id]: e.target.value }))} className="w-52 h-7 bg-slate-800 border-slate-600 text-white text-xs px-2" />
                                  <Button size="sm" variant="ghost" onClick={() => { const u = tempUrls[product.id] ?? product.sourceUrl ?? ''; if (!u.trim()) { toast({ title: 'Hata', description: 'Geçerli bir URL girin', variant: 'destructive' }); return; } updateUrlMutation.mutate({ shopifyProductId: product.shopifyId, sourceUrl: u }); }} disabled={updateUrlMutation.isPending} className="h-7 w-7 p-0 text-green-400 hover:text-green-300"><Save className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setEditingUrl((p) => { const n = { ...p }; delete n[product.id]; return n; }); setTempUrls((p) => { const n = { ...p }; delete n[product.id]; return n; }); }} className="h-7 w-7 p-0 text-red-400 hover:text-red-300"><X className="h-3.5 w-3.5" /></Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 max-w-[180px]">
                                  {product.sourceUrl ? (
                                    <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-xs truncate hover:underline" title={product.sourceUrl}>
                                      {product.sourceUrl.replace('https://www.trendyol.com', '').substring(0, 28)}...
                                    </a>
                                  ) : (
                                    <span className="text-white/30 text-xs italic">URL yok</span>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => { setEditingUrl((p) => ({ ...p, [product.id]: true })); setTempUrls((p) => ({ ...p, [product.id]: product.sourceUrl || '' })); }} className="h-6 w-6 p-0 shrink-0 text-blue-400/60 hover:text-blue-300"><Edit className="h-3 w-3" /></Button>
                                </div>
                              )}
                            </TableCell>

                            {/* İşlemler */}
                            <TableCell className="text-right pr-4">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openShopifyAdmin(product.shopifyId)} className="h-7 px-2 text-white/50 hover:text-white hover:bg-blue-900/40 text-xs" title="Shopify Admin">
                                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                  Shopify
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { const url = product.sourceUrl; if (url) { window.open(url, '_blank'); } else { toast({ title: 'URL Bulunamadı', description: 'Trendyol URL\'si yok', variant: 'destructive' }); } }} className="h-7 px-2 text-orange-400/70 hover:text-orange-300 hover:bg-orange-900/30 text-xs" title="Trendyol'da Aç">
                                  <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                                  Trendyol
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {pagination.totalPages > 1 && renderPagination()}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Kategori & Marka Detayları ── */}
        {statistics && (statistics.topCategories.length > 0 || statistics.topVendors.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="business-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">En Çok Ürün İçeren Kategoriler</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {statistics.topCategories.filter((c) => c.category !== 'Kategorisiz').slice(0, 6).map((cat, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-white/70 text-sm flex-1 truncate" title={cat.category}>{cat.category}</span>
                      <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (cat.count / statistics.totalProducts) * 100)}%` }} />
                      </div>
                      <span className="text-white text-sm font-medium w-8 text-right">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="business-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">En Çok Ürün Sunan Markalar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {statistics.topVendors.slice(0, 6).map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-white/70 text-sm flex-1 truncate" title={v.vendor}>{v.vendor}</span>
                      <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (v.count / statistics.totalProducts) * 100)}%` }} />
                      </div>
                      <span className="text-white text-sm font-medium w-8 text-right">{v.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Bekleyen Değişiklikler ── */}
        <PendingChangesPanel />
      </div>
    </div>
  );
}
