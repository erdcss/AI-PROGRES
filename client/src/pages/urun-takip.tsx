import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { isMaykNativeApp } from "@/lib/mayk-native";
import { useIsMobile } from "@/hooks/use-mobile";
import { openTrackingSource, resolveTrackingSourceUrl } from "@/lib/tracking-source-link";
import {
  RefreshCw,
  Play,
  Pause,
  ExternalLink,
  AlertTriangle,
  Package,
  GitCompare,
  Settings,
  Clock,
  Search,
  X,
} from "lucide-react";
import {
  TrackingChangeGroupCard,
  selectInstantMarktGoSyncIds,
} from "@/features/tracking/TrackingChangeGroupCard";
import { TrackingProductImage } from "@/features/tracking/TrackingProductImage";
import {
  buildProductTrackingTimeline,
  formatTrackingDateTime,
} from "@/features/tracking/tracking-timeline";
import { isPlaceholderVariantSize } from "@shared/tracking-price-sanity";
import { isPlaceholderColor } from "@shared/trendyol-variant-utils";

type TrackedProduct = {
  id: number;
  sourceUrl: string;
  sourceTitle: string;
  sourceSite?: string | null;
  sourceSiteName?: string | null;
  sourceLogoUrl?: string | null;
  shopifyProductId: string | null;
  trackingUid: string | null;
  currentSourcePrice: string | null;
  currentSourceStock: number | null;
  currentStatus: string;
  trackingEnabled: boolean;
  createdAt: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastShopifySyncAt?: string | null;
  shopifyTransferredAt?: string | null;
  productImageUrl?: string | null;
  productImageUrls?: string[];
  archivedAt?: string | null;
};

type DetectedChange = {
  id: number;
  trackedProductId: number;
  trackedVariantId?: number | null;
  changeType: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  confidence: string;
  status: string;
  reason: string | null;
  createdAt: string;
  seenAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  appliedAt?: string | null;
  productTitle?: string | null;
  productUrl?: string | null;
  productImageUrl?: string | null;
  shopifyProductId?: string | null;
  trackingUid?: string | null;
  variantUid?: string | null;
  variantLabel?: string | null;
  variantSku?: string | null;
  shopifyVariantId?: string | null;
  variantColor?: string | null;
  variantSize?: string | null;
  variantAvailable?: boolean | null;
  profitMarginPercent?: number | null;
  productCreatedAt?: string | null;
  productLastCheckedAt?: string | null;
  productLastSuccessAt?: string | null;
  productLastShopifySyncAt?: string | null;
  shopifyTransferredAt?: string | null;
  priceDisplay?: {
    costOld: number | null;
    costNew: number | null;
    saleOld: number | null;
    saleNew: number | null;
    marginPercent: number | null;
  } | null;
};

type SchedulerStatus = {
  trackingEnabled: boolean;
  schedulerEnabled: boolean;
  safeSchedulerRunning: boolean;
  pendingChangesCount: number;
  manualReviewCount: number;
  trackedProductsCount: number;
  activeTrackedProductsCount: number;
  errorProductsCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string;
  intervalMinutes: number;
  batchSize: number;
  legacySystemsRemoved: boolean;
};

type TrackingSettings = {
  trackingEnabled: boolean;
  schedulerEnabled: boolean;
  autoShopifySyncEnabled: boolean;
  checkIntervalMinutes: number;
  batchSize: number;
  requestDelayMs: number;
  maxErrorsBeforePause: number;
};

const CHANGE_FILTERS = [
  { value: "actionable", label: "Düzeltilecekler", countKey: "actionable" },
  { value: "pending", label: "Bekleyen", countKey: "pending" },
  { value: "manual_review", label: "Kontrol gerekli", countKey: "manual_review" },
  { value: "failed", label: "Hatalı", countKey: "failed" },
  { value: "ignored", label: "Yok sayılan", countKey: "ignored" },
  { value: "seen", label: "Görüldü", countKey: "seen" },
  { value: "applied", label: "Uygulanan", countKey: "applied" },
  { value: "history", label: "Tümü", countKey: "all" },
] as const;

type ChangeKindFilter = "price" | "color_oos" | "size_oos" | "product_oos";
type AuthenticityFilter = "all" | "real" | "review" | "suspect";

const CHANGE_KIND_FILTERS: Array<{ value: ChangeKindFilter; label: string }> = [
  { value: "price", label: "Fiyatı değişen ürünler" },
  { value: "color_oos", label: "Renk seçeneği tükenen ürünler" },
  { value: "size_oos", label: "Beden seçeneği tükenen ürünler" },
  { value: "product_oos", label: "Stoğu biten ürünler" },
];

const AUTHENTICITY_FILTERS: Array<{ value: AuthenticityFilter; label: string; hint: string }> = [
  { value: "all", label: "Tümü", hint: "Filtre yok" },
  { value: "real", label: "Gerçek aday", hint: "Bekleyen · güven ≥ %70" },
  { value: "review", label: "İnceleme", hint: "Manuel kontrol gerekli" },
  { value: "suspect", label: "Şüpheli", hint: "Düşük güven / sahte riski" },
];

function changeConfidence(change: DetectedChange): number {
  const n = Number(change.confidence);
  return Number.isFinite(n) ? n : 0;
}

function matchesAuthenticity(change: DetectedChange, filter: AuthenticityFilter): boolean {
  if (filter === "all") return true;
  const conf = changeConfidence(change);
  if (filter === "real") {
    return change.status === "pending" && conf >= 70;
  }
  if (filter === "review") {
    return change.status === "manual_review";
  }
  return (
    (change.status === "pending" && conf < 70) ||
    change.status === "failed" ||
    (change.status === "ignored" && conf < 50)
  );
}

type ChangeFilterCounts = {
  actionable: number;
  pending: number;
  manual_review: number;
  failed: number;
  ignored: number;
  seen: number;
  applied: number;
  auto_corrected: number;
  all: number;
};

function formatDate(value: string | null) {
  return formatTrackingDateTime(value);
}

function getChangeProductKey(change: DetectedChange): string {
  return `tracked:${change.trackedProductId}`;
}

function formatChangeValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 180 ? `${json.slice(0, 177)}…` : json;
  } catch {
    return String(value);
  }
}

function isOutOfStockNewValue(newValue: unknown): boolean {
  if (newValue === false || newValue === "false" || newValue === 0 || newValue === "0") {
    return true;
  }
  if (newValue && typeof newValue === "object" && "inStock" in (newValue as object)) {
    const stock = (newValue as { inStock: unknown }).inStock;
    return stock === false || stock === "false" || stock === 0;
  }
  return false;
}

function resolveChangeSize(change: DetectedChange): string {
  if (change.variantSize) return String(change.variantSize);
  const key = String(change.variantLabel ?? change.variantUid ?? "");
  if (key.includes("::")) return key.split("::").slice(1).join("::");
  if (key.includes("-")) {
    const parts = key.split("-");
    if (parts.length >= 2) return parts.slice(1).join("-");
  }
  return "";
}

function resolveChangeColor(change: DetectedChange): string {
  if (change.variantColor) return String(change.variantColor);
  const key = String(change.variantLabel ?? change.variantUid ?? "");
  if (key.includes("::")) return key.split("::")[0] ?? "";
  if (key.includes("-")) return key.split("-")[0] ?? "";
  return "";
}

/** Ürün grubunun hangi sınıf filtrelerine girdiğini döner */
function getProductChangeKinds(changes: DetectedChange[]): Set<ChangeKindFilter> {
  const kinds = new Set<ChangeKindFilter>();

  for (const change of changes) {
    if (
      change.changeType === "price_changed" ||
      change.changeType === "variant_price_changed"
    ) {
      kinds.add("price");
    }

    if (change.changeType === "stock_changed") {
      if (change.fieldName === "available" && isOutOfStockNewValue(change.newValue)) {
        kinds.add("product_oos");
      }
      if (change.fieldName === "stock" && Number(change.newValue) === 0) {
        kinds.add("product_oos");
      }
    }

    if (
      change.changeType === "variant_stock_changed" &&
      isOutOfStockNewValue(change.newValue)
    ) {
      const size = resolveChangeSize(change);
      const color = resolveChangeColor(change);
      if (!isPlaceholderVariantSize(size)) {
        kinds.add("size_oos");
      } else if (color && !isPlaceholderColor(color)) {
        kinds.add("color_oos");
      } else {
        kinds.add("product_oos");
      }
    }
  }

  return kinds;
}

