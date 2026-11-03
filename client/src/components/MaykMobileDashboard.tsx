import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity, ArrowRight, Boxes, FileCheck2, Package,
  RefreshCw, ShieldCheck, Sparkles, TrendingUp,
} from "lucide-react";

type MobileItem = {
  name: string;
  description: string;
  path: string;
  available?: boolean;
  icon: LucideIcon | "shark" | "box";
  testId?: string;
};

type Props = {
  extraction: MobileItem[];
  reviews: MobileItem[];
  system: MobileItem[];
  quick: Array<{ path: string; label: string; icon: LucideIcon; testId: string }>;
  restricted?: boolean;
  destination: string;
  onOpen: (path: string) => void;
};

type TrackingSnapshot = {
  trackedProductsCount: number;
  activeTrackedProductsCount: number;
  pendingChangesCount: number;
  manualReviewCount: number;
  safeSchedulerRunning: boolean;
};

function FeatureIcon({ icon }: { icon: MobileItem["icon"] }) {
  if (icon === "box") return <Package className="h-5 w-5" />;
  if (icon === "shark") return <Boxes className="h-5 w-5" />;
  const Icon = icon;
  return <Icon className="h-5 w-5" strokeWidth={1.8} />;
}

function LaunchCard({
  item, onOpen, restricted = false, priority = false,
}: {
  item: MobileItem; onOpen: (path: string) => void; restricted?: boolean; priority?: boolean;
}) {
  const disabled = restricted || item.available === false;
  return (
    <button
      type="button"
      data-testid={item.testId}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => onOpen(item.path)}
      className={`mayk-mobile-launch group flex w-full min-w-0 items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] disabled:opacity-50 ${priority
        ? "border-cyan-500/35 bg-gradient-to-br from-[#192F40] to-[#132332]"
        : "border-[#304152] bg-[#142231]"}`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${priority
        ? "border-teal-400/35 bg-[#183C48] text-teal-200"
        : "border-slate-600/60 bg-[#213445] text-slate-200"}`}>
        <FeatureIcon icon={item.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="min-w-0 break-words text-[15px] font-semibold leading-snug text-slate-100">{item.name}</p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-slate-400">{item.description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}

export function MaykMobileDashboard({
  extraction, reviews, system, quick, restricted, destination, onOpen,
}: Props) {
  const status = useQuery<TrackingSnapshot>({
    queryKey: ["mayk-mobile-home-tracking-snapshot"],
    queryFn: async () => {
      const response = await fetch("/api/tracking/scheduler-status", { cache: "no-store" });
      if (!response.ok) throw new Error("Durum verisi alınamadı");
      return response.json();
    },
    enabled: !restricted,
    refetchInterval: 30_000,
    retry: 1,
  });

  const summary = status.data;
  const summaryCards = [
    { title: "Takip edilen", value: summary?.trackedProductsCount, icon: Package },
    { title: "Aktif izleme", value: summary?.activeTrackedProductsCount, icon: Activity },
    { title: "Değişiklikler", value: summary?.pendingChangesCount, icon: TrendingUp },
    { title: "Kontrol gerekli", value: summary?.manualReviewCount, icon: FileCheck2 },
  ];

  const tracking = system.find(item => item.path === "/urun-takip");
  const suggested = restricted ? extraction.filter(item => item.path.includes("trendyol")) : tracking ? [tracking, ...extraction] : extraction;
  const remainingSystem = system.filter(item => item.path !== "/urun-takip");

  return (
    <main className="mayk-mobile-screen mx-auto w-full max-w-[760px] min-w-0 space-y-5 overflow-x-clip bg-[#0C1623] px-4 pb-8 pt-5 text-slate-100">
      <section className="relative overflow-hidden rounded-[24px] border border-[#395568] bg-gradient-to-br from-[#1A3645] via-[#122536] to-[#101B2A] p-5 shadow-lg">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">M.A.Y.K · AI PROGRES</p>
            <h1 className="mt-2 text-[25px] font-bold leading-tight tracking-tight text-white">
              Yönetim Merkezi
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-slate-300">
              Ürün operasyonları, takip ve {destination} işlemleri tek yerde.
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-300/30 bg-teal-200/10 text-teal-200">
            <ShieldCheck className="h-6 w-6" />
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium ${summary?.safeSchedulerRunning
            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
            : "border-slate-500/40 bg-slate-700/30 text-slate-200"}`}>
            <span className={`h-2 w-2 rounded-full ${summary?.safeSchedulerRunning ? "bg-emerald-400" : "bg-slate-400"}`} />
            {status.isLoading ? "Durum yükleniyor" : restricted ? "Kısıtlı çalışma alanı" : summary?.safeSchedulerRunning ? "Otomatik takip aktif" : "Takip durumu pasif"}
          </span>
          <button
            type="button"
            aria-label="Sistem durumunu yenile"
            onClick={() => void status.refetch()}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-500/30 px-3 text-[12px] text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${status.isFetching ? "animate-spin" : ""}`} /> Yenile
          </button>
        </div>
      </section>

      {!restricted && (
        <section aria-label="Takip özeti" className="grid min-w-0 grid-cols-2 gap-3">
          {summaryCards.map(card => (
            <div key={card.title} className="min-w-0 rounded-2xl border border-[#304152] bg-[#132232] p-3.5">
              <div className="flex items-center gap-2 text-slate-400">
                <card.icon className="h-4 w-4 shrink-0 text-teal-300" />
                <span className="min-w-0 text-[11px] leading-4">{card.title}</span>
              </div>
              <p className="mt-3 text-[26px] font-semibold tabular-nums leading-none text-white">{card.value ?? "—"}</p>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Hızlı İşlemler</h2>
          <Sparkles className="h-4 w-4 text-teal-300" />
        </div>
        {suggested.map((item, i) => (
          <LaunchCard
            key={item.path}
            item={item}
            onOpen={onOpen}
            restricted={restricted && item.path !== "/scraper/trendyol"}
            priority={i < 2}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">Sistem ve Yönetim</h2>
        <div className="grid min-w-0 grid-cols-1 gap-2.5">
          {remainingSystem.map(item => (
            <LaunchCard key={item.path} item={item} onOpen={onOpen} restricted={restricted} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">Diğer Araçlar</h2>
        {reviews.map(item => <LaunchCard key={item.path} item={item} onOpen={onOpen} restricted={restricted} />)}
        <div className="grid min-w-0 grid-cols-2 gap-2.5">
          {quick.map(item => (
            <button
              key={item.path}
              type="button"
              data-testid={item.testId}
              disabled={restricted}
              onClick={() => onOpen(item.path)}
              className="flex min-h-[76px] min-w-0 flex-col justify-center gap-2 rounded-2xl border border-[#304152] bg-[#142231] px-3.5 text-left disabled:opacity-40"
            >
              <item.icon className="h-4 w-4 text-teal-300" />
              <span className="min-w-0 break-words text-[12px] font-medium leading-4 text-slate-100">{item.label}</span>
            </button>
          ))}
        </div>
      </section>
      <p className="text-center text-[11px] text-slate-500">M.A.Y.K · Güvenli ürün yönetimi</p>
    </main>
  );
}
