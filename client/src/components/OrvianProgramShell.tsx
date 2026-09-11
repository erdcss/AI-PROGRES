import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  ChevronRight,
  CircleUserRound,
  Database,
  Home,
  LogOut,
  Menu,
  PackageSearch,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAppTabNavigation } from "@/components/app-tabs-store";
import { logoutAccount } from "@/lib/account-auth";
import { toast } from "@/hooks/use-toast";

type LiveNotification = {
  id: number | string;
  title?: string | null;
  body?: string | null;
  message?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  data?: Record<string, unknown> | null;
};

const navItems = [
  { label: "Genel Bakış", path: "/", icon: Home },
  { label: "Ürün Aktarımı", path: "/trendyol", icon: PackageSearch },
  { label: "Ürün Havuzu", path: "/urun-havuzu", icon: Boxes },
  { label: "Ürün Takibi", path: "/control-center?tab=tracking", icon: Activity },
  { label: "Veri Analizi", path: "/data-analysis", icon: BarChart3 },
  { label: "Kategoriler", path: "/kategoriler", icon: Database },
  { label: "Zamanlayıcı", path: "/scheduler", icon: CalendarClock },
] as const;

const secondaryItems = [
  { label: "Bildirimler", path: "/bildirimler", icon: Bell },
  { label: "Sistem Durumu", path: "/system-status", icon: ShieldCheck },
  { label: "Ayarlar", path: "/control-center", icon: Settings },
] as const;

function notificationText(item: LiveNotification) {
  return String(item.body || item.message || "Yeni sistem bildirimi");
}

