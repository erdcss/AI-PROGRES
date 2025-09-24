import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, BarChart3, 
  MessageSquare, Shield, Bot, AlertTriangle, 
  Database, Clock, Truck, Settings, Activity
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";

const MainDashboard = () => {
  const [, setLocation] = useLocation();

  // Ürün Veri Aktarım İşlemleri
  const dataTransferOptions = [
    {
      name: "Trendyol",
      description: "Ürün çıkarma ve Shopify aktarım",
      icon: <Store className="w-6 h-6" />,
      color: "from-blue-500 to-blue-600",
      available: true,
      path: "/scraper/trendyol"
    },
    {
      name: "Arçelik",
      description: "Ürün çıkarma ve Shopify aktarım",
      icon: <Package className="w-6 h-6" />,
      color: "from-emerald-500 to-emerald-600",
      available: true,
      path: "/arcelik"
    },
    {
      name: "Hepsiburada", 
      description: "Ürün çıkarma sistemi",
      icon: <ShoppingCart className="w-6 h-6" />,
      color: "from-slate-500 to-slate-600",
      available: false,
      path: "/coming-soon/hepsiburada"
    },
    {
      name: "Amazon",
      description: "Ürün çıkarma sistemi",
      icon: <Package className="w-6 h-6" />,
      color: "from-slate-500 to-slate-600", 
      available: false,
      path: "/coming-soon/amazon"
    },
    {
      name: "N11",
      description: "Ürün çıkarma sistemi", 
      icon: <Truck className="w-6 h-6" />,
      color: "from-slate-500 to-slate-600",
      available: false,
      path: "/coming-soon/n11"
    },
  ];

  // Sistem Donanım ve Kontrol Merkezi
  const systemControlOptions = [
    {
      name: "Sistem Durumu & Hata Merkezi",
      description: "Hata izleme ve sistem durumu",
      icon: <Shield className="w-6 h-6" />,
      color: "from-blue-500 to-blue-600",
      available: true,
      path: "/system-status"
    },
    {
      name: "Replit.Agent",
      description: "AI kod asistanı ve geliştirme",
      icon: <Bot className="w-6 h-6" />,
      color: "from-purple-500 to-purple-600",
      available: true,
      path: "/replit-agent"
    },
    {
      name: "S.O.S Kontrol Merkezi",
      description: "Acil durum kontrol paneli",
      icon: <AlertTriangle className="w-6 h-6" />,
      color: "from-slate-500 to-slate-600",
      available: true,
      path: "/sos-control"
    }
  ];

  const handleOptionClick = (option: any) => {
    if (option.available) {
      setLocation(option.path);
    } else {
      setLocation("/coming-soon");
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="text-center mb-16 animate-fade-in">
          <div className="card-glass-dark rounded-3xl p-10 shadow-2xl">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                <Settings className="w-8 h-8 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-4xl font-bold text-white tracking-tight">
                  Veri Transfer Programı
                </h1>
                <p className="text-sm text-slate-300 font-medium tracking-wide uppercase">
                  Ürün Çıkarma ve Analiz Sistemi
                </p>
              </div>
            </div>
            <p className="text-slate-300 text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
              Ürün verilerini çıkarabileceğiniz ve analiz edebileceğiniz platformları seçin. 
              Modern dashboard ile tüm işlemlerinizi kolayca yönetin.
            </p>
            <div className="inline-flex items-center gap-3 bg-slate-700/50 border border-slate-600/40 rounded-xl px-6 py-3 shadow-md backdrop-blur-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <Clock className="w-5 h-5 text-slate-300" />
              <span className="text-slate-200 font-medium">
                <RealTimeClock />
              </span>
            </div>
          </div>
        </header>

        <main className="space-y-12">
          {/* Kompakt Liste Formatı - Üç Bölüm */}
          <section className="animate-slide-up">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Ürün Çıkarma Platformları */}
              <div className="card-glass rounded-2xl p-5 shadow-xl">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                    <h2 className="text-base font-bold text-white">
                      Ürün Çıkarma Platformları
                    </h2>
                  </div>
                  <p className="text-slate-400 text-xs">
                    Shopify'a aktarabileceğiniz platformlar
                  </p>
                </div>
                
                <div className="space-y-2">
                  {dataTransferOptions.slice(0, 4).map((option, index) => (
                    <div
                      key={option.name}
                      onClick={() => handleOptionClick(option)}
                      className={`
                        group flex items-center justify-between p-3 bg-slate-700/30 border border-slate-600/30 rounded-lg cursor-pointer
                        transition-all duration-200 hover:bg-slate-600/40 hover:border-slate-500/40 hover:scale-[1.02]
                        ${!option.available ? 'opacity-60 cursor-not-allowed hover:scale-100' : ''}
                      `}
                      data-testid={`platform-${option.name.toLowerCase()}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded-md flex items-center justify-center shadow-sm">
                          <div className="text-white text-xs">
                            {option.icon}
                          </div>
                        </div>
                        <div className="text-left">
                          <h3 className="text-white font-medium text-sm">
                            {option.name}
                          </h3>
                          <p className="text-slate-400 text-xs leading-tight">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      {option.available ? (
                        <span className="status-active text-xs px-2 py-1 rounded-md font-medium">
                          Aktif
                        </span>
                      ) : (
                        <span className="status-coming-soon text-xs px-2 py-1 rounded-md font-medium">
                          Yakında
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sistem Yönetimi ve Analiz */}
              <div className="card-glass rounded-2xl p-5 shadow-xl">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                    <h2 className="text-base font-bold text-white">
                      Sistem Yönetimi ve Analiz
                    </h2>
                  </div>
                  <p className="text-slate-400 text-xs">
                    Analiz, takip ve yönetim araçları
                  </p>
                </div>
                
                <div className="space-y-2">
                  {systemControlOptions.map((option, index) => (
                    <div
                      key={option.name}
                      onClick={() => handleOptionClick(option)}
                      className="group flex items-center justify-between p-3 bg-slate-700/30 border border-slate-600/30 rounded-lg cursor-pointer transition-all duration-200 hover:bg-slate-600/40 hover:border-slate-500/40 hover:scale-[1.02]"
                      data-testid={`system-${option.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-md flex items-center justify-center shadow-sm">
                          <div className="text-white text-xs">
                            {option.icon}
                          </div>
                        </div>
                        <div className="text-left">
                          <h3 className="text-white font-medium text-sm leading-tight">
                            {option.name}
                          </h3>
                          <p className="text-slate-400 text-xs leading-tight">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="status-active text-xs px-2 py-1 rounded-md font-medium">
                          Aktif
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hızlı Erişim */}
              <div className="card-glass rounded-2xl p-5 shadow-xl">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                    <h2 className="text-base font-bold text-white">
                      Hızlı Erişim
                    </h2>
                  </div>
                  <p className="text-slate-400 text-xs">
                    En çok kullanılan araçlar
                  </p>
                </div>
                
                <div className="space-y-2">
                  <button
                    onClick={() => setLocation('/scraper/trendyol')}
                    className="w-full group flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-3 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02]"
                    data-testid="quick-access-trendyol"
                  >
                    <Store className="w-4 h-4" />
                    <span className="text-sm">Trendyol</span>
                  </button>
                  <button
                    onClick={() => setLocation('/system-status')}
                    className="w-full group flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-3 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02]"
                    data-testid="quick-access-system-status"
                  >
                    <Shield className="w-4 h-4" />
                    <span className="text-sm">Sistem Durumu</span>
                  </button>
                  <button
                    onClick={() => setLocation('/tracking-dashboard')}
                    className="w-full group flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-3 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02]"
                    data-testid="quick-access-tracking-dashboard"
                  >
                    <Activity className="w-4 h-4" />
                    <span className="text-sm">Takip Sistemi</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* İstatistikler ve Özet */}
          <section className="animate-slide-up" style={{animationDelay: '0.2s'}}>
            <div className="card-glass rounded-2xl p-6 shadow-xl">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-white mb-2">
                  Sistem Özeti
                </h2>
                <p className="text-slate-400 text-sm">
                  Platform durumu ve hızlı istatistikler
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-slate-700/20 rounded-xl border border-slate-600/20">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Store className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-white font-medium text-sm mb-1">Platformlar</h3>
                  <p className="text-slate-400 text-xs">4 Platform</p>
                  <p className="text-green-400 text-xs mt-1">2 Aktif</p>
                </div>
                
                <div className="text-center p-4 bg-slate-700/20 rounded-xl border border-slate-600/20">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Settings className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-white font-medium text-sm mb-1">Sistem Araçları</h3>
                  <p className="text-slate-400 text-xs">3 Araç</p>
                  <p className="text-green-400 text-xs mt-1">Tümü Aktif</p>
                </div>
                
                <div className="text-center p-4 bg-slate-700/20 rounded-xl border border-slate-600/20">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-white font-medium text-sm mb-1">Hızlı Erişim</h3>
                  <p className="text-slate-400 text-xs">3 Kısayol</p>
                  <p className="text-green-400 text-xs mt-1">Hazır</p>
                </div>
                
                <div className="text-center p-4 bg-slate-700/20 rounded-xl border border-slate-600/20">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-white font-medium text-sm mb-1">Sistem Durumu</h3>
                  <p className="text-slate-400 text-xs">Çevrimiçi</p>
                  <p className="text-green-400 text-xs mt-1">Sağlıklı</p>
                </div>
              </div>
              
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 text-slate-400 text-xs">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Son güncelleme: Az önce</span>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default MainDashboard;