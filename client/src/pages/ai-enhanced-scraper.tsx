import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Download, Sparkles, Brain, Target, TrendingUp, Zap, Cpu } from "lucide-react";
import { APIRequestError, apiRequest } from "@/lib/queryClient";
import { SimpleProductPreview } from "@/components/SimpleProductPreview";
import { AIEnhancedProductPreview } from "@/components/AIEnhancedProductPreview";

interface AIEnhancedProduct {
  success: boolean;
  title: string;
  brand: string;
  price: { original: number; withProfit: number; formatted: string; profitFormatted: string };
  images: string[];
  features: Array<{ key: string; value: string }>;
  variants: { colors: string[]; sizes: string[]; stockMap: Record<string, boolean> };
  aiEnhancements?: {
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
  };
}

export default function AIEnhancedScraper() {
  const [url, setUrl] = useState("");
  const [extractedProduct, setExtractedProduct] = useState<AIEnhancedProduct | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionType, setExtractionType] = useState<'normal' | 'ai'>('normal');

  const handleExtraction = async (useAI: boolean = false) => {
    if (!url.trim()) {
      alert("Lütfen geçerli bir URL girin");
      return;
    }

    setIsExtracting(true);
    setExtractedProduct(null);
    setExtractionType(useAI ? 'ai' : 'normal');

    try {
      const endpoint = useAI ? '/api/ai-enhanced-scrape' : '/api/scenario-scrape';
      console.log(`${useAI ? 'AI-Enhanced' : 'Normal'} extraction başlatılıyor:`, url);

      const response = await apiRequest('POST', endpoint, { url });
      const result = await response.json();

      if (result.success) {
        setExtractedProduct(result);
        console.log(`✅ ${useAI ? 'AI-Enhanced' : 'Normal'} extraction tamamlandı`);
      } else {
        alert(`Extraction başarısız: ${result.message || result.error}`);
      }
    } catch (error) {
      console.error('Extraction error:', error);
      if (error instanceof APIRequestError) {
        alert(`API Hatası: ${error.message}`);
      } else {
        alert('Beklenmedik bir hata oluştu');
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const downloadCSV = async () => {
    if (!extractedProduct) return;

    try {
      const response = await apiRequest('POST', '/api/comprehensive-csv', { 
        productData: extractedProduct 
      });
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${extractedProduct.brand}-${extractedProduct.title.substring(0, 50)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('CSV download error:', error);
      alert('CSV indirme başarısız');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-purple-600/20 rounded-lg">
              <Brain className="h-8 w-8 text-purple-400" />
            </div>
            <h1 className="text-4xl font-bold text-white">AI-Enhanced Product Extractor</h1>
            <div className="p-3 bg-blue-600/20 rounded-lg">
              <Cpu className="h-8 w-8 text-blue-400" />
            </div>
          </div>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            OpenAI GPT-4o ile geliştirilmiş akıllı ürün veri çıkarma sistemi. 
            Ürün bilgilerini analiz eder, SEO optimizasyonu yapar ve kalite skorlaması sağlar.
          </p>
        </motion.div>

        {/* URL Input */}
        <Card className="bg-slate-800/30 backdrop-blur-sm border-purple-500/30">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Trendyol ürün URL'sini buraya yapıştırın..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder-gray-400"
                />
              </div>
              
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => handleExtraction(false)}
                  disabled={isExtracting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 flex items-center gap-2"
                >
                  {isExtracting && extractionType === 'normal' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Çıkarılıyor...
                    </>
                  ) : (
                    <>
                      <Target className="h-4 w-4" />
                      Normal Çıkarma
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={() => handleExtraction(true)}
                  disabled={isExtracting}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 flex items-center gap-2"
                >
                  {isExtracting && extractionType === 'ai' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      AI Çalışıyor...
                    </>
                  ) : (
                    <>
                      <Bot className="h-4 w-4" />
                      AI-Enhanced Çıkarma
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-slate-800/30 backdrop-blur-sm border-blue-500/30">
            <CardContent className="p-6 text-center">
              <Target className="h-12 w-12 text-blue-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Gelişmiş Çıkarma</h3>
              <p className="text-gray-300 text-sm">
                Standart ürün veri çıkarma sistemi. Hızlı ve güvenilir sonuçlar alın.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/30 backdrop-blur-sm border-purple-500/30">
            <CardContent className="p-6 text-center">
              <Brain className="h-12 w-12 text-purple-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">AI Powered</h3>
              <p className="text-gray-300 text-sm">
                OpenAI GPT-4o ile ürün verilerini analiz edip geliştirir. Kalite skorlaması sağlar.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/30 backdrop-blur-sm border-green-500/30">
            <CardContent className="p-6 text-center">
              <TrendingUp className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">SEO Optimizasyonu</h3>
              <p className="text-gray-300 text-sm">
                Başlık, meta açıklama ve etiket önerileri ile SEO performansını artırır.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <AnimatePresence>
          {extractedProduct && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Download Button */}
              <div className="flex justify-center">
                <Button
                  onClick={downloadCSV}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Shopify CSV İndir
                </Button>
              </div>

              {/* Standard Product Preview */}
              <SimpleProductPreview 
                product={extractedProduct} 
                sourceUrl={url}
              />

              {/* AI Enhancement */}
              {extractedProduct.aiEnhancements && (
                <Card className="bg-slate-800/30 backdrop-blur-sm border-purple-500/30">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <Sparkles className="h-6 w-6 text-purple-400" />
                      <h3 className="text-xl font-semibold text-white">AI Geliştirmeleri</h3>
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-sm text-gray-400">Kalite Skoru:</span>
                        <span className="text-lg font-bold text-purple-400">
                          {extractedProduct.aiEnhancements.qualityScore}/100
                        </span>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Enhanced Description */}
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-white font-semibold mb-2">Gelişmiş Açıklama</h4>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            {extractedProduct.aiEnhancements.enhancedDescription}
                          </p>
                        </div>
                        
                        <div>
                          <h4 className="text-white font-semibold mb-2">Pazarlama Açıklaması</h4>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            {extractedProduct.aiEnhancements.marketingDescription}
                          </p>
                        </div>
                      </div>

                      {/* SEO and Tags */}
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-white font-semibold mb-2">SEO Başlık</h4>
                          <p className="text-blue-300 text-sm">{extractedProduct.aiEnhancements.seoTitle}</p>
                        </div>
                        
                        <div>
                          <h4 className="text-white font-semibold mb-2">Önerilen Etiketler</h4>
                          <div className="flex flex-wrap gap-2">
                            {extractedProduct.aiEnhancements.suggestedTags.map((tag, index) => (
                              <span 
                                key={index}
                                className="px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="text-white font-semibold mb-2">Kategori & Hedef Kitle</h4>
                          <p className="text-green-400 font-medium">{extractedProduct.aiEnhancements.categoryMatch}</p>
                          <p className="text-gray-400 text-sm">{extractedProduct.aiEnhancements.targetAudience}</p>
                        </div>
                      </div>
                    </div>

                    {/* AI Analysis */}
                    <div className="mt-6 pt-6 border-t border-slate-700">
                      <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <Zap className="h-5 w-5 text-yellow-400" />
                        AI Analiz Sonuçları
                      </h4>
                      <div className="grid md:grid-cols-3 gap-4">
                        <div>
                          <h5 className="text-sm text-gray-400 mb-2">Ana Özellikler</h5>
                          <ul className="space-y-1">
                            {extractedProduct.aiEnhancements.aiAnalysis.mainFeatures.map((feature, index) => (
                              <li key={index} className="text-sm text-gray-300">• {feature}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <h5 className="text-sm text-gray-400 mb-2">Rekabet Avantajları</h5>
                          <ul className="space-y-1">
                            {extractedProduct.aiEnhancements.aiAnalysis.competitiveAdvantages.map((advantage, index) => (
                              <li key={index} className="text-sm text-green-300">• {advantage}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <h5 className="text-sm text-gray-400 mb-2">AI Önerileri</h5>
                          <ul className="space-y-1">
                            {extractedProduct.aiEnhancements.aiAnalysis.recommendations.map((recommendation, index) => (
                              <li key={index} className="text-sm text-yellow-300">• {recommendation}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Enhancement Component */}
              {!extractedProduct.aiEnhancements && (
                <AIEnhancedProductPreview 
                  productData={{
                    title: extractedProduct.title,
                    brand: extractedProduct.brand,
                    price: extractedProduct.price.original,
                    images: extractedProduct.images,
                    features: extractedProduct.features
                  }}
                  sourceUrl={url}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Information */}
        <Card className="bg-slate-800/30 backdrop-blur-sm border-slate-600">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">AI-Enhanced Özellikler</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-medium mb-2">Normal Çıkarma</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Ürün başlığı ve markası</li>
                  <li>• Fiyat bilgileri</li>
                  <li>• Ürün görselleri</li>
                  <li>• Teknik özellikler</li>
                  <li>• Stok durumu</li>
                  <li>• Varyant bilgileri</li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-white font-medium mb-2">AI-Enhanced Çıkarma</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>• Tüm normal özellikler +</li>
                  <li>• Akıllı ürün açıklaması</li>
                  <li>• SEO optimizasyonu</li>
                  <li>• Kalite skorlaması</li>
                  <li>• Kategori tespiti</li>
                  <li>• Hedef kitle analizi</li>
                  <li>• Pazarlama önerileri</li>
                  <li>• Rekabet avantajları</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}