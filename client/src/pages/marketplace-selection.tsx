import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  Store, ShoppingCart, Package, Truck, ArrowLeft, ArrowRight,
  BarChart3, MessageSquare, Database, Shield, Bot, 
  ExternalLink, TrendingUp, Activity, Zap, Settings, Bell, Star, FolderTree
} from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";
import { useIsMobile } from "@/hooks/use-mobile";

const MarketplaceSelection = () => {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

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
    },
    {
      name: "PttAvm",
      icon: <span className="text-2xl font-black text-white">PT</span>,
      description: "Ürün çıkarma ve Shopify aktarım",
      available: true,
      path: "/pttavm"
    }
  ];

  // Yorum Çıkarma Araçları
  const reviewTools = [
    {
      name: "Trendyol Yorum Çıkarıcı",
      description: "Ürün yorumlarını çek ve CSV olarak dışa aktar",
      icon: <Star className="w-8 h-8 text-white" />,
      available: true,
      path: "/trendyol-reviews"
    }
  ];

  // Sistem Yönetimi ve Analiz
  const systemManagement = [
    {
      name: "Ürün Takip Sistemi",
      description: "Kaynak vs Shopify değişiklik tespiti (manuel onay)",
      icon: <Activity className="w-8 h-8 text-white" />,
      available: true,
      path: "/urun-takip"
    },
    {
      name: "Kategoriler",
      description: "Shopify etiketleri, ürün sayıları ve koleksiyonlar",
      icon: <FolderTree className="w-8 h-8 text-white" />,
      available: true,
      path: "/kategoriler"
    },
    {
      name: "Otomatik Takip Sistemi",
      description: "Ürün fiyat izleme ve Shopify senkronizasyonu (legacy)",
      icon: <Activity className="w-8 h-8 text-white" />,
      available: true,
      path: "/memory-tracking"
    },
    {
      name: "Shopify Sistem Analizi",
      description: "Token yenileme, bağlantı durumu ve kaynak izleme",
      icon: <Shield className="w-8 h-8 text-white" />,
      available: true,
      path: "/shopify-system"
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
        <div className={`mx-auto py-6 ${isMobile ? 'px-4 max-w-full' : 'max-w-7xl px-6 py-8'}`}>
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center"
          >
            <div className={`flex items-center justify-center mb-6 ${
              isMobile ? 'flex-col gap-4' : 'flex-row gap-4'
            }`}>
              <div className={`bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl flex items-center justify-center shadow-lg ${
                isMobile ? 'w-16 h-16' : 'w-20 h-20'
              }`}>
                <Settings className={`text-white ${isMobile ? 'w-8 h-8' : 'w-10 h-10'}`} />
              </div>
              <div className={`${isMobile ? 'text-center' : 'text-left'}`}>
                <h1 className={`font-black text-white ${
                  isMobile ? 'text-2xl leading-tight' : 'text-4xl'
                }`}>
                  VERİ TRANSFER PROGRAMI
                </h1>
                <p className={`text-blue-400 font-bold ${
                  isMobile ? 'text-base mt-1' : 'text-lg'
                }`}>
                  Ürün Çıkarma ve Analiz Sistemi
                </p>
              </div>
            </div>
            
            <div className={`flex justify-center ${isMobile ? 'mb-6' : 'mb-8'}`}>
              <RealTimeClock />
            </div>
            
            <p className={`text-white font-bold max-w-3xl mx-auto ${
              isMobile ? 'text-base px-2' : 'text-lg px-4'
            }`}>
              Ürün verilerini çıkarabileceğiniz ve analiz edebileceğiniz platformları seçin
            </p>
          </motion.div>
        </div>
      </div>

      {/* Main Content - Responsive Layout */}
      <div className={`mx-auto ${
        isMobile 
          ? 'px-4 py-6 max-w-full' 
          : 'max-w-7xl px-6 py-12'
      }`}>
        <div className={`grid gap-6 ${
          isMobile 
            ? 'grid-cols-1' 
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
        }`}>
          
          {/* Column 1: Ürün Çıkarma Platformları */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={`business-card ${
              isMobile 
                ? 'p-6' 
                : 'p-6 md:col-span-2 lg:col-span-1'
            }`}
          >
            <div className={`text-center ${isMobile ? 'mb-6' : 'mb-8'}`}>
              <h2 className={`font-black text-white mb-2 ${
                isMobile ? 'text-xl' : 'text-2xl'
              }`}>
                ÜRÜN ÇIKARMA PLATFORMLARI
              </h2>
              <p className={`text-white font-bold ${
                isMobile ? 'text-sm' : 'text-sm'
              }`}>
                Ürün verilerini çıkarıp Shopify'a aktarabileceğiniz platformlar
              </p>
            </div>

            <div className={`${isMobile ? 'space-y-4' : 'space-y-4'}`}>
              {extractionPlatforms.map((platform, index) => (
                <motion.div
                  key={platform.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
                  className={`
                    business-card cursor-pointer group card-hover
                    ${!platform.available ? 'opacity-60' : ''}
                    active:scale-95 transition-transform duration-200
                    ${isMobile ? 'p-4' : 'p-4'}
                  `}
                  onClick={() => platform.available && setLocation(platform.path)}
                  data-testid={`card-platform-${platform.name.toLowerCase()}`}
                >
                  <div className={`flex items-center ${isMobile ? 'gap-4' : 'gap-4'}`}>
                    <div className={`business-button rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${
                      isMobile ? 'w-14 h-14' : 'w-12 h-12'
                    }`}>
                      {platform.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-black text-white mb-1 truncate ${
                        isMobile ? 'text-lg' : 'text-lg'
                      }`}>
                        {platform.name}
                      </h3>
                      <p className={`text-white font-bold mb-2 line-clamp-2 ${
                        isMobile ? 'text-sm' : 'text-xs'
                      }`}>
                        {platform.description}
                      </p>
                      <div className="flex items-center justify-between">
                        {platform.available ? (
                          <span className={`text-white bg-green-600 rounded-full font-black ${
                            isMobile ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-xs'
                          }`}>
                            AKTİF
                          </span>
                        ) : (
                          <span className={`text-white bg-yellow-600 rounded-full font-black ${
                            isMobile ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-xs'
                          }`}>
                            YAKINDA
                          </span>
                        )}
                        <ArrowRight className={`text-white group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 ${
                          isMobile ? 'w-5 h-5' : 'w-4 h-4'
                        }`} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Column Review: Yorum Çıkarma */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className={`business-card ${isMobile ? 'p-6' : 'p-6'}`}
          >
            <div className={`text-center ${isMobile ? 'mb-6' : 'mb-8'}`}>
              <h2 className={`font-black text-white mb-2 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
                YORUM ÇIKARMA ALANI
              </h2>
              <p className={`text-white font-bold ${isMobile ? 'text-sm' : 'text-sm'}`}>
                Ürün yorumlarını çekip CSV olarak dışa aktarın
              </p>
            </div>

            <div className={`${isMobile ? 'space-y-4' : 'space-y-4'}`}>
              {reviewTools.map((tool, index) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 + index * 0.05 }}
                  className={`
                    business-card cursor-pointer group card-hover
                    active:scale-95 transition-transform duration-200
                    ${isMobile ? 'p-4' : 'p-4'}
                  `}
                  onClick={() => tool.available && setLocation(tool.path)}
                >
                  <div className={`flex items-center ${isMobile ? 'gap-4' : 'gap-4'}`}>
                    <div className={`rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${
                      isMobile ? 'w-14 h-14' : 'w-12 h-12'
                    } bg-gradient-to-br from-purple-600 to-pink-600`}>
                      {tool.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-black text-white mb-1 truncate ${isMobile ? 'text-lg' : 'text-lg'}`}>
                        {tool.name}
                      </h3>
                      <p className={`text-white font-bold mb-2 line-clamp-2 ${isMobile ? 'text-sm' : 'text-xs'}`}>
                        {tool.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className={`text-white bg-green-600 rounded-full font-black ${isMobile ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-xs'}`}>
                          AKTİF
                        </span>
                        <ArrowRight className={`text-white group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 ${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
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
            className={`business-card ${isMobile ? 'p-6' : 'p-6'}`}
          >
            <div className={`text-center ${isMobile ? 'mb-6' : 'mb-8'}`}>
              <h2 className={`font-black text-white mb-2 ${
                isMobile ? 'text-xl' : 'text-2xl'
              }`}>
                SİSTEM ANALİZ ALANI
              </h2>
              <p className={`text-white font-bold ${
                isMobile ? 'text-sm' : 'text-sm'
              }`}>
                Shopify'a aktarılan ürünlerin analizi, takibi ve yönetimi
              </p>
            </div>

            <div className={`${isMobile ? 'space-y-4' : 'space-y-4'}`}>
              {systemManagement.map((tool, index) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                  className={`business-card cursor-pointer group card-hover active:scale-95 transition-transform duration-200 ${
                    isMobile ? 'p-4' : 'p-4'
                  }`}
                  onClick={() => setLocation(tool.path)}
                  data-testid={`card-system-${tool.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className={`flex items-center ${isMobile ? 'gap-4' : 'gap-4'}`}>
                    <div className={`business-button rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${
                      isMobile ? 'w-14 h-14' : 'w-12 h-12'
                    }`}>
                      {tool.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-black text-white mb-1 truncate ${
                        isMobile ? 'text-lg' : 'text-lg'
                      }`}>
                        {tool.name}
                      </h3>
                      <p className={`text-white font-bold mb-2 line-clamp-2 ${
                        isMobile ? 'text-sm' : 'text-xs'
                      }`}>
                        {tool.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className={`text-white bg-green-600 rounded-full font-black ${
                          isMobile ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-xs'
                        }`}>
                          AKTİF
                        </span>
                        <ArrowRight className={`text-white group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 ${
                          isMobile ? 'w-5 h-5' : 'w-4 h-4'
                        }`} />
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
            className={`business-card ${
              isMobile 
                ? 'p-6' 
                : 'p-6 md:col-span-2 lg:col-span-1'
            }`}
          >
            <div className={`text-center ${isMobile ? 'mb-6' : 'mb-8'}`}>
              <h2 className={`font-black text-white mb-2 ${
                isMobile ? 'text-xl' : 'text-2xl'
              }`}>
                HIZLI ERİŞİM ALANI
              </h2>
              <p className={`text-white font-bold ${
                isMobile ? 'text-sm' : 'text-sm'
              }`}>
                Sık kullanılan sistem araçları
              </p>
            </div>

            <div className={`grid gap-4 ${
              isMobile 
                ? 'grid-cols-1' 
                : 'grid-cols-2 md:grid-cols-1'
            }`}>
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                onClick={() => setLocation("/replit-agent")}
                className={`w-full business-button rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex items-center ${
                  isMobile 
                    ? 'p-4 gap-4 flex-row justify-start' 
                    : 'p-4 gap-4 flex-row'
                }`}
                data-testid="button-quick-replit-agent"
              >
                <Bot className={`${isMobile ? 'w-6 h-6' : 'w-6 h-6'}`} />
                <span className={`font-black ${
                  isMobile ? 'text-sm' : 'text-sm'
                }`}>
                  REPLIT AGENT
                </span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.35 }}
                onClick={() => setLocation("/sos-control")}
                className={`w-full business-button rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex items-center ${
                  isMobile 
                    ? 'p-4 gap-4 flex-row justify-start' 
                    : 'p-4 gap-4 flex-row'
                }`}
                data-testid="button-quick-sos-control"
              >
                <Shield className={`${isMobile ? 'w-6 h-6' : 'w-6 h-6'}`} />
                <span className={`font-black ${
                  isMobile ? 'text-sm' : 'text-sm'
                }`}>
                  S.O.S KONTROL
                </span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
                onClick={() => setLocation("/scheduler")}
                className={`w-full business-button rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex items-center ${
                  isMobile 
                    ? 'p-4 gap-4 flex-row justify-start' 
                    : 'p-4 gap-4 flex-row'
                }`}
                data-testid="button-quick-scheduler"
              >
                <Activity className={`${isMobile ? 'w-6 h-6' : 'w-6 h-6'}`} />
                <span className={`font-black ${
                  isMobile ? 'text-sm' : 'text-sm'
                }`}>
                  ZAMANLI GÖREVLER
                </span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.45 }}
                onClick={() => setLocation("/shopify-products")}
                className={`w-full business-button rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex items-center ${
                  isMobile 
                    ? 'p-4 gap-4 flex-row justify-start' 
                    : 'p-4 gap-4 flex-row'
                }`}
                data-testid="button-quick-shopify-products"
              >
                <Database className={`${isMobile ? 'w-6 h-6' : 'w-6 h-6'}`} />
                <span className={`font-black ${
                  isMobile ? 'text-sm' : 'text-sm'
                }`}>
                  SHOPIFY ÜRÜNLERİ
                </span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                onClick={() => setLocation("/telegram-notifications")}
                className={`w-full business-button rounded-xl text-white hover:scale-105 active:scale-95 transition-all duration-300 flex items-center ${
                  isMobile 
                    ? 'p-4 gap-4 flex-row justify-start' 
                    : 'p-4 gap-4 flex-row'
                }`}
                data-testid="button-quick-telegram-notifications"
              >
                <Bell className={`${isMobile ? 'w-6 h-6' : 'w-6 h-6'}`} />
                <span className={`font-black ${
                  isMobile ? 'text-sm' : 'text-sm'
                }`}>
                  TELEGRAM BİLDİRİMLERİ
                </span>
              </motion.button>
            </div>
          </motion.div>
          
        </div>
      </div>
    </div>
  );
};

export default MarketplaceSelection;