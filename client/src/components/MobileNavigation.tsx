import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useAppTabNavigation } from '@/components/app-tabs-store';
import { useQuery } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Menu, 
  X, 
  Home, 
  ShoppingCart, 
  BarChart3, 
  Settings, 
  Database,
  Mail,
  Calendar,
  Shield,
  Bot,
  MessageCircle,
  Package,
  Bookmark,
  Activity,
  Cpu,
  TrendingUp,
  FolderTree,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavigationItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category: 'main' | 'scraper' | 'tools' | 'system';
}

const navigationItems: NavigationItem[] = [
  // Ana Menü
  { name: 'Ana Sayfa', path: '/', icon: Home, description: 'Platform seçimi', category: 'main' },
  
  // Ürün Çıkarma
  { name: 'Trendyol', path: '/trendyol', icon: ShoppingCart, description: 'Ürün çıkarma', category: 'scraper' },
  { name: 'Arçelik', path: '/arcelik', icon: Cpu, description: 'Beyaz eşya ürünleri', category: 'scraper' },
  { name: 'AI Enhanced', path: '/ai-enhanced', icon: Bot, description: 'AI destekli çıkarma', category: 'scraper' },
  { name: 'Kayıtlı URL\'ler', path: '/saved-urls', icon: Bookmark, description: 'URL arama', category: 'scraper' },
  
  // Analiz ve Takip
  { name: 'Hafıza Dashboard', path: '/memory-dashboard', icon: Database, description: 'Gerçek zamanlı takip', category: 'tools' },
  { name: 'Ürün Takip', path: '/urun-takip', icon: Activity, description: 'Kaynak vs Shopify diff', category: 'tools' },
  { name: 'Kategoriler', path: '/kategoriler', icon: FolderTree, description: 'Etiket ve koleksiyon dağılımı', category: 'tools' },
  { name: 'Takip Dashboard', path: '/tracking-dashboard', icon: Activity, description: 'Otomatik takip (legacy)', category: 'tools' },
  { name: 'Fiyat Karşılaştırma', path: '/price-comparison', icon: BarChart3, description: 'Fiyat analizi', category: 'tools' },
  { name: 'Veri Analizi', path: '/data-analysis', icon: Database, description: 'Ürün analizi', category: 'tools' },
  
  // Sistem ve Ayarlar
  { name: 'Sistem Durumu', path: '/system-status', icon: Shield, description: 'Sistem kontrolü', category: 'system' },
  { name: 'Zamanlayıcı', path: '/scheduler', icon: Calendar, description: 'Otomatik görevler', category: 'system' },
  { name: 'E-posta Ayarları', path: '/email', icon: Mail, description: 'Bildirim ayarları', category: 'system' },
  { name: 'Bildirimler', path: '/bildirimler', icon: Bell, description: 'Bildirim aç/kapa ve test', category: 'system' },
  { name: 'Telegram', path: '/telegram', icon: MessageCircle, description: 'Telegram botu', category: 'system' },
  { name: 'S.O.S Kontrol', path: '/sos-control', icon: TrendingUp, description: 'Acil durum kontrol', category: 'system' }
];

const categoryNames = {
  main: 'Ana Menü',
  scraper: 'Ürün Çıkarma',
  tools: 'Analiz & Takip',
  system: 'Sistem & Ayarlar'
};

