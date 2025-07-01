import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  ArrowLeft, 
  MessageSquare, 
  Download, 
  RefreshCw, 
  Store, 
  ShoppingCart, 
  Package, 
  Truck,
  Star,
  User,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface Review {
  id: string;
  productTitle: string;
  reviewerName: string;
  rating: number;
  reviewText: string;
  reviewDate: string;
  verified: boolean;
  helpful: number;
  platform: string;
  productUrl: string;
}

interface PlatformStats {
  totalProducts: number;
  totalReviews: number;
  averageRating: number;
  lastUpdated: string;
}

const ProductReviews = () => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("trendyol");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Record<string, PlatformStats>>({});
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const platforms = [
    {
      id: "trendyol",
      name: "Trendyol",
      icon: <Store className="w-5 h-5" />,
      color: "from-red-500 to-red-600",
      textColor: "text-red-600"
    },
    {
      id: "amazon",
      name: "Amazon", 
      icon: <Package className="w-5 h-5" />,
      color: "from-yellow-500 to-yellow-600",
      textColor: "text-yellow-600"
    },
    {
      id: "hepsiburada",
      name: "Hepsiburada",
      icon: <ShoppingCart className="w-5 h-5" />,
      color: "from-orange-500 to-orange-600", 
      textColor: "text-orange-600"
    },
    {
      id: "n11",
      name: "N11",
      icon: <Truck className="w-5 h-5" />,
      color: "from-purple-500 to-purple-600",
      textColor: "text-purple-600"
    }
  ];

  // Platform istatistiklerini yükle
  const loadPlatformStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reviews/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Stats loading error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Platform yorumlarını yükle
  const loadReviews = async (platform: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reviews/${platform}`);
      const data = await response.json();
      setReviews(data.reviews || []);
    } catch (error) {
      console.error('Reviews loading error:', error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  // Otomatik yorum çıkarma başlat
  const startAutoReviewExtraction = async (platform: string) => {
    setExtracting(true);
    try {
      const response = await fetch(`/api/reviews/extract/${platform}`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Yorum Çıkarma Başlatıldı",
          description: `${platform} ürünleri için otomatik yorum çıkarma işlemi başlatıldı.`,
        });
        
        // Birkaç saniye sonra verileri yenile
        setTimeout(() => {
          loadReviews(platform);
          loadPlatformStats();
        }, 3000);
      }
    } catch (error) {
      console.error('Auto extraction error:', error);
      toast({
        title: "Hata",
        description: "Otomatik yorum çıkarma başlatılamadı.",
        variant: "destructive"
      });
    } finally {
      setExtracting(false);
    }
  };

  // CSV export
  const exportToCSV = async (platform: string) => {
    try {
      const response = await fetch(`/api/reviews/export/${platform}`);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${platform}-reviews-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "CSV İndirildi",
        description: `${platform} yorumları CSV olarak indirildi.`,
      });
    } catch (error) {
      console.error('CSV export error:', error);
      toast({
        title: "Hata",
        description: "CSV export edilemedi.",
        variant: "destructive"
      });
    }
  };

  // Yıldız gösterimi
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${
          i < rating ? 'text-yellow-500 fill-current' : 'text-gray-300'
        }`}
      />
    ));
  };

  useEffect(() => {
    loadPlatformStats();
    loadReviews(activeTab);
  }, []);

  useEffect(() => {
    loadReviews(activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/")}
              className="text-white border-white/20 hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Ana Sayfa
            </Button>
            <div className="flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-blue-400" />
              <div>
                <h1 className="text-3xl font-bold text-white">Ürün Yorumları</h1>
                <p className="text-gray-300">Platform bazlı ürün yorumları yönetimi</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Platform Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-white/10 backdrop-blur-sm">
              {platforms.map((platform) => (
                <TabsTrigger
                  key={platform.id}
                  value={platform.id}
                  className="flex items-center gap-2 text-white data-[state=active]:bg-white/20"
                >
                  {platform.icon}
                  {platform.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {platforms.map((platform) => (
              <TabsContent key={platform.id} value={platform.id} className="mt-6">
                {/* Platform İstatistikleri */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                  <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-white">
                        Toplam Ürün
                      </CardTitle>
                      <Package className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {stats[platform.id]?.totalProducts || 0}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-white">
                        Toplam Yorum
                      </CardTitle>
                      <MessageSquare className="h-4 w-4 text-green-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {stats[platform.id]?.totalReviews || 0}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-white">
                        Ortalama Puan
                      </CardTitle>
                      <Star className="h-4 w-4 text-yellow-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {stats[platform.id]?.averageRating?.toFixed(1) || "0.0"}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-white">
                        Son Güncelleme
                      </CardTitle>
                      <Calendar className="h-4 w-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-white">
                        {stats[platform.id]?.lastUpdated || "Henüz yok"}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Platform Kontrolleri */}
                <div className="flex gap-4 mb-6">
                  <Button
                    onClick={() => startAutoReviewExtraction(platform.id)}
                    disabled={extracting}
                    className={`bg-gradient-to-r ${platform.color} hover:opacity-90 text-white`}
                  >
                    {extracting ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 mr-2" />
                    )}
                    Yorumları Çıkar
                  </Button>

                  <Button
                    onClick={() => exportToCSV(platform.id)}
                    variant="outline"
                    className="text-white border-white/20 hover:bg-white/10"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV İndir
                  </Button>

                  <Button
                    onClick={() => loadReviews(platform.id)}
                    variant="outline"
                    className="text-white border-white/20 hover:bg-white/10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Yenile
                  </Button>
                </div>

                {/* Yorumlar Listesi */}
                <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      {platform.name} Yorumları
                    </CardTitle>
                    <CardDescription className="text-gray-300">
                      Bu platformdan çıkarılan ürün yorumları
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin text-white" />
                        <span className="ml-2 text-white">Yükleniyor...</span>
                      </div>
                    ) : reviews.length === 0 ? (
                      <div className="text-center py-8 text-gray-300">
                        <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Henüz yorum bulunmuyor</p>
                        <p className="text-sm">Yorumları çıkarmak için yukarıdaki butonu kullanın</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {reviews.map((review) => (
                          <div
                            key={review.id}
                            className="p-4 rounded-lg bg-white/5 border border-white/10"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-400" />
                                <span className="text-white font-medium">
                                  {review.reviewerName}
                                </span>
                                {review.verified && (
                                  <Badge variant="secondary" className="text-xs">
                                    Doğrulanmış
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {renderStars(review.rating)}
                                <span className="text-sm text-gray-300 ml-2">
                                  {review.reviewDate}
                                </span>
                              </div>
                            </div>
                            
                            <h4 className="text-white font-medium mb-2">
                              {review.productTitle}
                            </h4>
                            
                            <p className="text-gray-300 text-sm mb-3 line-clamp-3">
                              {review.reviewText}
                            </p>
                            
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1 text-green-400">
                                  <ThumbsUp className="w-3 h-3" />
                                  <span className="text-xs">{review.helpful}</span>
                                </div>
                              </div>
                              <a
                                href={review.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-xs ${platform.textColor} hover:underline`}
                              >
                                Ürünü Görüntüle
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
};

export default ProductReviews;