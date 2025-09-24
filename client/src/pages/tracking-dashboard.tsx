import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Activity, BarChart3, Clock, Database, CheckCircle, 
  AlertTriangle, TrendingUp, TrendingDown, RefreshCw,
  Monitor, Zap, Eye, Target, ArrowUp, ArrowDown,
  Calendar, Globe, ShoppingCart, Settings, Play, Pause
} from 'lucide-react';
import { RealTimeClock } from "@/components/RealTimeClock";

interface DashboardStats {
  success: boolean;
  stats: {
    urlTracking: {
      totalUrls: number;
      activeTracking: number;
      errorUrls: number;
      lastHourChecks: number;
    };
    shopify: {
      totalProducts: number;
      activeProducts: number;
      trackedProducts: number;
      lastSyncedAt: string | null;
    };
    schedules: {
      total: number;
      active: number;
      types: {
        interval: number;
        fixedHours: number;
      };
    };
    recentActivity: {
      last24Hours: number;
      recentUpdates: Array<{
        title: string;
        trackingId: string;
        updatedAt: string;
        sourceUrl: string;
      }>;
    };
    system: {
      scheduler: {
        totalTasks: number;
        activeTasks: number;
        tasksRunning: boolean;
      };
      uptime: number;
      memoryUsage: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
      };
    };
  };
  timestamp: string;
}

interface ActiveItem {
  url: string;
  productTitle: string;
  currentPrice: string;
  currency: string;
  status: string;
  lastChecked: string;
  checkCount: number;
  trackingInterval: number;
}

interface RecentChange {
  url: string;
  productTitle: string;
  currentPrice: string;
  originalPrice: string;
  currency: string;
  lastChecked: string;
  status: string;
  priceChange: string;
  priceChangePercent: string;
  changeType: 'increase' | 'decrease';
}