async function runBulkTrackingAction(
  action: "approve" | "marktgo-sync",
  ids: number[],
): Promise<{
  summary: { total: number; succeeded: number; failed: number };
  results: Array<{ id: number; success: boolean; error?: string; message?: string }>;
}> {
  const summary = { total: ids.length, succeeded: 0, failed: 0 };
  const results: Array<{ id: number; success: boolean; error?: string; message?: string }> = [];
  const chunkSize = 100;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const res = await fetch(`/api/tracking/bulk/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Toplu işlem başarısız");
    summary.succeeded += Number(data.summary?.succeeded || 0);
    summary.failed += Number(data.summary?.failed || 0);
    if (Array.isArray(data.results)) results.push(...data.results);
  }

  if (summary.succeeded === 0 && summary.failed > 0) {
    const firstError = results.find((r) => !r.success)?.error;
    throw new Error(firstError || "MARKT-GO güncellemesi başarısız");
  }

  return { summary, results };
}

export default function UrunTakipPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobileViewport = useIsMobile();
  const isNativeApp = isMaykNativeApp();
  const isCompactTracking = isNativeApp || isMobileViewport;
  const [statusFilter, setStatusFilter] = useState<string>("actionable");
  const [mobileSection, setMobileSection] = useState<"products" | "changes" | "fixed" | "settings">("products");
  const [mobileAdvancedFilters, setMobileAdvancedFilters] = useState(false);
  const [expandedChangeGroup, setExpandedChangeGroup] = useState<string | null>(null);
  const [changeSearch, setChangeSearch] = useState("");
  const deferredChangeSearch = useDeferredValue(changeSearch);
  const [visibleChangeGroupCount, setVisibleChangeGroupCount] = useState(20);
  const [visibleAutoCorrectedCount, setVisibleAutoCorrectedCount] = useState(20);
  const [desktopSection, setDesktopSection] = useState("products");
  const [visibleProductCount, setVisibleProductCount] = useState(40);
  const nativeApp = isMaykNativeApp();
  const activeSection = isCompactTracking && !embedded
    ? mobileSection === "fixed" ? "auto-corrected" : mobileSection
    : desktopSection;
  const [showMaykNotifications, setShowMaykNotifications] = useState(false);
  const [expandedMobileProduct, setExpandedMobileProduct] = useState<number | null>(null);
  const [kindFilter, setKindFilter] = useState<ChangeKindFilter | null>(null);
  const [authenticityFilter, setAuthenticityFilter] = useState<AuthenticityFilter>("all");
  const [productSearch, setProductSearch] = useState("");
  const deferredProductSearch = useDeferredValue(productSearch);
  useEffect(() => { setVisibleProductCount(40); }, [deferredProductSearch]);
  const [settingsForm, setSettingsForm] = useState<Partial<TrackingSettings>>({});

  const maykNotificationsQuery = useQuery<{
    success: boolean;
    items: Array<{ id: string; type: string; title: string; body: string; createdAt: string }>;
  }>({
    queryKey: ["mayk-push-notifications"],
    enabled: nativeApp && showMaykNotifications,
    queryFn: async () => {
      const res = await fetch("/api/mayk/push/recent?limit=40", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("Bildirim geçmişi alınamadı");
      return res.json();
    },
    refetchInterval: showMaykNotifications ? 30_000 : false,
    staleTime: 15_000,
  });
  const maykDeviceQuery = useQuery<{ success: boolean; enabledDevices: number }>({
    queryKey: ["mayk-push-device-status"],
    enabled: nativeApp && showMaykNotifications,
    queryFn: async () => {
      const res = await fetch("/api/mayk/push/status", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("Cihaz durumu alınamadı");
      return res.json();
    },
    refetchInterval: showMaykNotifications ? 60_000 : false,
    staleTime: 30_000,
  });

  const sendMaykTestNotification = async () => {
    try {
      const res = await fetch("/api/mayk/push/test", {
        method:"POST",
        credentials:"same-origin",
        headers: { "X-Requested-With":"MAYK-IOS", "Content-Type":"application/json" },
        body:"{}",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test bildirimi gönderilemedi");
      toast({ title:"Test bildirimi sıraya alındı", description:"iOS cihazındaki bildirimleri kontrol edin." });
      void maykNotificationsQuery.refetch();
    } catch(err) {
      toast({ title:"Bildirim hatası", description:err instanceof Error?err.message:"İşlem başarısız",variant:"destructive" });
    }
  };

  const refreshTrackingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
    queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
    queryClient.invalidateQueries({ queryKey: ["tracking-change-counts"] });
    queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    queryClient.invalidateQueries({ queryKey: ["tracking-notifications"] });
  };

  const statusQuery = useQuery({
    queryKey: ["tracking-scheduler-status"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/scheduler-status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Durum alınamadı");
      return data as SchedulerStatus;
    },
    refetchInterval: 45_000,
    staleTime: 10_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["tracking-settings"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ayarlar alınamadı");
      return data.settings as TrackingSettings;
    },
  });

  const productsQuery = useQuery({
    queryKey: ["tracking-products"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/products?includeUnlinked=true&includeArchived=true", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Liste alınamadı");
      return (data.products || []) as TrackedProduct[];
    },
    enabled: activeSection === "products",
    refetchInterval: activeSection === "products" ? 60_000 : false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const changesQuery = useQuery({
    queryKey: ["tracking-changes", statusFilter],
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      qs.set("limit", "400");
      const res = await fetch(`/api/tracking/changes?${qs.toString()}`, {
        cache: "no-store",
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Değişiklikler alınamadı");
      return (data.changes || []) as DetectedChange[];
    },
    enabled: activeSection === "changes",
    refetchInterval: activeSection === "changes" ? 45_000 : false,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 15_000,
  });

  const autoCorrectedQuery = useQuery({
    queryKey: ["tracking-changes", "auto_corrected"],
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ status: "auto_corrected", limit: "400" });
      const res = await fetch(`/api/tracking/changes?${qs.toString()}`, {
        cache: "no-store",
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Otomatik düzeltilenler alınamadı");
      return (data.changes || []) as DetectedChange[];
    },
    enabled: activeSection === "auto-corrected",
    refetchInterval: activeSection === "auto-corrected" ? 60_000 : false,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 30_000,
  });

  const changeCountsQuery = useQuery({
    queryKey: ["tracking-change-counts"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/change-counts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sayımlar alınamadı");
      return (data.counts || {
        actionable: 0,
        pending: 0,
        manual_review: 0,
        failed: 0,
        ignored: 0,
        seen: 0,
        applied: 0,
        auto_corrected: 0,
        all: 0,
      }) as ChangeFilterCounts;
    },
    refetchInterval: 45_000,
    staleTime: 10_000,
  });

  const filteredProducts = useMemo(() => {
    const products = productsQuery.data ?? [];
    const query = deferredProductSearch.trim().toLocaleLowerCase("tr-TR");
    if (!query) return products;

    return products.filter((product) => {
      const searchable = [
        product.sourceTitle,
        product.sourceSite,
        product.sourceSiteName,
        product.sourceUrl,
        product.trackingUid,
        product.shopifyProductId,
        product.currentStatus,
        product.currentSourcePrice,
        String(product.id),
      ]
        .filter((value) => value != null && value !== "")
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return searchable.includes(query);
    });
  }, [productsQuery.data, deferredProductSearch]);
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleProductCount),
    [filteredProducts, visibleProductCount],
  );

  const saveSettingsMutation = useMutation({
    mutationFn: async (patch: Partial<TrackingSettings>) => {
      const res = await fetch("/api/tracking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi");
      return data.settings as TrackingSettings;
    },
    onSuccess: (settings, patch) => {
      setSettingsForm({});
      queryClient.setQueryData(["tracking-settings"], settings);
      queryClient.invalidateQueries({ queryKey: ["tracking-settings"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
      if (typeof patch.autoShopifySyncEnabled === "boolean") {
        toast({
          title: patch.autoShopifySyncEnabled
            ? "Otomatik düzeltme açıldı"
            : "Otomatik düzeltme kapatıldı",
          description: patch.autoShopifySyncEnabled
            ? "Bekleyen ve MARKT-GO'da uygulanabilir değişiklikler otomatik düzeltilecek"
            : undefined,
        });
      } else {
        toast({ title: "Takip ayarları kaydedildi" });
      }
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const checkMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tracking/products/${id}/check`, { method: "POST" });
      const data = await res.json();
      if (!res.ok && !data.skipped) {
        throw new Error(data.error || data.message || "Kontrol başarısız");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
      if (data.success) {
        const cleared = Number(data.clearedFalseOos || 0);
        toast({
          title: "Tekrar kontrol tamamlandı",
          description:
            cleared > 0
              ? `${cleared} yanlış stok dışı alarmı temizlendi`
              : data.changesCreated > 0
                ? `${data.changesCreated} yeni değişiklik tespit edildi`
                : data.userMessage || "Kaynak teyit edildi — yeni değişiklik yok",
        });
      } else {
        toast({
          title: "Kaynak veri alınamadı",
          description: data.userMessage || data.error || data.message,
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Kontrol hatası", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enable }: { id: number; enable: boolean }) => {
      const path = enable ? "enable" : "disable";
      const res = await fetch(`/api/tracking/products/${id}/${path}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "İşlem başarısız");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Takip durumu değiştirilemedi", description: err.message, variant: "destructive" });
    },
  });


  const changeActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "mark-seen" | "ignore" | "approve" | "reject" }) => {
      const res = await fetch(`/api/tracking/changes/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "İşlem başarısız");
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-change-counts"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-notifications"] });
      if (vars.action === "mark-seen") {
        toast({ title: "Görüldü olarak işaretlendi" });
      } else if (vars.action === "ignore") {
        toast({ title: "Yok sayıldı" });
      }
    },
  });

  const marktgoSyncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tracking/changes/${id}/marktgo-sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "MARKT-GO güncellemesi başarısız");
      return data;
    },
    onMutate: () => {
      toast({ title: "MARKT-GO güncelleniyor…", description: "Değişiklik doğrudan MARKT-GO ürününe yazılıyor" });
    },
    onSuccess: (data) => {
      toast({
        title: "MARKT-GO güncellendi",
        description: data.marktgo?.message || "Değişiklik uygulandı",
      });
      refreshTrackingQueries();
    },
    onError: (err: Error) => {
      toast({ title: "MARKT-GO hatası", description: err.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: number[]) => runBulkTrackingAction("approve", ids),
    onSuccess: (data) => {
      const s = data.summary;
      toast({
        title: "Toplu onay tamam",
        description: `${s.succeeded}/${s.total} değişiklik onaylandı`,
        variant: s.failed > 0 ? "destructive" : "default",
      });
      refreshTrackingQueries();
    },
    onError: (err: Error) => {
      toast({ title: "Toplu onay hatası", description: err.message, variant: "destructive" });
    },
  });

  const bulkMarktGoSyncMutation = useMutation({
    mutationFn: (ids: number[]) => runBulkTrackingAction("marktgo-sync", ids),
    onMutate: () => {
      toast({
        title: "MARKT-GO güncelleniyor…",
        description: "Değişiklikler doğrudan mağazaya uygulanıyor",
      });
    },
    onSuccess: (data) => {
      const summary = data.summary;
      const okMessages = (data.results ?? [])
        .filter((r) => r.success && r.message && !(r as { skipped?: boolean }).skipped)
        .map((r) => r.message!)
        .slice(0, 2);
      const failMessages = (data.results ?? [])
        .filter((r) => !r.success && r.error)
        .map((r) => r.error!)
        .slice(0, 2);
      const skippedCount = (data.results ?? []).filter(
        (r) => r.success && /yok sayıldı|atlandı/i.test(r.message || ""),
      ).length;
      toast({
        title:
          summary.failed === 0
            ? "MARKT-GO güncellendi"
            : `MARKT-GO kısmen güncellendi (${summary.succeeded}/${summary.total})`,
        description:
          [
            okMessages.join(" · ") || null,
            failMessages.length ? `Hata: ${failMessages.join(" · ")}` : null,
            skippedCount > 0 ? `${skippedCount} kayıt eşleşmediği için yok sayıldı` : null,
          ]
            .filter(Boolean)
            .join(" — ") ||
          `${summary.succeeded}/${summary.total} değişiklik uygulandı`,
        variant: summary.failed > 0 ? "destructive" : "default",
      });
      refreshTrackingQueries();
    },
    onError: (err: Error) => {
      toast({ title: "MARKT-GO güncelleme hatası", description: err.message, variant: "destructive" });
    },
  });

  const approvableIds =
    changesQuery.data?.filter((c) => c.status === "pending" || c.status === "manual_review").map((c) => c.id) ??
    [];
  const groupedChanges = useMemo(() => {
    const groups = new Map<string, DetectedChange[]>();
    for (const change of changesQuery.data ?? []) {
      const key = getChangeProductKey(change);
      const group = groups.get(key);
      if (group) group.push(change);
      else groups.set(key, [change]);
    }
    return [...groups.values()].sort((a, b) => {
      const latestA = Math.max(...a.map((change) => new Date(change.createdAt).getTime()));
      const latestB = Math.max(...b.map((change) => new Date(change.createdAt).getTime()));
      return latestB - latestA;
    });
  }, [changesQuery.data]);

  const autoCorrectedGroups = useMemo(() => {
    const groups = new Map<string, DetectedChange[]>();
    for (const change of autoCorrectedQuery.data ?? []) {
      const key = getChangeProductKey(change);
      const group = groups.get(key);
      if (group) group.push(change);
      else groups.set(key, [change]);
    }
    return [...groups.values()].sort((a, b) => {
      const latestA = Math.max(
        ...a.map((change) => new Date(change.appliedAt || change.createdAt).getTime()),
      );
      const latestB = Math.max(
        ...b.map((change) => new Date(change.appliedAt || change.createdAt).getTime()),
      );
      return latestB - latestA;
    });
  }, [autoCorrectedQuery.data]);

  const kindFilterCounts = useMemo(() => {
    const counts: Record<ChangeKindFilter, number> = {
      price: 0,
      color_oos: 0,
      size_oos: 0,
      product_oos: 0,
    };
    for (const group of groupedChanges) {
      const kinds = getProductChangeKinds(group);
      for (const kind of kinds) counts[kind] += 1;
    }
    return counts;
  }, [groupedChanges]);

  const filteredGroupedChanges = useMemo(() => {
    let groups = groupedChanges;
    if (authenticityFilter !== "all") {
      groups = groups
        .map((group) => group.filter((c) => matchesAuthenticity(c, authenticityFilter)))
        .filter((group) => group.length > 0);
    }
    if (kindFilter) groups = groups.filter((group) => getProductChangeKinds(group).has(kindFilter));
    const needle = deferredChangeSearch.trim().toLocaleLowerCase("tr-TR");
    if (needle) {
      groups = groups.filter((group) => {
        const sample = group[0];
        const haystack = [
          sample.productTitle, sample.productUrl, sample.trackingUid,
          sample.trackedProductId, ...group.map(c => c.variantLabel || c.fieldName || c.changeType),
        ].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
        return haystack.includes(needle);
      });
    }
    return groups;
  }, [groupedChanges, kindFilter, authenticityFilter, deferredChangeSearch]);

  const authenticityCounts = useMemo(() => {
    const counts: Record<AuthenticityFilter, number> = {
      all: groupedChanges.length,
      real: 0,
      review: 0,
      suspect: 0,
    };
    for (const group of groupedChanges) {
      if (group.some((c) => matchesAuthenticity(c, "real"))) counts.real += 1;
      if (group.some((c) => matchesAuthenticity(c, "review"))) counts.review += 1;
      if (group.some((c) => matchesAuthenticity(c, "suspect"))) counts.suspect += 1;
    }
    return counts;
  }, [groupedChanges]);

  const bulkFixIds = useMemo(() => {
    const ids: number[] = [];
    for (const group of filteredGroupedChanges) {
      ids.push(...selectInstantMarktGoSyncIds(group));
    }
    return [...new Set(ids)];
  }, [filteredGroupedChanges]);

  useEffect(() => { setVisibleChangeGroupCount(20); setExpandedChangeGroup(null); }, [statusFilter, kindFilter, authenticityFilter, deferredChangeSearch]);
  useEffect(() => { setVisibleAutoCorrectedCount(20); }, [mobileSection]);
  const mobileChangeGroups = useMemo(
    () => filteredGroupedChanges.slice(0, visibleChangeGroupCount),
    [filteredGroupedChanges, visibleChangeGroupCount],
  );
  const mobileCorrectedGroups = useMemo(
    () => autoCorrectedGroups.slice(0, visibleAutoCorrectedCount),
    [autoCorrectedGroups, visibleAutoCorrectedCount],
  );

  const st = statusQuery.data;
  const settings = { ...settingsQuery.data, ...settingsForm } as TrackingSettings | undefined;
  const autoCorrectOn = Boolean(settings?.autoShopifySyncEnabled);
  const trackingOff = settings && !settings.trackingEnabled;

  // M.A.Y.K iPhone presentation: same live queries and mutations as web, touch-first layout.
  if (isCompactTracking && !embedded) {
    const sectionItems = [
      { id: "products" as const, title: "Ürünler", count: productsQuery.data?.length ?? 0 },
      { id: "changes" as const, title: "Değişiklik", count: changeCountsQuery.data?.all ?? 0 },
      { id: "fixed" as const, title: "Düzeltilen", count: changeCountsQuery.data?.auto_corrected ?? 0 },
      { id: "settings" as const, title: "Ayarlar", count: null },
    ];

    const mobileRefresh = () => {
      void statusQuery.refetch();
      void changeCountsQuery.refetch();
      if (mobileSection === "products") void productsQuery.refetch();
      if (mobileSection === "changes") void changesQuery.refetch();
      if (mobileSection === "fixed") void autoCorrectedQuery.refetch();
      if (showMaykNotifications) void maykNotificationsQuery.refetch();
    };

    return (
      <main data-testid="mobile-tracking-screen" className="mayk-mobile-tracking web-mobile-tracking mx-auto w-full max-w-[760px] min-w-0 space-y-4 overflow-x-clip bg-[#0C1623] px-3.5 pb-8 pt-4 text-slate-100">
        <header className="rounded-[22px] border border-[#395568] bg-gradient-to-br from-[#1C3545] to-[#101D2A] p-4">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-teal-300">Canlı izleme</p>
              <h1 className="mt-1.5 text-[24px] font-bold leading-tight text-white">Ürün Takip</h1>
              <p className="mt-1 text-[12px] leading-5 text-slate-300">Fiyat, stok ve MarktGO değişikliklerini tek ekrandan yönet</p>
            </div>
            <button
              type="button"
              onClick={mobileRefresh}
              aria-label="Tüm takip verilerini yenile"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#466778] bg-[#223C4C] text-teal-100"
            >
              <RefreshCw className={`h-5 w-5 ${productsQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${st?.safeSchedulerRunning
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>
              {st?.safeSchedulerRunning ? "Takip aktif" : "Takip durdu"}
            </span>
            <span className="rounded-full border border-slate-500/40 bg-slate-700/30 px-3 py-1.5 text-[11px] text-slate-300">
              {st?.intervalMinutes ? `Her ${st.intervalMinutes} dk kontrol` : "Durum izleniyor"}
            </span>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2.5" aria-label="Takip özeti">
          {[
            { label: "Takip edilen", value: st?.trackedProductsCount ?? "—" },
            { label: "Aktif ürün", value: st?.activeTrackedProductsCount ?? "—" },
            { label: "Değişiklik", value: changeCountsQuery.data?.all ?? "—" },
            { label: "Kontrol gerekli", value: st?.manualReviewCount ?? "—" },
          ].map(item => (
            <div key={item.label} className="min-w-0 rounded-2xl border border-[#304152] bg-[#152434] px-3.5 py-3">
              <p className="text-[11px] leading-4 text-slate-400">{item.label}</p>
              <p className="mt-2 text-[25px] font-semibold leading-none tabular-nums text-white">{item.value}</p>
            </div>
          ))}
        </section>

        {isNativeApp && <section className="min-w-0 rounded-2xl border border-[#385466] bg-[#142638] px-3.5 py-3">
          <button
            type="button"
            onClick={() => setShowMaykNotifications(v => !v)}
            className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 text-left"
            aria-expanded={showMaykNotifications}
          >
            <span className="text-[14px] font-semibold text-slate-100">Bildirim Merkezi</span>
            <span className="text-[11px] text-teal-200">
              {maykNotificationsQuery.data?.items?.length ?? 0} kayıt · {maykDeviceQuery.data?.enabledDevices ?? 0} cihaz
            </span>
            <span aria-hidden className="text-[20px] text-slate-300">{showMaykNotifications ? "⌃" : "⌄"}</span>
          </button>
          {showMaykNotifications && (
            <div className="mt-3 min-w-0 space-y-2 border-t border-[#3B5265] pt-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void maykNotificationsQuery.refetch()} className="min-h-10 rounded-xl border border-[#4B687B] px-3 text-[12px] text-white">
                  Bildirimleri yenile
                </button>
                <button type="button" onClick={() => void sendMaykTestNotification()} className="min-h-10 rounded-xl bg-[#1C7480] px-3 text-[12px] font-semibold text-white">
                  Test bildirimi gönder
                </button>
              </div>
              {maykNotificationsQuery.isLoading && <p className="text-[12px] text-slate-400">Bildirimler yükleniyor...</p>}
              {maykNotificationsQuery.error && <p className="break-words text-[12px] text-rose-200">Bildirim geçmişine ulaşılamadı.</p>}
              {!maykNotificationsQuery.isLoading && (maykNotificationsQuery.data?.items?.length ?? 0) === 0 && (
                <p className="text-[12px] text-slate-400">Henüz ürün takip bildirimi yok.</p>
              )}
              {maykNotificationsQuery.data?.items?.slice(0,30).map(item => (
                <article key={item.id} className="min-w-0 rounded-xl border border-[#30485A] bg-[#1B3041] p-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-[12px] font-semibold text-teal-100">{item.title}</p>
                    <span className="text-[10px] text-slate-400">{formatDate(item.createdAt)}</span>
                  </div>
                  <p className="mt-1 break-words text-[12px] leading-5 text-slate-300">{item.body}</p>
                </article>
              ))}
            </div>
          )}
        </section>}

        <section className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#365061] bg-[#152938] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-white">Otomatik düzeltme</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              {autoCorrectOn ? "MarktGO değişiklikleri otomatik uygulanır." : "Bekleyen değişiklikleri manuel düzeltebilirsin."}
            </p>
          </div>
          <Switch
            id="mayk-mobile-auto-correct"
            checked={autoCorrectOn}
            disabled={saveSettingsMutation.isPending || settingsQuery.isLoading}
            aria-label="Otomatik düzeltmeyi aç veya kapat"
            onCheckedChange={v => {
              setSettingsForm(form => ({ ...form, autoShopifySyncEnabled: v }));
              saveSettingsMutation.mutate({
                autoShopifySyncEnabled: v,
                ...(v ? { trackingEnabled: true, schedulerEnabled: true } : {}),
              });
            }}
          />
        </section>

        <nav className="sticky top-[60px] z-20 grid min-w-0 grid-cols-4 gap-1 rounded-2xl border border-[#304152] bg-[#132232]/95 p-1.5 backdrop-blur-md" role="tablist" aria-label="Ürün takip bölümleri">
          {sectionItems.map(item => (
            <button
              type="button"
              role="tab"
              key={item.id}
              aria-selected={mobileSection === item.id}
              onClick={() => setMobileSection(item.id)}
              className={`min-h-12 min-w-0 overflow-hidden rounded-xl px-0.5 py-2 text-center transition-colors ${mobileSection === item.id
                ? "bg-[#2B5260] text-white shadow-sm"
                : "text-slate-400"}`}
            >
              <span className="block break-words text-[11px] font-semibold leading-4">{item.title}</span>
              {item.count != null && <span className="mt-0.5 block text-[10px] tabular-nums">{item.count}</span>}
            </button>
          ))}
        </nav>

        {mobileSection === "products" && (
          <section role="tabpanel" className="space-y-3">
            <label className="relative block">
              <span className="sr-only">Ürün ara</span>
              <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Ürün, kaynak, takip ID ara..."
                className="mayk-mobile-input h-12 w-full rounded-xl border border-[#3C5364] bg-[#172839] pl-11 pr-3 text-[16px] text-white placeholder:text-slate-400 focus:border-teal-400 focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-slate-400">{filteredProducts.length} ürün listeleniyor</p>
              <button type="button" disabled={productsQuery.isFetching} onClick={() => void productsQuery.refetch()} className="min-h-10 rounded-lg border border-[#466072] px-3 text-[12px] text-slate-200">
                Listeyi yenile
              </button>
            </div>
            {productsQuery.isLoading && <p className="py-8 text-center text-sm text-slate-400">Ürünler yükleniyor...</p>}
            {productsQuery.error && <p className="rounded-xl border border-red-500/30 bg-red-900/10 p-3 text-sm text-red-200">{(productsQuery.error as Error).message}</p>}
            {!productsQuery.isLoading && !productsQuery.error && filteredProducts.length === 0 && (
              <div className="rounded-xl border border-[#304152] bg-[#142231] p-6 text-center text-sm text-slate-400">
                {productSearch ? "Aramayla eşleşen ürün bulunamadı." : "Henüz takip edilen ürün bulunmuyor."}
              </div>
            )}
            {visibleProducts.map(product => (
              <article key={product.id} className="min-w-0 overflow-hidden rounded-2xl border border-[#33495B] bg-[#152536] p-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  <TrackingProductImage imageUrl={product.productImageUrl} title={product.sourceTitle} size="md" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="line-clamp-3 break-words text-[13px] font-semibold leading-[18px] text-white">{product.sourceTitle || "Başlıksız ürün"}</p>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {product.sourceLogoUrl && (
                        <img src={product.sourceLogoUrl} alt="" className="h-4 w-4 rounded bg-white p-0.5 object-contain" loading="lazy" />
                      )}
                      <span className="max-w-full break-words text-[11px] text-slate-400">{product.sourceSiteName || product.sourceSite || "Kaynak site"}</span>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${product.trackingEnabled
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-500/40 bg-slate-700/30 text-slate-300"}`}>
                      {product.trackingEnabled ? "Aktif takip" : "Takip durdu"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="min-w-0 rounded-xl bg-[#203445] px-3 py-2.5">
                    <p className="text-[11px] text-slate-400">Kaynak fiyatı</p>
                    <p className="mt-1 break-words text-[15px] font-semibold text-white">{product.currentSourcePrice ? `${product.currentSourcePrice} ₺` : "—"}</p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-[#203445] px-3 py-2.5">
                    <p className="text-[11px] text-slate-400">Stok</p>
                    <p className="mt-1 text-[15px] font-semibold text-white">{product.currentSourceStock ?? "—"}</p>
                  </div>
                </div>
                {product.lastErrorMessage && (
                  <div className="mt-2 break-words rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[12px] leading-4 text-rose-200">
                    {product.lastErrorMessage}
                  </div>
                )}
                {expandedMobileProduct === product.id && (
                  <div className="mt-3 space-y-2 rounded-xl border border-[#33495B] bg-[#0F1D2B] p-3">
                    <p className="text-[12px] font-semibold text-slate-200">Ürün zaman çizelgesi</p>
                    {buildProductTrackingTimeline({
                      productCreatedAt: product.createdAt,
                      shopifyTransferredAt: product.shopifyTransferredAt,
                      productLastCheckedAt: product.lastCheckedAt,
                      productLastSuccessAt: product.lastSuccessAt,
                      productLastShopifySyncAt: product.lastShopifySyncAt,
                    }).map(point => (
                      <div key={point.label} className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-[11px]">
                        <span className="text-slate-400">{point.label}</span>
                        <span className="break-words text-slate-200">{formatTrackingDateTime(point.at)}</span>
                      </div>
                    ))}
                    {(product.productImageUrls?.length ?? 0) > 1 && (
                      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                        {product.productImageUrls!.slice(0, 8).map((url, index) => (
                          <a key={url + index} href={url} target="_blank" rel="noreferrer" aria-label={`Ürün görseli ${index + 1}`} className="shrink-0">
                            <img src={url} alt="" loading="lazy" className="h-16 w-16 rounded-lg object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={checkMutation.isPending || !product.trackingEnabled}
                    onClick={() => checkMutation.mutate(product.id)}
                    className="min-h-11 rounded-xl bg-[#1C7480] px-2 text-[12px] font-semibold text-white disabled:opacity-50"
                  >Kontrol et</button>
                  <button
                    type="button"
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate({ id: product.id, enable: !product.trackingEnabled })}
                    className="min-h-11 rounded-xl border border-[#436074] bg-[#203749] px-2 text-[12px] font-semibold text-slate-100 disabled:opacity-50"
                  >{product.trackingEnabled ? "Duraklat" : "Etkinleştir"}</button>
                  <button type="button" onClick={() => setExpandedMobileProduct(id => id === product.id ? null : product.id)} className="min-h-10 rounded-xl border border-[#3A5265] px-2 text-[12px] text-slate-200">
                    {expandedMobileProduct === product.id ? "Ayrıntıyı gizle" : "Ayrıntılar"}
                  </button>
                  {resolveTrackingSourceUrl(product.sourceUrl) ? (
                    <button type="button" onClick={() => openTrackingSource(product.sourceUrl)} className="flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[#3A5265] px-2 text-[12px] font-semibold text-teal-200">
                      <ExternalLink className="h-3.5 w-3.5" /> Kaynağı aç
                    </button>
                  ) : <span className="flex min-h-10 items-center justify-center text-center text-[11px] text-slate-500">Kaynak URL yok</span>}
                </div>
              </article>
            ))}
            {visibleProducts.length < filteredProducts.length && (
              <button type="button" onClick={() => setVisibleProductCount(count => count + 40)}
                className="min-h-12 w-full rounded-xl border border-teal-500/30 bg-[#1C3446] text-[13px] font-semibold text-teal-100">
                Daha fazla ürün göster ({visibleProducts.length}/{filteredProducts.length})
              </button>
            )}
          </section>
        )}

        {mobileSection === "changes" && (
          <section role="tabpanel" className="min-w-0 space-y-3">
            <label className="relative block">
              <span className="sr-only">Değişikliklerde ürün ara</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input type="search" value={changeSearch} onChange={event => setChangeSearch(event.target.value)}
                placeholder="Değişikliklerde ürün ara..."
                className="h-12 w-full min-w-0 rounded-xl border border-[#3C5364] bg-[#172839] pl-11 pr-3 text-[16px] text-white placeholder:text-slate-400 focus:border-teal-400 focus:outline-none" />
            </label>
            <p className="text-[12px] leading-5 text-slate-400">MarktGO değişikliklerini filtrele, kontrol et ve düzelt.</p>
            <div className="flex flex-wrap gap-2">
              {CHANGE_FILTERS.filter(filter => ["actionable", "pending", "manual_review", "history"].includes(filter.value)).map(filter => (
                <button
                  type="button"
                  key={filter.value}
                  onClick={() => { setStatusFilter(filter.value); setKindFilter(null); }}
                  className={`min-h-10 rounded-xl border px-3 text-[12px] font-medium ${statusFilter === filter.value
                    ? "border-teal-400/50 bg-[#24515A] text-white" : "border-[#3A5265] bg-[#182B3B] text-slate-300"}`}
                >{filter.label} ({changeCountsQuery.data?.[filter.countKey] ?? 0})</button>
              ))}
            </div>
            <button
              type="button"
              aria-expanded={mobileAdvancedFilters}
              onClick={() => setMobileAdvancedFilters(value => !value)}
              className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#3A5265] bg-[#182B3B] px-3 text-left text-[12px] font-semibold text-slate-200"
            >
              <span>Detaylı filtreler {kindFilter || authenticityFilter !== "all" || !["actionable","pending","manual_review","history"].includes(statusFilter) ? "· Aktif" : ""}</span>
              <span aria-hidden>{mobileAdvancedFilters ? "−" : "+"}</span>
            </button>
            {mobileAdvancedFilters && (
              <div className="min-w-0 space-y-3 rounded-xl border border-[#334B5D] bg-[#111F2F] p-3">
                <div className="flex flex-wrap gap-2">
                  {CHANGE_FILTERS.filter(filter => !["actionable", "pending", "manual_review", "history"].includes(filter.value)).map(filter => (
                    <button type="button" key={filter.value}
                      onClick={() => { setStatusFilter(filter.value); setKindFilter(null); }}
                      className={`min-h-10 rounded-lg border px-3 text-[12px] ${statusFilter === filter.value ? "border-teal-400/50 bg-[#24515A] text-white" : "border-[#3A5265] text-slate-300"}`}>
                      {filter.label} ({changeCountsQuery.data?.[filter.countKey] ?? 0})
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
              {AUTHENTICITY_FILTERS.map(filter => (
                <button
                  type="button"
                  key={filter.value}
                  title={filter.hint}
                  onClick={() => setAuthenticityFilter(filter.value)}
                  className={`min-h-9 rounded-lg border px-3 text-[11px] ${authenticityFilter === filter.value
                    ? "border-teal-400/50 bg-[#24515A] text-white" : "border-[#3A5265] text-slate-400"}`}
                >{filter.label} ({authenticityCounts[filter.value]})</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {CHANGE_KIND_FILTERS.map(filter => (
                <button
                  type="button"
                  key={filter.value}
                  onClick={() => setKindFilter(prev => prev === filter.value ? null : filter.value)}
                  className={`min-h-9 rounded-lg border px-3 text-[11px] ${kindFilter === filter.value
                    ? "border-teal-400/50 bg-[#24515A] text-white" : "border-[#3A5265] text-slate-400"}`}
                >{filter.label} ({kindFilterCounts[filter.value]})</button>
              ))}
                </div>
                <button type="button" onClick={() => { setStatusFilter("actionable"); setKindFilter(null); setAuthenticityFilter("all"); setChangeSearch(""); }}
                  className="min-h-10 w-full rounded-lg border border-[#3A5265] text-[12px] text-slate-300">Filtreleri temizle</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {bulkFixIds.length > 0 && !["ignored", "seen", "applied", "history"].includes(statusFilter) && (
                <button
                  type="button"
                  disabled={bulkMarktGoSyncMutation.isPending}
                  onClick={() => bulkMarktGoSyncMutation.mutate(bulkFixIds)}
                  className="min-h-11 rounded-xl bg-[#1C7480] px-2 text-[12px] font-semibold text-white disabled:opacity-50"
                >Toplu düzelt ({bulkFixIds.length})</button>
              )}
              {approvableIds.length > 0 && !["ignored", "seen", "applied", "history"].includes(statusFilter) && (
                <button
                  type="button"
                  disabled={bulkApproveMutation.isPending || bulkMarktGoSyncMutation.isPending}
                  onClick={() => bulkApproveMutation.mutate(approvableIds)}
                  className="min-h-11 rounded-xl border border-[#436074] bg-[#203749] px-2 text-[12px] text-slate-100 disabled:opacity-50"
                >Toplu onay ({approvableIds.length})</button>
              )}
            </div>
            {changesQuery.isLoading && <p className="text-center text-sm text-slate-400">Değişiklikler yükleniyor...</p>}
            {changesQuery.error && <p className="rounded-xl border border-rose-500/40 p-3 text-sm text-rose-200">{(changesQuery.error as Error).message}</p>}
            {(changesQuery.data?.length ?? 0) >= 400 && (
              <p className="text-[11px] text-amber-200">Son 400 değişiklik gösteriliyor. Filtrelerle daraltabilirsin.</p>
            )}
            {!changesQuery.isLoading && !changesQuery.error && filteredGroupedChanges.length === 0 && (
              <div className="rounded-xl border border-[#304152] bg-[#142231] p-6 text-center text-sm text-slate-400">Bu filtrede değişiklik yok.</div>
            )}
            {mobileChangeGroups.map(group => {
              const p = group[0];
              const productKey = getChangeProductKey(p);
              const isExpanded = expandedChangeGroup === productKey;
              const syncIds = selectInstantMarktGoSyncIds(group);
              const busy = changeActionMutation.isPending || marktgoSyncMutation.isPending || bulkApproveMutation.isPending || bulkMarktGoSyncMutation.isPending;
              return (
                <article key={getChangeProductKey(p)} className="min-w-0 space-y-3 rounded-2xl border border-[#33495B] bg-[#152536] p-3.5">
                  <div className="flex min-w-0 gap-3">
                    <TrackingProductImage imageUrl={p.productImageUrl} title={p.productTitle} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 break-words text-[13px] font-semibold leading-[18px] text-white">{p.productTitle || `Ürün #${p.trackedProductId}`}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{group.length} değişiklik · Takip #{p.trackedProductId}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Son değişiklik: {formatDate(p.createdAt)}</p>
                    </div>
                  </div>
                  {group.slice(0, isExpanded ? undefined : 2).map(change => {
                    const canSync = syncIds.includes(change.id);
                    const canApprove = ["pending", "manual_review"].includes(change.status);
                    return (
                      <div key={change.id} className="min-w-0 space-y-2 rounded-xl border border-[#314A5C] bg-[#0F1E2D] p-3">
                        <div className="flex flex-wrap justify-between gap-1 text-[11px]">
                          <span className="break-words font-semibold text-teal-200">{change.variantLabel || change.fieldName || change.changeType}</span>
                          <span className="text-slate-400">{change.status}</span>
                        </div>
                        <div className="grid min-w-0 grid-cols-2 gap-2 text-[12px]">
                          <div className="min-w-0 rounded-lg bg-[#213347] p-2">
                            <p className="text-[10px] text-slate-400">Önce</p>
                            <p className="break-all text-slate-200">{formatChangeValue(change.oldValue)}</p>
                          </div>
                          <div className="min-w-0 rounded-lg bg-[#213347] p-2">
                            <p className="text-[10px] text-slate-400">Sonra</p>
                            <p className="break-all text-white">{formatChangeValue(change.newValue)}</p>
                          </div>
                        </div>
                        {change.reason && <p className="break-words text-[11px] leading-4 text-slate-400">{change.reason}</p>}
                        <div className="grid grid-cols-2 gap-2">
                          {canSync && <button type="button" disabled={busy} onClick={() => marktgoSyncMutation.mutate(change.id)} className="min-h-11 rounded-lg bg-[#1C7480] px-2 text-[11px] font-semibold text-white disabled:opacity-50">MarktGO'da düzelt</button>}
                          {canApprove && <button type="button" disabled={busy} onClick={() => changeActionMutation.mutate({ id: change.id, action: "approve" })} className="min-h-11 rounded-lg border border-teal-500/30 px-2 text-[11px] font-medium text-teal-200 disabled:opacity-50">Onayla</button>}
                          {change.status !== "ignored" && <button type="button" disabled={busy} onClick={() => changeActionMutation.mutate({ id: change.id, action: "ignore" })} className="min-h-10 rounded-lg border border-[#435A6C] px-2 text-[11px] text-slate-300 disabled:opacity-50">Yok say</button>}
                          {change.status !== "seen" && <button type="button" disabled={busy} onClick={() => changeActionMutation.mutate({ id: change.id, action: "mark-seen" })} className="min-h-10 rounded-lg border border-[#435A6C] px-2 text-[11px] text-slate-300 disabled:opacity-50">Görüldü</button>}
                        </div>
                      </div>
                    );
                  })}
                  {group.length > 2 && (
                    <button type="button" onClick={() => setExpandedChangeGroup(current => current === productKey ? null : productKey)}
                      aria-expanded={isExpanded}
                      className="min-h-11 w-full rounded-xl border border-[#476477] bg-[#162E3F] px-3 text-[12px] font-semibold text-teal-100">
                      {isExpanded ? "Ayrıntıları gizle" : `Diğer ${group.length - 2} değişikliği göster`}
                    </button>
                  )}
                  {resolveTrackingSourceUrl(p.productUrl) && (
                    <button type="button" onClick={() => openTrackingSource(p.productUrl)}
                      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#476477] bg-[#172D3D] text-[12px] text-teal-200">
                      <ExternalLink className="h-4 w-4" /> Kaynak ürün sayfasına git
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => checkMutation.mutate(p.trackedProductId)}
                    disabled={checkMutation.isPending}
                    className="min-h-10 w-full rounded-xl border border-[#476477] bg-[#20394B] px-3 text-[12px] font-medium text-white disabled:opacity-50"
                  >Kaynağı yeniden kontrol et</button>
                </article>
              );
            })}
            {mobileChangeGroups.length < filteredGroupedChanges.length && (
              <button type="button" onClick={() => setVisibleChangeGroupCount(count => count + 20)}
                className="min-h-12 w-full rounded-xl border border-[#466577] bg-[#1B3446] text-[13px] font-semibold text-teal-100">
                Daha fazla değişiklik göster ({mobileChangeGroups.length}/{filteredGroupedChanges.length})
              </button>
            )}
          </section>
        )}

        {mobileSection === "fixed" && (
          <section role="tabpanel" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] leading-5 text-slate-400">MarktGO'da otomatik uygulanan değişiklikler.</p>
              <button onClick={() => void autoCorrectedQuery.refetch()} type="button" className="min-h-10 rounded-xl border border-[#3D586A] px-3 text-[12px] text-slate-200">Yenile</button>
            </div>
            {autoCorrectedQuery.isLoading && <p className="text-sm text-slate-400">Kayıtlar yükleniyor...</p>}
            {autoCorrectedQuery.error && <p className="rounded-xl border border-red-500/30 p-3 text-sm text-red-200">{(autoCorrectedQuery.error as Error).message}</p>}
            {!autoCorrectedQuery.isLoading && !autoCorrectedQuery.error && autoCorrectedGroups.length === 0 && (
              <p className="rounded-xl border border-[#304152] p-5 text-center text-sm text-slate-400">Henüz otomatik düzeltilmiş ürün yok.</p>
            )}
            {mobileCorrectedGroups.map(group => {
              const p = group[0];
              return (
                <article key={getChangeProductKey(p)} className="min-w-0 rounded-2xl border border-[#33495B] bg-[#152536] p-3.5">
                  <div className="flex min-w-0 gap-3">
                    <TrackingProductImage imageUrl={p.productImageUrl} title={p.productTitle} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 break-words text-[13px] font-semibold text-white">{p.productTitle || `Ürün #${p.trackedProductId}`}</p>
                      <p className="mt-2 text-[11px] font-medium text-emerald-300">Otomatik düzeltildi</p>
                      <p className="text-[11px] text-slate-400">{formatDate(p.appliedAt || p.createdAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.map(change => (
                      <div key={change.id} className="min-w-0 rounded-xl bg-[#203445] p-3">
                        <p className="break-words text-[12px] font-semibold text-slate-200">{change.fieldName || change.changeType}</p>
                        <p className="mt-1 break-all text-[11px] text-slate-300">{formatChangeValue(change.oldValue)} → {formatChangeValue(change.newValue)}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
            {mobileCorrectedGroups.length < autoCorrectedGroups.length && (
              <button type="button" onClick={() => setVisibleAutoCorrectedCount(count => count + 20)}
                className="min-h-12 w-full rounded-xl border border-[#466577] bg-[#1B3446] text-[13px] font-semibold text-teal-100">
                Daha fazla düzeltilen göster ({mobileCorrectedGroups.length}/{autoCorrectedGroups.length})
              </button>
            )}
          </section>
        )}

        {mobileSection === "settings" && (
          <section role="tabpanel" className="space-y-4 rounded-2xl border border-[#33495B] bg-[#152536] p-4">
            <div>
              <h2 className="text-[16px] font-semibold text-white">Takip Ayarları</h2>
              <p className="mt-1 text-[12px] leading-4 text-slate-400">Kaydedilen ayarlar web ve mobil sistemde ortak uygulanır.</p>
            </div>
            {settingsQuery.isLoading ? <p className="text-slate-400">Yükleniyor...</p> : (
              <>
                {[
                  { key: "trackingEnabled" as const, title: "Takip sistemi" },
                  { key: "schedulerEnabled" as const, title: "Otomatik kontrol" },
                  { key: "autoShopifySyncEnabled" as const, title: "MarktGO otomatik düzeltme" },
                ].map(item => (
                  <label key={item.key} className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-[#203445] px-3 py-2">
                    <span className="min-w-0 flex-1 text-[13px] leading-4 text-slate-200">{item.title}</span>
                    <Switch
                      checked={Boolean(settings?.[item.key])}
                      onCheckedChange={value => setSettingsForm(prev => ({ ...prev, [item.key]: value }))}
                      aria-label={item.title}
                    />
                  </label>
                ))}
                {[
                  { key: "checkIntervalMinutes" as const, label: "Kontrol aralığı (dk)" },
                  { key: "batchSize" as const, label: "Toplu kontrol adedi" },
                  { key: "requestDelayMs" as const, label: "İstek bekleme (ms)" },
                  { key: "maxErrorsBeforePause" as const, label: "Hata sonrası duraklat" },
                ].map(item => (
                  <label key={item.key} className="block space-y-1.5">
                    <span className="text-[12px] text-slate-300">{item.label}</span>
                    <input
                      type="number"
                      min="0"
                      value={settings?.[item.key] ?? ""}
                      onChange={e => setSettingsForm(prev => ({ ...prev, [item.key]: Number(e.target.value) }))}
                      className="mayk-mobile-input h-12 w-full rounded-xl border border-[#3C5364] bg-[#172839] px-3 text-[16px] text-white focus:border-teal-400 focus:outline-none"
                    />
                  </label>
                ))}
                <p className="text-[11px] text-slate-400">Sonraki kontrol: {formatDate(st?.nextRunAt ?? null)}</p>
                <button
                  type="button"
                  disabled={saveSettingsMutation.isPending || Object.keys(settingsForm).length === 0}
                  onClick={() => saveSettingsMutation.mutate(settingsForm)}
                  className="min-h-12 w-full rounded-xl bg-[#1C7480] font-semibold text-white disabled:opacity-50"
                >{saveSettingsMutation.isPending ? "Kaydediliyor..." : "Ayarları kaydet"}</button>
              </>
            )}
          </section>
        )}
      </main>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "container mx-auto p-4 md:p-6 space-y-6 max-w-7xl"}>
      {!embedded && (
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8 text-blue-500" />
            Ürün Takip Sistemi v2
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Kaynak sitedeki fiyat ve stok değişikliklerini izler
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant={st?.safeSchedulerRunning ? "default" : "secondary"}>
            Scheduler: {st?.safeSchedulerRunning ? "çalışıyor" : "durdu"}
          </Badge>
          {st?.legacySystemsRemoved && (
            <Badge variant="outline" className="text-green-600 border-green-600/40">
              Legacy kaldırıldı
            </Badge>
          )}
        </div>
      </div>
      )}

      <Card className="border-border/60 bg-card/40">
        <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Otomatik düzeltme</p>
            <p className="text-xs text-muted-foreground">
              Açıkken bekleyen ve uygulanabilir değişiklikler MARKT-GO&apos;da otomatik düzeltilir;
              tamamlanan kayıtlar Otomatik Düzeltilenler arşivine taşınır
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={autoCorrectOn ? "default" : "secondary"}>
              {autoCorrectOn ? "Açık" : "Kapalı"}
            </Badge>
            <Switch
              id="auto-correct-toggle"
              checked={autoCorrectOn}
              disabled={saveSettingsMutation.isPending || settingsQuery.isLoading}
              onCheckedChange={(v) => {
                setSettingsForm((f) => ({ ...f, autoShopifySyncEnabled: v }));
                saveSettingsMutation.mutate({
                  autoShopifySyncEnabled: v,
                  ...(v ? { trackingEnabled: true, schedulerEnabled: true } : {}),
                });
              }}
            />
          </div>
        </CardContent>
      </Card>

      {trackingOff && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Takip sistemi kapalı</p>
              <p className="text-sm text-muted-foreground">
                Ayarlar sekmesinden &quot;Takip sistemi&quot;ni açabilirsiniz.
              </p>
            </div>
          </CardContent>
        </Card>
      )}


      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Takip edilen",
            value: st?.trackedProductsCount ?? "—",
            hint: st?.activeTrackedProductsCount != null ? `${st.activeTrackedProductsCount} aktif` : undefined,
          },
          { label: "Tespit edilen değişiklik", value: changeCountsQuery.data?.all ?? st?.pendingChangesCount ?? "—" },
          { label: "Manuel inceleme", value: st?.manualReviewCount ?? "—" },
          {
            label: "Son kontrol",
            value: st?.lastRunAt ? formatDate(st.lastRunAt).split(",")[0] : "—",
            hint: st?.intervalMinutes ? `Her ${st.intervalMinutes} dk` : undefined,
          },
        ].map((card) => (
          <Card key={card.label} className="border-border/60 bg-card/40">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
              {card.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{card.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={desktopSection} onValueChange={setDesktopSection}>
        <TabsList>
          <TabsTrigger value="products">Takip Edilen Ürünler</TabsTrigger>
          <TabsTrigger value="changes">
            Değişiklikler
            {(changeCountsQuery.data?.all ?? 0) > 0 && (
              <Badge className="ml-2 h-5 px-1.5" variant="destructive">
                {changeCountsQuery.data?.all}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="auto-corrected">
            Otomatik Düzeltilenler
            {(changeCountsQuery.data?.auto_corrected ?? 0) > 0 && (
              <Badge className="ml-2 h-5 px-1.5" variant="secondary">
                {changeCountsQuery.data?.auto_corrected}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-1" />
            Ayarlar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {productSearch.trim() ? (
                  <>
                    <span className="font-semibold text-foreground">{filteredProducts.length}</span> sonuç bulundu
                    <span className="mx-1.5">·</span>
                    Toplam {productsQuery.data?.length ?? 0} ürün
                  </>
                ) : (
                  <>
                    Toplam <span className="font-semibold text-foreground">{productsQuery.data?.length ?? 0}</span> ürün listeleniyor
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => productsQuery.refetch()}
                disabled={productsQuery.isFetching}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${productsQuery.isFetching ? "animate-spin" : ""}`} />
                Listeyi yenile
              </Button>
            </div>

            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Ürün adı, kaynak site, URL, takip ID veya durum ara..."
                className="h-11 pl-10 pr-10"
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => setProductSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Aramayı temizle"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {productsQuery.isLoading && <p className="text-muted-foreground text-center py-8">Yükleniyor...</p>}
          {productsQuery.error && (
            <Card className="border-destructive/50">
              <CardContent className="py-4 text-destructive text-sm text-center">
                {(productsQuery.error as Error).message}
              </CardContent>
            </Card>
          )}

          {!productsQuery.isLoading && !productsQuery.error && (productsQuery.data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Henüz takip edilen ürün yok. MARKT-GO&apos;ya başarılı gönderim sonrası otomatik eklenir.
              </CardContent>
            </Card>
          )}

          {!productsQuery.isLoading &&
            !productsQuery.error &&
            (productsQuery.data?.length ?? 0) > 0 &&
            filteredProducts.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Search className="w-9 h-9 mx-auto mb-3 opacity-40" />
                  <p>Aramanızla eşleşen takip ürünü bulunamadı.</p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setProductSearch("")}>
                    Aramayı temizle
                  </Button>
                </CardContent>
              </Card>
            )}

          <div className="grid gap-3">
            {visibleProducts.map((p) => (
              <article
                key={p.id}
                className="rounded-xl border border-border/60 bg-card/50 p-4 flex gap-4"
              >
                <div className="shrink-0 space-y-2">
                  <TrackingProductImage
                    imageUrl={p.productImageUrl}
                    title={p.sourceTitle}
                    size="lg"
                  />
                  {p.sourceLogoUrl && (
                    <div className="flex items-center justify-center">
                      <img
                        src={p.sourceLogoUrl}
                        alt={p.sourceSiteName || p.sourceSite || "Kaynak site"}
                        className="h-5 w-5 rounded object-contain bg-white/90 p-0.5"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium leading-snug line-clamp-2 text-[15px] pr-2">
                        {p.sourceTitle}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">
                          {p.sourceLogoUrl && (
                            <img
                              src={p.sourceLogoUrl}
                              alt=""
                              className="h-4 w-4 rounded object-contain bg-white/90 p-0.5"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                          {p.sourceSiteName || p.sourceSite || "Kaynak site"}
                        </span>
                        {p.archivedAt && (
                          <Badge variant="outline" className="text-[10px]">
                            Arşiv
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={p.currentStatus === "active" ? "default" : "secondary"}
                      className="shrink-0 text-xs"
                    >
                      {p.currentStatus === "active" ? "Aktif" : p.currentStatus}
                    </Badge>
                  </div>

                  {(p.productImageUrls?.length ?? 0) > 1 && (
                    <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                      {p.productImageUrls!.slice(0, 8).map((imageUrl, imageIndex) => (
                        <a
                          key={`${p.id}-image-${imageIndex}`}
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg border border-border/50 bg-background/40 p-1 hover:border-primary/50"
                          title={`Görsel ${imageIndex + 1}`}
                        >
                          <img
                            src={imageUrl}
                            alt={`${p.sourceTitle} görsel ${imageIndex + 1}`}
                            className="h-12 w-12 rounded-md object-cover"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">Fiyat: </span>
                      {p.currentSourcePrice ? `${p.currentSourcePrice} ₺` : "—"}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Stok: </span>
                      {p.currentSourceStock ?? "—"}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-background/25 px-3 py-2.5 space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Zaman çizelgesi
                    </p>
                    <dl className="grid gap-1 sm:grid-cols-2">
                      {buildProductTrackingTimeline({
                        productCreatedAt: p.createdAt,
                        shopifyTransferredAt: p.shopifyTransferredAt,
                        productLastCheckedAt: p.lastCheckedAt,
                        productLastSuccessAt: p.lastSuccessAt,
                        productLastShopifySyncAt: p.lastShopifySyncAt,
                      }).map((point) => (
                        <div
                          key={`${p.id}-${point.label}`}
                          className="flex items-baseline gap-2 text-xs"
                        >
                          <dt className="text-muted-foreground shrink-0 min-w-[7.5rem]">
                            {point.label}
                          </dt>
                          <dd className="font-medium tabular-nums text-foreground/90">
                            {formatTrackingDateTime(point.at)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {p.lastErrorMessage && (
                    <p className="text-sm text-destructive flex items-center gap-1.5 rounded-lg bg-destructive/5 px-3 py-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {p.lastErrorMessage}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => checkMutation.mutate(p.id)}
                      disabled={checkMutation.isPending || !p.trackingEnabled}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Kontrol Et
                    </Button>
                    {p.trackingEnabled ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ id: p.id, enable: false })}
                        disabled={toggleMutation.isPending}
                      >
                        <Pause className="w-4 h-4 mr-1" />
                        Duraklat
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ id: p.id, enable: true })}
                        disabled={toggleMutation.isPending}
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Etkinleştir
                      </Button>
                    )}
                    {resolveTrackingSourceUrl(p.sourceUrl) ? (
                      <Button size="sm" variant="ghost" type="button" onClick={() => openTrackingSource(p.sourceUrl)}>
                        <ExternalLink className="w-4 h-4 mr-1" /> Kaynağa Git
                      </Button>
                    ) : <Badge variant="outline">Kaynak URL yok</Badge>}
                  </div>
                </div>
              </article>
            ))}
            {visibleProducts.length < filteredProducts.length && (
              <Button type="button" variant="outline" className="min-h-11 w-full"
                onClick={() => setVisibleProductCount(count => count + 40)}>
                Daha fazla ürün göster ({visibleProducts.length}/{filteredProducts.length})
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="changes" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Değişiklikler yalnız bekleyen, manuel işlem gerektiren ve manuel uygulanmış kayıtları gösterir.
            Otomatik düzeltme ile tamamlanan kayıtlar bu bölümden çıkarılır ve ayrı arşivde saklanır.
          </p>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {CHANGE_FILTERS.map((f) => {
                  const count = changeCountsQuery.data?.[f.countKey] ?? 0;
                  return (
                    <Button
                      key={f.value}
                      size="sm"
                      variant={statusFilter === f.value ? "default" : "outline"}
                      className="h-8"
                      onClick={() => {
                        setStatusFilter(f.value);
                        setKindFilter(null);
                      }}
                    >
                      {f.label}
                      <span
                        className={`ml-1.5 tabular-nums ${
                          statusFilter === f.value ? "opacity-90" : "text-muted-foreground"
                        }`}
                      >
                        ({count})
                      </span>
                    </Button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                {statusFilter !== "ignored" && statusFilter !== "seen" && statusFilter !== "applied" && statusFilter !== "history" && bulkFixIds.length > 0 && (
                  <Button
                    size="sm"
                    disabled={bulkMarktGoSyncMutation.isPending}
                    onClick={() => bulkMarktGoSyncMutation.mutate(bulkFixIds)}
                  >
                    {bulkMarktGoSyncMutation.isPending
                      ? "Güncelleniyor…"
                      : `Toplu düzelt (${bulkFixIds.length})`}
                  </Button>
                )}
                {statusFilter !== "ignored" && statusFilter !== "seen" && statusFilter !== "applied" && statusFilter !== "history" && approvableIds.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkApproveMutation.isPending || bulkMarktGoSyncMutation.isPending}
                    onClick={() => bulkApproveMutation.mutate(approvableIds)}
                  >
                    Toplu Onayla ({approvableIds.length})
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => changesQuery.refetch()}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${changesQuery.isFetching ? "animate-spin" : ""}`} />
                  Yenile
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
                Doğruluk
              </span>
              {AUTHENTICITY_FILTERS.map((f) => {
                const count = authenticityCounts[f.value];
                const active = authenticityFilter === f.value;
                return (
                  <Button
                    key={f.value}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8"
                    title={f.hint}
                    onClick={() => setAuthenticityFilter(f.value)}
                  >
                    {f.label}
                    <span
                      className={`ml-1.5 tabular-nums ${
                        active ? "opacity-90" : "text-muted-foreground"
                      }`}
                    >
                      ({count})
                    </span>
                  </Button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CHANGE_KIND_FILTERS.map((f) => {
                const count = kindFilterCounts[f.value];
                const active = kindFilter === f.value;
                return (
                  <Button
                    key={f.value}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8"
                    onClick={() => setKindFilter((prev) => (prev === f.value ? null : f.value))}
                  >
                    {f.label}
                    <span
                      className={`ml-1.5 tabular-nums ${
                        active ? "opacity-90" : "text-muted-foreground"
                      }`}
                    >
                      ({changesQuery.isLoading ? "…" : count})
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          {changesQuery.isLoading && (
            <p className="text-muted-foreground text-sm">Değişiklikler yükleniyor…</p>
          )}
          {!changesQuery.isLoading &&
            (changesQuery.data?.length ?? 0) >= 400 &&
            (changeCountsQuery.data?.all ?? 0) > 400 && (
              <p className="text-xs text-muted-foreground">
                Son 400 kayıt gösteriliyor. Filtreleyerek daraltın.
              </p>
            )}
          {changesQuery.error && (
            <Card className="border-destructive/50">
              <CardContent className="py-4 text-destructive text-sm">
                {(changesQuery.error as Error).message}
                <Button variant="outline" size="sm" className="ml-3" onClick={() => changesQuery.refetch()}>
                  Tekrar dene
                </Button>
              </CardContent>
            </Card>
          )}

          {!changesQuery.isLoading && !changesQuery.error && (changesQuery.data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                Henüz kayıtlı değişiklik yok
              </CardContent>
            </Card>
          )}

          {!changesQuery.isLoading &&
            !changesQuery.error &&
            (changesQuery.data?.length ?? 0) > 0 &&
            filteredGroupedChanges.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  Bu sınıfta listelenecek ürün yok
                </CardContent>
              </Card>
            )}

          <div className="grid gap-3">
            {filteredGroupedChanges.map((changes) => (
              <TrackingChangeGroupCard
                key={getChangeProductKey(changes[0])}
                changes={changes}
                busy={
                  changeActionMutation.isPending ||
                  marktgoSyncMutation.isPending ||
                  bulkApproveMutation.isPending ||
                  bulkMarktGoSyncMutation.isPending
                }
                rechecking={
                  checkMutation.isPending && checkMutation.variables === changes[0].trackedProductId
                }
                onMarkSeen={(id) => changeActionMutation.mutate({ id, action: "mark-seen" })}
                onIgnore={(id) => changeActionMutation.mutate({ id, action: "ignore" })}
                onApprove={(id) => changeActionMutation.mutate({ id, action: "approve" })}
                onMarktGoSync={(id) => marktgoSyncMutation.mutate(id)}
                onApproveMany={(ids) => bulkApproveMutation.mutate(ids)}
                onMarktGoSyncMany={(ids) => bulkMarktGoSyncMutation.mutate(ids)}
                onRecheck={() => checkMutation.mutate(changes[0].trackedProductId)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="auto-corrected" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold">Otomatik Düzeltilenler</h2>
              <p className="text-sm text-muted-foreground">
                Otomatik düzeltme tarafından MARKT-GO&apos;ya başarıyla uygulanan kayıtlar.
                Bu kayıtlar Değişiklikler bölümünde tekrar gösterilmez.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoCorrectedQuery.refetch()}
              disabled={autoCorrectedQuery.isFetching}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${autoCorrectedQuery.isFetching ? "animate-spin" : ""}`}
              />
              Yenile
            </Button>
          </div>

          {autoCorrectedQuery.isLoading && (
            <p className="text-muted-foreground text-sm">Otomatik düzeltilenler yükleniyor…</p>
          )}

          {autoCorrectedQuery.error && (
            <Card className="border-destructive/50">
              <CardContent className="py-4 text-destructive text-sm">
                {(autoCorrectedQuery.error as Error).message}
              </CardContent>
            </Card>
          )}

          {!autoCorrectedQuery.isLoading &&
            !autoCorrectedQuery.error &&
            autoCorrectedGroups.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Henüz otomatik düzeltilmiş ürün yok
                </CardContent>
              </Card>
            )}

          <div className="grid gap-3">
            {autoCorrectedGroups.map((changes) => {
              const product = changes[0];
              const latestApplied = [...changes]
                .sort(
                  (a, b) =>
                    new Date(b.appliedAt || b.createdAt).getTime() -
                    new Date(a.appliedAt || a.createdAt).getTime(),
                )[0];
              return (
                <article
                  key={getChangeProductKey(product)}
                  className="rounded-xl border border-border/60 bg-card/50 p-4"
                >
                  <div className="flex gap-4">
                    <TrackingProductImage
                      imageUrl={product.productImageUrl}
                      title={product.productTitle || `Ürün #${product.trackedProductId}`}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium leading-snug line-clamp-2 text-[15px]">
                            {product.productTitle || `Ürün #${product.trackedProductId}`}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Son düzeltme: {formatDate(latestApplied.appliedAt ?? latestApplied.createdAt)}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                        >
                          Otomatik düzeltildi
                        </Badge>
                      </div>

                      <div className="grid gap-2">
                        {changes.map((change) => (
                          <div
                            key={change.id}
                            className="rounded-lg border border-border/40 bg-background/30 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                {change.fieldName || change.changeType}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(change.appliedAt ?? change.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              {formatChangeValue(change.oldValue)} → {formatChangeValue(change.newValue)}
                            </p>
                          </div>
                        ))}
                      </div>

                      {product.productUrl && /^https?:\/\//i.test(product.productUrl) && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={product.productUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Kaynak
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Takip Ayarları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              {settingsQuery.isLoading ? (
                <p className="text-muted-foreground">Yükleniyor...</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Takip sistemi açık</Label>
                    <Switch
                      checked={settings?.trackingEnabled ?? true}
                      onCheckedChange={(v) => setSettingsForm((f) => ({ ...f, trackingEnabled: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Otomatik kontrol (scheduler)</Label>
                    <Switch
                      checked={settings?.schedulerEnabled ?? true}
                      onCheckedChange={(v) => setSettingsForm((f) => ({ ...f, schedulerEnabled: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Otomatik düzeltme</Label>
                      <p className="text-xs text-muted-foreground">
                        Bekleyen ve uygulanabilir değişiklikleri MARKT-GO&apos;da otomatik düzeltir;
                        tamamlananları ayrı arşive taşır
                      </p>
                    </div>
                    <Switch
                      checked={autoCorrectOn}
                      disabled={saveSettingsMutation.isPending}
                      onCheckedChange={(v) => {
                        setSettingsForm((f) => ({ ...f, autoShopifySyncEnabled: v }));
                        saveSettingsMutation.mutate({
                          autoShopifySyncEnabled: v,
                          ...(v ? { trackingEnabled: true, schedulerEnabled: true } : {}),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Kontrol aralığı (dakika)</Label>
                    <Input
                      type="number"
                      value={settings?.checkIntervalMinutes ?? 60}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, checkIntervalMinutes: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Batch size</Label>
                    <Input
                      type="number"
                      value={settings?.batchSize ?? 5}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, batchSize: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>İstek bekleme (ms)</Label>
                    <Input
                      type="number"
                      value={settings?.requestDelayMs ?? 1500}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, requestDelayMs: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Max hata sonrası duraklat</Label>
                    <Input
                      type="number"
                      value={settings?.maxErrorsBeforePause ?? 5}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, maxErrorsBeforePause: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Sonraki scheduler: {formatDate(st?.nextRunAt ?? null)}
                  </div>
                  <Button
                    onClick={() => saveSettingsMutation.mutate(settingsForm)}
                    disabled={saveSettingsMutation.isPending || Object.keys(settingsForm).length === 0}
                  >
                    Kaydet
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
