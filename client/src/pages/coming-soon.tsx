import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, Wrench } from "lucide-react";

const ComingSoon = () => {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-6"
          >
            <Wrench className="w-20 h-20 text-yellow-400" />
          </motion.div>
          
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
            Şuan Hazır Değil
          </h1>
          
          <p className="text-xl text-gray-300 mb-2">
            Çalışıyoruz
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
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
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