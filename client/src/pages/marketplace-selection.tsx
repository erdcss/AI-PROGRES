import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, Truck, ArrowLeft, ArrowRight,
  BarChart3, MessageSquare, Database, Shield, Bot, 
  ExternalLink, TrendingUp, Activity
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";
import PageLayout from "@/components/PageLayout";

const MarketplaceSelection = () => {
  const [, setLocation] = useLocation();

  // Ürün Çıkarma Platformları
  const extractionPlatforms = [
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
      icon: <Package className="w-8 h-8 text-slate-400" />,
      description: "Ürün çıkarma sistemi",
      color: "from-slate-500 to-slate-600", 
      available: false,
      path: "/coming-soon/amazon"
    }
  ];

  // Sistem Yönetimi ve Analiz
  const systemManagement = [
    {
      name: "Ürün Veri Analizi",
      description: "Shopify'a aktarılan ürünlerin detaylı analizi",
      icon: <BarChart3 className="w-8 h-8 text-purple-400" />,
      color: "from-purple-500 to-purple-600",
      available: true,
      path: "/product-data-analysis"
    },
    {
      name: "Ürün Yorumları",
      description: "Platform bazlı ürün yorumları yönetimi",
      icon: <MessageSquare className="w-8 h-8 text-green-400" />,
      color: "from-green-500 to-green-600",
      available: true,
      path: "/product-reviews"
    },
    {
      name: "Memory Tracking",
      description: "Ürün takip ve fiyat değişim izleme",
      icon: <Database className="w-8 h-8 text-blue-400" />,
      color: "from-blue-500 to-blue-600",
      available: true,
      path: "/memory-tracking"
    },
    {
      name: "Sistem Durumu",
      description: "Hata izleme ve sistem durumu",
      icon: <Shield className="w-8 h-8 text-cyan-400" />,
      color: "from-cyan-500 to-cyan-600",
      available: true,
      path: "/system-status"
    }
  ];

  return (
    <PageLayout
      title="Platform Seçimi"
      subtitle="Ürün verilerini çıkarabileceğiniz ve analiz edebileceğiniz platformları seçin"
    >
      <div className="w-full space-y-12">
        {/* Status indicator */}
        <div className="flex justify-center">
          <RealTimeClock />
        </div>

        {/* Ürün Çıkarma Platformları */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Ürün Çıkarma Platformları</h2>
            <p className="text-gray-300">Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar</p>
          </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {extractionPlatforms.map((platform, index) => (
                <motion.div
                  key={platform.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                  className={`
                    glassmorphism-card p-6 cursor-pointer group card-hover
                    ${!platform.available ? 'opacity-60' : ''}
                  `}
                  onClick={() => platform.available && setLocation(platform.path)}
                >
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${platform.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {platform.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{platform.name}</h3>
                  <p className="text-gray-300 text-sm mb-4">{platform.description}</p>
                  <div className="flex items-center justify-between">
                    {platform.available ? (
                      <span className="text-green-400 text-sm font-medium">Aktif</span>
                    ) : (
                      <span className="text-yellow-400 text-sm font-medium">Yakında</span>
                    )}
                    <ArrowRight className="w-4 h-4 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" />
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
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-4">Sistem Yönetimi ve Analiz</h2>
              <p className="text-gray-300">Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {systemManagement.map((tool, index) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 cursor-pointer group"
                  onClick={() => setLocation(tool.path)}
                >
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${tool.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {tool.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{tool.name}</h3>
                  <p className="text-gray-300 text-sm mb-4">{tool.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-green-400 text-sm font-medium">Aktif</span>
                    <ArrowRight className="w-4 h-4 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" />
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
            className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10"
          >
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Hızlı Erişim</h3>
              <p className="text-gray-300">Sık kullanılan sistem araçları</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setLocation("/replit-agent")}
                className="flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl text-white hover:from-indigo-600 hover:to-purple-600 transition-all duration-300"
              >
                <Bot className="w-6 h-6" />
                <span className="font-medium">Replit Agent</span>
              </button>

              <button
                onClick={() => setLocation("/sos-control")}
                className="flex items-center gap-3 p-4 bg-gradient-to-r from-red-500 to-red-600 rounded-xl text-white hover:from-red-600 hover:to-red-700 transition-all duration-300"
              >
                <Shield className="w-6 h-6" />
                <span className="font-medium">S.O.S Kontrol</span>
              </button>

              <button
                onClick={() => setLocation("/scheduler")}
                className="flex items-center gap-3 p-4 bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl text-white hover:from-orange-600 hover:to-orange-700 transition-all duration-300"
              >
                <Activity className="w-6 h-6" />
                <span className="font-medium">Zamanlı Görevler</span>
              </button>
            </div>
          </motion.section>
      </div>
    </PageLayout>
  );
};

export default MarketplaceSelection;