export function MobileNavigation({ actions }: { actions?: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useAppTabNavigation();
  const isMobile = useIsMobile();

  const { data: trackingBadge } = useQuery({
    queryKey: ['tracking-notifications'],
    queryFn: async () => {
      const r = await fetch('/api/tracking/notifications');
      if (!r.ok) return { pendingChangesCount: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: isMobile,
    staleTime: 30_000,
  });

  const pendingCount = Number(trackingBadge?.pendingChangesCount ?? 0);

  const handleNavigate = (path: string) => {
    setLocation(path);
    setIsOpen(false);
  };

  const groupedItems = navigationItems.reduce((groups, item) => {
    if (!groups[item.category]) {
      groups[item.category] = [];
    }
    groups[item.category].push(item);
    return groups;
  }, {} as Record<string, NavigationItem[]>);

  if (!isMobile) {
    return null; // Sadece mobilde göster
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-[60px] min-w-0 items-center gap-3 border-b border-[#253D4E] bg-[#0D1B29]/95 px-3 text-slate-100 shadow-sm backdrop-blur-md">
        <button
          type="button"
          aria-label="Ana menüyü aç"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#35556A] bg-[#1B3648] text-teal-100"
          data-testid="button-mobile-menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold tracking-[0.13em] text-teal-200">AI PROGRES</div>
          <div className="truncate text-[11px] text-slate-400">
            {location.startsWith("/urun-takip") ? "Ürün Takip Merkezi" : location === "/" ? "Ana Sayfa" : "Yönetim Paneli"}
          </div>
        </div>
        {actions && <div className="min-w-0 shrink-0">{actions}</div>}
      </header>

      <nav aria-label="Mobil ana gezinme" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#355165] bg-[#0F1F2E]/95 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-2xl backdrop-blur-lg">
        {[
          { path: "/", title: "Ana Sayfa", icon: Home },
          { path: "/urun-takip", title: "Ürün Takip", icon: Activity },
          { path: "/scraper/trendyol", title: "Ürün Çek", icon: ShoppingCart },
        ].map(item => {
          const Icon = item.icon;
          const active = location === item.path || (item.path === "/scraper/trendyol" && location === "/trendyol");
          return (
            <button key={item.path} type="button" aria-current={active ? "page" : undefined}
              onClick={() => handleNavigate(item.path)}
              className={`relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] ${active ? "bg-[#1C3C4A] font-semibold text-teal-200" : "text-slate-400"}`}>
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.title}</span>
              {item.path === "/urun-takip" && pendingCount > 0 && (
                <span className="absolute right-1.5 top-0 rounded-full bg-rose-600 px-1 text-[9px] text-white">
                  {pendingCount > 999 ? "999+" : pendingCount}
                </span>
              )}
            </button>
          );
        })}
        <button type="button" onClick={() => setIsOpen(true)}
          className="flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] text-slate-400">
          <Menu className="h-5 w-5" />
          <span>Menü</span>
        </button>
      </nav>

      {/* Navigation Drawer — AnimatePresence kaldırıldı (insertBefore reset) */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed left-0 top-0 z-[80] h-[100dvh] w-80 max-w-[88vw] bg-gradient-to-br from-slate-900 via-blue-900/90 to-slate-900 border-r border-blue-600/30 shadow-2xl animate-in slide-in-from-left duration-200">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-blue-600/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-700 to-blue-900 rounded-xl flex items-center justify-center">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-sm">VERİ TRANSFER</h2>
                    <p className="text-blue-400 text-xs font-bold">Mobil Navigasyon</p>
                  </div>
                </div>
                <Button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600/50"
                  size="icon"
                  data-testid="button-close-menu"
                >
                  <X className="h-4 w-4 text-white" />
                </Button>
              </div>

              {/* Navigation Content */}
              <div className="h-[calc(100dvh-80px)] space-y-6 overflow-y-auto overscroll-contain p-4 pb-10">
                {Object.entries(groupedItems).map(([category, items]) => (
                  <div key={category}>
                    <h3 className="text-blue-400 text-xs font-black uppercase tracking-wider mb-3 px-2">
                      {categoryNames[category as keyof typeof categoryNames]}
                    </h3>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const Icon = item.icon;
                        const isActive = location === item.path;
                        
                        return (
                          <motion.button
                            key={item.path}
                            onClick={() => handleNavigate(item.path)}
                            className={`
                              w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200
                              ${isActive 
                                ? 'bg-blue-600/30 border border-blue-500/50 shadow-lg' 
                                : 'bg-slate-800/30 hover:bg-slate-700/30 border border-slate-600/30'
                              }
                              active:scale-95
                            `}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            data-testid={`link-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <div className={`
                              w-8 h-8 rounded-lg flex items-center justify-center
                              ${isActive 
                                ? 'bg-blue-600 shadow-lg' 
                                : 'bg-slate-700/50'
                              }
                            `}>
                              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-400'}`} />
                            </div>
                            <div className="flex-1 text-left">
                              <p className={`font-bold text-sm ${isActive ? 'text-white' : 'text-slate-300'}`}>
                                {item.name}
                                {item.path === '/urun-takip' && pendingCount > 0 && (
                                  <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs rounded-full bg-red-500 text-white">
                                    {pendingCount}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {item.description}
                              </p>
                            </div>
                            {isActive && (
                              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </>
      )}
    </>
  );
}