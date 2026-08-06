import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Link2,
  ListTodo,
  Trash2,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type PoolFeature = { name: string; value: string };

type PoolProduct = {
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
  id: string;
  sourceUrl: string;
  title: string;
  siteName: string;
  siteLogoUrl: string;
  price: number;
  salePrice: number;
  shopifyPrice?: number;
  shopifyProductId?: string;
  image?: string;
  notes?: string;
  tags?: string[];
  addedAt: string;
};

const TRACK_KEY = "product-pool-tracking-v1";

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
      className={`group w-full inline-flex items-center justify-between gap-3 rounded-full border-2 border-[#96bf48] bg-[#0a0a0a] px-5 py-3.5 transition-all duration-200 hover:border-[#96bf48] hover:bg-gradient-to-b hover:from-[#a8d05a] hover:to-[#96bf48] hover:shadow-[0_0_28px_rgba(150,191,72,0.7)] disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      <span className="inline-flex items-center gap-3 min-w-0">
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-white shrink-0" />
        ) : (
          <ShopifyBagIcon className="w-7 h-8 shrink-0 drop-shadow-sm" />
        )}
        <span className="font-bold text-[15px] tracking-tight leading-none">
          {label === "bulk" ? (
            <>
              <span className="text-white group-hover:text-neutral-900 transition-colors">
                Toplu{" "}
              </span>
              <span className="text-[#96bf48] group-hover:text-neutral-900 transition-colors">
                Gönder
              </span>
            </>
          ) : (
            <>
              <span className="text-white group-hover:text-neutral-900 transition-colors">
                Shopify&apos;a{" "}
              </span>
              <span className="text-[#96bf48] group-hover:text-neutral-900 transition-colors">
                Gönder
              </span>
            </>
          )}
        </span>
      </span>
      <span className="shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors group-hover:bg-black/25">
        <ChevronRight
          className="w-5 h-5 text-white transition-colors"
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

function loadTracking(): TrackItem[] {
  try {
    const raw = localStorage.getItem(TRACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTracking(items: TrackItem[]) {
  localStorage.setItem(TRACK_KEY, JSON.stringify(items));
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
    <span className="inline-flex items-center shrink-0 rounded bg-white border border-neutral-300 px-2 py-1">
      {logoUrl && !failed ? (
        <img
          src={logoUrl}
          alt={siteName}
          title={siteName}
          className="h-7 w-auto max-w-[120px] object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-neutral-800">{siteName}</span>
      )}
    </span>
  );
}

export default function UrunHavuzuPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [products, setProducts] = useState<PoolProduct[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tracking, setTracking] = useState<TrackItem[]>([]);

  useEffect(() => {
    setTracking(loadTracking());
  }, []);

  const product = products[activeIndex] || null;
  const images = product?.images?.length ? product.images : [];
  const activeImage = images[imageIndex] || images[0];
  const parsedTags = useMemo(() => parseTags(tagsInput), [tagsInput]);
  const shopifyPreviewPrice = product
    ? Math.round(product.salePrice * 1.1 * 100) / 100
    : 0;

  const upsertTracking = useCallback((item: TrackItem) => {
    setTracking((prev) => {
      const without = prev.filter((t) => t.sourceUrl !== item.sourceUrl);
      const next = [item, ...without];
      saveTracking(next);
      return next;
    });
  }, []);

  const scrapeUrls = useCallback(
    async (rawText: string) => {
      const urls = extractUrlsFromText(rawText);
      if (!urls.length) {
        toast({
          title: "URL gerekli",
          description: "Bir veya daha fazla ürün linki yapıştırın",
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
          scraped.push(data.product as PoolProduct);
        }

        if (!scraped.length) {
          throw new Error("Hiçbir URL çekilemedi");
        }

        setProducts(scraped);
        setUrlInput(urls.join("\n"));
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
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const text =
        e.dataTransfer.getData("text/uri-list") ||
        e.dataTransfer.getData("text/plain") ||
        "";
      void scrapeUrls(text);
    },
    [scrapeUrls],
  );

  const removeTrack = (id: string) => {
    const next = tracking.filter((t) => t.id !== id);
    setTracking(next);
    saveTracking(next);
  };

  const trackFromUpload = (p: PoolProduct, shopifyPrice?: number, productId?: string) => {
    upsertTracking({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceUrl: p.sourceUrl,
      title: p.title,
      siteName: p.siteName,
      siteLogoUrl: p.siteLogoUrl,
      price: p.price,
      salePrice: p.salePrice,
      shopifyPrice,
      shopifyProductId: productId,
      image: p.images[0],
      notes: notes.trim() || undefined,
      tags: parsedTags,
      addedAt: new Date().toISOString(),
    });
  };

  const sendOne = async (p: PoolProduct) => {
    const res = await fetch("/api/product-pool/shopify-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: { ...p, notes, tags: parsedTags },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Shopify gönderimi başarısız",
      );
    }
    trackFromUpload(p, data.shopifyPrice, data.productId);
    return data as { shopifyPrice: number; productId: string };
  };

  const sendToShopify = async () => {
    if (!product) return;
    setUploading(true);
    try {
      const data = await sendOne(product);
      toast({
        title: "Shopify'a aktif gönderildi",
        description: `${formatMoney(product.salePrice)} → ${formatMoney(data.shopifyPrice)} (+%10)`,
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
          products: products.map((p) => ({ ...p, notes, tags: parsedTags })),
          tags: parsedTags,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Toplu gönderim başarısız");
      }

      for (const r of data.results || []) {
        if (!r.success) continue;
        const p = products.find((x) => x.sourceUrl === r.sourceUrl);
        if (p) trackFromUpload(p, r.shopifyPrice, r.productId);
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
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-xl border border-dashed p-4 transition-colors ${
            dragOver ? "border-neutral-400 bg-neutral-900" : "border-neutral-700 bg-neutral-950"
          }`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <div className="flex-1 flex items-start gap-2 rounded-lg bg-black border border-neutral-800 px-3 py-2">
                <Link2 className="w-4 h-4 text-neutral-500 shrink-0 mt-1" />
                <textarea
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  rows={3}
                  placeholder="Tek veya birden fazla ürün URL'si (her satıra bir link)…"
                  className="w-full bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-600 resize-y min-h-[72px]"
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => scrapeUrls(urlInput)}
                className="rounded-lg bg-neutral-200 hover:bg-white text-black px-4 py-2.5 font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2 sm:self-stretch"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Ürünü Çek{loadingProgress ? ` (${loadingProgress})` : ""}
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              Birden fazla URL için satır satır yapıştırın. Destek: hepegitim.com, idefix.com, pazarama.com ve genel Open Graph.
              Toplu gönderim butonu 2+ üründe görünür.
            </p>
          </div>
        </div>

        {/* Shared notes + tags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
              Not
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Not ekleyin (isteğe bağlı)…"
              className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 resize-none"
            />
            <div className="text-right text-[10px] text-neutral-600 mt-1">{notes.length}/500</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <label className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
              Etiketler (Shopify)
            </label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="ör. lego, oyuncak, ferrari (virgülle ayırın)"
              className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
            />
            {parsedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parsedTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-md border border-neutral-700 bg-black px-2 py-0.5 text-xs text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
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
                <span className="line-clamp-2 font-semibold">{p.title}</span>
              </button>
            ))}
          </div>
        )}

        {product && (
          <article className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="flex flex-col sm:flex-row gap-0">
              <div className="relative sm:w-40 sm:min-w-[10rem] h-40 bg-black border-b sm:border-b-0 sm:border-r border-neutral-800 shrink-0">
                {activeImage ? (
                  <img
                    src={activeImage}
                    alt={product.title}
                    className="w-full h-full object-contain p-2"
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
                      className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded bg-black/70 border border-neutral-700"
                      onClick={() =>
                        setImageIndex((i) => (i - 1 + images.length) % images.length)
                      }
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded bg-black/70 border border-neutral-700"
                      onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
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
                  <a
                    href={product.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 p-1.5 rounded-md border border-neutral-700 hover:bg-neutral-900 text-neutral-400"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
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

                {(product.features?.length ?? 0) > 0 && (
                  <p className="text-[11px] text-neutral-500">
                    {product.features!.length} özellik Shopify açıklamasına eklenecek
                    {parsedTags.length > 0
                      ? ` · ${parsedTags.length} etiket Shopify tags alanına gidecek`
                      : ""}
                  </p>
                )}
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
                  <p className="text-xs text-neutral-500">Shopify gönderiminde otomatik eklenir</p>
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
                    className="relative rounded-lg border border-neutral-800 bg-black p-3 pr-3 pb-3"
                  >
                    <button
                      type="button"
                      onClick={() => removeTrack(item.id)}
                      className="absolute top-2 right-2 z-10 p-1.5 rounded-md hover:bg-neutral-900 text-neutral-500 hover:text-neutral-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex gap-3 pr-8">
                      <div className="w-14 h-14 rounded-md overflow-hidden bg-neutral-900 shrink-0">
                        {item.image ? (
                          <img src={item.image} alt="" className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-100 line-clamp-2 pr-2">
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
                            void scrapeUrls(item.sourceUrl);
                          }}
                        >
                          Yeniden çek
                        </button>
                      </div>
                    </div>

                    {/* Site logosu — sabit boyut, kartı taşırmayan */}
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
