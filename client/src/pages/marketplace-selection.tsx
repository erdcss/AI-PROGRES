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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
        
        {/* Ürün Çıkarma Platformları */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-4">ÜRÜN ÇIKARMA PLATFORMLARI</h2>
            <p className="text-white font-bold text-lg">Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {extractionPlatforms.map((platform, index) => (
              <motion.div
                key={platform.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                className={`
                  business-card p-8 cursor-pointer group card-hover
                  ${!platform.available ? 'opacity-60' : ''}
                `}
                onClick={() => platform.available && setLocation(platform.path)}
              >
                <div className="w-20 h-20 business-button rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  {platform.icon}
                </div>
                <h3 className="text-2xl font-black text-white mb-3">{platform.name}</h3>
                <p className="text-white font-bold text-sm mb-6">{platform.description}</p>
                <div className="flex items-center justify-between">
                  {platform.available ? (
                    <span className="text-white bg-green-600 px-3 py-1 rounded-full text-sm font-black">AKTİF</span>
                  ) : (
                    <span className="text-white bg-yellow-600 px-3 py-1 rounded-full text-sm font-black">YAKINDA</span>
                  )}
                  <ArrowRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-all duration-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Sistem Yönetimi ve Analiz */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-4">SİSTEM YÖNETİMİ VE ANALİZ</h2>
            <p className="text-white font-bold text-lg">Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {systemManagement.map((tool, index) => (
              <motion.div
                key={tool.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                className="business-card p-8 cursor-pointer group card-hover"
                onClick={() => setLocation(tool.path)}
              >
                <div className="w-20 h-20 business-button rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  {tool.icon}
                </div>
                <h3 className="text-2xl font-black text-white mb-3">{tool.name}</h3>
                <p className="text-white font-bold text-sm mb-6">{tool.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-white bg-green-600 px-3 py-1 rounded-full text-sm font-black">AKTİF</span>
                  <ArrowRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-all duration-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Hızlı Erişim */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="business-card p-8"
        >
          <div className="text-center mb-8">
            <h3 className="text-3xl font-black text-white mb-3">HIZLI ERİŞİM</h3>
            <p className="text-white font-bold text-lg">Sık kullanılan sistem araçları</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <button
              onClick={() => setLocation("/replit-agent")}
              className="business-button p-6 rounded-2xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
            >
              <Bot className="w-8 h-8" />
              <span className="font-black text-lg">REPLIT AGENT</span>
            </button>

            <button
              onClick={() => setLocation("/sos-control")}
              className="business-button p-6 rounded-2xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
            >
              <Shield className="w-8 h-8" />
              <span className="font-black text-lg">S.O.S KONTROL</span>
            </button>

            <button
              onClick={() => setLocation("/scheduler")}
              className="business-button p-6 rounded-2xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
            >
              <Activity className="w-8 h-8" />
              <span className="font-black text-lg">ZAMANLI GÖREVLER</span>
            </button>

            <button
              onClick={() => setLocation("/shopify-products")}
              className="business-button p-6 rounded-2xl text-white hover:scale-105 transition-all duration-300 flex items-center gap-4"
            >
              <Database className="w-8 h-8" />
              <span className="font-black text-lg">SHOPIFY ÜRÜNLERİ</span>
            </button>
          </div>
        </motion.section>
      </div>
    </div>
  );
};

export default MarketplaceSelection;