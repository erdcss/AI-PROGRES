import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
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

/** Ürün Havuzu — özel adaptörü olan siteler */
const SUPPORTED_SITES = [
  {
    name: "Hepegitim",
    domain: "hepegitim.com",
    url: "https://www.hepegitim.com",
    logoUrl: "https://www.hepegitim.com/skins/shared/images/logo.png",
  },
  {
    name: "idefix",
    domain: "idefix.com",
    url: "https://www.idefix.com",
    logoUrl: "https://www.idefix.com/images/app-icons/logo.svg",
  },
  {
    name: "Pazarama",
    domain: "pazarama.com",
    url: "https://www.pazarama.com",
    logoUrl: "https://img.pzrmcdn.com/mnresize/128/128/asset/icons/pwa.png",
  },
  {
    name: "Beymen",
    domain: "beymen.com",
    url: "https://www.beymen.com",
    logoUrl: "https://cdn.beymen.com/assets/images/favicon.ico",
  },
  {
    name: "PTT AVM",
    domain: "pttavm.com",
    url: "https://www.pttavm.com",
    logoUrl: "https://www.pttavm.com/favicon.ico",
  },
  {
    name: "n11",
    domain: "n11.com",
    url: "https://www.n11.com",
    logoUrl: "https://www.n11.com/favicon.ico",
  },
  {
    name: "Amazon",
    domain: "amazon.com.tr",
    url: "https://www.amazon.com.tr",
    logoUrl: "https://www.amazon.com.tr/favicon.ico",
  },
] as const;

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
  /** Ana kategori (otomatik) */
  category: PoolCategoryId;
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

/** Takip çekmecesi — yalnızca ana kategoriler */
const POOL_CATEGORIES = [
  { id: "moda", label: "Moda" },
  { id: "kozmetik", label: "Kozmetik" },
  { id: "elektronik", label: "Elektronik" },
  { id: "oyuncak", label: "Oyuncak" },
  { id: "ev", label: "Ev & Yaşam" },
  { id: "spor", label: "Spor" },
  { id: "diger", label: "Diğer" },
] as const;

type PoolCategoryId = (typeof POOL_CATEGORIES)[number]["id"];

const POOL_CATEGORY_IDS = new Set<string>(POOL_CATEGORIES.map((c) => c.id));

function normalizeCategoryId(raw: unknown): PoolCategoryId | null {
  const id = String(raw || "").trim().toLowerCase();
  return POOL_CATEGORY_IDS.has(id) ? (id as PoolCategoryId) : null;
}

