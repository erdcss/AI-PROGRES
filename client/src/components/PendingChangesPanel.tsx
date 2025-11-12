import { useState, useMemo } from 'react';
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
  CheckCheck,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface PendingChange {
  id: number;
  productId: number | null;
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
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

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
              <span className="text-slate-500 dark:text-slate-400 line-through">{change.oldPrice} TL</span>
              {' → '}
              <span className="font-medium text-slate-900 dark:text-slate-100">{change.newPrice} TL</span>
            </div>
            {change.priceChange && (
              <div className={`text-xs font-medium ${change.changeType === 'price_increase' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
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
                <span className="text-slate-500 dark:text-slate-400">{change.oldStock} adet</span>
                {' → '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{change.newStock} adet</span>
              </>
            ) : (
              <span className="font-medium text-slate-900 dark:text-slate-100">{change.changeType === 'stock_out' ? 'Stokta yok' : 'Stokta var'}</span>
            )}
          </div>
        );
      case 'variant_added':
        return <div className="text-sm font-medium text-green-600 dark:text-green-400">Yeni varyant eklendi</div>;
      case 'variant_removed':
        return <div className="text-sm font-medium text-red-600 dark:text-red-400">Varyant kaldırıldı</div>;
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

  const toggleProductExpansion = (productId: number) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      const key = `product-${productId}`;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Smart filtering: Only show critical changes
  const CRITICAL_CHANGE_TYPES = ['price_increase', 'price_decrease', 'stock_out', 'variant_removed'];
  
  // Group variant changes by productId (stable identifier) with smart filtering
  const groupedChanges = useMemo(() => {
    if (!changesData?.changes) return { grouped: [], individual: [] };

    // Filter to only critical changes
    const criticalChanges = changesData.changes.filter(change => 
      CRITICAL_CHANGE_TYPES.includes(change.changeType)
    );

    const variantChangesByProductId = new Map<number, PendingChange[]>();
    const nonVariantChanges: PendingChange[] = [];

    criticalChanges.forEach(change => {
      const isVariantChange = change.changeType === 'variant_removed';
      
      if (isVariantChange && change.productId) {
        const existing = variantChangesByProductId.get(change.productId) || [];
        existing.push(change);
        variantChangesByProductId.set(change.productId, existing);
      } else {
        nonVariantChanges.push(change);
      }
    });

    // Convert grouped variants to array
    const groupedVariants = Array.from(variantChangesByProductId.entries()).map(([productId, changes]) => ({
      productId,
      productTitle: changes[0].productTitle,
      changes,
      isGroup: true
    }));

    return {
      grouped: groupedVariants,
      individual: nonVariantChanges
    };
  }, [changesData]);

  return (
    <Card className="mt-6 bg-slate-800 dark:bg-slate-900 border-slate-700">
      <CardHeader className="bg-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
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
            <div className="bg-slate-700 rounded-lg p-2 text-center border border-slate-600">
              <div className="text-xs text-slate-300">Bekleyen</div>
              <div className="text-2xl font-bold text-blue-400">
                {summaryData.summary.pending}
              </div>
            </div>
            <div className="bg-slate-700 rounded-lg p-2 text-center border border-slate-600">
              <div className="text-xs text-slate-300">Onaylanan</div>
              <div className="text-2xl font-bold text-green-400">
                {summaryData.summary.approved || 0}
              </div>
            </div>
            <div className="bg-slate-700 rounded-lg p-2 text-center border border-slate-600">
              <div className="text-xs text-slate-300">Fiyat ↑</div>
              <div className="text-2xl font-bold text-red-400">
                {summaryData.summary.byType.price_increase || 0}
              </div>
            </div>
            <div className="bg-slate-700 rounded-lg p-2 text-center border border-slate-600">
              <div className="text-xs text-slate-300">Fiyat ↓</div>
              <div className="text-2xl font-bold text-green-400">
                {summaryData.summary.byType.price_decrease || 0}
              </div>
            </div>
            <div className="bg-slate-700 rounded-lg p-2 text-center border border-slate-600">
              <div className="text-xs text-slate-300">Stok Bitti</div>
              <div className="text-2xl font-bold text-orange-400">
                {summaryData.summary.byType.stock_out || 0}
              </div>
            </div>
            <div className="bg-slate-700 rounded-lg p-2 text-center border border-slate-600">
              <div className="text-xs text-slate-300">Toplam</div>
              <div className="text-2xl font-bold text-slate-200">
                {summaryData.summary.total}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="bg-slate-800 dark:bg-slate-900">
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="mb-4 bg-slate-700 border border-slate-600">
            <TabsTrigger value="pending" data-testid="tab-pending" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white text-slate-300">
              Bekleyen ({summaryData?.summary.pending || 0})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white text-slate-300">
              Onaylanan ({summaryData?.summary.approved || 0})
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected" className="data-[state=active]:bg-slate-600 data-[state=active]:text-white text-slate-300">
              Reddedilen ({summaryData?.summary.rejected || 0})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value={selectedTab}>
            {isLoading ? (
              <div className="text-center py-8 text-slate-300">Yükleniyor...</div>
            ) : groupedChanges.individual.length === 0 && groupedChanges.grouped.length === 0 ? (
              <div className="text-center py-8 text-slate-300">
                {selectedTab === 'pending' 
                  ? 'Kritik bekleyen değişiklik yok (sadece fiyat değişiklikleri, stok biten ve kaldırılan ürünler gösteriliyor)' 
                  : selectedTab === 'approved' 
                    ? 'Onaylanmış kritik değişiklik yok' 
                    : 'Reddedilmiş kritik değişiklik yok'}
              </div>
            ) : (
              <div className="rounded-md border border-slate-700 bg-slate-800">
                <Table>
                  <TableHeader className="bg-slate-700">
                    <TableRow className="border-b border-slate-600">
                      {selectedTab === 'pending' && (
                        <TableHead className="w-12 text-sm font-medium text-white">
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
                      <TableHead className="text-sm font-medium text-white">Tip</TableHead>
                      <TableHead className="text-sm font-medium text-white">Ürün</TableHead>
                      <TableHead className="text-sm font-medium text-white">Varyant</TableHead>
                      <TableHead className="text-sm font-medium text-white">Değişiklik</TableHead>
                      <TableHead className="text-sm font-medium text-white">Tarih</TableHead>
                      {selectedTab === 'pending' && <TableHead className="text-right text-sm font-medium text-white">İşlem</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="bg-slate-800">
                    {/* Render individual (non-variant) changes */}
                    {groupedChanges.individual.map((change) => (
                      <TableRow key={change.id} data-testid={`row-change-${change.id}`} className="border-b border-slate-700 hover:bg-slate-700/50">
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
                        <TableCell className="text-sm text-slate-200">
                          <div className="flex items-center gap-2">
                            {getChangeIcon(change.changeType)}
                            {getChangeBadge(change.changeType)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-sm max-w-xs truncate text-white">
                          {change.productTitle}
                        </TableCell>
                        <TableCell className="text-sm text-slate-200">
                          {change.color || change.size ? (
                            <div className="space-y-0.5">
                              {change.color && <div className="font-medium text-sm text-white">{change.color}</div>}
                              {change.size && <div className="text-xs text-slate-400">{change.size}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-200">{getChangeDetails(change)}</TableCell>
                        <TableCell className="text-xs text-slate-400 whitespace-nowrap">
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

                    {/* Render grouped variant changes */}
                    {groupedChanges.grouped.map((group) => {
                      const groupKey = `product-${group.productId}`;
                      return (
                      <Collapsible
                        key={groupKey}
                        open={expandedProducts.has(groupKey)}
                        onOpenChange={() => toggleProductExpansion(group.productId)}
                      >
                        {/* Main product row with expand/collapse trigger */}
                        <CollapsibleTrigger asChild>
                          <TableRow 
                            className="border-b border-slate-700 hover:bg-slate-700/50 cursor-pointer"
                            data-testid={`row-variant-group-${group.productId}`}
                          >
                            {selectedTab === 'pending' && (
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={group.changes.every(c => selectedChanges.includes(c.id))}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (e.target.checked) {
                                      setSelectedChanges(prev => [...prev, ...group.changes.map(c => c.id).filter(id => !prev.includes(id))]);
                                    } else {
                                      setSelectedChanges(prev => prev.filter(id => !group.changes.some(c => c.id === id)));
                                    }
                                  }}
                                  className="rounded"
                                />
                              </TableCell>
                            )}
                            <TableCell className="text-sm text-slate-200" colSpan={selectedTab === 'pending' ? 1 : 2}>
                              <div className="flex items-center gap-2">
                                {expandedProducts.has(groupKey) ? (
                                  <ChevronDown className="h-4 w-4 text-slate-400" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-400" />
                                )}
                                <Package className="h-4 w-4 text-slate-400" />
                                <Badge variant="secondary" className="bg-slate-600 text-white">
                                  {group.changes.length} Varyant
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-sm max-w-xs truncate text-white" colSpan={selectedTab === 'pending' ? 5 : 4}>
                              {group.productTitle}
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>

                        {/* Expanded variant rows */}
                        <CollapsibleContent asChild>
                          <>
                            {group.changes.map((change) => (
                              <TableRow key={change.id} data-testid={`row-change-${change.id}`} className="border-b border-slate-700 bg-slate-750 hover:bg-slate-700/70">
                                {selectedTab === 'pending' && (
                                  <TableCell className="pl-8">
                                    <input
                                      type="checkbox"
                                      checked={selectedChanges.includes(change.id)}
                                      onChange={() => handleToggleChange(change.id)}
                                      className="rounded"
                                    />
                                  </TableCell>
                                )}
                                <TableCell className="text-sm text-slate-200 pl-8">
                                  <div className="flex items-center gap-2">
                                    {getChangeIcon(change.changeType)}
                                    {getChangeBadge(change.changeType)}
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-slate-300">
                                  {change.productTitle}
                                </TableCell>
                                <TableCell className="text-sm text-slate-200">
                                  {change.color || change.size ? (
                                    <div className="space-y-0.5">
                                      {change.color && <div className="font-medium text-sm text-white">{change.color}</div>}
                                      {change.size && <div className="text-xs text-slate-400">{change.size}</div>}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-sm">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-slate-200">{getChangeDetails(change)}</TableCell>
                                <TableCell className="text-xs text-slate-400 whitespace-nowrap">
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
                          </>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                    })}
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
