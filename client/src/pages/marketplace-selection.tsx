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
  Link2,
  KeyRound,
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";
import { OrvianHeroBrand } from "@/components/OrvianHeroBrand";
import { useIsMobile } from "@/hooks/use-mobile";
import { hasShopifyLabel, useDestinationBrand } from "@/hooks/use-destination-brand";

type NavItem = {
  name: string;
  description: string;
  path: string;
  available?: boolean;
  icon: LucideIcon | "shark" | "box";
  testId?: string;
};

function StatusDot({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] tracking-[0.12em] uppercase ${
        available
          ? "border-zinc-700 bg-zinc-950 text-zinc-200"
          : "border-zinc-800 bg-black text-zinc-500"
      }`}
    >
      <span className={`h-1 w-1 rounded-full ${available ? "bg-emerald-400" : "bg-zinc-600"}`} />
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
        className="h-6 w-6 object-contain"
        style={{ transform: "perspective(400px) rotateY(-16deg)" }}
        draggable={false}
      />
    );
  }
  if (kind === "box") {
    return <Package className="h-4 w-4 text-zinc-300" strokeWidth={1.25} />;
  }
  const Icon = kind;
  return <Icon className="h-4 w-4 text-zinc-300" strokeWidth={1.25} />;
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.16, 1, 0.3, 1] }}
      disabled={!available}
      onClick={() => available && onOpen()}
      data-testid={item.testId}
      className="group flex w-full min-h-0 items-center gap-2.5 rounded-lg border border-zinc-800/90 bg-black/70 px-2.5 py-2 text-left transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-950 disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.99]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950">
        <ItemIcon kind={item.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="home-title truncate text-[13px] tracking-wide">{item.name}</div>
          <StatusDot available={available} />
        </div>
        <p className="home-muted mt-0.5 truncate text-[11px] leading-snug">{item.description}</p>
      </div>
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-zinc-200"
        strokeWidth={1.25}
      />
    </motion.button>
  );
}

function Section({
  title,
  subtitle,
  children,
  delay = 0.2,
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`flex h-fit flex-col rounded-xl border border-zinc-800/80 bg-[#070707] p-3 sm:p-3.5 ${className}`}
    >
      <header className="mb-2.5 shrink-0 border-b border-zinc-900 pb-2">
        <h2 className="home-title text-[11px] uppercase tracking-[0.24em] sm:text-xs">{title}</h2>
        <p className="home-muted mt-0.5 text-[11px] leading-snug">{subtitle}</p>
      </header>
      <div>{children}</div>
    </motion.section>
  );
}

