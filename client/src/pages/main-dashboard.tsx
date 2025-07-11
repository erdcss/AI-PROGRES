import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, Truck, BarChart3, 
  MessageSquare, Shield, Bot, AlertTriangle, 
  Database, ArrowRight, Activity
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";

const MainDashboard = () => {
  const [, setLocation] = useLocation();

  // Ürün Veri Aktarım İşlemleri
  const dataTransferOptions = [
    {
      name: "Trendyol",
      description: "Ürün çıkarma ve Shopify aktarım",
      icon: <Store className="w-8 h-8 text-blue-400" />,
      color: "from-blue-500 to-blue-600",
      available: true,
      path: "/scraper/trendyol"
    },
    {
      name: "Arçelik",
      description: "Ürün çıkarma ve Shopify aktarım",
      icon: <Package className="w-8 h-8 text-emerald-400" />,
      color: "from-emerald-500 to-emerald-600",
      available: true,
      path: "/arcelik"
    },
    {
      name: "Hepsiburada", 
      description: "Ürün çıkarma sistemi",
      icon: <ShoppingCart className="w-8 h-8 text-slate-400" />,
      color: "from-slate-500 to-slate-600",
      available: false,
      path: "/coming-soon/hepsiburada"
    },
    {
      name: "Amazon",
      description: "Ürün çıkarma sistemi",
      icon: <Package className="w-8 h-8 text-slate-400" />,
      color: "from-slate-500 to-slate-600", 
      available: false,
      path: "/coming-soon/amazon"
    },
    {
      name: "N11",
      description: "Ürün çıkarma sistemi", 
      icon: <Truck className="w-8 h-8 text-slate-400" />,
      color: "from-slate-500 to-slate-600",
      available: false,
      path: "/coming-soon/n11"
    },
    {
      name: "Ürün Veri Analizi",
      description: "Hafıza sistemi ve analiz",
      icon: <BarChart3 className="w-8 h-8 text-indigo-400" />,
      color: "from-indigo-500 to-indigo-600",
      available: true,
      path: "/data-analysis"
    },
    {
      name: "Ürün Yorumları",
      description: "Yorum çıkarma ve yönetim",
      icon: <MessageSquare className="w-8 h-8 text-blue-400" />,
      color: "from-blue-500 to-blue-600",
      available: true,
      path: "/reviews"
    }
  ];

  // Sistem Donanım ve Kontrol Merkezi
  const systemControlOptions = [
    {
      name: "Sistem Durumu & Hata Merkezi",
      description: "Hata izleme ve sistem durumu",
      icon: <Shield className="w-8 h-8 text-blue-400" />,
      color: "from-blue-500 to-blue-600",
      available: true,
      path: "/system-status"
    },
    {
      name: "Replit.Agent",
      description: "AI kod asistanı ve geliştirme",
      icon: <Bot className="w-8 h-8 text-indigo-400" />,
      color: "from-indigo-500 to-indigo-600",
      available: true,
      path: "/replit-agent"
    },
    {
      name: "S.O.S Kontrol Merkezi",
      description: "Acil durum kontrol paneli",
      icon: <AlertTriangle className="w-8 h-8 text-slate-400" />,
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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-900 to-indigo-900 flex items-center justify-center p-3 sm:p-6">
      <div className="max-w-7xl w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 sm:mb-12"
        >
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">
            E-ticaret Veri Merkezi
          </h1>
          <p className="text-gray-300 text-sm sm:text-base lg:text-lg mb-4 sm:mb-6 px-4 sm:px-0">
            Ürün veri aktarım işlemleri ve sistem kontrol merkezi
          </p>
          <RealTimeClock />
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Ürün Veri Aktarım İşlemleri */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-blue-500/20"
          >
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <Database className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-white">
                Ürün Veri Aktarım İşlemleri
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {dataTransferOptions.map((option, index) => (
                <motion.div
                  key={option.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    relative overflow-hidden rounded-xl cursor-pointer
                    bg-gradient-to-br ${option.color} p-3 sm:p-4
                    transform transition-all duration-300 hover:scale-105 hover:shadow-xl
                    ${!option.available ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center">
                        {option.icon}
                      </div>
                      {option.available && (
                        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white/80" />
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                      {option.name}
                    </h3>
                    <p className="text-white/80 text-xs sm:text-sm">
                      {option.description}
                    </p>
                    {!option.available && (
                      <div className="absolute top-2 right-2">
                        <span className="bg-black/30 text-white text-xs px-2 py-1 rounded">
                          Yakında
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-white/5 rounded-xl"></div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Sistem Donanım ve Kontrol Merkezi */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-blue-500/20"
          >
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-red-400" />
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-white">
                Sistem Donanım ve Kontrol Merkezi
              </h2>
            </div>
            
            <div className="space-y-4">
              {systemControlOptions.map((option, index) => (
                <motion.div
                  key={option.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    relative overflow-hidden rounded-xl cursor-pointer
                    bg-gradient-to-br ${option.color} p-4
                    transform transition-all duration-300 hover:scale-105 hover:shadow-xl
                    ${!option.available ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {option.icon}
                        <h3 className="text-lg font-bold text-white">
                          {option.name}
                        </h3>
                      </div>
                      {option.available && (
                        <ArrowRight className="w-5 h-5 text-white/80" />
                      )}
                    </div>
                    <p className="text-white/80 text-sm ml-11">
                      {option.description}
                    </p>
                    {!option.available && (
                      <div className="absolute top-2 right-2">
                        <span className="bg-black/30 text-white text-xs px-2 py-1 rounded">
                          Yakında
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-white/5 rounded-xl"></div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Footer Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="text-center mt-8"
        >
          <p className="text-gray-400 text-sm">
            E-ticaret veri aktarım ve sistem yönetim platformu
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default MainDashboard;