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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-800 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-800/20 via-indigo-800/30 to-blue-900/20 animate-pulse"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/10 via-blue-900/20 to-purple-900/10 animate-pulse" style={{animationDelay: '1s'}}></div>
      
      {/* Floating particles */}
      <div className="absolute top-20 left-20 w-2 h-2 bg-blue-400/60 rounded-full animate-particle-float"></div>
      <div className="absolute top-40 right-32 w-3 h-3 bg-purple-400/40 rounded-full animate-particle-float" style={{animationDelay: '2s'}}></div>
      <div className="absolute bottom-32 left-40 w-2 h-2 bg-cyan-400/50 rounded-full animate-particle-float" style={{animationDelay: '4s'}}></div>
      <div className="absolute bottom-20 right-20 w-1 h-1 bg-blue-300/70 rounded-full animate-particle-float" style={{animationDelay: '6s'}}></div>

      <div className="relative z-10 w-full px-4 md:px-8 py-8">
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
          <div className="flex items-center justify-center gap-2 glassmorphism-card rounded-full px-4 py-2 w-fit mx-auto">
            <Clock className="w-4 h-4 text-blue-400 animate-clock-pulse" />
            <RealTimeClock />
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Ürün Veri Aktarım İşlemleri */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
            className="glassmorphism-card rounded-3xl p-6"
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
                    card-hover group
                  `}
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center justify-center text-white">
                        {option.icon}
                      </div>
                      {option.available ? (
                        <ArrowRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform duration-300" />
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