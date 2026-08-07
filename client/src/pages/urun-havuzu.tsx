import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Link2,
  ListTodo,
  Plus,
  Tag,
  Trash2,
  Eraser,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type PoolFeature = { name: string; value: string };

type PoolProduct = {
  poolId: string;
  title: string;
  sourceUrl: string;
  siteName: string;
  siteLogoUrl: string;
  brand?: string;
  sku?: string;
  currency: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  salePrice: number;
  images: string[];
  features?: PoolFeature[];
  inStock: boolean;
  scrapedAt: string;
};

type TrackItem = {
  /** Benzersiz havuz ID — URL’den stabil (PH-XXXXXX) */
  id: string;
  sourceUrl: string;
  title: string;
  siteName: string;
  siteLogoUrl: string;
  price: number;
  salePrice: number;
  inStock: boolean;
  shopifyPrice?: number;
  shopifyProductId?: string;
  image?: string;
  tags?: string[];
  addedAt: string;
  lastCheckedAt?: string;
  removed?: boolean;
};

type PoolNotification = {
  id: string;
  trackId: string;
  kind: "price" | "stock" | "removed";
  title: string;
  message: string;
  at: string;
  read: boolean;
};

const TRACK_KEY = "product-pool-tracking-v2";
const NOTIF_KEY = "product-pool-notifications-v1";
const POLL_MS = 3 * 60 * 1000;

/** Kaynak URL’den stabil benzersiz havuz ID */
function makePoolId(url: string): string {
  const normalized = url.trim().toLowerCase().replace(/\/$/, "");
  let h = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 8);
  return `PH-${hex}`;
}

function withPoolId(p: Omit<PoolProduct, "poolId"> & { poolId?: string }): PoolProduct {
  return { ...p, poolId: p.poolId || makePoolId(p.sourceUrl) };
}

/** Shopify torba ikonu — yeşil bag + beyaz S */
function ShopifyBagIcon({ className = "w-7 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="shopifyBagGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8d05a" />
          <stop offset="100%" stopColor="#7aa63a" />
        </linearGradient>
      </defs>
      {/* bag body */}
      <path
        fill="url(#shopifyBagGrad)"
        d="M8.5 14.5c0-1 .8-1.8 1.8-1.8h19.4c1 0 1.8.8 1.8 1.8v24.2c0 2.2-1.8 4-4 4H12.5c-2.2 0-4-1.8-4-4V14.5z"
      />
      {/* handle */}
      <path
        fill="none"
        stroke="#96bf48"
        strokeWidth="2.4"
        strokeLinecap="round"
        d="M14 14.2c0-4.2 2.6-7.4 6-7.4s6 3.2 6 7.4"
      />
      {/* white S */}
      <text
        x="20"
        y="32"
        textAnchor="middle"
        fill="#fff"
        fontSize="16"
        fontWeight="800"
        fontFamily="system-ui,Segoe UI,sans-serif"
      >
        S
      </text>
    </svg>
  );
}

