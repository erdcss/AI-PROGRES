import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ShoppingCart, Package, Store, Truck } from "lucide-react";

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
                scale: 1.05,
                transition: { duration: 0.2 }
              }}
              whileTap={{ scale: 0.95 }}
              className="relative"
            >
              <button
                onClick={() => handleMarketplaceClick(marketplace)}
                className={`
                  w-full h-48 rounded-2xl bg-gradient-to-br ${marketplace.color}
                  flex flex-col items-center justify-center text-white font-semibold text-lg
                  shadow-xl hover:shadow-2xl transition-all duration-300
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
      </div>
    </div>
  );
};

export default MarketplaceSelection;