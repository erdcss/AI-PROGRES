import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  AlertTriangle, 
  ArrowLeft, 
  Shield, 
  Database, 
  ShoppingCart, 
  MessageSquare,
  Trash2,
  Unlink,
  Eye,
  EyeOff,
  Lock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SOSControl = () => {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAuth = () => {
    // Using the same password as login (turmarkt123)
    if (password === 'turmarkt123') {
      setIsAuthenticated(true);
      toast({
        title: "Giriş Başarılı",
        description: "S.O.S Kontrol Paneline hoş geldiniz",
      });
    } else {
      toast({
        title: "Hatalı Şifre",
        description: "Lütfen doğru şifreyi girin",
        variant: "destructive"
      });
    }
  };

  const executeAction = async (action: string) => {
    setIsLoading(true);
    try {
      let endpoint = '';
      let message = '';
      
      switch (action) {
        case 'clear_memory':
          endpoint = '/api/memory/clear-all';
          message = 'Hafıza verileri temizlendi';
          break;
        case 'disconnect_shopify':
          endpoint = '/api/sos/disconnect-shopify';
          message = 'Shopify bağlantısı kesildi';
          break;
        case 'disconnect_telegram':
          endpoint = '/api/sos/disconnect-telegram';
          message = 'Telegram bağlantısı kesildi';
          break;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast({
          title: "İşlem Başarılı",
          description: message,
        });
      } else {
        throw new Error('Operation failed');
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "İşlem gerçekleştirilemedi",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setShowConfirmDialog(null);
    }
  };

  const getActionDetails = (action: string) => {
    switch (action) {
      case 'clear_memory':
        return {
          title: 'Hafıza Verilerini Temizle',
          description: 'Bu işlem sistemdeki tüm ürün verilerini, varyantları, fiyat geçmişi ve stok bilgilerini kalıcı olarak silecektir.',
          consequences: [
            '• Tüm ürün verileri silinecek',
            '• Varyant bilgileri kaybolacak',
            '• Fiyat geçmişi temizlenecek',
            '• Stok takibi sıfırlanacak',
            '• Bu işlem geri alınamaz!'
          ],
          color: 'red'
        };
      case 'disconnect_shopify':
        return {
          title: 'Shopify Bağlantısını Kes',
          description: 'Bu işlem Shopify API bağlantısını devre dışı bırakacak ve otomatik senkronizasyonu durduracaktır.',
          consequences: [
            '• Shopify API erişimi kesilecek',
            '• Otomatik fiyat güncellemeleri duracak',
            '• Stok senkronizasyonu devre dışı kalacak',
            '• Yeni ürün yüklemeleri engellenecek',
            '• Manuel olarak yeniden bağlanmanız gerekecek'
          ],
          color: 'orange'
        };
      case 'disconnect_telegram':
        return {
          title: 'Telegram Bağlantısını Kes',
          description: 'Bu işlem Telegram bot bağlantısını devre dışı bırakacak ve tüm bildirimleri durduracaktır.',
          consequences: [
            '• Telegram bildirimleri duracak',
            '• Günlük raporlar gönderilmeyecek',
            '• Sistem uyarıları iletilmeyecek',
            '• Bot komutları çalışmayacak',
            '• Manuel olarak yeniden etkinleştirmeniz gerekecek'
          ],
          color: 'blue'
        };
      default:
        return null;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-red-900 via-gray-900 to-black fixed inset-0 overflow-y-auto">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23dc2626%22 fill-opacity=%220.1%22%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
        
        <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-red-500/20 p-8 w-full max-w-md">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">S.O.S Kontrol Paneli</h1>
              <p className="text-red-400 text-sm">Sistem Operasyonları & Güvenlik</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Güvenlik Şifresi
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-red-500 border border-gray-700"
                    placeholder="Şifrenizi girin..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleAuth}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <Lock className="w-5 h-5" />
                <span>Güvenli Giriş</span>
              </button>

              <button
                onClick={() => setLocation("/")}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Ana Sayfaya Dön</span>
              </button>
            </div>

            <div className="mt-6 p-4 bg-red-900/20 rounded-lg border border-red-500/30">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="text-sm text-red-300">
                  <p className="font-medium mb-1">⚠️ UYARI</p>
                  <p>Bu panel kritik sistem operasyonları içerir. Sadece yetkili personel erişebilir.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-red-900 via-gray-900 to-black fixed inset-0 overflow-y-auto">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23dc2626%22 fill-opacity=%220.1%22%3E%3Ccircle cx=%2230%22 cy=%2230%22 r=%221%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
      
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <div className="bg-black/20 backdrop-blur-sm border-b border-red-500/20 p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setLocation("/")}
                className="text-white/70 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Shield className="w-8 h-8 text-red-500" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">S.O.S Kontrol Paneli</h1>
                  <p className="text-sm text-red-400">Sistem Operasyonları & Güvenlik</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-red-400">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span>Kritik Erişim</span>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Sistem Kontrol Merkezine Hoş Geldiniz</h2>
            <p className="text-gray-300">Aşağıdaki kritik operasyonları dikkatli bir şekilde kullanın. Her işlem geri alınamaz sonuçlara yol açabilir.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Clear Memory Button */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-black/40 backdrop-blur-sm rounded-xl border border-red-500/20 p-6"
            >
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mb-4">
                  <Database className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Hafıza Temizle</h3>
                <p className="text-gray-400 text-sm mb-4">Tüm ürün verilerini kalıcı olarak sil</p>
                <button
                  onClick={() => setShowConfirmDialog('clear_memory')}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Hafızayı Temizle</span>
                </button>
              </div>
            </motion.div>

            {/* Disconnect Shopify Button */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-black/40 backdrop-blur-sm rounded-xl border border-orange-500/20 p-6"
            >
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-orange-600/20 rounded-full flex items-center justify-center mb-4">
                  <ShoppingCart className="w-8 h-8 text-orange-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Shopify Bağlantısı</h3>
                <p className="text-gray-400 text-sm mb-4">API bağlantısını devre dışı bırak</p>
                <button
                  onClick={() => setShowConfirmDialog('disconnect_shopify')}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <Unlink className="w-5 h-5" />
                  <span>Bağlantıyı Kes</span>
                </button>
              </div>
            </motion.div>

            {/* Disconnect Telegram Button */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-black/40 backdrop-blur-sm rounded-xl border border-blue-500/20 p-6"
            >
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Telegram Bağlantısı</h3>
                <p className="text-gray-400 text-sm mb-4">Bot bağlantısını devre dışı bırak</p>
                <button
                  onClick={() => setShowConfirmDialog('disconnect_telegram')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <Unlink className="w-5 h-5" />
                  <span>Bağlantıyı Kes</span>
                </button>
              </div>
            </motion.div>
          </div>

          {/* Safety Information */}
          <div className="mt-8 p-6 bg-red-900/20 rounded-xl border border-red-500/30">
            <div className="flex items-start space-x-4">
              <AlertTriangle className="w-6 h-6 text-red-500 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-red-400 mb-2">Güvenlik Uyarısı</h3>
                <ul className="text-gray-300 space-y-1 text-sm">
                  <li>• Bu işlemler geri alınamaz ve sistem üzerinde kalıcı etkiler yaratır</li>
                  <li>• Her işlem öncesi onay ekranı görüntülenecektir</li>
                  <li>• İşlemler log sistemine kaydedilir ve izlenebilir</li>
                  <li>• Sadece acil durumlarda bu operasyonları kullanın</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 rounded-xl border border-red-500/30 p-6 w-full max-w-lg"
          >
            {(() => {
              const details = getActionDetails(showConfirmDialog);
              if (!details) return null;

              return (
                <div>
                  <div className="text-center mb-6">
                    <div className={`mx-auto w-16 h-16 bg-${details.color}-600/20 rounded-full flex items-center justify-center mb-4`}>
                      <AlertTriangle className={`w-8 h-8 text-${details.color}-500`} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{details.title}</h3>
                    <p className="text-gray-300 text-sm">{details.description}</p>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-red-400 mb-3">Bu işlemin sonuçları:</h4>
                    <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/30">
                      {details.consequences.map((consequence, index) => (
                        <p key={index} className="text-gray-300 text-sm mb-1">{consequence}</p>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowConfirmDialog(null)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg transition-colors"
                    >
                      İptal Et
                    </button>
                    <button
                      onClick={() => executeAction(showConfirmDialog)}
                      disabled={isLoading}
                      className={`flex-1 bg-${details.color}-600 hover:bg-${details.color}-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50`}
                    >
                      {isLoading ? 'İşleniyor...' : 'Onayla ve Uygula'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SOSControl;