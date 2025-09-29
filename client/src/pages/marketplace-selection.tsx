import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, Truck, ArrowLeft, ArrowRight,
  BarChart3, MessageSquare, Database, Shield, Bot, 
  ExternalLink, TrendingUp, Activity, Zap, Settings
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";

const MarketplaceSelection = () => {
  const [, setLocation] = useLocation();

  // Ürün Çıkarma Platformları
  const extractionPlatforms = [
    {
      name: "Trendyol",
      description: "Ürün çıkarma ve Shopify aktarım",
      icon: <span className="text-4xl">📦</span>,
      available: true,
      path: "/scraper/trendyol"
    },
    {
      name: "Arçelik",
      description: "Ürün çıkarma ve Shopify aktarım",
      icon: <Package className="w-8 h-8 text-white" />,
      available: true,
      path: "/arcelik"
    },
    {
      name: "Hepsiburada", 
      description: "Ürün çıkarma sistemi",
      icon: <ShoppingCart className="w-8 h-8 text-white" />,
      available: false,
      path: "/coming-soon/hepsiburada"
    },
    {
      name: "Amazon",
      icon: <Package className="w-8 h-8 text-white" />,
      description: "Ürün çıkarma sistemi",
      available: false,
      path: "/coming-soon/amazon"
    }
  ];

  // Sistem Yönetimi ve Analiz
  const systemManagement = [
    {
      name: "Otomatik Takip Sistemi",
      description: "Ürün fiyat izleme ve Shopify senkronizasyonu",
      icon: <Activity className="w-8 h-8 text-white" />,
      available: true,
      path: "/tracking-dashboard"
    },
    {
      name: "Sistem Durumu",
      description: "Hata izleme ve sistem durumu",
      icon: <Shield className="w-8 h-8 text-white" />,
      available: true,
      path: "/system-status"
    }
  ];

  return (
    <div className="min-h-screen business-bg">
      {/* Business Header */}
      <div className="business-bg border-b-2 business-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center"
          >
            <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl flex items-center justify-center shadow-lg">
                <Settings className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              <div className="text-center md:text-left">
                <h1 className="text-2xl md:text-4xl font-black text-white">VERİ TRANSFER PROGRAMI</h1>
                <p className="text-blue-400 text-base md:text-lg font-bold">Ürün Çıkarma ve Analiz Sistemi</p>
              </div>
            </div>
            
            <div className="flex justify-center mb-4 md:mb-6">
              <RealTimeClock />
            </div>
            
            <p className="text-white text-sm md:text-lg font-bold max-w-3xl mx-auto px-4">
              Ürün verilerini çıkarabileceğiniz ve analiz edebileceğiniz platformları seçin
            </p>
          </motion.div>
        </div>
      </div>

      {/* Main Content - Responsive Layout */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
          
          {/* Column 1: Ürün Çıkarma Platformları */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="business-card p-4 md:p-6 md:col-span-2 lg:col-span-1"
          >
            <div className="text-center mb-6 md:mb-8">
              <h2 className="text-lg md:text-2xl font-black text-white mb-2">ÜRÜN ÇIKARMA PLATFORMLARI</h2>
              <p className="text-white font-bold text-xs md:text-sm">Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar</p>
            </div>

            <div className="space-y-3 md:space-y-4">
              {extractionPlatforms.map((platform, index) => (
                <motion.div
                  key={platform.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
                  className={`
                    business-card p-3 md:p-4 cursor-pointer group card-hover
                    ${!platform.available ? 'opacity-60' : ''}
                    active:scale-95 transition-transform duration-200
                  `}
                  onClick={() => platform.available && setLocation(platform.path)}
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 business-button rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      {platform.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base md:text-lg font-black text-white mb-1 truncate">{platform.name}</h3>
                      <p className="text-white font-bold text-xs md:text-xs mb-2 line-clamp-2">{platform.description}</p>
                      <div className="flex items-center justify-between">
                        {platform.available ? (
                          <span className="text-white bg-green-600 px-2 py-1 rounded-full text-xs font-black">AKTİF</span>
                        ) : (
                          <span className="text-white bg-yellow-600 px-2 py-1 rounded-full text-xs font-black">YAKINDA</span>
                        )}
                        <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Column 2: Sistem Analizi */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="business-card p-4 md:p-6"
          >
            <div className="text-center mb-6 md:mb-8">
              <h2 className="text-lg md:text-2xl font-black text-white mb-2">SİSTEM ANALİZ ALANI</h2>
              <p className="text-white font-bold text-xs md:text-sm">Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi</p>
            </div>

            <div className="space-y-3 md:space-y-4">
              {systemManagement.map((tool, index) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                  className="business-card p-3 md:p-4 cursor-pointer group card-hover active:scale-95 transition-transform duration-200"
                  onClick={() => setLocation(tool.path)}
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 business-button rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      {tool.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base md:text-lg font-black text-white mb-1 truncate">{tool.name}</h3>
                      <p className="text-white font-bold text-xs md:text-xs mb-2 line-clamp-2">{tool.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-white bg-green-600 px-2 py-1 rounded-full text-xs font-black">AKTİF</span>
                        <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-all duration-300 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Column 3: Hızlı Erişim */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="business-card p-4 md:p-6 md:col-span-2 lg:col-span-1"
          >
            <div className="text-center mb-6 md:mb-8">
              <h2 className="text-lg md:text-2xl font-black text-white mb-2">HIZLI ERİŞİM ALANI</h2>
              <p className="text-white font-bold text-xs md:text-sm">Sık kullanılan sistem araçları</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                onClick={() => setLocation("/replit-agent")}
                className="w-full business-button p-3 md:p-4 rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex flex-col md:flex-row items-center gap-2 md:gap-4"
              >
                <Bot className="w-5 h-5 md:w-6 md:h-6" />
                <span className="font-black text-xs md:text-sm text-center md:text-left">REPLIT AGENT</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.35 }}
                onClick={() => setLocation("/sos-control")}
                className="w-full business-button p-3 md:p-4 rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex flex-col md:flex-row items-center gap-2 md:gap-4"
              >
                <Shield className="w-5 h-5 md:w-6 md:h-6" />
                <span className="font-black text-xs md:text-sm text-center md:text-left">S.O.S KONTROL</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
                onClick={() => setLocation("/scheduler")}
                className="w-full business-button p-3 md:p-4 rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex flex-col md:flex-row items-center gap-2 md:gap-4"
              >
                <Activity className="w-5 h-5 md:w-6 md:h-6" />
                <span className="font-black text-xs md:text-sm text-center md:text-left">ZAMANLI GÖREVLER</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.45 }}
                onClick={() => setLocation("/shopify-products")}
                className="w-full business-button p-3 md:p-4 rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex flex-col md:flex-row items-center gap-2 md:gap-4"
              >
                <Database className="w-5 h-5 md:w-6 md:h-6" />
                <span className="font-black text-xs md:text-sm text-center md:text-left">SHOPIFY ÜRÜNLERİ</span>
              </motion.button>
            </div>
          </motion.div>
          
        </div>
      </div>
    </div>
  );
};

export default MarketplaceSelection;