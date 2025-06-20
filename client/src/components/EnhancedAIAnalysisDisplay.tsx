import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, 
  Target, 
  DollarSign,
  ShoppingCart,
  Eye,
  Palette,
  Users,
  Star,
  TrendingUp,
  FileText,
  Tag,
  Search,
  Lightbulb,
  CheckCircle,
  Award
} from "lucide-react";
import { motion } from "framer-motion";
import { cardVariants } from "@/components/PageTransition";

interface EnhancedAIAnalysisProps {
  analysis: {
    category: string;
    subcategory: string;
    targetAudience: string;
    ageGroup: string;
    gender: string;
    season: string;
    materials: string[];
    features: string[];
    benefits: string[];
    keywords: string[];
    seoTitle: string;
    seoDescription: string;
    marketingCopy: string;
    priceAnalysis: {
      priceCategory: string;
      valueProposition: string;
      competitiveAdvantage: string[];
    };
    shopifyOptimization: {
      handle: string;
      tags: string[];
      productType: string;
      vendor: string;
      metaTitle: string;
      metaDescription: string;
    };
    imageAnalysis: {
      dominantColors: string[];
      style: string;
      setting: string;
      quality: string;
    };
    usageInstructions: string[];
  };
}

export function EnhancedAIAnalysisDisplay({ analysis }: EnhancedAIAnalysisProps) {
  
  const getPriceCategoryColor = (category: string) => {
    switch (category) {
      case 'budget': return 'bg-green-600/20 text-green-300 border-green-500';
      case 'mid-range': return 'bg-blue-600/20 text-blue-300 border-blue-500';
      case 'premium': return 'bg-purple-600/20 text-purple-300 border-purple-500';
      case 'luxury': return 'bg-yellow-600/20 text-yellow-300 border-yellow-500';
      default: return 'bg-gray-600/20 text-gray-300 border-gray-500';
    }
  };

  const getPriceCategoryText = (category: string) => {
    switch (category) {
      case 'budget': return 'Ekonomik';
      case 'mid-range': return 'Orta Segment';
      case 'premium': return 'Premium';
      case 'luxury': return 'Lüks';
      default: return 'Standart';
    }
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      {/* AI Analysis Header */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Brain className="h-6 w-6 text-white" />
              </div>
              Yapay Zeka Ürün Analizi
              <Badge className="bg-green-600/20 text-green-300 border-green-500">
                <CheckCircle className="h-3 w-3 mr-1" />
                Claude 4.0 ile Analiz Edildi
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      </motion.div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-slate-800">
          <TabsTrigger value="overview" className="text-white">Genel Bakış</TabsTrigger>
          <TabsTrigger value="marketing" className="text-white">Pazarlama</TabsTrigger>
          <TabsTrigger value="seo" className="text-white">SEO Optimizasyonu</TabsTrigger>
          <TabsTrigger value="shopify" className="text-white">Shopify Entegrasyonu</TabsTrigger>
          <TabsTrigger value="insights" className="text-white">AI Öngörüleri</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Category Analysis */}
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Tag className="h-5 w-5 text-blue-400" />
                  Kategori Analizi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-gray-400">Ana Kategori</div>
                  <Badge variant="secondary" className="bg-blue-600/20 text-blue-300">
                    {analysis.category}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Alt Kategori</div>
                  <Badge variant="outline" className="border-blue-500 text-blue-300">
                    {analysis.subcategory}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Mevsim</div>
                  <Badge variant="secondary">
                    {analysis.season}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Target Audience */}
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-green-400" />
                  Hedef Kitle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-gray-400">Ana Hedef</div>
                  <Badge className="bg-green-600/20 text-green-300">
                    {analysis.targetAudience}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Yaş Grubu</div>
                  <Badge variant="outline" className="border-green-500 text-green-300">
                    {analysis.ageGroup}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Cinsiyet</div>
                  <Badge variant="secondary">
                    {analysis.gender}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Price Analysis */}
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-yellow-400" />
                  Fiyat Analizi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm text-gray-400">Fiyat Kategorisi</div>
                  <Badge className={getPriceCategoryColor(analysis.priceAnalysis.priceCategory)}>
                    <Award className="h-3 w-3 mr-1" />
                    {getPriceCategoryText(analysis.priceAnalysis.priceCategory)}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Değer Önerisi</div>
                  <div className="text-sm text-white bg-slate-700 p-2 rounded">
                    {analysis.priceAnalysis.valueProposition}
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Features and Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Star className="h-5 w-5 text-orange-400" />
                  Ürün Özellikleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {analysis.features.map((feature, index) => (
                    <Badge key={index} variant="outline" className="border-orange-500 text-orange-300">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  Ürün Faydaları
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {analysis.benefits.map((benefit, index) => (
                    <Badge key={index} className="bg-green-600/20 text-green-300 border-green-500">
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Materials and Image Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Palette className="h-5 w-5 text-purple-400" />
                  Malzeme Analizi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {analysis.materials.map((material, index) => (
                    <Badge key={index} variant="secondary" className="bg-purple-600/20 text-purple-300">
                      {material}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Eye className="h-5 w-5 text-pink-400" />
                  Görsel Analizi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <span className="text-sm text-gray-400">Stil: </span>
                  <Badge className="bg-pink-600/20 text-pink-300">{analysis.imageAnalysis.style}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-400">Kalite: </span>
                  <Badge variant="outline" className="border-pink-500 text-pink-300">{analysis.imageAnalysis.quality}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-400">Renkler: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {analysis.imageAnalysis.dominantColors.map((color, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {color}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4">
          <div className="grid grid-cols-1 gap-6">
            
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-400" />
                  AI Üretimi Pazarlama Metni
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-700 p-4 rounded-lg">
                  <p className="text-white text-lg leading-relaxed">
                    {analysis.marketingCopy}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <Card className="bg-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-400" />
                    Rekabet Avantajları
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.priceAnalysis.competitiveAdvantage.map((advantage, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-blue-900/20 rounded">
                        <CheckCircle className="h-4 w-4 text-blue-400" />
                        <span className="text-blue-300">{advantage}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="h-5 w-5 text-green-400" />
                    Kullanım Talimatları
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.usageInstructions.map((instruction, index) => (
                      <div key={index} className="flex items-start gap-2 p-2 bg-green-900/20 rounded">
                        <span className="text-green-400 font-bold text-sm">{index + 1}.</span>
                        <span className="text-green-300 text-sm">{instruction}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-4">
          <div className="grid grid-cols-1 gap-6">
            
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Search className="h-5 w-5 text-blue-400" />
                  SEO Optimizasyonu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">SEO Başlığı (60 karakter)</label>
                  <div className="bg-slate-700 p-3 rounded mt-1">
                    <div className="text-white">{analysis.seoTitle}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {analysis.seoTitle.length}/60 karakter
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm text-gray-400">SEO Açıklaması (160 karakter)</label>
                  <div className="bg-slate-700 p-3 rounded mt-1">
                    <div className="text-white">{analysis.seoDescription}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {analysis.seoDescription.length}/160 karakter
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Tag className="h-5 w-5 text-purple-400" />
                  Anahtar Kelimeler
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {analysis.keywords.map((keyword, index) => (
                    <Badge key={index} className="bg-purple-600/20 text-purple-300 border-purple-500">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        <TabsContent value="shopify" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-green-400" />
                  Shopify Ürün Bilgileri
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400">Handle (URL)</label>
                  <div className="bg-slate-700 p-2 rounded mt-1 text-green-300 font-mono text-sm">
                    {analysis.shopifyOptimization.handle}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Ürün Tipi</label>
                  <div className="bg-slate-700 p-2 rounded mt-1 text-white">
                    {analysis.shopifyOptimization.productType}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Satıcı</label>
                  <div className="bg-slate-700 p-2 rounded mt-1 text-white">
                    {analysis.shopifyOptimization.vendor}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Tag className="h-5 w-5 text-blue-400" />
                  Shopify Etiketleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {analysis.shopifyOptimization.tags.map((tag, index) => (
                    <Badge key={index} className="bg-blue-600/20 text-blue-300 border-blue-500">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

          </div>

          <Card className="bg-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Meta Veriler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Meta Başlık</label>
                <div className="bg-slate-700 p-2 rounded mt-1 text-white">
                  {analysis.shopifyOptimization.metaTitle}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400">Meta Açıklama</label>
                <div className="bg-slate-700 p-2 rounded mt-1 text-white">
                  {analysis.shopifyOptimization.metaDescription}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-400" />
                AI Öngörüleri ve Öneriler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-purple-900/30 p-4 rounded-lg">
                <h4 className="text-purple-300 font-semibold mb-2">Pazarlama Stratejisi</h4>
                <p className="text-purple-200 text-sm">
                  Bu ürün {analysis.targetAudience.toLowerCase()} hedef kitlesi için idealdir. 
                  {analysis.priceAnalysis.priceCategory === 'budget' ? ' Ekonomik fiyat avantajını' : 
                   analysis.priceAnalysis.priceCategory === 'premium' ? ' Premium kalite özelliklerini' : 
                   ' Değer odaklı konumlandırmasını'} öne çıkarın.
                </p>
              </div>
              
              <div className="bg-blue-900/30 p-4 rounded-lg">
                <h4 className="text-blue-300 font-semibold mb-2">SEO Tavsiyesi</h4>
                <p className="text-blue-200 text-sm">
                  "{analysis.keywords.slice(0, 3).join(', ')}" anahtar kelimelerine odaklanın. 
                  Ürün açıklamasında bu terimleri doğal şekilde kullanın.
                </p>
              </div>
              
              <div className="bg-green-900/30 p-4 rounded-lg">
                <h4 className="text-green-300 font-semibold mb-2">Satış Optimizasyonu</h4>
                <p className="text-green-200 text-sm">
                  {analysis.season !== 'Her Mevsim' ? `${analysis.season} mevsimi yaklaşırken` : 'Yıl boyunca'} 
                  bu ürünün talebinin artması bekleniyor. Stok planlamasını buna göre yapın.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}