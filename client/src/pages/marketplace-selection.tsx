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
      icon: (
        <svg 
          width="64" 
          height="64" 
          viewBox="0 0 200 200" 
          className="rounded-lg"
        >
          <rect width="200" height="200" rx="25" fill="#FF6000"/>
          <rect x="0" y="65" width="200" height="70" fill="#000000"/>
          <text 
            x="100" 
            y="110" 
            textAnchor="middle" 
            fill="white" 
            fontSize="32" 
            fontFamily="Arial, sans-serif" 
            fontWeight="bold"
          >
            trendyol
          </text>
        </svg>
      ),
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
      name: "Ürün Veri Analizi",
      description: "Shopify'a aktarılan ürünlerin detaylı analizi",
      icon: <BarChart3 className="w-8 h-8 text-white" />,
      available: true,
      path: "/product-data-analysis"
    },
    {
      name: "Ürün Yorumları",
      description: "Platform bazlı ürün yorumları yönetimi",
      icon: <MessageSquare className="w-8 h-8 text-white" />,
      available: true,
      path: "/product-reviews"
    },
    {
      name: "Memory Tracking",
      description: "Ürün takip ve fiyat değişim izleme",
      icon: <Database className="w-8 h-8 text-white" />,
      available: true,
      path: "/memory-tracking"
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
        <div className="max-w-7xl mx-auto px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center"
          >
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl flex items-center justify-center shadow-lg">
                <Settings className="w-8 h-8 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-4xl font-black text-white">VERİ TRANSFER PROGRAMI</h1>
                <p className="text-blue-400 text-lg font-bold">Ürün Çıkarma ve Analiz Sistemi</p>
              </div>
            </div>
            
            <div className="flex justify-center mb-6">
              <RealTimeClock />
            </div>
            
            <p className="text-white text-lg font-bold max-w-3xl mx-auto">
              Ürün verilerini çıkarabileceğiniz ve analiz edebileceğiniz platformları seçin
            </p>
          </motion.div>
        </div>
      </div>

      {/* Main Content - 3 Column Layout */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Column 1: Ürün Çıkarma Platformları */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="business-card p-6"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white mb-2">ÜRÜN ÇIKARMA PLATFORMLARI</h2>
              <p className="text-white font-bold text-sm">Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar</p>
            </div>

            <div className="space-y-4">
              {extractionPlatforms.map((platform, index) => (
                <motion.div
                  key={platform.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
                  className={`
                    business-card p-4 cursor-pointer group card-hover
                    ${!platform.available ? 'opacity-60' : ''}
                  `}
                  onClick={() => platform.available && setLocation(platform.path)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 business-button rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      {platform.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-white mb-1">{platform.name}</h3>
                      <p className="text-white font-bold text-xs mb-2">{platform.description}</p>
                      <div className="flex items-center justify-between">
                        {platform.available ? (
                          <span className="text-white bg-green-600 px-2 py-1 rounded-full text-xs font-black">AKTİF</span>
                        ) : (
                          <span className="text-white bg-yellow-600 px-2 py-1 rounded-full text-xs font-black">YAKINDA</span>
                        )}
                        <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-all duration-300" />
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
            className="business-card p-6"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white mb-2">SİSTEM ANALİZ ALANI</h2>
              <p className="text-white font-bold text-sm">Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi</p>
            </div>

            <div className="space-y-4">
              {systemManagement.map((tool, index) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                  className="business-card p-4 cursor-pointer group card-hover"
                  onClick={() => setLocation(tool.path)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 business-button rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      {tool.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-white mb-1">{tool.name}</h3>
                      <p className="text-white font-bold text-xs mb-2">{tool.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-white bg-green-600 px-2 py-1 rounded-full text-xs font-black">AKTİF</span>
                        <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-all duration-300" />
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
            className="business-card p-6"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white mb-2">HIZLI ERİŞİM ALANI</h2>
              <p className="text-white font-bold text-sm">Sık kullanılan sistem araçları</p>
            </div>

            <div className="space-y-4">
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                onClick={() => setLocation("/replit-agent")}
                className="w-full business-button p-4 rounded-xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
              >
                <Bot className="w-6 h-6" />
                <span className="font-black text-sm">REPLIT AGENT</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.35 }}
                onClick={() => setLocation("/sos-control")}
                className="w-full business-button p-4 rounded-xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
              >
                <Shield className="w-6 h-6" />
                <span className="font-black text-sm">S.O.S KONTROL</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
                onClick={() => setLocation("/scheduler")}
                className="w-full business-button p-4 rounded-xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
              >
                <Activity className="w-6 h-6" />
                <span className="font-black text-sm">ZAMANLI GÖREVLER</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.45 }}
                onClick={() => setLocation("/shopify-products")}
                className="w-full business-button p-4 rounded-xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
              >
                <Database className="w-6 h-6" />
                <span className="font-black text-sm">SHOPIFY ÜRÜNLERİ</span>
              </motion.button>
            </div>
          </motion.div>
          
        </div>
      </div>
    </div>
  );
};

export default MarketplaceSelection;