export function OrvianProgramShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useAppTabNavigation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [connected, setConnected] = useState(false);

  const activePath = useMemo(() => location.split("?")[0], [location]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/live-notifications/recent?limit=30", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!mounted || !payload) return;
        setNotifications(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch(() => undefined);

    const stream = new EventSource("/api/live-notifications/stream", { withCredentials: true });
    stream.addEventListener("open", () => mounted && setConnected(true));
    stream.addEventListener("error", () => mounted && setConnected(false));
    stream.addEventListener("notification", (event) => {
      if (!mounted) return;
      try {
        const item = JSON.parse((event as MessageEvent).data) as LiveNotification;
        setNotifications((current) => [item, ...current.filter((x) => String(x.id) !== String(item.id))].slice(0, 40));
        toast({ title: item.title || "Orvian", description: notificationText(item) });
      } catch {
        // malformed notification must never break the application shell
      }
    });

    return () => {
      mounted = false;
      stream.close();
    };
  }, []);

  const go = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const renderNav = (items: readonly { label: string; path: string; icon: typeof Home }[]) =>
    items.map((item) => {
      const Icon = item.icon;
      const itemPath = item.path.split("?")[0];
      const active = activePath === itemPath;
      return (
        <button
          type="button"
          key={item.path}
          onClick={() => go(item.path)}
          className={`group relative flex h-9 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[12px] transition-colors ${
            active
              ? "bg-[#181818] text-[#f5f5f5]"
              : "text-[#a3a3a3] hover:bg-[#141414] hover:text-[#ededed]"
          }`}
        >
          <span className={`absolute -left-1 h-3.5 w-0.5 rounded-full ${active ? "bg-[#b8f171]" : "bg-transparent"}`} />
          <Icon className="h-4 w-4 text-[#737373] group-hover:text-[#a3a3a3]" />
          <span>{item.label}</span>
        </button>
      );
    });

  return (
    <div className="min-h-screen bg-[#090909] text-[#f5f5f5]">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[79] bg-black/65 md:hidden"
          aria-label="Menüyü kapat"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-[80] flex w-[248px] flex-col border-r border-[#222] bg-[#0d0d0d] px-3 pb-3 pt-3 transition-transform md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-10 items-center justify-between px-1">
          <button type="button" onClick={() => go("/")} className="flex items-center gap-2.5 text-left">
            <span className="grid h-6 w-6 place-items-center rounded-[7px] border border-[#343434] bg-[#151515] text-[11px] font-semibold">O</span>
            <span className="text-[13px] font-semibold tracking-[-0.02em]">ORVIAN <span className="text-[#b8f171]">AI</span></span>
          </button>
          <button type="button" className="rounded-md p-1 text-[#777] md:hidden" onClick={() => setMobileOpen(false)}><X className="h-4 w-4" /></button>
        </div>

        <div className="mx-1 mb-3 mt-2 rounded-[8px] border border-[#252525] bg-[#121212] p-2.5">
          <div className="text-[9px] uppercase tracking-[0.1em] text-[#646464]">Çalışma alanı</div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-[#d4d4d4]">
            <span>Turmarkt Veri Programı</span><ChevronRight className="h-3.5 w-3.5 text-[#555]" />
          </div>
        </div>

        <nav className="grid gap-0.5">{renderNav(navItems)}</nav>
        <div className="mx-1 my-2.5 h-px bg-[#1d1d1d]" />
        <nav className="grid gap-0.5">{renderNav(secondaryItems)}</nav>

        <div className="mt-auto border-t border-[#1d1d1d] pt-2">
          <div className="mb-1.5 flex items-center gap-2 rounded-[7px] px-2.5 py-2 text-[#999]">
            <CircleUserRound className="h-4 w-4" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-[#d4d4d4]">Yönetici</div>
              <div className="truncate text-[9px] text-[#666]">Senkronize hesap</div>
            </div>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-[#b8f171]" : "bg-[#555]"}`} title={connected ? "Canlı bildirim bağlantısı aktif" : "Canlı bağlantı yeniden kuruluyor"} />
          </div>
          <button
            type="button"
            onClick={() => void logoutAccount()}
            className="flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-[11px] text-[#737373] hover:bg-[#151515] hover:text-[#c8c8c8]"
          >
            <LogOut className="h-3.5 w-3.5" /> Çıkış Yap
          </button>
        </div>
      </aside>

      <main className="min-h-screen bg-[#090909] md:ml-[248px]">
        <div className="sticky top-0 z-[70] flex h-12 items-center justify-between border-b border-[#1d1d1d] bg-[#090909]/95 px-3 backdrop-blur md:px-5">
          <button type="button" className="grid h-8 w-8 place-items-center rounded-[7px] border border-[#252525] bg-[#121212] text-[#999] md:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-4 w-4" /></button>
          <div className="hidden text-[11px] text-[#666] md:block">Turmarkt Veri Programı · Orvian arayüzü</div>
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setNotificationsOpen((v) => !v)}
              className="relative grid h-8 w-8 place-items-center rounded-[7px] border border-[#252525] bg-[#121212] text-[#999] hover:bg-[#171717] hover:text-[#ddd]"
              aria-label="Bildirimler"
            >
              <Bell className="h-4 w-4" />
              {notifications.length > 0 ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#b8f171] px-1 text-center text-[9px] font-bold leading-4 text-[#080808]">{Math.min(notifications.length, 99)}</span> : null}
            </button>
            {notificationsOpen ? (
              <div className="absolute right-0 top-10 z-[100] w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[10px] border border-[#292929] bg-[#101010] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#222] px-3.5 py-3">
                  <div><div className="text-[12px] font-medium">Bildirimler</div><div className="mt-0.5 text-[9px] text-[#666]">Anlık sistem akışı</div></div>
                  <span className={`text-[9px] ${connected ? "text-[#9dcd68]" : "text-[#777]"}`}>{connected ? "CANLI" : "BAĞLANIYOR"}</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {notifications.length ? notifications.map((item) => (
                    <div key={String(item.id)} className="border-b border-[#1d1d1d] px-3.5 py-3 last:border-0">
                      <div className="text-[11px] font-medium text-[#e5e5e5]">{item.title || "Orvian"}</div>
                      <div className="mt-1 whitespace-pre-line text-[10px] leading-4 text-[#888]">{notificationText(item)}</div>
                    </div>
                  )) : <div className="px-4 py-8 text-center text-[10px] text-[#666]">Henüz bildirim yok.</div>}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">{children}</div>
      </main>
    </div>
  );
}
