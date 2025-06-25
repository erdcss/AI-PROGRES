import { ProductDataAnalysis } from "@/components/ProductDataAnalysis";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";

const ProductDataAnalysisPage = () => {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div className="max-w-7xl mx-auto p-6">
        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Button
            onClick={() => setLocation("/")}
            variant="outline"
            className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 transition-all duration-300 font-medium"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Ana Sayfa
          </Button>
        </motion.div>

        {/* Dashboard component */}
        <ProductDataAnalysis />
      </div>
    </div>
  );
};

export default ProductDataAnalysisPage;