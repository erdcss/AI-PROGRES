import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ShoppingCart, Package, Store, Truck, BarChart3, Shield, Bot, MessageSquare } from "lucide-react";
import { RealTimeClock } from "@/components/RealTimeClock";

const MarketplaceSelection = () => {
  const [, setLocation] = useLocation();

  const marketplaces = [
    {
      name: "Trendyol",
      icon: <Store className="w-12 h-12 mb-4 text-red-500" />,
      color: "from-red-500 to-red-600",
      available: true,
      path: "/scraper/trendyol"
    },
    {
      name: "Hepsiburada", 
      icon: <ShoppingCart className="w-12 h-12 mb-4 text-orange-500" />,
      color: "from-orange-500 to-orange-600",
      available: false,
      path: "/coming-soon/hepsiburada"
    },
    {
      name: "Amazon",
      icon: <Package className="w-12 h-12 mb-4 text-yellow-500" />,
      color: "from-yellow-500 to-yellow-600", 
      available: false,
      path: "/coming-soon/amazon"
    },
    {
      name: "N11",
      icon: <Truck className="w-12 h-12 mb-4 text-purple-500" />,
      color: "from-purple-500 to-purple-600",
      available: false,
      path: "/coming-soon/n11"
    }
  ];

  const handleMarketplaceClick = (marketplace: typeof marketplaces[0]) => {
    if (marketplace.available) {
      setLocation(marketplace.path);
    } else {
      setLocation("/coming-soon");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Marketplace Seçin
          </h1>
          <p className="text-xl text-gray-300">
            Ürün verilerini çekmek istediğiniz platformu seçin
          </p>
          
          {/* Real-time Clock */}
          <div className="flex justify-center mt-6">
            <RealTimeClock />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {marketplaces.map((marketplace, index) => (
            <motion.div
              key={marketplace.name}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.6, 
                delay: index * 0.1,
                ease: "easeOut"
              }}
              whileHover={{ 
                transition: { duration: 0.2 }
              }}
              className="relative"
            >
              <button
                onClick={() => handleMarketplaceClick(marketplace)}
                className={`
                  w-full h-48 rounded-2xl bg-gradient-to-br ${marketplace.color}
                  flex flex-col items-center justify-center text-white font-semibold text-lg
                  shadow-xl
                  border border-white/10 backdrop-blur-sm
                  ${!marketplace.available ? 'opacity-75' : 'hover:brightness-110'}
                `}
              >
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                >
                  {marketplace.icon}
                </motion.div>
                <span className="text-xl font-bold">{marketplace.name}</span>
                {!marketplace.available && (
                  <span className="text-sm mt-2 text-white/80">Yakında</span>
                )}
              </button>
              
              {marketplace.available && (
                <motion.div
                  className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                >
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="text-center mt-12"
        >
          <p className="text-gray-400">
            Diğer platformlar yakında eklenecek...
          </p>
        </motion.div>

        {/* Control Panel Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="mt-12 text-center space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => setLocation("/product-data-analysis")}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 px-8 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <BarChart3 className="h-6 w-6 inline-block mr-2" />
              Ürün Veri Analizi
            </button>
            
            <button
              onClick={() => setLocation("/system-status")}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-4 px-8 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <Shield className="h-6 w-6 inline-block mr-2" />
              Sistem Durumu & Hata Merkezi
            </button>
            
            <button
              onClick={() => setLocation("/replit-agent")}
              className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold py-4 px-8 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <Bot className="h-6 w-6 inline-block mr-2" />
              Replit.Agent
            </button>

            <button
              onClick={() => setLocation("/sos-control")}
              className="bg-gradient-to-r from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white font-semibold py-4 px-8 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 relative overflow-hidden border-2 border-red-500/30"
            >
              <div className="absolute inset-0 bg-red-500/10 animate-pulse"></div>
              <div className="relative z-10 flex items-center">
                <Shield className="h-6 w-6 inline-block mr-2" />
                S.O.S Kontrol Merkezi
              </div>
            </button>

            <button
              onClick={() => setLocation("/product-reviews")}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-4 px-8 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <MessageSquare className="h-6 w-6 inline-block mr-2" />
              Ürün Yorumları
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center text-gray-400 text-sm">
            <p>AI chatbot, hafıza bilgisi ve gerçek zamanlı veri takibi</p>
            <p>İleri düzey sistem izleme, hata tespit ve otomatik düzeltme</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default MarketplaceSelection;