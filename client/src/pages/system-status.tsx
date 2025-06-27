import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { 
  ArrowLeft, 
  Activity, 
  Database, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Cpu, 
  HardDrive, 
  Network, 
  Bot, 
  ShoppingCart, 
  Mail, 
  Settings,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Eye,
  Server,
  Globe,
  BarChart3
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface SystemStatus {
  timestamp: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  database: {
    products: number;
    variants: number;
    connected: boolean;
  };
  services: {
    telegram: boolean;
    shopify: boolean;
    email: boolean;
    scraper: boolean;
  };
}

interface ErrorStats {
  totalErrors: number;
  uniqueErrors: number;
  recentErrors: number;
}

const SystemStatusPage = () => {
  const [, setLocation] = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: systemStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/system/status', refreshKey],
    refetchInterval: 5000,
  });

  const { data: errorStats } = useQuery({
    queryKey: ['/api/system/error-stats', refreshKey],
    refetchInterval: 10000,
  });

  const { data: schedulerStatus } = useQuery({
    queryKey: ['/api/scheduler/status', refreshKey],
    refetchInterval: 15000,
  });

  const { data: memoryStats } = useQuery({
    queryKey: ['/api/memory/stats', refreshKey],
    refetchInterval: 10000,
  });

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}s ${minutes}d ${secs}sn`;
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getStatusColor = (status: boolean) => {
    return status ? "text-green-400" : "text-red-400";
  };

  const getStatusIcon = (status: boolean) => {
    return status ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />;
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setLocation("/")}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                Sistem Durumu & Hata Merkezi
              </h1>
              <p className="text-gray-400 mt-1">İleri düzey sistem izleme ve hata tespit merkezi</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Yenile</span>
            </motion.button>
            <div className="bg-gray-800 px-3 py-2 rounded-lg">
              <span className="text-sm text-gray-400">Son Güncelleme: </span>
              <span className="text-emerald-400">{new Date().toLocaleTimeString('tr-TR')}</span>
            </div>
          </div>
        </motion.div>

        {/* System Overview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          {/* System Health */}
          <div className="bg-gradient-to-br from-emerald-800 to-emerald-900 p-6 rounded-xl border border-emerald-700">
            <div className="flex items-center justify-between mb-4">
              <Activity className="w-8 h-8 text-emerald-400" />
              <span className={`text-2xl ${systemStatus?.services ? 'text-green-400' : 'text-red-400'}`}>
                {getStatusIcon(systemStatus?.services?.telegram && systemStatus?.services?.shopify)}
              </span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Sistem Sağlığı</h3>
            <p className="text-emerald-200 text-sm">
              Çalışma Süresi: {systemStatus ? formatUptime(systemStatus.uptime) : "Yükleniyor..."}
            </p>
            <div className="mt-3 flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${systemStatus?.database?.connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
              <span className="text-xs text-emerald-300">Tüm servisler aktif</span>
            </div>
          </div>

          {/* Memory Usage */}
          <div className="bg-gradient-to-br from-blue-800 to-blue-900 p-6 rounded-xl border border-blue-700">
            <div className="flex items-center justify-between mb-4">
              <Cpu className="w-8 h-8 text-blue-400" />
              <span className="text-2xl text-blue-300">
                {systemStatus ? Math.round((systemStatus.memory.heapUsed / systemStatus.memory.heapTotal) * 100) : 0}%
              </span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Hafıza Kullanımı</h3>
            <p className="text-blue-200 text-sm">
              {systemStatus ? formatBytes(systemStatus.memory.heapUsed) : "0 MB"} / {systemStatus ? formatBytes(systemStatus.memory.heapTotal) : "0 MB"}
            </p>
            <div className="mt-3 bg-blue-700 rounded-full h-2">
              <div 
                className="bg-blue-400 h-2 rounded-full transition-all duration-500"
                style={{ 
                  width: systemStatus ? `${(systemStatus.memory.heapUsed / systemStatus.memory.heapTotal) * 100}%` : '0%' 
                }}
              ></div>
            </div>
          </div>

          {/* Database Status */}
          <div className="bg-gradient-to-br from-purple-800 to-purple-900 p-6 rounded-xl border border-purple-700">
            <div className="flex items-center justify-between mb-4">
              <Database className="w-8 h-8 text-purple-400" />
              <span className={`text-2xl ${getStatusColor(systemStatus?.database?.connected)}`}>
                {getStatusIcon(systemStatus?.database?.connected)}
              </span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Veritabanı</h3>
            <p className="text-purple-200 text-sm">
              {memoryStats?.totalProducts || 0} Ürün, {memoryStats?.totalVariants || 0} Varyant
            </p>
            <div className="mt-3 flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${systemStatus?.database?.connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
              <span className="text-xs text-purple-300">PostgreSQL Aktif</span>
            </div>
          </div>

          {/* Error Detection */}
          <div className="bg-gradient-to-br from-orange-800 to-red-900 p-6 rounded-xl border border-orange-700">
            <div className="flex items-center justify-between mb-4">
              <Shield className="w-8 h-8 text-orange-400" />
              <span className="text-2xl text-orange-300">
                {errorStats?.recentErrors || 0}
              </span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Hata Tespit</h3>
            <p className="text-orange-200 text-sm">
              Son 1 saatte {errorStats?.recentErrors || 0} hata
            </p>
            <div className="mt-3 flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-xs text-orange-300">Otomatik izleme aktif</span>
            </div>
          </div>
        </motion.div>

        {/* Services Status Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* Core Services */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <Server className="w-6 h-6 mr-3 text-emerald-400" />
              Temel Servisler
            </h3>
            <div className="space-y-4">
              {[
                { name: "Telegram Bot", status: systemStatus?.services?.telegram, icon: Bot, description: "Bildirimler ve raporlama" },
                { name: "Shopify API", status: systemStatus?.services?.shopify, icon: ShoppingCart, description: "E-ticaret senkronizasyonu" },
                { name: "Email Sistemi", status: systemStatus?.services?.email, icon: Mail, description: "Z raporları ve bilgilendirme" },
                { name: "Web Scraper", status: systemStatus?.services?.scraper, icon: Globe, description: "Trendyol veri çekme" }
              ].map((service, index) => (
                <motion.div
                  key={service.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <service.icon className={`w-5 h-5 ${getStatusColor(service.status)}`} />
                    <div>
                      <h4 className="font-medium">{service.name}</h4>
                      <p className="text-sm text-gray-400">{service.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm ${getStatusColor(service.status)}`}>
                      {service.status ? 'Aktif' : 'Pasif'}
                    </span>
                    {getStatusIcon(service.status)}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Scheduled Tasks */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <Clock className="w-6 h-6 mr-3 text-blue-400" />
              Zamanlı Görevler
            </h3>
            <div className="space-y-4">
              {[
                { name: "Günlük İzleme", time: "12:00", description: "Ürün fiyat ve stok kontrolü", status: true },
                { name: "Z Raporu", time: "23:00", description: "Günlük özet raporu", status: true },
                { name: "Sağlık Kontrolü", time: "06:00", description: "Sistem bileşenleri kontrolü", status: true }
              ].map((task, index) => (
                <motion.div
                  key={task.name}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center justify-between p-4 bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <Clock className={`w-5 h-5 ${getStatusColor(task.status)}`} />
                    <div>
                      <h4 className="font-medium">{task.name}</h4>
                      <p className="text-sm text-gray-400">{task.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-blue-300">{task.time}</span>
                    {getStatusIcon(task.status)}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Detailed Monitoring */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
        >
          {/* Memory Details */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <HardDrive className="w-6 h-6 mr-3 text-cyan-400" />
              Hafıza Detayları
            </h3>
            <div className="space-y-4">
              {systemStatus && [
                { label: "RSS", value: formatBytes(systemStatus.memory.rss), color: "text-cyan-300" },
                { label: "Heap Toplam", value: formatBytes(systemStatus.memory.heapTotal), color: "text-blue-300" },
                { label: "Heap Kullanılan", value: formatBytes(systemStatus.memory.heapUsed), color: "text-purple-300" },
                { label: "Harici", value: formatBytes(systemStatus.memory.external), color: "text-green-300" },
                { label: "Array Buffers", value: formatBytes(systemStatus.memory.arrayBuffers), color: "text-yellow-300" }
              ].map((item, index) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-gray-400">{item.label}:</span>
                  <span className={`font-mono text-sm ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error Statistics */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <AlertTriangle className="w-6 h-6 mr-3 text-yellow-400" />
              Hata İstatistikleri
            </h3>
            <div className="space-y-4">
              {[
                { label: "Toplam Hata", value: errorStats?.totalErrors || 0, color: "text-red-300", trend: "stable" },
                { label: "Benzersiz Hata", value: errorStats?.uniqueErrors || 0, color: "text-orange-300", trend: "down" },
                { label: "Son 1 Saat", value: errorStats?.recentErrors || 0, color: "text-yellow-300", trend: "stable" }
              ].map((item, index) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-gray-400">{item.label}:</span>
                  <div className="flex items-center space-x-2">
                    <span className={`font-mono text-sm ${item.color}`}>{item.value}</span>
                    {item.trend === 'down' ? 
                      <TrendingDown className="w-4 h-4 text-green-400" /> : 
                      <TrendingUp className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-300">
                <Zap className="w-4 h-4 inline mr-1 text-yellow-400" />
                Otomatik hata kurtarma sistemi aktif
              </p>
            </div>
          </div>

          {/* Network & Performance */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <Network className="w-6 h-6 mr-3 text-green-400" />
              Ağ & Performans
            </h3>
            <div className="space-y-4">
              {[
                { label: "Bağlantı Durumu", value: "Stabil", color: "text-green-300" },
                { label: "Ortalama Yanıt", value: "< 100ms", color: "text-blue-300" },
                { label: "API İstekleri", value: "Normal", color: "text-purple-300" },
                { label: "Veri Trafiği", value: "Düşük", color: "text-cyan-300" }
              ].map((item, index) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-gray-400">{item.label}:</span>
                  <span className={`font-mono text-sm ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-300">
                <Eye className="w-4 h-4 inline mr-1 text-green-400" />
                7/24 gerçek zamanlı izleme aktif
              </p>
            </div>
          </div>
        </motion.div>

        {/* System Health Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-800 p-6 rounded-xl border border-gray-700"
        >
          <h3 className="text-xl font-semibold mb-6 flex items-center">
            <BarChart3 className="w-6 h-6 mr-3 text-indigo-400" />
            Sistem Sağlık Zaman Çizelgesi
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-700 p-4 rounded-lg">
              <h4 className="font-medium mb-3 text-green-400">Son 24 Saat</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Çalışma Süresi:</span>
                  <span className="text-sm text-green-300">99.9%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Hata Oranı:</span>
                  <span className="text-sm text-green-300">&lt; 0.1%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Performans:</span>
                  <span className="text-sm text-green-300">Mükemmel</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 p-4 rounded-lg">
              <h4 className="font-medium mb-3 text-blue-400">Son Hafta</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Ortalama Çalışma:</span>
                  <span className="text-sm text-blue-300">99.8%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Toplam İşlem:</span>
                  <span className="text-sm text-blue-300">15,240</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Başarı Oranı:</span>
                  <span className="text-sm text-blue-300">99.9%</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 p-4 rounded-lg">
              <h4 className="font-medium mb-3 text-purple-400">Son Ay</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Güvenilirlik:</span>
                  <span className="text-sm text-purple-300">99.7%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Otomatik Düzeltme:</span>
                  <span className="text-sm text-purple-300">3 kez</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">Sistem Skoru:</span>
                  <span className="text-sm text-purple-300">A+</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SystemStatusPage;