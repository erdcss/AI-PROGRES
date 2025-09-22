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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Settings className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-semibold text-gray-900">
              Veri Transfer Programı
            </h1>
          </div>
          <p className="text-gray-600 text-lg mb-6">
            Ürün verilerini çıkarabileceğiniz ve analiz edebileceğiniz platformları seçin
          </p>
          <div className="inline-flex items-center gap-2 bg-white border rounded-lg px-4 py-2 shadow-sm">
            <Clock className="w-4 h-4 text-gray-500" />
            <RealTimeClock />
          </div>
        </header>

        <main className="space-y-12">
          {/* Ana Platformlar */}
          <section>
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Ürün Çıkarma Platformları
              </h2>
              <p className="text-gray-600">
                Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {dataTransferOptions.slice(0, 4).map((option) => (
                <div
                  key={option.name}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    bg-white border border-gray-200 rounded-xl p-6 cursor-pointer
                    hover:shadow-lg hover:border-gray-300 transition-all duration-200
                    ${!option.available ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-1'}
                  `}
                  data-testid={`platform-${option.name.toLowerCase()}`}
                >
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                      {option.icon}
                    </div>
                  </div>
                  <h3 className="text-gray-900 font-medium text-center mb-2">
                    {option.name}
                  </h3>
                  <p className="text-gray-600 text-sm text-center leading-relaxed">
                    {option.description}
                  </p>
                  {option.available ? (
                    <div className="text-center mt-4">
                      <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                        Aktif
                      </span>
                    </div>
                  ) : (
                    <div className="text-center mt-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                        Yakında
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Sistem Araçları */}
          <section>
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Sistem Yönetimi ve Analiz
              </h2>
              <p className="text-gray-600">
                Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {systemControlOptions.map((option) => (
                <div
                  key={option.name}
                  onClick={() => handleOptionClick(option)}
                  className="bg-white border border-gray-200 rounded-xl p-6 cursor-pointer hover:shadow-lg hover:border-gray-300 hover:-translate-y-1 transition-all duration-200"
                  data-testid={`system-${option.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                      {option.icon}
                    </div>
                  </div>
                  <h3 className="text-gray-900 font-medium text-center mb-2 text-sm">
                    {option.name}
                  </h3>
                  <p className="text-gray-600 text-sm text-center leading-relaxed">
                    {option.description}
                  </p>
                  <div className="text-center mt-4">
                    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                      Aktif
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Hızlı Erişim */}
          <section className="bg-white border border-gray-200 rounded-xl p-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
              Hızlı Erişim
            </h3>
            
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => setLocation('/scraper/trendyol')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200"
                data-testid="quick-access-trendyol"
              >
                Trendyol
              </button>
              <button
                onClick={() => setLocation('/data-analysis')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200"
                data-testid="quick-access-data-analysis"
              >
                Veri Analizi
              </button>
              <button
                onClick={() => setLocation('/system-status')}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200"
                data-testid="quick-access-system-status"
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