const TrackingDashboard = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  // Dashboard statistics query
  const { data: dashboardData, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['/api/tracking/dashboard-stats'],
    refetchInterval: autoRefresh ? refreshInterval : false,
    refetchIntervalInBackground: true
  });

  // Active tracking items query  
  const { data: activeItemsData, isLoading: itemsLoading } = useQuery<{
    success: boolean;
    activeItems: ActiveItem[];
    total: number;
  }>({
    queryKey: ['/api/tracking/active-items'],
    refetchInterval: autoRefresh ? refreshInterval : false
  });

  // Recent changes query
  const { data: changesData, isLoading: changesLoading } = useQuery<{
    success: boolean;
    recentChanges: RecentChange[];
    total: number;
  }>({
    queryKey: ['/api/tracking/recent-changes'],
    refetchInterval: autoRefresh ? refreshInterval : false
  });

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}s ${minutes}d`;
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dakika önce`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} saat önce`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} gün önce`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Otomatik Takip Sistemi
                </h1>
                <p className="text-slate-400 text-sm">
                  Anlık monitoring ve sistem durumu
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Auto Refresh Toggle */}
              <div className="flex items-center gap-2 bg-slate-700/50 border border-slate-600/40 rounded-lg px-3 py-2">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`p-1 rounded ${autoRefresh ? 'text-green-400' : 'text-slate-400'}`}
                  data-testid="auto-refresh-toggle"
                >
                  {autoRefresh ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <span className="text-slate-300 text-xs">
                  {autoRefresh ? 'Otomatik' : 'Duraklı'}
                </span>
              </div>

              {/* Manual Refresh */}
              <button
                onClick={() => refetchStats()}
                className="p-2 bg-slate-700/50 border border-slate-600/40 rounded-lg text-slate-300 hover:text-white hover:bg-slate-600/50 transition-all"
                data-testid="manual-refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Current Time */}
              <div className="flex items-center gap-2 bg-slate-700/50 border border-slate-600/40 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-200 text-sm font-medium">
                  <RealTimeClock />
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* URL Tracking Stats */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">
                  {dashboardData?.stats.urlTracking.totalUrls || 0}
                </p>
                <p className="text-xs text-slate-400">Toplam URL</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Aktif Takip:</span>
                <span className="text-green-400 font-medium">
                  {dashboardData?.stats.urlTracking.activeTracking || 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Son Saat:</span>
                <span className="text-blue-400 font-medium">
                  {dashboardData?.stats.urlTracking.lastHourChecks || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Shopify Integration Stats */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-green-400" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">
                  {dashboardData?.stats.shopify.totalProducts || 0}
                </p>
                <p className="text-xs text-slate-400">Shopify Ürün</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Aktif:</span>
                <span className="text-green-400 font-medium">
                  {dashboardData?.stats.shopify.activeProducts || 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Takipli:</span>
                <span className="text-purple-400 font-medium">
                  {dashboardData?.stats.shopify.trackedProducts || 0}
                </span>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Settings className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">
                  {dashboardData?.stats.system.scheduler.totalTasks || 0}
                </p>
                <p className="text-xs text-slate-400">Sistem Görevi</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Aktif Görev:</span>
                <span className="text-purple-400 font-medium">
                  {dashboardData?.stats.system.scheduler.activeTasks || 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Çalışma Zamanı:</span>
                <span className="text-blue-400 font-medium">
                  {dashboardData?.stats.system.uptime ? formatUptime(dashboardData.stats.system.uptime) : '0s'}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-orange-400" />
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">
                  {dashboardData?.stats.recentActivity.last24Hours || 0}
                </p>
                <p className="text-xs text-slate-400">Son 24 Saat</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Güncelleme:</span>
                <span className="text-orange-400 font-medium">
                  {dashboardData?.stats.recentActivity.recentUpdates.length || 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durum:</span>
                <span className="text-green-400 font-medium">
                  {dashboardData?.stats.system.scheduler.tasksRunning ? 'Çalışıyor' : 'Duraklı'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Active Tracking Items */}
          <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Aktif Takip Edilen Ürünler</h3>
                  <p className="text-sm text-slate-400">Şu anda izlenen ürünler ve durumları</p>
                </div>
              </div>
              <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium">
                {activeItemsData?.total || 0} Aktif
              </span>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activeItemsData?.activeItems.map((item, index) => (
                <div key={index} className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate" title={item.productTitle}>
                        {item.productTitle || 'Ürün adı yükleniyor...'}
                      </h4>
                      <p className="text-slate-400 text-sm truncate" title={item.url}>
                        {item.url}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-green-400 font-semibold">
                        {item.currentPrice} {item.currency}
                      </p>
                      <p className="text-slate-400 text-xs">
                        {formatTimeAgo(item.lastChecked)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-1 rounded-full ${
                      item.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      item.status === 'error' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {item.status === 'active' ? 'Aktif' : 
                       item.status === 'error' ? 'Hata' : 'Beklemede'}
                    </span>
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>{item.checkCount} kontrol</span>
                      <span>•</span>
                      <span>Her {item.trackingInterval}s</span>
                    </div>
                  </div>
                </div>
              ))}
              
              {(!activeItemsData?.activeItems || activeItemsData.activeItems.length === 0) && (
                <div className="text-center py-8">
                  <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">Henüz aktif takip edilen ürün yok</p>
                  <p className="text-slate-500 text-sm">Ürün yükleyerek otomatik takibi başlatabilirsiniz</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Price Changes */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Son Fiyat Değişiklikleri</h3>
                  <p className="text-sm text-slate-400">Son 7 günlük değişiklikler</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {changesData?.recentChanges.map((change, index) => (
                <div key={index} className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white text-sm font-medium truncate" title={change.productTitle}>
                        {change.productTitle || 'Ürün adı yükleniyor...'}
                      </h4>
                      <p className="text-slate-400 text-xs">
                        {formatTimeAgo(change.lastChecked)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className={`flex items-center gap-1 ${
                        change.changeType === 'increase' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {change.changeType === 'increase' ? 
                          <ArrowUp className="w-3 h-3" /> : 
                          <ArrowDown className="w-3 h-3" />
                        }
                        <span className="text-xs font-medium">
                          {change.priceChangePercent}%
                        </span>
                      </div>
                      <p className="text-white text-sm font-semibold">
                        {change.currentPrice} {change.currency}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Önceki: {change.originalPrice} {change.currency}</span>
                    <span>{change.priceChange} {change.currency}</span>
                  </div>
                </div>
              ))}
              
              {(!changesData?.recentChanges || changesData.recentChanges.length === 0) && (
                <div className="text-center py-8">
                  <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">Son 7 günde fiyat değişikliği yok</p>
                  <p className="text-slate-500 text-sm">Değişiklikler tespit edildiğinde burada görünecek</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Health Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Memory Usage */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Database className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Sistem Performansı</h3>
                <p className="text-sm text-slate-400">Bellek kullanımı ve sistem durumu</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700/30 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">Heap Kullanımı</p>
                <p className="text-white text-lg font-semibold">
                  {dashboardData?.stats.system.memoryUsage ? 
                    formatBytes(dashboardData.stats.system.memoryUsage.heapUsed) : '0 MB'}
                </p>
                <p className="text-slate-500 text-xs">
                  / {dashboardData?.stats.system.memoryUsage ? 
                    formatBytes(dashboardData.stats.system.memoryUsage.heapTotal) : '0 MB'}
                </p>
              </div>
              
              <div className="bg-slate-700/30 rounded-lg p-4">
                <p className="text-slate-400 text-sm mb-1">RSS Bellek</p>
                <p className="text-white text-lg font-semibold">
                  {dashboardData?.stats.system.memoryUsage ? 
                    formatBytes(dashboardData.stats.system.memoryUsage.rss) : '0 MB'}
                </p>
              </div>
            </div>
          </div>

          {/* Recent Updates */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Monitor className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Son Güncellemeler</h3>
                <p className="text-sm text-slate-400">En son güncellenen ürünler</p>
              </div>
            </div>

            <div className="space-y-3">
              {dashboardData?.stats.recentActivity.recentUpdates.map((update, index) => (
                <div key={index} className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-3">
                  <h4 className="text-white text-sm font-medium truncate" title={update.title}>
                    {update.title}
                  </h4>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-green-400">ID: {update.trackingId}</span>
                    <span className="text-slate-400">{formatTimeAgo(update.updatedAt)}</span>
                  </div>
                </div>
              ))}
              
              {(!dashboardData?.stats.recentActivity.recentUpdates || 
                dashboardData.stats.recentActivity.recentUpdates.length === 0) && (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Henüz güncel güncelleme yok</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Status */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-6 py-3">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              dashboardData?.stats.system.scheduler.tasksRunning ? 'bg-green-400' : 'bg-yellow-400'
            }`}></div>
            <span className="text-slate-300 text-sm">
              Sistem Durumu: {dashboardData?.stats.system.scheduler.tasksRunning ? 
                'Aktif ve Çalışıyor' : 'Beklemede'}
            </span>
            <span className="text-slate-500 text-xs">
              • Son güncelleme: {dashboardData?.timestamp ? formatTimeAgo(dashboardData.timestamp) : 'Bilinmiyor'}
            </span>
          </div>
        </div>

        {/* Automation Information */}
        <div className="mt-12 mb-8">
          <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-700/30 rounded-2xl p-8 backdrop-blur-sm">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <Zap className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold text-white">Otomatik Takip Sistemi Nasıl Çalışır?</h3>
              </div>
              <p className="text-slate-300 text-lg max-w-4xl mx-auto leading-relaxed">
                Bu sistem, ürün fiyatlarını sürekli izleyerek size en güncel bilgileri sunar ve otomatik olarak Shopify mağazanızı senkronize eder.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Real-time Monitoring */}
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <Monitor className="w-5 h-5 text-green-400" />
                  </div>
                  <h4 className="text-white font-semibold">Real-Time İzleme</h4>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sistem 5 dakikada bir tüm ürünleri kontrol eder. Fiyat değişiklikleri anında tespit edilir ve 
                  Telegram üzerinden bildirim gönderilir.
                </p>
              </div>

              {/* Shopify Sync */}
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <ShoppingCart className="w-5 h-5 text-blue-400" />
                  </div>
                  <h4 className="text-white font-semibold">Shopify Senkronizasyonu</h4>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Fiyat değişiklikleri otomatik olarak Shopify mağazanıza yansıtılır. %10 kar marjı ile 
                  güncellenen fiyatlar anlık olarak senkronize edilir.
                </p>
              </div>

              {/* Scheduled Tasks */}
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Clock className="w-5 h-5 text-purple-400" />
                  </div>
                  <h4 className="text-white font-semibold">Zamanlı Görevler</h4>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sistem günde 3 kez (08:00, 12:00, 23:00) kapsamlı kontroller yapar ve 
                  detaylı raporları Telegram'a gönderir.
                </p>
              </div>

              {/* Price Tracking */}
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-yellow-400" />
                  </div>
                  <h4 className="text-white font-semibold">Fiyat Geçmişi</h4>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Tüm fiyat değişiklikleri veritabanında saklanır. Trend analizi ve geçmiş 
                  veriler ile en iyi satış stratejilerini belirleyebilirsiniz.
                </p>
              </div>

              {/* Intelligent Notifications */}
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <h4 className="text-white font-semibold">Akıllı Bildirimler</h4>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sistem önemli fiyat değişikliklerini (&gt;%20) yüksek öncelikli olarak işaretler. 
                  Filtrelenmiş bildirimler ile sadece önemli güncellemeler alırsınız.
                </p>
              </div>

              {/* Error Management */}
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <Settings className="w-5 h-5 text-orange-400" />
                  </div>
                  <h4 className="text-white font-semibold">Hata Yönetimi</h4>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sistem otomatik olarak hataları tespit eder ve düzeltmeye çalışır. 
                  Engellenme durumlarında alternatif yöntemler devreye girer.
                </p>
              </div>
            </div>

            <div className="mt-8 text-center">
              <div className="bg-slate-700/30 border border-slate-600/40 rounded-xl p-4">
                <p className="text-slate-300 text-sm">
                  <strong className="text-white">💡 İpucu:</strong> Dashboard'daki tüm veriler 30 saniyede bir otomatik olarak güncellenir. 
                  Sistem 7/24 çalışarak işinizi kolaylaştırır ve manuel takip gerektirmez.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackingDashboard;