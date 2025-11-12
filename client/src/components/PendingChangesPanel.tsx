import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Check, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  PackageMinus,
  PackagePlus,
  AlertTriangle,
  RefreshCw,
  CheckCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface PendingChange {
  id: number;
  productTitle: string;
  changeType: string;
  status: string;
  color?: string | null;
  size?: string | null;
  oldPrice?: string | null;
  newPrice?: string | null;
  priceChange?: string | null;
  priceChangePercent?: string | null;
  oldStock?: number | null;
  newStock?: number | null;
  stockChange?: number | null;
  createdAt: string;
  url?: string | null;
}

interface Summary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  byType: {
    price_increase: number;
    price_decrease: number;
    stock_out: number;
    stock_in: number;
    variant_added: number;
    variant_removed: number;
  };
}

export function PendingChangesPanel() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState('pending');
  const [selectedChanges, setSelectedChanges] = useState<number[]>([]);

  // Fetch pending changes
  const { data: changesData, isLoading, refetch } = useQuery<{
    success: boolean;
    changes: PendingChange[];
    pagination: { total: number };
  }>({
    queryKey: ['/api/pending-changes', selectedTab],
    queryFn: async () => {
      const res = await fetch(`/api/pending-changes?status=${selectedTab}&limit=100`);
      if (!res.ok) throw new Error('Failed to fetch changes');
      return res.json();
    },
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Fetch summary
  const { data: summaryData } = useQuery<{
    success: boolean;
    summary: Summary;
  }>({
    queryKey: ['/api/pending-changes/summary'],
    queryFn: async () => {
      const res = await fetch('/api/pending-changes/summary');
      if (!res.ok) throw new Error('Failed to fetch summary');
      return res.json();
    },
    refetchInterval: 10000
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/pending-changes/${id}/approve`, { approvedBy: 'admin' });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Değişiklik onaylandı",
        description: "Değişiklik başarıyla uygulandı ve Telegram bildirimi gönderildi"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pending-changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pending-changes/summary'] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Onay hatası",
        description: error.message || "Değişiklik onaylanırken hata oluştu",
        variant: "destructive"
      });
    }
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest('POST', '/api/pending-changes/bulk-approve', { ids, approvedBy: 'admin' });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: `✅ ${data.results.success} değişiklik onaylandı`,
        description: data.results.failed > 0 
          ? `${data.results.failed} değişiklik başarısız oldu`
          : "Tüm değişiklikler başarıyla uygulandı"
      });
      setSelectedChanges([]);
      queryClient.invalidateQueries({ queryKey: ['/api/pending-changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pending-changes/summary'] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Toplu onay hatası",
        description: error.message || "Toplu onay sırasında hata oluştu",
        variant: "destructive"
      });
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/pending-changes/${id}/reject`, { 
        rejectedBy: 'admin',
        rejectionReason: 'Manuel red'
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "❌ Değişiklik reddedildi",
        description: "Değişiklik reddedildi"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pending-changes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pending-changes/summary'] });
    }
  });

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'price_increase': return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'price_decrease': return <TrendingDown className="h-4 w-4 text-green-500" />;
      case 'stock_out': return <PackageMinus className="h-4 w-4 text-orange-500" />;
      case 'stock_in': return <PackagePlus className="h-4 w-4 text-blue-500" />;
      case 'variant_added': return <PackagePlus className="h-4 w-4 text-green-500" />;
      case 'variant_removed': return <PackageMinus className="h-4 w-4 text-red-500" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getChangeBadge = (changeType: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      price_increase: { label: 'Fiyat ↑', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
      price_decrease: { label: 'Fiyat ↓', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
      stock_out: { label: 'Stok Bitti', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
      stock_in: { label: 'Stokta', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
      variant_added: { label: 'Varyant +', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
      variant_removed: { label: 'Varyant -', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' }
    };
    const badge = badges[changeType] || { label: changeType, className: '' };
    return <Badge className={badge.className}>{badge.label}</Badge>;
  };

  const getChangeDetails = (change: PendingChange) => {
    switch (change.changeType) {
      case 'price_increase':
      case 'price_decrease':
        return (
          <div className="space-y-1">
            <div className="text-sm">
              <span className="text-muted-foreground line-through">{change.oldPrice} TL</span>
              {' → '}
              <span className="font-medium">{change.newPrice} TL</span>
            </div>
            {change.priceChange && (
              <div className={`text-xs font-medium ${change.changeType === 'price_increase' ? 'text-red-600' : 'text-green-600'}`}>
                {change.changeType === 'price_increase' ? '+' : ''}{change.priceChange} TL 
                {change.priceChangePercent && ` (${change.priceChangePercent}%)`}
              </div>
            )}
          </div>
        );
      case 'stock_out':
      case 'stock_in':
        return (
          <div className="text-sm">
            {change.oldStock !== null && change.newStock !== null ? (
              <>
                <span className="text-muted-foreground">{change.oldStock} adet</span>
                {' → '}
                <span className="font-medium">{change.newStock} adet</span>
              </>
            ) : (
              <span className="font-medium">{change.changeType === 'stock_out' ? 'Stokta yok' : 'Stokta var'}</span>
            )}
          </div>
        );
      case 'variant_added':
        return <div className="text-sm font-medium text-green-600">Yeni varyant eklendi</div>;
      case 'variant_removed':
        return <div className="text-sm font-medium text-red-600">Varyant kaldırıldı</div>;
      default:
        return null;
    }
  };

  const handleToggleChange = (id: number) => {
    setSelectedChanges(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleApproveSelected = () => {
    if (selectedChanges.length === 0) return;
    bulkApproveMutation.mutate(selectedChanges);
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Değişiklik Onay Paneli
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedChanges.length > 0 && (
              <Button
                size="sm"
                onClick={handleApproveSelected}
                disabled={bulkApproveMutation.isPending}
                data-testid="button-approve-selected"
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                {selectedChanges.length} Değişikliği Onayla
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
              data-testid="button-refresh-changes"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {summaryData?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-4">
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground">Bekleyen</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {summaryData.summary.pending}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground">Onaylanan</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {summaryData.summary.approved}
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground">Fiyat ↑</div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                {summaryData.summary.byType.price_increase}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground">Fiyat ↓</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {summaryData.summary.byType.price_decrease}
              </div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground">Stok Bitti</div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {summaryData.summary.byType.stock_out}
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2 text-center">
              <div className="text-xs text-muted-foreground">Toplam</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {summaryData.summary.total}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending" data-testid="tab-pending">
              Bekleyen ({summaryData?.summary.pending || 0})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              Onaylanan ({summaryData?.summary.approved || 0})
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              Reddedilen ({summaryData?.summary.rejected || 0})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value={selectedTab}>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Yükleniyor...</div>
            ) : (changesData?.changes.length || 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {selectedTab === 'pending' 
                  ? 'Bekleyen değişiklik yok' 
                  : selectedTab === 'approved' 
                    ? 'Onaylanmış değişiklik yok' 
                    : 'Reddedilmiş değişiklik yok'}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedTab === 'pending' && (
                        <TableHead className="w-12 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={selectedChanges.length === changesData?.changes.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedChanges(changesData?.changes.map(c => c.id) || []);
                              } else {
                                setSelectedChanges([]);
                              }
                            }}
                            className="rounded"
                          />
                        </TableHead>
                      )}
                      <TableHead className="text-sm font-medium">Tip</TableHead>
                      <TableHead className="text-sm font-medium">Ürün</TableHead>
                      <TableHead className="text-sm font-medium">Varyant</TableHead>
                      <TableHead className="text-sm font-medium">Değişiklik</TableHead>
                      <TableHead className="text-sm font-medium">Tarih</TableHead>
                      {selectedTab === 'pending' && <TableHead className="text-right text-sm font-medium">İşlem</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changesData?.changes.map((change) => (
                      <TableRow key={change.id} data-testid={`row-change-${change.id}`}>
                        {selectedTab === 'pending' && (
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedChanges.includes(change.id)}
                              onChange={() => handleToggleChange(change.id)}
                              className="rounded"
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {getChangeIcon(change.changeType)}
                            {getChangeBadge(change.changeType)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-sm max-w-xs truncate">
                          {change.productTitle}
                        </TableCell>
                        <TableCell className="text-sm">
                          {change.color || change.size ? (
                            <div className="space-y-0.5">
                              {change.color && <div className="font-medium text-sm">{change.color}</div>}
                              {change.size && <div className="text-xs text-muted-foreground">{change.size}</div>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{getChangeDetails(change)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(change.createdAt).toLocaleString('tr-TR')}
                        </TableCell>
                        {selectedTab === 'pending' && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => approveMutation.mutate(change.id)}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-${change.id}`}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectMutation.mutate(change.id)}
                                disabled={rejectMutation.isPending}
                                data-testid={`button-reject-${change.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
