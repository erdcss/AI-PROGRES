import { motion } from "framer-motion";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Database,
  Shield,
  Bot,
  Activity,
  Bell,
  Star,
  FolderTree,
  Package,
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";
import { OrvianHeroBrand } from "@/components/OrvianHeroBrand";
import { useIsMobile } from "@/hooks/use-mobile";

type NavItem = {
  name: string;
  description: string;
  path: string;
  available?: boolean;
  icon: LucideIcon | "shark" | "box";
  testId?: string;
};

function StatusPill({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.14em] uppercase ${
        available
          ? "border-zinc-700 bg-zinc-950 text-zinc-200"
          : "border-zinc-800 bg-black text-zinc-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          available ? "bg-zinc-300" : "bg-zinc-600"
        }`}
      />
      {available ? "Aktif" : "Yakında"}
    </span>
  );
}

function ItemIcon({ kind }: { kind: NavItem["icon"] }) {
  if (kind === "shark") {
    return (
      <img
        src="/product-pool-shark-3d.png"
        alt=""
        className="h-8 w-8 object-contain"
        style={{ transform: "perspective(400px) rotateY(-16deg)" }}
        draggable={false}
      />
    );
  }
  if (kind === "box") {
    return <Package className="h-5 w-5 text-zinc-300" strokeWidth={1.25} />;
  }
  const Icon = kind;
  return <Icon className="h-5 w-5 text-zinc-300" strokeWidth={1.25} />;
}

function NavCard({
  item,
  delay,
  onOpen,
}: {
  item: NavItem;
  delay: number;
  onOpen: () => void;
}) {
  const available = item.available !== false;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      disabled={!available}
      onClick={() => available && onOpen()}
      data-testid={item.testId}
      className={`group flex w-full items-center gap-3.5 rounded-xl border border-zinc-800/90 bg-black/70 px-3.5 py-3.5 text-left transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-950 disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.99]`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 transition-transform duration-300 group-hover:scale-105">
        <ItemIcon kind={item.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="home-title truncate text-[15px] tracking-wide">{item.name}</div>
        <p className="home-muted mt-0.5 line-clamp-2 text-[12px] leading-relaxed">
          {item.description}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <StatusPill available={available} />
          <ArrowRight
            className="h-4 w-4 shrink-0 text-zinc-500 transition-all duration-300 group-hover:translate-x-1 group-hover:text-zinc-200"
            strokeWidth={1.25}
          />
        </div>
      </div>
    </motion.button>
  );
}

function Section({
  title,
  subtitle,
  children,
  delay = 0.9,
  className = "",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border border-zinc-800/80 bg-[#070707] p-5 sm:p-6 ${className}`}
    >
      <header className="mb-5 border-b border-zinc-900 pb-4">
        <h2 className="home-title text-[13px] uppercase tracking-[0.28em] sm:text-sm">
          {title}
        </h2>
        <p className="home-muted mt-2 text-[12px] leading-relaxed sm:text-[13px]">
          {subtitle}
        </p>
      </header>
      <div className="space-y-2.5">{children}</div>
    </motion.section>
  );
}