const MarketplaceSelection = () => {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const brand = useDestinationBrand();
  const dest = brand.destinationName;

  const extraction: NavItem[] = [
    {
      name: "Trendyol",
      description: `Ürün çıkarma ve ${dest} aktarım`,
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
      description: `Kaynak vs ${dest} değişiklik tespiti (manuel onay)`,
      path: "/urun-takip",
      icon: Activity,
      testId: "card-system-ürün-takip-sistemi",
    },
    {
      name: "Kategoriler",
      description: `${dest} etiketleri, ürün sayıları ve koleksiyonlar`,
      path: "/kategoriler",
      icon: FolderTree,
      testId: "card-system-kategoriler",
    },
    {
      name: "Web sitesi kancaları",
      description: "Ürün havuzu + Trendyol siteleri · canlı şema (ürünler mobilde)",
      path: "/web-hooks",
      icon: Link2,
      testId: "card-system-web-hooks",
    },
    {
      name: "Bağlantı API Erişimi",
      description: "Tüm bağlantılar, şemalar, durdur ve yeni API anahtarı",
      path: "/baglanti-api",
      icon: KeyRound,
      testId: "card-system-baglanti-api",
    },
    {
      name: "Otomatik Takip Sistemi",
      description: `Ürün fiyat izleme ve ${dest} senkronizasyonu (legacy)`,
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
      name: `${dest} Sistem Analizi`,
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
      label: `${dest} Ürünleri`,
      testId: "button-quick-shopify-products",
    },
    {
      path: "/telegram-notifications",
      icon: Bell,
      label: "Telegram Bildirimleri",
      testId: "button-quick-telegram-notifications",
    },
  ];

  const hideShopifyNav = true;
  const visibleSystem = hideShopifyNav
    ? system.filter((item) => !hasShopifyLabel(`${item.path} ${item.name} ${item.testId || ""}`))
    : system;
  const visibleQuick = hideShopifyNav
    ? quick.filter((item) => !hasShopifyLabel(`${item.path} ${item.label} ${item.testId}`))
    : quick;

  return (
    <div className="home-orvian relative min-h-screen overflow-x-hidden bg-black">
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

      <div className="absolute right-3 top-2 z-40 sm:right-5 sm:top-3">
        <motion.div
          initial={{ opacity: 0, x: 20, y: -6 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <RealTimeClock variant="pool" />
        </motion.div>
      </div>

      <div
        className={`relative z-10 mx-auto flex w-full flex-col ${
          isMobile ? "max-w-full px-4 py-4" : "max-w-[1400px] px-5 py-3"
        }`}
      >
        <header className="relative shrink-0 overflow-visible border-b border-zinc-900 pb-2 pt-1">
          <div className="flex flex-col items-center overflow-visible">
            <OrvianHeroBrand compact />
          </div>
        </header>

        <main className="relative mt-3 flex flex-col gap-3">
          <div
            className={`grid items-start gap-3 ${
              isMobile ? "grid-cols-1" : "grid-cols-12"
            }`}
          >
            <Section
              title="Ürün Çıkarma"
              subtitle={
                hideShopifyNav ? "Ürün çekme platformları" : `${dest}’a aktarım için platformlar`
              }
              delay={0.15}
              className={isMobile ? "" : "col-span-3"}
            >
              <div className="flex flex-col gap-2">
                {extraction.map((item, i) => (
                  <NavCard
                    key={item.path}
                    item={item}
                    delay={0.2 + i * 0.04}
                    onOpen={() => setLocation(item.path)}
                  />
                ))}
              </div>
            </Section>

            <Section
              title="Yorum Çıkarma"
              subtitle="Yorumları çekip CSV dışa aktarın"
              delay={0.18}
              className={isMobile ? "" : "col-span-3"}
            >
              <div className="flex flex-col gap-2">
                {reviews.map((item, i) => (
                  <NavCard
                    key={item.path}
                    item={item}
                    delay={0.22 + i * 0.04}
                    onOpen={() => setLocation(item.path)}
                  />
                ))}
              </div>
            </Section>

            <Section
              title="Sistem Analizi"
              subtitle="Takip, kategori ve bağlantı yönetimi"
              delay={0.22}
              className={isMobile ? "" : "col-span-6"}
            >
              <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
                {visibleSystem.map((item, i) => (
                  <NavCard
                    key={item.path}
                    item={item}
                    delay={0.24 + i * 0.03}
                    onOpen={() => setLocation(item.path)}
                  />
                ))}
              </div>
            </Section>
          </div>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 rounded-xl border border-zinc-800/80 bg-[#070707] px-3 py-2.5 sm:px-3.5"
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="home-title text-[11px] uppercase tracking-[0.24em] sm:text-xs">
                Hızlı Erişim
              </h2>
              <p className="home-muted hidden text-[11px] sm:block">Sık kullanılan sistem araçları</p>
            </div>
            <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "grid-cols-5"}`}>
              {visibleQuick.map((item, index) => (
                <motion.button
                  key={item.path}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.35 + index * 0.03 }}
                  onClick={() => setLocation(item.path)}
                  data-testid={item.testId}
                  className="group flex items-center gap-2 rounded-lg border border-zinc-800/90 bg-black/80 px-2.5 py-2 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-950 active:scale-[0.99]"
                >
                  <item.icon
                    className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-200"
                    strokeWidth={1.25}
                  />
                  <span className="home-title truncate text-[11px] tracking-[0.06em] sm:text-[12px]">
                    {item.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
};

export default MarketplaceSelection;
