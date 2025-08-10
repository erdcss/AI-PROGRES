import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, Truck, BarChart3, 
  MessageSquare, Shield, Bot, AlertTriangle, 
  Database, ArrowRight, Activity, Clock
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
    <div className="min-h-screen bg-slate-900 relative">
      <div className="w-full px-6 py-12 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-3xl text-white mb-3">
            Veri Transfer Programı
          </h1>
          <p className="text-gray-400 text-base mb-6">
            Ürün çıkarma ve analiz sistemi
          </p>
          <div className="flex items-center justify-center gap-2 bg-slate-800/50 rounded-lg px-4 py-2 w-fit mx-auto">
            <Clock className="w-4 h-4 text-blue-400" />
            <RealTimeClock />
          </div>
        </div>

        <div className="space-y-12">
          {/* Ürün Çıkarma Platformları */}
          <div>
            <h2 className="text-xl text-white mb-6 text-center">
              ÜRÜN ÇIKARMA PLATFORMLARI
            </h2>
            <p className="text-gray-400 text-center mb-8">
              Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {dataTransferOptions.slice(0, 4).map((option, index) => (
                <div
                  key={option.name}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    bg-slate-800/50 border border-slate-700 rounded-lg p-4 cursor-pointer
                    hover:bg-slate-700/50 transition-colors group text-center
                    ${!option.available ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="flex items-center justify-center mb-3 text-blue-400">
                    {option.icon}
                  </div>
                  <h3 className="text-white text-sm mb-1">
                    {option.name}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {option.description}
                  </p>
                  {!option.available && (
                    <span className="text-xs text-gray-500 mt-2 block">Yakında</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sistem Yönetimi ve Analiz */}
          <div>
            <h2 className="text-xl text-white mb-6 text-center">
              SİSTEM YÖNETİMİ VE ANALİZ
            </h2>
            <p className="text-gray-400 text-center mb-8">
              Sık kullanılan sistem araçları
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {systemControlOptions.slice(0, 3).map((option, index) => (
                <div
                  key={option.name}
                  onClick={() => handleOptionClick(option)}
                  className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 cursor-pointer hover:bg-slate-700/50 transition-colors text-center"
                >
                  <div className="flex items-center justify-center mb-3 text-green-400">
                    {option.icon}
                  </div>
                  <h3 className="text-white text-sm mb-1">
                    {option.name}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {option.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Hızlı Erişim */}
          <div>
            <h3 className="text-lg text-white mb-4 text-center">
              HIZLI ERİŞİM
            </h3>
            <p className="text-gray-400 text-center mb-6">
              Sık kullanılan sistem araçları
            </p>
            
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setLocation('/replit-agent')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm transition-colors"
              >
                REPLIT AGENT
              </button>
              <button
                onClick={() => setLocation('/data-analysis')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm transition-colors"
              >
                VERI ANALİZİ
              </button>
              <button
                onClick={() => setLocation('/system-status')}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm transition-colors"
              >
                SİSTEM DURUMU
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainDashboard;

          {/* Sistem Donanım ve Kontrol Merkezi */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
            className="glassmorphism-card rounded-3xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <Activity className="w-7 h-7 text-red-400" />
              <h2 className="text-xl font-bold text-white">
                Sistem Donanım ve Kontrol Merkezi
              </h2>
            </div>
            
            <div className="space-y-4">
              {systemControlOptions.map((option, index) => (
                <motion.div
                  key={option.name}
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ 
                    delay: 0.6 + index * 0.15, 
                    duration: 0.5, 
                    ease: "easeOut",
                    type: "spring",
                    stiffness: 100 
                  }}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    relative overflow-hidden rounded-2xl cursor-pointer
                    bg-gradient-to-r ${option.color} p-4
                    transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl
                    hover:shadow-blue-500/25 group card-hover
                  `}
                >
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center text-white">
                        {option.icon}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white mb-1">
                          {option.name}
                        </h3>
                        <p className="text-white/90 text-sm">
                          {option.description}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform duration-300" />
                  </div>
                  
                  {/* Hover Effect */}
                  <div className="absolute inset-0 bg-white/0 hover:bg-white/5 transition-all duration-300 rounded-2xl"></div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Footer Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="text-center mt-12"
        >
          <p className="text-white/60 text-sm">
            E-ticaret veri aktarım ve sistem yönetim platformu
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default MainDashboard;