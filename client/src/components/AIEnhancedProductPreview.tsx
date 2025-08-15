import { motion } from "framer-motion";
import { Bot, Sparkles, Target, Award, TrendingUp, Lightbulb } from "lucide-react";
import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface AIEnhancementData {
  enhancedDescription: string;
  seoTitle: string;
  seoDescription: string;
  suggestedTags: string[];
  categoryMatch: string;
  qualityScore: number;
  marketingDescription: string;
  targetAudience: string;
  aiAnalysis: {
    productType: string;
    mainFeatures: string[];
    competitiveAdvantages: string[];
    recommendations: string[];
  };
}

interface AIEnhancedProductPreviewProps {
  productData: {
    title: string;
    brand: string;
    price: number;
    images: string[];
    features: Array<{ key: string; value: string }>;
  };
  sourceUrl?: string;
}

export function AIEnhancedProductPreview({ productData, sourceUrl }: AIEnhancedProductPreviewProps) {
  const [aiEnhancement, setAiEnhancement] = useState<AIEnhancementData | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const handleAIEnhancement = async () => {
    setIsEnhancing(true);
    try {
      const response = await apiRequest('POST', '/api/ai-enhance-product', { productData });
      const result = await response.json();
      
      if (result.success) {
        setAiEnhancement(result.enhancedProduct);
        setShowAnalysis(true);
      } else {
        alert('AI geliştirme başarısız: ' + result.error);
      }
    } catch (error) {
      console.error('AI enhancement error:', error);
      alert('AI işlemi başarısız oldu');
    } finally {
      setIsEnhancing(false);
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 75) return 'text-yellow-400';
    if (score >= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const getQualityLabel = (score: number) => {
    if (score >= 90) return 'Mükemmel';
    if (score >= 75) return 'İyi';
    if (score >= 60) return 'Orta';
    return 'Geliştirilmeli';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/50 backdrop-blur-sm border border-purple-500/30 rounded-lg p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <Bot className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">AI Ürün Geliştirici</h3>
            <p className="text-sm text-gray-300">OpenAI ile ürün verilerini geliştirin</p>
          </div>
        </div>
        <button
          onClick={handleAIEnhancement}
          disabled={isEnhancing}
          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
            isEnhancing 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-purple-600 hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-500/25'
          } text-white flex items-center gap-2`}
        >
          {isEnhancing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              AI Çalışıyor...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              AI ile Geliştir
            </>
          )}
        </button>
      </div>

      {/* AI Enhancement Results */}
      {aiEnhancement && showAnalysis && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-4"
        >
          {/* Quality Score */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-yellow-400" />
                <span className="text-white font-semibold">Kalite Skoru</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${getQualityColor(aiEnhancement.qualityScore)}`}>
                  {aiEnhancement.qualityScore}
                </span>
                <span className="text-gray-400 text-sm">/100</span>
              </div>
            </div>
            <div className="text-sm text-gray-300">
              Durum: <span className={getQualityColor(aiEnhancement.qualityScore)}>
                {getQualityLabel(aiEnhancement.qualityScore)}
              </span>
            </div>
          </div>

          {/* Enhanced Descriptions */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-800/30 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-400" />
                Gelişmiş Açıklama
              </h4>
              <p className="text-sm text-gray-300 leading-relaxed">
                {aiEnhancement.enhancedDescription}
              </p>
            </div>
            
            <div className="bg-slate-800/30 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-400" />
                Pazarlama Açıklaması
              </h4>
              <p className="text-sm text-gray-300 leading-relaxed">
                {aiEnhancement.marketingDescription}
              </p>
            </div>
          </div>

          {/* SEO Improvements */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-3">SEO Optimizasyonu</h4>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">SEO Başlık:</label>
                <p className="text-white text-sm mt-1">{aiEnhancement.seoTitle}</p>
              </div>
              <div>
                <label className="text-sm text-gray-400">Meta Açıklama:</label>
                <p className="text-white text-sm mt-1">{aiEnhancement.seoDescription}</p>
              </div>
            </div>
          </div>

          {/* Tags and Category */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-800/30 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-2">Önerilen Etiketler</h4>
              <div className="flex flex-wrap gap-2">
                {aiEnhancement.suggestedTags.map((tag, index) => (
                  <span 
                    key={index}
                    className="px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            
            <div className="bg-slate-800/30 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-2">Kategori Önerisi</h4>
              <p className="text-green-400 font-medium">{aiEnhancement.categoryMatch}</p>
              <p className="text-sm text-gray-400 mt-1">Hedef Kitle: {aiEnhancement.targetAudience}</p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-400" />
              AI Analizi
            </h4>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <h5 className="text-sm text-gray-400 mb-2">Ana Özellikler</h5>
                <ul className="space-y-1">
                  {aiEnhancement.aiAnalysis.mainFeatures.map((feature, index) => (
                    <li key={index} className="text-sm text-gray-300">• {feature}</li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h5 className="text-sm text-gray-400 mb-2">Rekabet Avantajları</h5>
                <ul className="space-y-1">
                  {aiEnhancement.aiAnalysis.competitiveAdvantages.map((advantage, index) => (
                    <li key={index} className="text-sm text-green-300">• {advantage}</li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h5 className="text-sm text-gray-400 mb-2">Öneriler</h5>
                <ul className="space-y-1">
                  {aiEnhancement.aiAnalysis.recommendations.map((recommendation, index) => (
                    <li key={index} className="text-sm text-yellow-300">• {recommendation}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Product Type */}
          <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white font-semibold">Ürün Tipi</h4>
                <p className="text-purple-300 font-medium">{aiEnhancement.aiAnalysis.productType}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-300">AI Powered</p>
                <p className="text-xs text-purple-400">OpenAI GPT-4o</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Information */}
      {!aiEnhancement && (
        <div className="bg-slate-800/30 rounded-lg p-4">
          <h4 className="text-white font-semibold mb-2">AI Geliştirme Özellikleri</h4>
          <ul className="space-y-1 text-sm text-gray-300">
            <li>• Akıllı ürün açıklaması geliştirme</li>
            <li>• SEO optimizasyonu (başlık, meta, etiketler)</li>
            <li>• Kategori ve hedef kitle tespiti</li>
            <li>• Kalite analizi ve skorlama</li>
            <li>• Pazarlama önerileri</li>
            <li>• Rekabet avantajları belirleme</li>
          </ul>
        </div>
      )}
    </motion.div>
  );
}