/** Gönderilen tasarıma birebir Shopify gönder butonu */
function ShopifySendButton({
  onClick,
  disabled,
  loading,
  label = "send",
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: "send" | "bulk";
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`group w-full inline-flex items-center justify-between gap-3 rounded-full border-2 border-[#96bf48] bg-[#0a0a0a] px-5 py-3.5 transition-all duration-200 hover:border-[#7aa63a] hover:bg-gradient-to-b hover:from-[#a8d05a] hover:to-[#96bf48] hover:shadow-[0_0_28px_rgba(150,191,72,0.7)] disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      <span className="inline-flex items-center gap-3 min-w-0">
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-white group-hover:!text-black shrink-0" />
        ) : (
          <ShopifyBagIcon className="w-7 h-8 shrink-0 drop-shadow-sm" />
        )}
        {/* Tek renk sınıfı: arbitrary text-[#…] hover'da yenilmezdi → yazı kayboluyordu */}
        <span className="font-bold text-[15px] tracking-tight leading-none text-white group-hover:!text-black transition-colors">
          {label === "bulk" ? "Toplu Gönder" : "Shopify'a Gönder"}
        </span>
      </span>
      <span className="shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors bg-transparent group-hover:bg-black/20">
        <ChevronRight
          className="w-5 h-5 text-white group-hover:!text-black transition-colors"
          strokeWidth={2.5}
        />
      </span>
    </button>
  );
}

function formatMoney(n: number, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency === "TRY" ? "TRY" : currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;\n]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

function migrateTrackItem(raw: Record<string, unknown>): TrackItem | null {
  const sourceUrl = String(raw.sourceUrl || "");
  if (!sourceUrl) return null;
  const id =
    typeof raw.id === "string" && raw.id.startsWith("PH-")
      ? raw.id
      : makePoolId(sourceUrl);
  return {
    id,
    sourceUrl,
    title: String(raw.title || "Ürün"),
    siteName: String(raw.siteName || ""),
    siteLogoUrl: String(raw.siteLogoUrl || ""),
    price: Number(raw.price) || 0,
    salePrice: Number(raw.salePrice) || 0,
    inStock: raw.inStock !== false && raw.removed !== true,
    shopifyPrice: raw.shopifyPrice != null ? Number(raw.shopifyPrice) : undefined,
    shopifyProductId: raw.shopifyProductId ? String(raw.shopifyProductId) : undefined,
    image: raw.image ? String(raw.image) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    addedAt: String(raw.addedAt || new Date().toISOString()),
    lastCheckedAt: raw.lastCheckedAt ? String(raw.lastCheckedAt) : undefined,
    removed: raw.removed === true,
  };
}

function loadTracking(): TrackItem[] {
  try {
    let raw = localStorage.getItem(TRACK_KEY);
    if (!raw) {
      raw = localStorage.getItem("product-pool-tracking-v1");
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => migrateTrackItem(row as Record<string, unknown>))
      .filter((x): x is TrackItem => Boolean(x));
  } catch {
    return [];
  }
}

function saveTracking(items: TrackItem[]) {
  localStorage.setItem(TRACK_KEY, JSON.stringify(items));
}

function loadNotifications(): PoolNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotifications(items: PoolNotification[]) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(items.slice(0, 50)));
}

function extractUrlsFromText(text: string): string[] {
  const re = /https?:\/\/[^\s<>"']+/gi;
  return [...new Set((text.match(re) || []).map((u) => u.replace(/[.,;)]+$/, "")))];
}

function SiteLogoBesideTitle({
  logoUrl,
  siteName,
}: {
  logoUrl?: string;
  siteName: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 rounded bg-white border border-neutral-300 px-2 py-1">
      {logoUrl && !failed ? (
        <img
          src={logoUrl}
          alt=""
          className="h-5 w-auto max-w-[72px] object-contain"
          onError={() => setFailed(true)}
        />
      ) : null}
      <span className="text-xs font-semibold text-neutral-800 whitespace-nowrap">{siteName}</span>
    </span>
  );
}

export default function UrunHavuzuPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [urlList, setUrlList] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [products, setProducts] = useState<PoolProduct[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [tracking, setTracking] = useState<TrackItem[]>([]);
  const [notifications, setNotifications] = useState<PoolNotification[]>([]);
  const trackingRef = useRef<TrackItem[]>([]);
  const pollBusyRef = useRef(false);

  useEffect(() => {
    const loaded = loadTracking();
    setTracking(loaded);
    trackingRef.current = loaded;
    setNotifications(loadNotifications());
  }, []);

  useEffect(() => {
    trackingRef.current = tracking;
  }, [tracking]);

  const product = products[activeIndex] || null;
  const images = product?.images?.length ? product.images : [];
  const activeImage = images[imageIndex] || images[0];
  const unreadNotifs = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );
  const shopifyPreviewPrice = product
    ? Math.round(product.salePrice * 1.1 * 100) / 100
    : 0;

  const pushNotification = useCallback(
    (n: Omit<PoolNotification, "id" | "at" | "read">) => {
      const item: PoolNotification = {
        ...n,
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => {
        const next = [item, ...prev].slice(0, 50);
        saveNotifications(next);
        return next;
      });
      toast({
        title: n.title,
        description: n.message,
        variant: n.kind === "removed" ? "destructive" : "default",
      });
    },
    [toast],
  );

  const addTagsFromRaw = useCallback((raw: string) => {
    const next = parseTags(raw);
    if (!next.length) return;
    setTags((prev) => {
      const merged = [...prev];
      for (const t of next) {
        if (!merged.some((x) => x.toLowerCase() === t.toLowerCase())) merged.push(t);
      }
      return merged;
    });
    setTagDraft("");
  }, []);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const upsertTracking = useCallback((item: TrackItem) => {
    setTracking((prev) => {
      const without = prev.filter((t) => t.id !== item.id && t.sourceUrl !== item.sourceUrl);
      const next = [item, ...without];
      saveTracking(next);
      trackingRef.current = next;
      return next;
    });
  }, []);

  const addUrlsToList = useCallback(
    (rawText: string) => {
      const urls = extractUrlsFromText(rawText);
      if (!urls.length) {
        toast({
          title: "URL bulunamadı",
          description: "Geçerli bir ürün linki sürükleyin veya yapıştırın",
          variant: "destructive",
        });
        return;
      }
      setUrlList((prev) => {
        const merged = [...prev];
        for (const u of urls) {
          if (!merged.includes(u)) merged.push(u);
        }
        return merged;
      });
    },
    [toast],
  );

  const removeUrlFromList = useCallback((url: string) => {
    setUrlList((prev) => prev.filter((u) => u !== url));
  }, []);

  const scrapeUrls = useCallback(
    async (urls: string[]) => {
      if (!urls.length) {
        toast({
          title: "URL gerekli",
          description: "Listeye en az bir ürün linki ekleyin",
          variant: "destructive",
        });
        return;
      }

      setLoading(true);
      setProducts([]);
      setActiveIndex(0);
      setImageIndex(0);
      const scraped: PoolProduct[] = [];

      try {
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          setLoadingProgress(`${i + 1}/${urls.length}`);
          const res = await fetch("/api/product-pool/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            toast({
              title: "Çekim atlandı",
              description: `${url}: ${data.error || "başarısız"}`,
              variant: "destructive",
            });
            continue;
          }
          scraped.push(withPoolId(data.product as Omit<PoolProduct, "poolId">));
        }

        if (!scraped.length) {
          throw new Error("Hiçbir URL çekilemedi");
        }

        setProducts(scraped);
        toast({
          title: "Ürünler çekildi",
          description: `${scraped.length} ürün hazır`,
        });
      } catch (err) {
        toast({
          title: "Çekim başarısız",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setLoadingProgress("");
      }
    },
    [toast],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const text =
        e.dataTransfer.getData("text/uri-list") ||
        e.dataTransfer.getData("text/plain") ||
        "";
      addUrlsToList(text);
    },
    [addUrlsToList],
  );

  const removeTrack = (id: string) => {
    const next = tracking.filter((t) => t.id !== id);
    setTracking(next);
    trackingRef.current = next;
    saveTracking(next);
  };

  const trackFromProduct = (
    p: PoolProduct,
    extras?: { shopifyPrice?: number; productId?: string },
  ) => {
    upsertTracking({
      id: p.poolId || makePoolId(p.sourceUrl),
      sourceUrl: p.sourceUrl,
      title: p.title,
      siteName: p.siteName,
      siteLogoUrl: p.siteLogoUrl,
      price: p.price,
      salePrice: p.salePrice,
      inStock: p.inStock !== false,
      shopifyPrice: extras?.shopifyPrice,
      shopifyProductId: extras?.productId,
      image: p.images[0],
      tags: tags.length ? tags : undefined,
      addedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      removed: false,
    });
  };

  const runTrackingPoll = useCallback(async () => {
    if (pollBusyRef.current) return;
    const items = trackingRef.current.filter((t) => !t.removed);
    if (!items.length) return;
    pollBusyRef.current = true;
    try {
      for (const item of items) {
        try {
          const res = await fetch("/api/product-pool/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: item.sourceUrl }),
          });
          const data = await res.json();
          if (!res.ok || !data.success || !data.product) {
            const updated: TrackItem = {
              ...item,
              removed: true,
              inStock: false,
              lastCheckedAt: new Date().toISOString(),
            };
            upsertTracking(updated);
            pushNotification({
              trackId: item.id,
              kind: "removed",
              title: "Ürün kaldırıldı",
              message: `${item.id} · ${item.title} artık erişilemiyor`,
            });
            continue;
          }
          const fresh = withPoolId(data.product as Omit<PoolProduct, "poolId">);
          const priceChanged =
            Math.abs((Number(fresh.salePrice) || 0) - (Number(item.salePrice) || 0)) >= 0.01;
          const stockChanged = Boolean(fresh.inStock) !== Boolean(item.inStock);

          if (priceChanged) {
            pushNotification({
              trackId: item.id,
              kind: "price",
              title: "Fiyat güncellendi",
              message: `${item.id} · ${formatMoney(item.salePrice)} → ${formatMoney(fresh.salePrice)}`,
            });
          }
          if (stockChanged) {
            pushNotification({
              trackId: item.id,
              kind: "stock",
              title: fresh.inStock ? "Stokta" : "Stok bitti",
              message: `${item.id} · ${fresh.title}`,
            });
          }

          upsertTracking({
            ...item,
            title: fresh.title,
            siteName: fresh.siteName,
            siteLogoUrl: fresh.siteLogoUrl,
            price: fresh.price,
            salePrice: fresh.salePrice,
            inStock: fresh.inStock !== false,
            image: fresh.images[0] || item.image,
            lastCheckedAt: new Date().toISOString(),
            removed: false,
          });
        } catch {
          /* tek ürün hatası poll’u bozmaz */
        }
      }
    } finally {
      pollBusyRef.current = false;
    }
  }, [pushNotification, upsertTracking]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void runTrackingPoll();
    }, POLL_MS);
    const boot = window.setTimeout(() => void runTrackingPoll(), 12_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(boot);
    };
  }, [runTrackingPoll]);

  const sendOne = async (p: PoolProduct) => {
    const res = await fetch("/api/product-pool/shopify-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: { ...p, tags },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Shopify gönderimi başarısız",
      );
    }
    trackFromProduct(p, { shopifyPrice: data.shopifyPrice, productId: data.productId });
    return data as { shopifyPrice: number; productId: string };
  };

  const sendToShopify = async () => {
    if (!product) return;
    setUploading(true);
    try {
      const data = await sendOne(product);
      toast({
        title: "Shopify'a aktif gönderildi",
        description: `${product.poolId} · ${formatMoney(product.salePrice)} → ${formatMoney(data.shopifyPrice)} (+%10)`,
      });
      setDrawerOpen(true);
    } catch (err) {
      toast({
        title: "Shopify hatası",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const sendBulk = async () => {
    if (products.length < 2) return;
    setBulkUploading(true);
    try {
      const res = await fetch("/api/product-pool/shopify-upload-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: products.map((p) => ({ ...p, tags })),
          tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Toplu gönderim başarısız");
      }

      for (const r of data.results || []) {
        if (!r.success) continue;
        const p = products.find((x) => x.sourceUrl === r.sourceUrl);
        if (p) trackFromProduct(p, { shopifyPrice: r.shopifyPrice, productId: r.productId });
      }

      toast({
        title: "Toplu gönderim tamam",
        description: `${data.ok} başarılı · ${data.fail} hata`,
      });
      setDrawerOpen(true);
    } catch (err) {
      toast({
        title: "Toplu gönderim hatası",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBulkUploading(false);
    }
  };

  const discountLabel =
    product && product.discountPercent > 0 ? `%${product.discountPercent}` : "%0";

  /** Takip listesine dokunmadan çalışma alanını sıfırla */
  const clearWorkspace = useCallback(() => {
    if (loading || uploading || bulkUploading) return;
    setUrlList([]);
    setProducts([]);
    setActiveIndex(0);
    setImageIndex(0);
    setTags([]);
    setTagDraft("");
    setDragOver(false);
    setLoadingProgress("");
    toast({
      title: "Sayfa temizlendi",
      description:
        tracking.length > 0
          ? `Takipteki ${tracking.length} ürün korundu — yeni URL ekleyebilirsiniz`
          : "Yeni URL ekleyebilirsiniz",
    });
  }, [bulkUploading, loading, toast, tracking.length, uploading]);

  const markAllNotifsRead = () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(next);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-black text-neutral-200">
      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-300"
              aria-label="Geri"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="relative w-12 h-12 shrink-0" style={{ perspective: 600 }}>
              <motion.img
                src="/product-pool-shark-3d.png"
                alt="Ürün Havuzu"
                className="w-12 h-12 object-contain"
                animate={{ rotateY: [0, 10, 0, -10, 0], y: [0, -2, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                style={{ transformStyle: "preserve-3d" }}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-wide text-white truncate">ÜRÜN HAVUZU</h1>
              <p className="text-xs text-neutral-500 truncate">Bağımsız ürün çekme · ara sıra siteler</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  if (!notifOpen) markAllNotifsRead();
                }}
                className="inline-flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 p-2 text-neutral-100"
                title="Bildirimler"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
                    {unreadNotifs > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-h-80 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl z-50">
                  <div className="px-3 py-2 border-b border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                    Takip bildirimleri
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm text-neutral-600">Henüz bildirim yok</p>
                  ) : (
                    <ul className="divide-y divide-neutral-800">
                      {notifications.slice(0, 20).map((n) => (
                        <li key={n.id} className="px-3 py-2.5">
                          <p className="text-sm font-semibold text-neutral-100">{n.title}</p>
                          <p className="text-xs text-neutral-400 mt-0.5">{n.message}</p>
                          <p className="text-[10px] text-neutral-600 mt-1">
                            {new Date(n.at).toLocaleString("tr-TR")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-100"
            >
              <ListTodo className="w-4 h-4 text-neutral-300" />
              Takip
              {tracking.length > 0 && (
                <span className="rounded-full bg-neutral-900 border border-neutral-600 px-2 py-0.5 text-xs">
                  {tracking.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch">
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text/plain");
                if (text) {
                  e.preventDefault();
                  addUrlsToList(text);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).focus();
                }
              }}
              className={`flex-1 min-h-[44px] h-11 rounded-lg border border-dashed px-4 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 ${
                dragOver
                  ? "border-neutral-300 bg-neutral-900 text-neutral-200"
                  : "border-neutral-600 bg-neutral-950 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Link2 className="w-4 h-4 shrink-0 opacity-70" />
              <span className="text-sm font-medium tracking-wide">Sürükle bırak</span>
              <span className="text-xs text-neutral-600 hidden sm:inline">veya buraya yapıştırın</span>
            </div>
            <button
              type="button"
              disabled={loading || urlList.length === 0}
              onClick={() => void scrapeUrls(urlList)}
              className="rounded-lg bg-neutral-200 hover:bg-white text-black px-4 py-2.5 font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2 sm:min-w-[128px]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Ürünü Çek{loadingProgress ? ` (${loadingProgress})` : ""}
            </button>
            <button
              type="button"
              disabled={
                loading ||
                uploading ||
                bulkUploading ||
                (urlList.length === 0 && products.length === 0 && tags.length === 0)
              }
              onClick={clearWorkspace}
              className="rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 px-3 py-2.5 font-semibold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2"
              title="Takiptekiler hariç URL listesi, ürün kartları ve etiketleri temizler"
            >
              <Eraser className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Sayfayı Temizle</span>
              <span className="sm:hidden">Temizle</span>
            </button>
          </div>

          {urlList.length > 0 && (
            <ul className="rounded-lg border border-neutral-800 bg-black/60 divide-y divide-neutral-800 overflow-hidden">
              {urlList.map((url) => (
                <li
                  key={url}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-300"
                >
                  <Link2 className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-mono text-xs sm:text-sm" title={url}>
                    {url}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUrlFromList(url)}
                    className="shrink-0 p-1 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                    aria-label="URL sil"
                    title="Sil"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-neutral-600">
            Destek: hepegitim.com, idefix.com, pazarama.com, pttavm.com, n11.com ve genel Open Graph.
            Toplu gönderim butonu 2+ üründe görünür.
          </p>
        </div>

        {/* Etiketler — ince uzun satır; tek tek veya virgülle toplu */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 h-11 rounded-lg border border-neutral-800 bg-neutral-950 px-3">
            <Tag className="w-4 h-4 text-neutral-500 shrink-0" />
            <span className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold shrink-0 hidden sm:inline">
              Etiketler
            </span>
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTagsFromRaw(tagDraft);
                }
              }}
              placeholder="Tek etiket veya virgülle toplu (ör. lego, oyuncak)"
              className="flex-1 min-w-0 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600 h-full"
            />
            <button
              type="button"
              onClick={() => addTagsFromRaw(tagDraft)}
              disabled={!tagDraft.trim()}
              className="shrink-0 inline-flex items-center gap-1 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 px-2.5 py-1.5 text-xs font-semibold text-neutral-100"
              title="Ekle (virgül varsa toplu)"
            >
              <Plus className="w-3.5 h-3.5" />
              Ekle
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-0.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-black px-2 py-0.5 text-xs text-neutral-300"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-neutral-500 hover:text-white"
                    aria-label={`${t} sil`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {products.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5">
            <p className="text-sm text-neutral-300">
              <span className="font-semibold text-white">{products.length}</span> ürün listede
            </p>
            <div className="w-full sm:w-auto sm:min-w-[240px]">
              <ShopifySendButton
                label="bulk"
                loading={bulkUploading}
                disabled={loading}
                onClick={sendBulk}
              />
            </div>
          </div>
        )}

        {!product && !loading && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-8 text-center text-neutral-500">
            <img
              src="/product-pool-shark-3d.png"
              alt=""
              className="mx-auto w-20 h-20 object-contain opacity-70 mb-3"
            />
            <p className="font-medium text-neutral-400">Henüz ürün yok</p>
            <p className="text-sm mt-1 text-neutral-600">URL çekince yatay ürün kartı açılır</p>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-10 flex flex-col items-center gap-3 text-neutral-500">
            <Loader2 className="w-7 h-7 animate-spin text-neutral-300" />
            Ürün verisi çekiliyor{loadingProgress ? ` (${loadingProgress})` : ""}…
          </div>
        )}

        {products.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {products.map((p, i) => (
              <button
                key={p.sourceUrl}
                type="button"
                onClick={() => {
                  setActiveIndex(i);
                  setImageIndex(0);
                }}
                className={`shrink-0 max-w-[200px] rounded-lg border px-3 py-2 text-left text-xs ${
                  i === activeIndex
                    ? "border-neutral-400 bg-neutral-900 text-white"
                    : "border-neutral-800 bg-black text-neutral-400 hover:border-neutral-600"
                }`}
              >
                <span className="block font-mono text-[10px] text-neutral-500 mb-0.5">
                  {p.poolId}
                </span>
                <span className="line-clamp-2 font-semibold">{p.title}</span>
              </button>
            ))}
          </div>
        )}

        {product && (
          <article className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="flex flex-col sm:flex-row gap-0">
              <div className="relative w-full sm:w-56 sm:min-w-[14rem] sm:max-w-[14rem] aspect-square bg-neutral-900 border-b sm:border-b-0 sm:border-r border-neutral-800 shrink-0 flex items-center justify-center overflow-hidden">
                {activeImage ? (
                  <img
                    src={activeImage}
                    alt={product.title}
                    className="max-w-full max-h-full w-auto h-auto object-contain p-3"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => {
                      // Bozuk ilk görsel (ör. n11 logo placeholder) → sıradakine geç
                      setImageIndex((i) =>
                        images.length > 1 && i < images.length - 1 ? i + 1 : i,
                      );
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
                    Görsel yok
                  </div>
                )}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-black/75 border border-neutral-700 text-neutral-200 hover:bg-black"
                      onClick={() =>
                        setImageIndex((i) => (i - 1 + images.length) % images.length)
                      }
                      aria-label="Önceki görsel"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-black/75 border border-neutral-700 text-neutral-200 hover:bg-black"
                      onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                      aria-label="Sonraki görsel"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-neutral-300 tabular-nums">
                      {imageIndex + 1}/{images.length}
                    </span>
                  </>
                )}
              </div>

              <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="inline-flex items-center rounded border border-neutral-600 bg-black px-1.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-200 tracking-wide"
                        title="Havuz takip ID"
                      >
                        {product.poolId}
                      </span>
                      {!product.inStock && (
                        <span className="text-[10px] uppercase tracking-wide text-red-400 font-semibold">
                          Stok yok
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2 min-w-0">
                        {product.title}
                      </h2>
                      <SiteLogoBesideTitle
                        logoUrl={product.siteLogoUrl}
                        siteName={product.siteName}
                      />
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      {product.brand ? `Marka: ${product.brand}` : null}
                      {product.sku ? `${product.brand ? " · " : ""}${product.sku}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        trackFromProduct(product);
                        toast({
                          title: "Takibe alındı",
                          description: `${product.poolId} — fiyat/stok otomatik izlenir`,
                        });
                        setDrawerOpen(true);
                      }}
                      className="rounded-md border border-neutral-700 hover:bg-neutral-900 px-2 py-1.5 text-[11px] font-semibold text-neutral-300"
                      title="Bağımsız takip listesine ekle"
                    >
                      Takibe al
                    </button>
                    <a
                      href={product.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-md border border-neutral-700 hover:bg-neutral-900 text-neutral-400"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-neutral-800 bg-black px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
                      Alış
                    </div>
                    <div className="text-sm font-semibold text-neutral-100">
                      {formatMoney(product.salePrice, product.currency)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-black px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
                      İndirim
                    </div>
                    <div className="text-sm font-semibold text-neutral-300">{discountLabel}</div>
                  </div>
                  <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
                      Shopify (+%10)
                    </div>
                    <div className="text-sm font-bold text-white">
                      {formatMoney(shopifyPreviewPrice, product.currency)}
                    </div>
                  </div>
                </div>

                <ShopifySendButton
                  loading={uploading}
                  disabled={bulkUploading}
                  onClick={sendToShopify}
                />

                {(product.features?.length ?? 0) > 0 || tags.length > 0 ? (
                  <p className="text-[11px] text-neutral-500">
                    {(product.features?.length ?? 0) > 0
                      ? `${product.features!.length} özellik Shopify açıklamasına eklenecek`
                      : null}
                    {tags.length > 0
                      ? `${(product.features?.length ?? 0) > 0 ? " · " : ""}${tags.length} etiket Shopify tags alanına gidecek`
                      : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        )}
      </main>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Kapat"
              className="fixed inset-0 z-40 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-neutral-950 border-l border-neutral-800 shadow-2xl flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
            >
              <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-800">
                <div>
                  <h3 className="font-bold text-lg text-white">Ürün Havuzu Takip</h3>
                  <p className="text-xs text-neutral-500">
                    PH-ID ile bağımsız izleme · ~3 dk’da bir fiyat/stok kontrolü
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-lg hover:bg-neutral-900 text-neutral-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {tracking.length === 0 && (
                  <p className="text-sm text-neutral-600 text-center py-10">Takip listesi boş</p>
                )}
                {tracking.map((item) => (
                  <div
                    key={item.id}
                    className="relative rounded-lg border border-neutral-800 bg-black p-3"
                  >
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-md hover:bg-neutral-900 text-neutral-400 hover:text-neutral-100 border border-transparent hover:border-neutral-700"
                        title="Ürün URL’sini aç"
                        aria-label="Ürün URL"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeTrack(item.id)}
                        className="p-1.5 rounded-md hover:bg-neutral-900 text-neutral-500 hover:text-neutral-200"
                        title="Takipten çıkar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex gap-3 pr-16">
                      <div className="w-14 h-14 rounded-md overflow-hidden bg-neutral-900 shrink-0">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            className="w-full h-full object-contain p-0.5 bg-neutral-950"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11px] font-semibold text-neutral-400">
                          {item.id}
                          {item.removed ? (
                            <span className="ml-2 text-red-400 font-sans">kaldırıldı</span>
                          ) : !item.inStock ? (
                            <span className="ml-2 text-amber-400 font-sans">stok yok</span>
                          ) : null}
                        </p>
                        <p className="text-sm font-semibold text-neutral-100 line-clamp-2 pr-2 mt-0.5">
                          {item.title}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                          Alış {formatMoney(item.salePrice)}
                          {item.shopifyPrice != null
                            ? ` · Shopify ${formatMoney(item.shopifyPrice)}`
                            : ""}
                        </p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-neutral-300 hover:text-white mt-1"
                          onClick={() => {
                            setDrawerOpen(false);
                            setUrlList((prev) =>
                              prev.includes(item.sourceUrl) ? prev : [...prev, item.sourceUrl],
                            );
                            void scrapeUrls([item.sourceUrl]);
                          }}
                        >
                          Yeniden çek
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 flex justify-end">
                      <div className="inline-flex h-9 w-[7.5rem] items-center justify-center overflow-hidden rounded-md bg-white border border-neutral-300 px-2">
                        {item.siteLogoUrl ? (
                          <img
                            src={item.siteLogoUrl}
                            alt={item.siteName}
                            title={item.siteName}
                            className="max-h-6 max-w-full w-auto object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).replaceWith(
                                Object.assign(document.createElement("span"), {
                                  className: "text-[10px] font-bold text-neutral-800 truncate",
                                  textContent: item.siteName,
                                }),
                              );
                            }}
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-neutral-800 truncate">
                            {item.siteName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