/** Başlık / site / etiketlerden ana kategori çıkar */
function inferMainCategory(input: {
  title?: string;
  siteName?: string;
  tags?: string[];
}): PoolCategoryId {
  const blob = [input.title, input.siteName, ...(input.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");

  const rules: Array<[PoolCategoryId, RegExp]> = [
    [
      "kozmetik",
      /kozmetik|krem|ruj|makyaj|cilt\b|serum|parf[uü]m|maskara|oje|fond[oö]ten|g[uü]zellik|beauty|skincare|pdrn|şampuan|sampuan|deodorant|nemlendirici|anti[- ]?aging|yenileyici\s*y[uü]z|bb\s*krem|cc\s*krem|eyeliner|rimel/,
    ],
    [
      "elektronik",
      /elektronik|kulakl[iı]k|telefon|iphone|samsung|laptop|tablet|\btv\b|televizyon|klima|bluetooth|hoparl[oö]r|şarj|sarj|kamera|airpods|headphone|bilgisayar|monit[oö]r|oyun\s*konsol|playstation|xbox|mouse|klavye|powerbank|usb|ssd|hdd/,
    ],
    [
      "oyuncak",
      /oyuncak|lego|puzzle|fig[uü]r|peluş|pelus|oyun\s*seti|barbie|hot\s*wheels|nerf|eğitici\s*oyun/,
    ],
    [
      "spor",
      /spor|fitness|yoga|koşu|kosu|treadmill|dumbbell|halter|bisiklet|kayak|outdoor|antrenman|dumbel|mat\b|protein\s*tozu/,
    ],
    [
      "moda",
      /sneaker|ayakkab[iı]|elbise|tiş[oö]rt|tisort|g[oö]mlek|pantolon|çanta|canta|deri|mont|ceket|bot\b|çizme|cizme|moda|giyim|jean|sweatshirt|hoodie|kazak|etek|bluz|tak[iı]|m[uü]cevher|kolye|k[uü]pe|bileklik|loafer|sandalet|terlik|polo|şapka|sapka|kemer|c[uü]zdan/,
    ],
    [
      "ev",
      /ev\s*&\s*yaşam|ev\s*yaşam|mobilya|mutfak|yatak|yast[iı]k|havlu|dekor|ayd[iı]nlatma|vazo|tencere|[uü]t[uü]|hal[iı]|perde|nevresim|çatal|kasık|kaşık|bardak|tabak|organizer/,
    ],
  ];

  for (const [id, re] of rules) {
    if (re.test(blob)) return id;
  }
  return "diger";
}

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
function ShopifyBagIcon({
  className = "w-7 h-8",
  gradId = "shopifyBagGrad",
}: {
  className?: string;
  gradId?: string;
}) {
  return (
    <svg viewBox="0 0 40 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8d05a" />
          <stop offset="100%" stopColor="#7aa63a" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M8.5 14.5c0-1 .8-1.8 1.8-1.8h19.4c1 0 1.8.8 1.8 1.8v24.2c0 2.2-1.8 4-4 4H12.5c-2.2 0-4-1.8-4-4V14.5z"
      />
      <path
        fill="none"
        stroke="#96bf48"
        strokeWidth="2.4"
        strokeLinecap="round"
        d="M14 14.2c0-4.2 2.6-7.4 6-7.4s6 3.2 6 7.4"
      />
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

/** Gerçekçi 3D dalgalı su dolumu — clip-path ile ilerleme */
function ShopifyWaterFill({ progress, uid }: { progress: number; uid: string }) {
  const p = Math.max(0, Math.min(100, progress));
  if (p <= 0.1) return null;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-full"
      style={{
        clipPath: `inset(0 ${100 - p}% 0 0)`,
        WebkitClipPath: `inset(0 ${100 - p}% 0 0)`,
      }}
    >
      {/* Su gövdesi — dikey 3D hacim */}
      <span
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #e8f99a 0%, #c5eb6a 12%, #96bf48 38%, #6fa82e 68%, #3f7018 100%)",
          boxShadow:
            "inset 0 10px 18px rgba(255,255,255,0.38), inset 0 -14px 22px rgba(20,40,0,0.38), inset 8px 0 16px rgba(255,255,255,0.12)",
        }}
      />

      {/* Derinlik gölgesi */}
      <span
        className="absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(35,70,8,0.25) 45%, rgba(20,45,5,0.55) 100%)",
        }}
      />

      {/* Üst ışık bandı */}
      <span
        className="absolute inset-x-0 top-0 h-[42%]"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 40%, transparent 100%)",
        }}
      />

      {/* Dalga katmanları */}
      <span className="shopify-wave-bob absolute inset-[-8%_-5%] overflow-hidden">
        <svg
          className="shopify-wave-layer-a absolute left-0 top-[-10%] h-[120%] w-[200%]"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`${uid}-w1`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f2ffb0" stopOpacity="0.85" />
              <stop offset="35%" stopColor="#a8d05a" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#5e8e28" stopOpacity="0.35" />
            </linearGradient>
            <filter id={`${uid}-blur`} x="-5%" y="-20%" width="110%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
            </filter>
          </defs>
          <path
            fill={`url(#${uid}-w1)`}
            filter={`url(#${uid}-blur)`}
            d="M0 52 C75 22 150 22 225 52 S375 82 450 52 S600 22 675 52 S825 82 900 52 S1050 22 1125 52 S1200 72 1200 72 V120 H0 Z"
          />
          <path
            fill={`url(#${uid}-w1)`}
            filter={`url(#${uid}-blur)`}
            d="M1200 52 C1275 22 1350 22 1425 52 S1575 82 1650 52 S1800 22 1875 52 S2025 82 2100 52 S2250 22 2325 52 S2400 72 2400 72 V120 H1200 Z"
            transform="translate(-1200 0)"
          />
        </svg>

        <svg
          className="shopify-wave-layer-b absolute left-0 top-[8%] h-[110%] w-[200%] opacity-80"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path
            fill="#9fd44a"
            opacity="0.55"
            d="M0 58 C60 38 120 38 180 58 S300 78 360 58 S480 38 540 58 S660 78 720 58 S840 38 900 58 S1020 78 1080 58 S1200 48 1200 48 V120 H0 Z"
          />
          <path
            fill="#7ab83a"
            opacity="0.4"
            d="M0 68 C50 52 100 52 150 68 S250 84 300 68 S400 52 450 68 S550 84 600 68 S700 52 750 68 S850 84 900 68 S1000 52 1050 68 S1200 60 1200 60 V120 H0 Z"
          />
        </svg>

        {/* Köpük / yüzey çizgisi */}
        <svg
          className="shopify-wave-layer-a absolute left-0 top-0 h-[70%] w-[200%] opacity-70"
          viewBox="0 0 1200 80"
          preserveAspectRatio="none"
          style={{ animationDuration: "1.6s" }}
        >
          <path
            fill="none"
            stroke="rgba(255,255,255,0.75)"
            strokeWidth="2.5"
            d="M0 40 C80 18 160 18 240 40 S400 62 480 40 S640 18 720 40 S880 62 960 40 S1120 18 1200 40"
          />
          <path
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="6"
            d="M0 42 C80 20 160 20 240 42 S400 64 480 42 S640 20 720 42 S880 64 960 42 S1120 20 1200 42"
          />
        </svg>
      </span>

      {/* Caustic shimmer */}
      <span
        className="shopify-water-shimmer absolute top-[10%] h-[35%] w-[28%] rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
          filter: "blur(6px)",
        }}
      />

      {/* İlerleme kenarı — dalga tepesi */}
      <span
        className="shopify-crest-pulse absolute top-0 bottom-0 right-0 w-10"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(232,249,154,0.55) 45%, rgba(255,255,255,0.75) 70%, rgba(150,191,72,0.35) 100%)",
          boxShadow: "0 0 18px rgba(200,240,100,0.65)",
        }}
      />
    </span>
  );
}

