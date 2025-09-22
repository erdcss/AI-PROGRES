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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="text-center mb-16 animate-fade-in">
          <div className="card-glass-dark rounded-3xl p-10 shadow-2xl border border-white/30">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
                <Settings className="w-8 h-8 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-4xl font-bold text-slate-800 tracking-tight">
                  Veri Transfer Programı
                </h1>
                <p className="text-sm text-slate-500 font-medium tracking-wide uppercase">
                  Ürün Çıkarma ve Analiz Sistemi
                </p>
              </div>
            </div>
            <p className="text-slate-600 text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
              Ürün verilerini çıkarabileceğiniz ve analiz edebileceğiniz platformları seçin. 
              Modern dashboard ile tüm işlemlerinizi kolayca yönetin.
            </p>
            <div className="inline-flex items-center gap-3 bg-white/70 border border-white/40 rounded-xl px-6 py-3 shadow-md backdrop-blur-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <Clock className="w-5 h-5 text-slate-600" />
              <span className="text-slate-700 font-medium">
                <RealTimeClock />
              </span>
            </div>
          </div>
        </header>

        <main className="space-y-12">
          {/* Ana Platformlar */}
          <section className="animate-slide-up">
            <div className="card-glass rounded-3xl p-8 shadow-xl border border-white/30">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    Ürün Çıkarma Platformları
                  </h2>
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                </div>
                <p className="text-slate-600 max-w-lg mx-auto">
                  Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {dataTransferOptions.slice(0, 4).map((option, index) => (
                  <div
                    key={option.name}
                    onClick={() => handleOptionClick(option)}
                    className={`
                      group bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl p-8 cursor-pointer
                      transition-all duration-300 hover:shadow-2xl hover:bg-white/90 hover:-translate-y-2 hover:border-white/60
                      ${!option.available ? 'opacity-70 cursor-not-allowed hover:transform-none hover:shadow-lg' : ''}
                    `}
                    data-testid={`platform-${option.name.toLowerCase()}`}
                    style={{animationDelay: `${index * 0.1}s`}}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <div className="text-white text-2xl">
                          {option.icon}
                        </div>
                      </div>
                      <h3 className="text-slate-800 font-semibold text-lg mb-3 group-hover:text-slate-900">
                        {option.name}
                      </h3>
                      <p className="text-slate-600 text-sm leading-relaxed mb-6 min-h-[40px]">
                        {option.description}
                      </p>
                      {option.available ? (
                        <span className="status-active text-xs px-4 py-2 rounded-full font-medium shadow-md">
                          Aktif
                        </span>
                      ) : (
                        <span className="status-coming-soon text-xs px-4 py-2 rounded-full font-medium shadow-md">
                          Yakında
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Sistem Araçları */}
          <section className="animate-slide-up" style={{animationDelay: '0.2s'}}>
            <div className="card-glass rounded-3xl p-8 shadow-xl border border-white/30">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    Sistem Yönetimi ve Analiz
                  </h2>
                  <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                </div>
                <p className="text-slate-600 max-w-lg mx-auto">
                  Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {systemControlOptions.map((option, index) => (
                  <div
                    key={option.name}
                    onClick={() => handleOptionClick(option)}
                    className="group bg-white/70 backdrop-blur-sm border border-white/40 rounded-2xl p-8 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:bg-white/90 hover:-translate-y-2 hover:border-white/60"
                    data-testid={`system-${option.name.toLowerCase().replace(/\s+/g, '-')}`}
                    style={{animationDelay: `${(index + 4) * 0.1}s`}}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <div className="text-white text-2xl">
                          {option.icon}
                        </div>
                      </div>
                      <h3 className="text-slate-800 font-semibold text-lg mb-3 group-hover:text-slate-900 leading-tight">
                        {option.name}
                      </h3>
                      <p className="text-slate-600 text-sm leading-relaxed mb-6 min-h-[40px]">
                        {option.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="status-active text-xs px-4 py-2 rounded-full font-medium shadow-md">
                          Aktif
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Hızlı Erişim */}
          <section className="animate-slide-up" style={{animationDelay: '0.4s'}}>
            <div className="card-glass rounded-3xl p-8 shadow-xl border border-white/30">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                  <h3 className="text-2xl font-bold text-slate-800">
                    Hızlı Erişim
                  </h3>
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                </div>
                <p className="text-slate-600">
                  En çok kullanılan araçlara hızlı erişim
                </p>
              </div>
              
              <div className="flex flex-wrap justify-center gap-6">
                <button
                  onClick={() => setLocation('/scraper/trendyol')}
                  className="group relative bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-8 py-4 rounded-2xl font-semibold transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1 hover:scale-105"
                  data-testid="quick-access-trendyol"
                >
                  <div className="flex items-center gap-3">
                    <Store className="w-5 h-5" />
                    <span>Trendyol</span>
                  </div>
                  <div className="absolute inset-0 bg-white/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
                <button
                  onClick={() => setLocation('/data-analysis')}
                  className="group relative bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white px-8 py-4 rounded-2xl font-semibold transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1 hover:scale-105"
                  data-testid="quick-access-data-analysis"
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5" />
                    <span>Veri Analizi</span>
                  </div>
                  <div className="absolute inset-0 bg-white/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
                <button
                  onClick={() => setLocation('/system-status')}
                  className="group relative bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-8 py-4 rounded-2xl font-semibold transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1 hover:scale-105"
                  data-testid="quick-access-system-status"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5" />
                    <span>Sistem Durumu</span>
                  </div>
                  <div className="absolute inset-0 bg-white/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default MainDashboard;