import { useLocation } from "wouter";
import { ArrowRight, Bell, Bot, Box, Boxes, Clock3, GitBranch, KeyRound, Link2, Shield, Star, TimerReset, Workflow, Wrench } from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";

type Item = { title: string; description: string; path: string; icon: React.ReactNode };

const extractionItems: Item[] = [
  { title: "Trendyol", description: "Ürün çıkarma ve MARKT-GO aktarım", path: "/scraper/trendyol", icon: <Box className="h-4 w-4" /> },
  { title: "Ürün Havuzu", description: "Bağımsız ürün çekme aracı sıra siteler", path: "/urun-havuzu", icon: <Boxes className="h-4 w-4" /> },
];

const reviewItems: Item[] = [
  { title: "Trendyol Yorum Çıkarıcı", description: "Ürün yorumlarını çek ve CSV olarak dışa aktar", path: "/trendyol-reviews", icon: <Star className="h-4 w-4" /> },
];

const analysisItems: Item[] = [
  { title: "Ürün Takip Sistemi", description: "Kaynak vs MARKT-GO değişiklik tespiti", path: "/urun-takip", icon: <Workflow className="h-4 w-4" /> },
  { title: "Kategoriler", description: "MARKT-GO etiketleri, ürün sayıları ve koleksiyonlar", path: "/kategoriler", icon: <GitBranch className="h-4 w-4" /> },
  { title: "Web sitesi kancaları", description: "Ürün havuzu + Trendyol siteleri canlı şema", path: "/web-sitesi-kancalari", icon: <Link2 className="h-4 w-4" /> },
  { title: "Bağlantı API Erişimi", description: "Tüm bağlantılar, şemalar ve yeni API erişimi", path: "/baglanti-api", icon: <KeyRound className="h-4 w-4" /> },
  { title: "Otomatik Takip Sistemi", description: "Ürün fiyat izleme ve MARKT-GO senkronizasyonu", path: "/control-center?tab=tracking", icon: <Workflow className="h-4 w-4" /> },
  { title: "Bildirimler", description: "Bildirim türlerini aç/kapa ve test gönder", path: "/bildirimler", icon: <Bell className="h-4 w-4" /> },
  { title: "Sistem Durumu", description: "Hata izleme ve sistem durumu", path: "/system-status", icon: <Shield className="h-4 w-4" /> },
];

const quickItems: Item[] = [
  { title: "Replit Agent", description: "", path: "/replit-agent", icon: <Bot className="h-4 w-4" /> },
  { title: "S.O.S Kontrol", description: "", path: "/sos-control", icon: <Shield className="h-4 w-4" /> },
  { title: "Zamanlı Görevler", description: "", path: "/scheduler", icon: <TimerReset className="h-4 w-4" /> },
  { title: "Telegram Bildirimleri", description: "", path: "/telegram-notifications", icon: <Bell className="h-4 w-4" /> },
];

function StatusPill() {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-black/70 px-2 py-0.5 text-[9px] tracking-[0.18em] text-zinc-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />AKTİF</span>;
}

function DashboardItem({ item }: { item: Item }) {
  const [, setLocation] = useLocation();
  return (
    <button type="button" onClick={() => setLocation(item.path)} className="group flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-[#080808] px-3 py-2.5 text-left transition-colors hover:border-zinc-600 hover:bg-[#0d0d0d]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-[#0b0b0b] text-zinc-500 group-hover:text-white">{item.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><span className="truncate text-[13px] font-medium text-zinc-100">{item.title}</span><StatusPill /></span>
        {item.description ? <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{item.description}</span> : null}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300" />
    </button>
  );
}

function Section({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-zinc-800 bg-black/35 p-3 ${className}`}><div className="mb-2 border-b border-zinc-900 pb-2"><h2 className="text-[11px] font-semibold tracking-[0.16em] text-zinc-100">{title}</h2><p className="mt-0.5 text-[10px] text-zinc-500">{subtitle}</p></div>{children}</section>;
}

export default function BlackMainDashboard() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-[1140px] px-4 pb-10 pt-5 md:px-6 md:pt-7">
        <header className="relative mb-3 border-b border-zinc-900 pb-3 text-center">
          <div className="absolute right-0 top-0 hidden items-center gap-2 rounded-full border border-zinc-800 bg-black/50 px-3 py-1.5 text-[11px] text-zinc-400 md:flex"><Clock3 className="h-3.5 w-3.5" /><RealTimeClock /></div>
          <div className="flex items-center justify-center gap-3"><span className="text-[28px] font-semibold tracking-[0.32em] text-zinc-200 md:text-[34px]">ORVIAN</span><span className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-600 text-zinc-200"><Wrench className="h-4 w-4" /></span></div>
          <p className="mt-1 text-[9px] tracking-[0.35em] text-zinc-400">TOMORROW BEGINS HERE</p>
        </header>

        <main className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <Section title="ÜRÜN ÇIKARMA" subtitle="Ürün çekme platformları" className="lg:col-span-3"><div className="space-y-2">{extractionItems.map((item) => <DashboardItem key={item.title} item={item} />)}</div></Section>
          <Section title="YORUM ÇIKARMA" subtitle="Yorumları çekip CSV dışa aktarın" className="lg:col-span-3"><div className="space-y-2">{reviewItems.map((item) => <DashboardItem key={item.title} item={item} />)}</div></Section>
          <Section title="SİSTEM ANALİZİ" subtitle="Takip, kategori ve bağlantı yönetimi" className="lg:col-span-6"><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{analysisItems.map((item) => <DashboardItem key={item.title} item={item} />)}</div></Section>

          <section className="lg:col-span-12 rounded-xl border border-zinc-800 bg-black/35 p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-[11px] font-semibold tracking-[0.16em] text-zinc-100">HIZLI ERİŞİM</h2><span className="text-[9px] text-zinc-600">Sık kullanılan sistem araçları</span></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{quickItems.map((item) => <button key={item.title} type="button" onClick={() => setLocation(item.path)} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-[#080808] px-3 py-2 text-left text-[12px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"><span className="text-zinc-500">{item.icon}</span><span>{item.title}</span></button>)}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
