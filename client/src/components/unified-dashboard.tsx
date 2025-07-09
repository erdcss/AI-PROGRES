import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ShoppingCart, 
  TrendingUp, 
  Database, 
  MessageSquare, 
  Mail, 
  Settings, 
  BarChart3,
  Clock,
  FileText,
  Zap,
  Globe,
  AlertCircle,
  CheckCircle,
  Activity,
  Users,
  Target,
  Cpu,
  HardDrive,
  Wifi,
  Calendar,
  Download,
  Upload,
  Search,
  Filter,
  RefreshCw,
  Play,
  Pause,
  Stop
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UnifiedDashboardProps {
  onNavigate: (path: string) => void;
}

interface SystemStats {
  totalProducts: number;
  successRate: number;
  activeMonitors: number;
  avgResponseTime: number;
  dailyExtractions: number;
  errorRate: number;
  lastUpdate: string;
}

interface RecentActivity {
  id: string;
  type: 'scraping' | 'telegram' | 'email' | 'analysis' | 'export';
  description: string;
  timestamp: string;
  status: 'success' | 'error' | 'warning';
  url?: string;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
  available: boolean;
}

export default function UnifiedDashboard({ onNavigate }: UnifiedDashboardProps) {
  const [systemStats, setSystemStats] = useState<SystemStats>({
    totalProducts: 0,
    successRate: 0,
    activeMonitors: 0,
    avgResponseTime: 0,
    dailyExtractions: 0,
    errorRate: 0,
    lastUpdate: new Date().toISOString()
  });

  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const quickActions: QuickAction[] = [
    {
      id: 'scraper',
      title: 'Ürün Çıkarma',
      description: 'Trendyol ürün verilerini çıkar',
      icon: <Search className="w-5 h-5" />,
      path: '/scraper',
      color: 'bg-blue-500',
      available: true
    },
    {
      id: 'telegram',
      title: 'Telegram Bildirimleri',
      description: 'Anlık bildirim ayarları',
      icon: <MessageSquare className="w-5 h-5" />,
      path: '/telegram',
      color: 'bg-green-500',
      available: true
    },
    {
      id: 'email',
      title: 'Email Raporları',
      description: 'Otomatik email raporları',
      icon: <Mail className="w-5 h-5" />,
      path: '/email',
      color: 'bg-yellow-500',
      available: true
    },
    {
      id: 'analysis',
      title: 'Veri Analizi',
      description: 'Ürün verilerini analiz et',
      icon: <BarChart3 className="w-5 h-5" />,
      path: '/data-analysis',
      color: 'bg-purple-500',
      available: true
    },
    {
      id: 'scheduler',
      title: 'Zamanlayıcı',
      description: 'Otomatik görevler',
      icon: <Clock className="w-5 h-5" />,
      path: '/scheduler',
      color: 'bg-orange-500',
      available: true
    },
    {
      id: 'reviews',
      title: 'Ürün Yorumları',
      description: 'Müşteri yorumları analizi',
      icon: <Users className="w-5 h-5" />,
      path: '/product-reviews',
      color: 'bg-pink-500',
      available: true
    },
    {
      id: 'price-comparison',
      title: 'Fiyat Karşılaştırma',
      description: 'Marketplace fiyat analizi',
      icon: <TrendingUp className="w-5 h-5" />,
      path: '/price-comparison',
      color: 'bg-cyan-500',
      available: true
    },
    {
      id: 'system-status',
      title: 'Sistem Durumu',
      description: 'Performans ve durum',
      icon: <Activity className="w-5 h-5" />,
      path: '/system-status',
      color: 'bg-red-500',
      available: true
    }
  ];

  useEffect(() => {
    loadSystemStats();
    loadRecentActivity();
    
    const interval = setInterval(() => {
      loadSystemStats();
      loadRecentActivity();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadSystemStats = async () => {
    try {
      const response = await fetch('/api/system-stats');
      if (response.ok) {
        const data = await response.json();
        setSystemStats(data);
      }
    } catch (error) {
      console.error('System stats loading error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecentActivity = async () => {
    try {
      const response = await fetch('/api/recent-activity');
      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data);
      }
    } catch (error) {
      console.error('Recent activity loading error:', error);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'scraping': return <Search className="w-4 h-4" />;
      case 'telegram': return <MessageSquare className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'analysis': return <BarChart3 className="w-4 h-4" />;
      case 'export': return <Download className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Entegre Kontrol Paneli
          </h1>
          <p className="text-gray-300 text-lg">
            Tüm e-ticaret operasyonlarınız tek yerden
          </p>
        </motion.div>

        {/* System Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { 
              title: 'Toplam Ürün', 
              value: systemStats.totalProducts.toLocaleString(), 
              icon: <ShoppingCart className="w-5 h-5" />,
              color: 'text-blue-400'
            },
            { 
              title: 'Başarı Oranı', 
              value: `${systemStats.successRate}%`, 
              icon: <CheckCircle className="w-5 h-5" />,
              color: 'text-green-400'
            },
            { 
              title: 'Aktif Monitör', 
              value: systemStats.activeMonitors.toString(), 
              icon: <Activity className="w-5 h-5" />,
              color: 'text-yellow-400'
            },
            { 
              title: 'Ortalama Süre', 
              value: `${systemStats.avgResponseTime}ms`, 
              icon: <Zap className="w-5 h-5" />,
              color: 'text-purple-400'
            }
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">{stat.title}</p>
                      <p className="text-2xl font-bold text-white">{stat.value}</p>
                    </div>
                    <div className={`${stat.color}`}>
                      {stat.icon}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50">
            <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
            <TabsTrigger value="actions">Hızlı İşlemler</TabsTrigger>
            <TabsTrigger value="activity">Son Aktiviteler</TabsTrigger>
            <TabsTrigger value="monitoring">Canlı İzleme</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Performance Chart */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Performans Grafiği
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm text-gray-400 mb-1">
                        <span>Günlük Çıkarım</span>
                        <span>{systemStats.dailyExtractions}</span>
                      </div>
                      <Progress value={75} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm text-gray-400 mb-1">
                        <span>Sistem Yükü</span>
                        <span>45%</span>
                      </div>
                      <Progress value={45} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm text-gray-400 mb-1">
                        <span>Hata Oranı</span>
                        <span>{systemStats.errorRate}%</span>
                      </div>
                      <Progress value={systemStats.errorRate} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Hedef Durumu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Günlük Hedef</span>
                      <Badge variant="outline" className="border-green-500 text-green-400">
                        Tamamlandı
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Haftalık Hedef</span>
                      <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                        %80 Tamamlandı
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Aylık Hedef</span>
                      <Badge variant="outline" className="border-blue-500 text-blue-400">
                        Devam Ediyor
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Quick Actions Tab */}
          <TabsContent value="actions" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {quickActions.map((action) => (
                <motion.div
                  key={action.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card 
                    className={`bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors cursor-pointer ${
                      !action.available ? 'opacity-50' : ''
                    }`}
                    onClick={() => action.available && onNavigate(action.path)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg ${action.color}`}>
                          {action.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{action.title}</h3>
                          <p className="text-xs text-gray-400">{action.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant={action.available ? 'default' : 'secondary'}>
                          {action.available ? 'Aktif' : 'Yakında'}
                        </Badge>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          disabled={!action.available}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(action.path);
                          }}
                        >
                          Başlat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* Recent Activity Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Son Aktiviteler
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentActivity.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">Henüz aktivite bulunmuyor</p>
                  ) : (
                    recentActivity.map((activity) => (
                      <div 
                        key={activity.id}
                        className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg"
                      >
                        <div className={getStatusColor(activity.status)}>
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-sm">{activity.description}</p>
                          <p className="text-gray-400 text-xs">{formatTime(activity.timestamp)}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {activity.type}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Live Monitoring Tab */}
          <TabsContent value="monitoring" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Cpu className="w-5 h-5" />
                    Sistem Kaynakları
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm text-gray-400 mb-1">
                        <span>CPU Kullanımı</span>
                        <span>45%</span>
                      </div>
                      <Progress value={45} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm text-gray-400 mb-1">
                        <span>Bellek Kullanımı</span>
                        <span>60%</span>
                      </div>
                      <Progress value={60} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm text-gray-400 mb-1">
                        <span>Disk Kullanımı</span>
                        <span>30%</span>
                      </div>
                      <Progress value={30} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Wifi className="w-5 h-5" />
                    Ağ Durumu
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Trendyol API</span>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-green-400 text-sm">Aktif</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Telegram Bot</span>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-green-400 text-sm">Aktif</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Email Service</span>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-green-400 text-sm">Aktif</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Database</span>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-green-400 text-sm">Bağlı</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}