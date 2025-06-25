import { ProductDataAnalysis } from "@/components/ProductDataAnalysis";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

const ProductDataAnalysisPage = () => {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header with back button */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <Button
            onClick={() => setLocation("/")}
            variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Marketplace'e Dön
          </Button>
          
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">
              Ürün Veri Analizi
            </h1>
            <p className="text-xl text-gray-300">
              Hafıza sistemi, AI chatbot ve gerçek zamanlı veri takibi
            </p>
          </div>
        </motion.div>

        {/* Dashboard component */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <ProductDataAnalysis />
        </motion.div>
      </div>
    </div>
  );
};

export default ProductDataAnalysisPage;