import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
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
  Globe
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
  { name: 'Kaynak Erişim', path: '/kaynak-erisim', icon: Globe, description: 'Proxy / scraping API', category: 'system' },
  { name: 'Takip Dashboard', path: '/tracking-dashboard', icon: Activity, description: 'Otomatik takip (legacy)', category: 'tools' },
  { name: 'Fiyat Karşılaştırma', path: '/price-comparison', icon: BarChart3, description: 'Fiyat analizi', category: 'tools' },
  { name: 'Veri Analizi', path: '/data-analysis', icon: Database, description: 'Ürün analizi', category: 'tools' },
  
  // Sistem ve Ayarlar
  { name: 'Sistem Durumu', path: '/system-status', icon: Shield, description: 'Sistem kontrolü', category: 'system' },
  { name: 'Zamanlayıcı', path: '/scheduler', icon: Calendar, description: 'Otomatik görevler', category: 'system' },
  { name: 'E-posta Ayarları', path: '/email', icon: Mail, description: 'Bildirim ayarları', category: 'system' },
  { name: 'Telegram', path: '/telegram', icon: MessageCircle, description: 'Telegram botu', category: 'system' },
  { name: 'S.O.S Kontrol', path: '/sos-control', icon: TrendingUp, description: 'Acil durum kontrol', category: 'system' }
];

const categoryNames = {
  main: 'Ana Menü',
  scraper: 'Ürün Çıkarma',
  tools: 'Analiz & Takip',
  system: 'Sistem & Ayarlar'
};

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const isMobile = useIsMobile();

  const { data: trackingBadge } = useQuery({
    queryKey: ['tracking-notifications'],
    queryFn: async () => {
      const r = await fetch('/api/tracking/notifications');
      if (!r.ok) return { pendingChangesCount: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
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
      {/* Hamburger Menu Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed top-4 left-4 z-50"
      >
        <Button
          onClick={() => setIsOpen(true)}
          className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-700 to-blue-900 border border-blue-600/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
          size="icon"
          data-testid="button-mobile-menu"
        >
          <Menu className="h-6 w-6 text-white" />
        </Button>
      </motion.div>

      {/* Navigation Drawer — AnimatePresence kaldırıldı (insertBefore reset) */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full w-80 max-w-[85vw] bg-gradient-to-br from-slate-900 via-blue-900/90 to-slate-900 border-r border-blue-600/30 shadow-2xl z-50 animate-in slide-in-from-left duration-200">
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
              <div className="overflow-y-auto h-[calc(100%-80px)] p-4 space-y-6">
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