import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, Wrench } from "lucide-react";

// Platform logo configuration
const PlatformLogos = {
  trendyol: {
    name: "Trendyol",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-red-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-2xl">T</span>
        </div>
        <span className="text-4xl font-bold text-red-500">Trendyol</span>
      </div>
    ),
    color: "red",
    domain: "trendyol.com"
  },
  hepsiburada: {
    name: "Hepsiburada",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-2xl">H</span>
        </div>
        <span className="text-4xl font-bold text-orange-500">Hepsiburada</span>
      </div>
    ),
    color: "orange",
    domain: "hepsiburada.com"
  },
  amazon: {
    name: "Amazon",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-2xl">A</span>
        </div>
        <span className="text-4xl font-bold text-yellow-500">Amazon</span>
      </div>
    ),
    color: "yellow",
    domain: "amazon.com.tr"
  },
  n11: {
    name: "N11",
    logo: (
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-2xl">N</span>
        </div>
        <span className="text-4xl font-bold text-purple-500">N11</span>
      </div>
    ),
    color: "purple",
    domain: "n11.com"
  }
};

interface ComingSoonProps {
  platform?: string;
}

const ComingSoon = ({ platform }: ComingSoonProps) => {
  const [, setLocation] = useLocation();
  
  // Get current platform configuration
  const currentPlatform = platform 
    ? PlatformLogos[platform as keyof typeof PlatformLogos] 
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          {currentPlatform && (
            <div className="flex justify-center mb-6">
              {currentPlatform.logo}
            </div>
          )}
          
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-6"
          >
            <Wrench className="w-20 h-20 text-yellow-400" />
          </motion.div>
          
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
            {currentPlatform ? `${currentPlatform.name} Henüz Hazır Değil` : 'Şuan Hazır Değil'}
          </h1>
          
          <p className="text-xl text-gray-300 mb-2">
            {currentPlatform ? `${currentPlatform.domain} desteği için çalışıyoruz` : 'Çalışıyoruz'}
          </p>
          
          <div className="flex items-center justify-center text-gray-400 mb-8">
            <Clock className="w-5 h-5 mr-2" />
            <span>Bu platform yakında eklenecek</span>
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          whileHover={{ }}
          whileTap={{ }}
          onClick={() => setLocation("/marketplace")}
          className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-3 rounded-xl font-semibold 
                     hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl
                     flex items-center justify-center mx-auto"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Geri Dön
        </motion.button>
      </div>
    </div>
  );
};

export default ComingSoon;