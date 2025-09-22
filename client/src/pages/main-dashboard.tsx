import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, BarChart3, 
  MessageSquare, Shield, Bot, AlertTriangle, 
  Database, Clock, Truck, Settings
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
    {
      name: "Ürün Veri Analizi",
      description: "Hafıza sistemi ve analiz",
      icon: <BarChart3 className="w-6 h-6" />,
      color: "from-purple-500 to-purple-600",
      available: true,
      path: "/data-analysis"
    },
    {
      name: "Ürün Yorumları",
      description: "Yorum çıkarma ve yönetim",
      icon: <MessageSquare className="w-6 h-6" />,
      color: "from-blue-500 to-blue-600",
      available: true,
      path: "/product-reviews"
    }
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
      name: "Hafıza Takip Sistemi",
      description: "Ürün değişikliklerini takip et",
      icon: <Database className="w-6 h-6" />,
      color: "from-green-500 to-green-600",
      available: true,
      path: "/memory-tracking"
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

        <main className="space-y-16">
          {/* Üç Ana Bölüm - Yanyana */}
          <section className="animate-slide-up">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Ürün Çıkarma Platformları */}
              <div className="card-glass rounded-3xl p-6 shadow-xl">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <h2 className="text-lg font-bold text-white">
                      Ürün Çıkarma Platformları
                    </h2>
                  </div>
                  <p className="text-slate-300 text-sm">
                    Shopify'a aktarabileceğiniz platformlar
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {dataTransferOptions.slice(0, 4).map((option, index) => (
                    <div
                      key={option.name}
                      onClick={() => handleOptionClick(option)}
                      className={`
                        group bg-slate-700/50 backdrop-blur-sm border border-slate-600/40 rounded-xl p-4 cursor-pointer
                        transition-all duration-300 hover:shadow-lg hover:bg-slate-600/50 hover:-translate-y-1
                        ${!option.available ? 'opacity-60 cursor-not-allowed hover:transform-none' : ''}
                      `}
                      data-testid={`platform-${option.name.toLowerCase()}`}
                    >
                      <div className="flex flex-col items-center text-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center mb-3 shadow-md group-hover:scale-110 transition-transform duration-300">
                          <div className="text-white text-lg">
                            {option.icon}
                          </div>
                        </div>
                        <h3 className="text-white font-medium text-sm mb-2">
                          {option.name}
                        </h3>
                        {option.available ? (
                          <span className="status-active text-xs px-2 py-1 rounded-full font-medium">
                            Aktif
                          </span>
                        ) : (
                          <span className="status-coming-soon text-xs px-2 py-1 rounded-full font-medium">
                            Yakında
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sistem Yönetimi ve Analiz */}
              <div className="card-glass rounded-3xl p-6 shadow-xl">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                    <h2 className="text-lg font-bold text-white">
                      Sistem Yönetimi ve Analiz
                    </h2>
                  </div>
                  <p className="text-slate-300 text-sm">
                    Analiz, takip ve yönetim araçları
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {systemControlOptions.map((option, index) => (
                    <div
                      key={option.name}
                      onClick={() => handleOptionClick(option)}
                      className="group bg-slate-700/50 backdrop-blur-sm border border-slate-600/40 rounded-xl p-4 cursor-pointer transition-all duration-300 hover:shadow-lg hover:bg-slate-600/50 hover:-translate-y-1"
                      data-testid={`system-${option.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="flex flex-col items-center text-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-lg flex items-center justify-center mb-3 shadow-md group-hover:scale-110 transition-transform duration-300">
                          <div className="text-white text-lg">
                            {option.icon}
                          </div>
                        </div>
                        <h3 className="text-white font-medium text-sm mb-2 leading-tight">
                          {option.name}
                        </h3>
                        <div className="flex items-center gap-1">
                          <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="status-active text-xs px-2 py-1 rounded-full font-medium">
                            Aktif
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hızlı Erişim */}
              <div className="card-glass rounded-3xl p-6 shadow-xl">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    <h2 className="text-lg font-bold text-white">
                      Hızlı Erişim
                    </h2>
                  </div>
                  <p className="text-slate-300 text-sm">
                    En çok kullanılan araçlar
                  </p>
                </div>
                
                <div className="space-y-3">
                  <button
                    onClick={() => setLocation('/scraper/trendyol')}
                    className="w-full group relative bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-3 rounded-xl font-semibold transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-1"
                    data-testid="quick-access-trendyol"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Store className="w-4 h-4" />
                      <span className="text-sm">Trendyol</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setLocation('/data-analysis')}
                    className="w-full group relative bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-4 py-3 rounded-xl font-semibold transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-1"
                    data-testid="quick-access-data-analysis"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      <span className="text-sm">Veri Analizi</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setLocation('/system-status')}
                    className="w-full group relative bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-4 py-3 rounded-xl font-semibold transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-1"
                    data-testid="quick-access-system-status"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Shield className="w-4 h-4" />
                      <span className="text-sm">Sistem Durumu</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Liste Formatı */}
          <section className="animate-slide-up" style={{animationDelay: '0.2s'}}>
            <div className="card-glass rounded-3xl p-8 shadow-xl">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Tüm Özellikler - Liste Görünümü
                </h2>
                <p className="text-slate-300">
                  Platform ve sistem araçlarının detaylı listesi
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Platformlar Listesi */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    E-ticaret Platformları
                  </h3>
                  <div className="space-y-3">
                    {dataTransferOptions.slice(0, 4).map((option) => (
                      <div
                        key={option.name}
                        onClick={() => handleOptionClick(option)}
                        className={`
                          flex items-center justify-between p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl cursor-pointer
                          transition-all duration-200 hover:bg-slate-600/40 hover:border-slate-500/40
                          ${!option.available ? 'opacity-60 cursor-not-allowed' : ''}
                        `}
                        data-testid={`list-platform-${option.name.toLowerCase()}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                            <div className="text-white text-sm">
                              {option.icon}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-white font-medium">{option.name}</h4>
                            <p className="text-slate-400 text-sm">{option.description}</p>
                          </div>
                        </div>
                        {option.available ? (
                          <span className="status-active text-xs px-3 py-1 rounded-full font-medium">
                            Aktif
                          </span>
                        ) : (
                          <span className="status-coming-soon text-xs px-3 py-1 rounded-full font-medium">
                            Yakında
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sistem Araçları Listesi */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                    Sistem Araçları
                  </h3>
                  <div className="space-y-3">
                    {systemControlOptions.map((option) => (
                      <div
                        key={option.name}
                        onClick={() => handleOptionClick(option)}
                        className="flex items-center justify-between p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-600/40 hover:border-slate-500/40"
                        data-testid={`list-system-${option.name.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-lg flex items-center justify-center">
                            <div className="text-white text-sm">
                              {option.icon}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-white font-medium">{option.name}</h4>
                            <p className="text-slate-400 text-sm">{option.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="status-active text-xs px-3 py-1 rounded-full font-medium">
                            Aktif
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
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