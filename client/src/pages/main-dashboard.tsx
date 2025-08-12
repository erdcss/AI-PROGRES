import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, BarChart3, 
  MessageSquare, Shield, Bot, AlertTriangle, 
  Database, Clock, Truck
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
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Header */}
        <header className="text-center mb-20">
          <h1 className="text-4xl font-bold text-white mb-8">
            E-Ticaret Veri İstasyonu
          </h1>
          <div className="inline-flex items-center gap-2 bg-slate-800 rounded-md px-3 py-1.5 text-sm">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <RealTimeClock />
          </div>
        </header>

        <main className="space-y-16">
          {/* Ana Platformlar */}
          <section>
            <h2 className="text-lg text-white mb-2 text-center">
              Ürün Çıkarma Platformları
            </h2>
            <p className="text-gray-400 text-center text-sm mb-10">
              Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar
            </p>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {dataTransferOptions.slice(0, 4).map((option) => (
                <div
                  key={option.name}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    bg-white/5 border border-white/10 rounded-lg p-6 cursor-pointer
                    hover:bg-white/10 hover:border-white/20 transition-all
                    ${!option.available ? 'opacity-40 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="flex items-center justify-center mb-4 text-slate-300">
                    {option.icon}
                  </div>
                  <h3 className="text-white text-sm text-center mb-2">
                    {option.name}
                  </h3>
                  <p className="text-gray-400 text-xs text-center">
                    {option.description}
                  </p>
                  {!option.available && (
                    <div className="text-center mt-3">
                      <span className="text-xs bg-slate-700 text-gray-300 px-2 py-1 rounded">Yakında</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Sistem Araçları */}
          <section>
            <h2 className="text-lg text-white mb-2 text-center">
              Sistem Yönetimi
            </h2>
            <p className="text-gray-400 text-center text-sm mb-10">
              Sistem durum takibi ve analiz araçları
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {systemControlOptions.slice(0, 3).map((option) => (
                <div
                  key={option.name}
                  onClick={() => handleOptionClick(option)}
                  className="bg-white/5 border border-white/10 rounded-lg p-6 cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center justify-center mb-4 text-slate-300">
                    {option.icon}
                  </div>
                  <h3 className="text-white text-sm text-center mb-2">
                    {option.name}
                  </h3>
                  <p className="text-gray-400 text-xs text-center">
                    {option.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Hızlı Erişim */}
          <section>
            <h3 className="text-base text-white mb-8 text-center">
              Hızlı Erişim
            </h3>
            
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setLocation('/scraper/trendyol')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                Trendyol
              </button>
              <button
                onClick={() => setLocation('/data-analysis')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                Veri Analizi
              </button>
              <button
                onClick={() => setLocation('/system-status')}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                Sistem Durumu
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default MainDashboard;