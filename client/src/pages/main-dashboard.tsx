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
      name: "Hafıza Takip Sistemi",
      description: "Ürün değişikliklerini takip et",
      icon: <Database className="w-8 h-8 text-green-400" />,
      color: "from-green-500 to-green-600",
      available: true,
      path: "/memory-tracking"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-white mb-4">
            E-ticaret Veri Merkezi
          </h1>
          <p className="text-gray-300 text-lg mb-6">
            Ürün veri aktarım işlemleri ve sistem kontrol merkezi
          </p>
          <RealTimeClock />
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Ürün Veri Aktarım İşlemleri */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
            className="bg-slate-800/40 backdrop-blur-lg rounded-3xl p-6 border border-slate-700/50"
          >
            <div className="flex items-center gap-3 mb-6">
              <Database className="w-7 h-7 text-blue-400" />
              <h2 className="text-xl font-bold text-white">
                Ürün Veri Aktarım İşlemleri
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dataTransferOptions.map((option, index) => (
                <motion.div
                  key={option.name}
                  initial={{ opacity: 0, y: 30, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    delay: 0.4 + index * 0.1, 
                    duration: 0.5, 
                    ease: "easeOut",
                    type: "spring",
                    stiffness: 100 
                  }}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    relative overflow-hidden rounded-2xl cursor-pointer
                    bg-gradient-to-br ${option.color} p-4
                    transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl
                    ${!option.available ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-blue-500/25'}
                  `}
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center justify-center">
                        {option.icon}
                      </div>
                      {option.available ? (
                        <ArrowRight className="w-5 h-5 text-white/80" />
                      ) : (
                        <span className="bg-black/40 text-white text-xs px-2 py-1 rounded-full">
                          Yakında
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white mb-1">
                      {option.name}
                    </h3>
                    <p className="text-white/90 text-sm">
                      {option.description}
                    </p>
                  </div>
                  
                  {/* Hover Effect */}
                  <div className="absolute inset-0 bg-white/0 hover:bg-white/5 transition-all duration-300 rounded-2xl"></div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Sistem Donanım ve Kontrol Merkezi */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
            className="bg-slate-800/40 backdrop-blur-lg rounded-3xl p-6 border border-slate-700/50"
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
                    delay: 0.6 + index * 0.1, 
                    duration: 0.5, 
                    ease: "easeOut",
                    type: "spring",
                    stiffness: 120 
                  }}
                  onClick={() => handleOptionClick(option)}
                  className={`
                    relative overflow-hidden rounded-2xl cursor-pointer
                    bg-gradient-to-r ${option.color} p-4
                    transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl
                    ${!option.available ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-red-500/25'}
                  `}
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {option.icon}
                        <h3 className="text-base font-bold text-white">
                          {option.name}
                        </h3>
                      </div>
                      <ArrowRight className="w-5 h-5 text-white/80" />
                    </div>
                    <p className="text-white/90 text-sm">
                      {option.description}
                    </p>
                  </div>
                  
                  {/* Hover Effect */}
                  <div className="absolute inset-0 bg-white/0 hover:bg-white/5 transition-all duration-300 rounded-2xl"></div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Footer Info */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6, ease: "easeOut" }}
          className="text-center mt-12"
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