const MarketplaceSelection = () => {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const extraction: NavItem[] = [
    {
      name: "Trendyol",
      description: "Ürün çıkarma ve Shopify aktarım",
      path: "/scraper/trendyol",
      icon: "box",
      testId: "card-platform-trendyol",
    },
    {
      name: "Ürün Havuzu",
      description: "Bağımsız ürün çekme · ara sıra siteler",
      path: "/urun-havuzu",
      icon: "shark",
      testId: "card-platform-urun-havuzu",
    },
  ];

  const reviews: NavItem[] = [
    {
      name: "Trendyol Yorum Çıkarıcı",
      description: "Ürün yorumlarını çek ve CSV olarak dışa aktar",
      path: "/trendyol-reviews",
      icon: Star,
    },
  ];

  const system: NavItem[] = [
    {
      name: "Ürün Takip Sistemi",
      description: "Kaynak vs Shopify değişiklik tespiti (manuel onay)",
      path: "/urun-takip",
      icon: Activity,
      testId: "card-system-ürün-takip-sistemi",
    },
    {
      name: "Kategoriler",
      description: "Shopify etiketleri, ürün sayıları ve koleksiyonlar",
      path: "/kategoriler",
      icon: FolderTree,
      testId: "card-system-kategoriler",
    },
    {
      name: "Otomatik Takip Sistemi",
      description: "Ürün fiyat izleme ve Shopify senkronizasyonu (legacy)",
      path: "/memory-tracking",
      icon: Activity,
    },
    {
      name: "Bildirimler",
      description: "Bildirim türlerini aç/kapa ve test gönder",
      path: "/bildirimler",
      icon: Bell,
      testId: "card-system-bildirimler",
    },
    {
      name: "Shopify Sistem Analizi",
      description: "Token yenileme, bağlantı durumu ve kaynak izleme",
      path: "/shopify-system",
      icon: Shield,
    },
    {
      name: "Sistem Durumu",
      description: "Hata izleme ve sistem durumu",
      path: "/system-status",
      icon: Shield,
    },
  ];

  const quick: { path: string; icon: LucideIcon; label: string; testId: string }[] = [
    { path: "/replit-agent", icon: Bot, label: "Replit Agent", testId: "button-quick-replit-agent" },
    { path: "/sos-control", icon: Shield, label: "S.O.S Kontrol", testId: "button-quick-sos-control" },
    { path: "/scheduler", icon: Activity, label: "Zamanlı Görevler", testId: "button-quick-scheduler" },
    {
      path: "/shopify-products",
      icon: Database,
      label: "Shopify Ürünleri",
      testId: "button-quick-shopify-products",
    },
    {
      path: "/telegram-notifications",
      icon: Bell,
      label: "Telegram Bildirimleri",
      testId: "button-quick-telegram-notifications",
    },
  ];

  return (
    <div className="home-orvian relative min-h-screen overflow-x-hidden bg-black">
      {/* Kapalı ton doku — açık renk yok */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,255,255,0.03), transparent 55%), linear-gradient(180deg, #050505 0%, #000 40%, #000 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0, transparent 2px, rgba(255,255,255,0.015) 3px)",
        }}
      />

      {/* Sağ üst saat */}
      <div className="absolute right-3 top-3 z-40 sm:right-6 sm:top-5">
        <motion.div
          initial={{ opacity: 0, x: 20, y: -6 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.65, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <RealTimeClock variant="pool" />
        </motion.div>
      </div>

      {/* Hero */}
      <header className="relative z-10 overflow-visible border-b border-zinc-900">
        <div
          className={`mx-auto flex flex-col items-center overflow-visible ${
            isMobile ? "max-w-full px-4 pb-7 pt-14" : "max-w-6xl px-6 pb-9 pt-14"
          }`}
        >
          <OrvianHeroBrand compact={isMobile} />
        </div>
      </header>

      {/* İçerik — yeniden düzenlenmiş ızgara */}
      <main
        className={`relative z-10 mx-auto ${
          isMobile ? "max-w-full px-4 py-6" : "max-w-6xl px-6 py-10"
        }`}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <Section
            title="Ürün Çıkarma"
            subtitle="Shopify’a aktarım için platformlar"
            delay={0.95}
            className="lg:col-span-4"
          >
            {extraction.map((item, i) => (
              <NavCard
                key={item.path}
                item={item}
                delay={1 + i * 0.06}
                onOpen={() => setLocation(item.path)}
              />
            ))}
          </Section>

          <Section
            title="Yorum Çıkarma"
            subtitle="Yorumları çekip CSV dışa aktarın"
            delay={1.02}
            className="lg:col-span-4"
          >
            {reviews.map((item, i) => (
              <NavCard
                key={item.path}
                item={item}
                delay={1.08 + i * 0.06}
                onOpen={() => setLocation(item.path)}
              />
            ))}
          </Section>

          <Section
            title="Sistem Analizi"
            subtitle="Takip, kategori ve bağlantı yönetimi"
            delay={1.08}
            className="lg:col-span-4 overflow-visible"
          >
            <div className="space-y-2.5 overflow-visible">
              {system.map((item, i) => (
                <NavCard
                  key={item.path}
                  item={item}
                  delay={1.12 + i * 0.04}
                  onOpen={() => setLocation(item.path)}
                />
              ))}
            </div>
          </Section>

          {/* Hızlı erişim — tam genişlik şerit */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 1.25, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-zinc-800/80 bg-[#070707] p-5 sm:p-6 lg:col-span-12"
          >
            <header className="mb-4 flex flex-col gap-1 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="home-title text-[13px] uppercase tracking-[0.28em] sm:text-sm">
                  Hızlı Erişim
                </h2>
                <p className="home-muted mt-2 text-[12px] sm:text-[13px]">
                  Sık kullanılan sistem araçları
                </p>
              </div>
            </header>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {quick.map((item, index) => (
                <motion.button
                  key={item.path}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 1.3 + index * 0.05 }}
                  onClick={() => setLocation(item.path)}
                  data-testid={item.testId}
                  className="group flex items-center gap-3 rounded-xl border border-zinc-800/90 bg-black/80 px-3.5 py-3.5 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-950 active:scale-[0.99]"
                >
                  <item.icon
                    className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-200"
                    strokeWidth={1.25}
                  />
                  <span className="home-title text-[12px] tracking-[0.06em] sm:text-[13px]">
                    {item.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
};

export default MarketplaceSelection;