/** Gönderilen tasarıma birebir Shopify gönder butonu + 3D dalgalı su dolum */
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
  const reactId = useId().replace(/:/g, "");
  const bagGradId = `sbag-${reactId}`;
  const [fill, setFill] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      setFinishing(false);
      setFill(18);
      const start = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const t = (now - start) / 1000;
        // Hızlı başlangıç, sonra yavaşlayarak ~92%
        const next = 18 + 74 * (1 - Math.exp(-t / 1.35));
        setFill(Math.min(92, next));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setFill(100);
      setFinishing(true);
      const t = window.setTimeout(() => {
        setFill(0);
        setFinishing(false);
      }, 900);
      return () => window.clearTimeout(t);
    }

    setFill(0);
    setFinishing(false);
  }, [loading]);

  const isBusy = Boolean(loading) || finishing || fill > 1;
  const filledEnough = fill >= 38;
  const blocked = Boolean(disabled) || Boolean(loading);

  return (
    <button
      type="button"
      disabled={blocked}
      onClick={(e) => {
        if (blocked) {
          e.preventDefault();
          return;
        }
        onClick();
      }}
      aria-busy={loading || undefined}
      className={`group relative isolate w-full inline-flex items-center justify-between gap-3 overflow-hidden rounded-full border-2 border-[#96bf48] bg-[#0a0a0a] px-5 py-3.5 transition-[box-shadow,border-color,background-color] duration-200 disabled:pointer-events-none disabled:!opacity-100 ${
        disabled && !loading ? "!opacity-50" : ""
      } ${
        isBusy
          ? "shadow-[0_0_28px_rgba(150,191,72,0.55)]"
          : "hover:border-[#7aa63a] hover:bg-gradient-to-b hover:from-[#a8d05a] hover:to-[#96bf48] hover:shadow-[0_0_28px_rgba(150,191,72,0.7)]"
      } ${className}`}
      style={isBusy ? { opacity: 1 } : undefined}
    >
      <ShopifyWaterFill progress={fill} uid={reactId} />

      <span className="relative z-10 inline-flex items-center gap-3 min-w-0 drop-shadow-sm">
        {loading ? (
          <Loader2
            className={`w-6 h-6 animate-spin shrink-0 ${
              filledEnough ? "text-neutral-900" : "text-white"
            }`}
          />
        ) : (
          <ShopifyBagIcon
            gradId={bagGradId}
            className="w-7 h-8 shrink-0 drop-shadow-sm"
          />
        )}
        <span
          className={`font-bold text-[15px] tracking-tight leading-none transition-colors ${
            isBusy
              ? filledEnough
                ? "text-neutral-900"
                : "text-white"
              : "text-white group-hover:!text-black"
          }`}
          style={
            isBusy && !filledEnough
              ? { textShadow: "0 1px 2px rgba(0,0,0,0.65)" }
              : undefined
          }
        >
          {loading
            ? label === "bulk"
              ? "Toplu gönderiliyor…"
              : "Shopify'a gidiyor…"
            : finishing
              ? "Gönderildi"
              : label === "bulk"
                ? "Toplu Gönder"
                : "Shopify'a Gönder"}
        </span>
      </span>
      <span
        className={`relative z-10 shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors ${
          isBusy
            ? filledEnough
              ? "bg-black/20"
              : "bg-white/15"
            : "bg-transparent group-hover:bg-black/20"
        }`}
      >
        <ChevronRight
          className={`w-5 h-5 transition-colors ${
            isBusy
              ? filledEnough
                ? "text-neutral-900"
                : "text-white"
              : "text-white group-hover:!text-black"
          }`}
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
  const title = String(raw.title || "Ürün");
  const siteName = String(raw.siteName || "");
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : undefined;
  const category =
    normalizeCategoryId(raw.category) ||
    inferMainCategory({ title, siteName, tags });
  return {
    id,
    sourceUrl,
    title,
    siteName,
    siteLogoUrl: String(raw.siteLogoUrl || ""),
    category,
    price: Number(raw.price) || 0,
    salePrice: Number(raw.salePrice) || 0,
    inStock: raw.inStock !== false && raw.removed !== true,
    shopifyPrice: raw.shopifyPrice != null ? Number(raw.shopifyPrice) : undefined,
    shopifyProductId: raw.shopifyProductId ? String(raw.shopifyProductId) : undefined,
    image: raw.image ? String(raw.image) : undefined,
    tags,
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
  const [sitesDrawerOpen, setSitesDrawerOpen] = useState(false);
  const [trackCategoryFilter, setTrackCategoryFilter] = useState<"all" | PoolCategoryId>(
    "all",
  );
  const [notifOpen, setNotifOpen] = useState(false);
  const [tracking, setTracking] = useState<TrackItem[]>([]);
  const [notifications, setNotifications] = useState<PoolNotification[]>([]);
  const trackingRef = useRef<TrackItem[]>([]);
  const pollBusyRef = useRef(false);

  useEffect(() => {
    const loaded = loadTracking();
    setTracking(loaded);
    trackingRef.current = loaded;
    saveTracking(loaded);
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
  const trackCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tracking.length };
    for (const c of POOL_CATEGORIES) counts[c.id] = 0;
    for (const item of tracking) {
      const cat = item.category || "diger";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [tracking]);
  const filteredTracking = useMemo(() => {
    if (trackCategoryFilter === "all") return tracking;
    return tracking.filter((t) => (t.category || "diger") === trackCategoryFilter);
  }, [tracking, trackCategoryFilter]);
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
    const itemTags = tags.length ? tags : undefined;
    upsertTracking({
      id: p.poolId || makePoolId(p.sourceUrl),
      sourceUrl: p.sourceUrl,
      title: p.title,
      siteName: p.siteName,
      siteLogoUrl: p.siteLogoUrl,
      category: inferMainCategory({
        title: p.title,
        siteName: p.siteName,
        tags: itemTags,
      }),
      price: p.price,
      salePrice: p.salePrice,
      inStock: p.inStock !== false,
      shopifyPrice: extras?.shopifyPrice,
      shopifyProductId: extras?.productId,
      image: p.images[0],
      tags: itemTags,
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
            category: inferMainCategory({
              title: fresh.title,
              siteName: fresh.siteName,
              tags: item.tags,
            }),
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
    <div className="min-h-screen bg-black text-neutral-200 flex flex-col">
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
              onClick={() => {
                setNotifOpen(false);
                setDrawerOpen(false);
                setSitesDrawerOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-100"
              title="Desteklenen Siteler"
            >
              <Globe2 className="w-4 h-4 text-neutral-300 shrink-0" />
              <span className="hidden sm:inline">Desteklenen Siteler</span>
              <span className="sm:hidden">Siteler</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNotifOpen(false);
                setSitesDrawerOpen(false);
                setDrawerOpen(true);
              }}
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

      <main className="max-w-5xl mx-auto w-full px-4 py-5 space-y-4 flex-1">
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
            Destek: hepegitim.com, idefix.com, pazarama.com, beymen.com, pttavm.com, n11.com, amazon.com.tr ve genel Open Graph.
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

      <footer className="mt-auto w-full py-8 px-4 text-center">
        <button
          type="button"
          className="orvian-credit outline-none"
          aria-label="powered by Orvian"
        >
          <span className="credit-orvian">
            powered by{" "}
            <span className="credit-orvian-brand">Orvian</span>
          </span>
          <span className="credit-erdem" aria-hidden>
            Tomorrow begins here.
          </span>
        </button>
      </footer>

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

              <div className="px-4 py-3 border-b border-neutral-800 space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
                  Ana kategoriler
                </p>
                <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-thin">
                  <button
                    type="button"
                    onClick={() => setTrackCategoryFilter("all")}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      trackCategoryFilter === "all"
                        ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                    }`}
                  >
                    Tümü
                    <span className="ml-1.5 opacity-70">{trackCategoryCounts.all || 0}</span>
                  </button>
                  {POOL_CATEGORIES.map((cat) => {
                    const count = trackCategoryCounts[cat.id] || 0;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setTrackCategoryFilter(cat.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          trackCategoryFilter === cat.id
                            ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                            : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                        }`}
                      >
                        {cat.label}
                        <span className="ml-1.5 opacity-70">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {tracking.length === 0 && (
                  <p className="text-sm text-neutral-600 text-center py-10">Takip listesi boş</p>
                )}
                {tracking.length > 0 && filteredTracking.length === 0 && (
                  <p className="text-sm text-neutral-600 text-center py-10">
                    Bu kategoride ürün yok
                  </p>
                )}
                {filteredTracking.map((item) => {
                  const catLabel =
                    POOL_CATEGORIES.find((c) => c.id === item.category)?.label || "Diğer";
                  return (
                  <div
                    key={item.id}
                    className="relative rounded-xl border border-neutral-800 bg-black overflow-hidden"
                  >
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-md bg-black/70 hover:bg-neutral-900 text-neutral-300 hover:text-neutral-100 border border-neutral-700/80"
                        title="Ürün URL’sini aç"
                        aria-label="Ürün URL"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeTrack(item.id)}
                        className="p-1.5 rounded-md bg-black/70 hover:bg-neutral-900 text-neutral-400 hover:text-neutral-100 border border-neutral-700/80"
                        title="Takipten çıkar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex gap-0 min-h-[7.5rem]">
                      <div className="w-[7.25rem] sm:w-32 self-stretch shrink-0 bg-neutral-900 overflow-hidden">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            className="w-full h-full min-h-[7.5rem] object-cover object-center"
                          />
                        ) : (
                          <div className="w-full h-full min-h-[7.5rem] flex items-center justify-center text-[10px] text-neutral-600">
                            Görsel yok
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 p-3 pr-14 flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono text-[11px] font-semibold text-neutral-400">
                            {item.id}
                          </p>
                          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-neutral-300">
                            {catLabel}
                          </span>
                          {item.removed ? (
                            <span className="text-[10px] text-red-400 font-semibold">kaldırıldı</span>
                          ) : !item.inStock ? (
                            <span className="text-[10px] text-amber-400 font-semibold">stok yok</span>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-neutral-100 line-clamp-2 mt-1">
                          {item.title}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                          Alış {formatMoney(item.salePrice)}
                          {item.shopifyPrice != null
                            ? ` · Shopify ${formatMoney(item.shopifyPrice)}`
                            : ""}
                        </p>
                        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-neutral-300 hover:text-white"
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
                          <div className="inline-flex h-8 w-[6.5rem] items-center justify-center overflow-hidden rounded-md bg-white border border-neutral-300 px-2 shrink-0">
                            {item.siteLogoUrl ? (
                              <img
                                src={item.siteLogoUrl}
                                alt={item.siteName}
                                title={item.siteName}
                                className="max-h-5 max-w-full w-auto object-contain"
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
                    </div>
                  </div>
                  );
                })}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sitesDrawerOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Kapat"
              className="fixed inset-0 z-40 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSitesDrawerOpen(false)}
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
                  <h3 className="font-bold text-lg text-white">Desteklenen Siteler</h3>
                  <p className="text-xs text-neutral-500">
                    Özel adaptörlü siteler · diğerleri genel Open Graph
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSitesDrawerOpen(false)}
                  className="p-2 rounded-lg hover:bg-neutral-900 text-neutral-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-3">
                  {SUPPORTED_SITES.map((site) => (
                    <a
                      key={site.domain}
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group rounded-xl border border-neutral-800 bg-black hover:border-neutral-600 hover:bg-neutral-900/80 transition-colors p-4 flex flex-col items-center gap-3 text-center"
                    >
                      <span className="inline-flex h-16 w-full max-w-[9rem] items-center justify-center overflow-hidden rounded-lg bg-white border border-neutral-300 px-3">
                        <img
                          src={site.logoUrl}
                          alt={site.name}
                          title={site.name}
                          className="max-h-10 max-w-full w-auto object-contain"
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = "none";
                            const parent = img.parentElement;
                            if (parent && !parent.querySelector("[data-fallback]")) {
                              const span = document.createElement("span");
                              span.dataset.fallback = "1";
                              span.className = "text-xs font-bold text-neutral-800";
                              span.textContent = site.name;
                              parent.appendChild(span);
                            }
                          }}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-100 group-hover:text-white">
                          {site.name}
                        </span>
                        <span className="block text-[11px] text-neutral-500 mt-0.5">
                          {site.domain}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
                <p className="mt-5 text-xs text-neutral-600 text-center leading-relaxed">
                  Ürün URL’sini yapıştırıp çekebilirsiniz. Listede olmayan siteler için genel Open
                  Graph okuma denenir.
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
