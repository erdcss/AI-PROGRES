import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, Wrench } from "lucide-react";
import PageLayout from "@/components/PageLayout";

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
    <PageLayout
      title={currentPlatform ? `${currentPlatform.name} Henüz Hazır Değil` : 'Şuan Hazır Değil'}
      subtitle={currentPlatform ? `${currentPlatform.domain} desteği için çalışıyoruz` : 'Çalışıyoruz'}
      backTo="/marketplace"
      backLabel="Geri Dön"
    >
      <div className="max-w-2xl w-full text-center mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          {currentPlatform && (
            <div className="flex justify-center mb-8">
              {currentPlatform.logo}
            </div>
          )}
          
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-8"
          >
            <Wrench className="w-20 h-20 text-yellow-400" />
          </motion.div>
          
          <div className="flex items-center justify-center text-gray-300 mb-8 glassmorphism-card px-6 py-3 rounded-full">
            <Clock className="w-5 h-5 mr-2" />
            <span>Bu platform yakında eklenecek</span>
          </div>
        </motion.div>
      </div>
    </PageLayout>
  );
};

export default ComingSoon;