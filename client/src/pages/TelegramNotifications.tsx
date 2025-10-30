import { TelegramNotificationPanel } from '@/components/TelegramNotificationPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function TelegramNotifications() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-slate-900 to-cyan-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-black/95 via-slate-900/90 to-cyan-900/80 backdrop-blur-sm border-b border-cyan-800/30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setLocation('/')}
              variant="outline"
              className="business-button px-4 py-2"
              data-testid="button-back-home"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Ana Sayfa
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Telegram Bildirim Yönetimi</h1>
              <p className="text-sm text-slate-400">Telegram bildirimlerinizi yönetin ve geçmişi görüntüleyin</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <TelegramNotificationPanel />
      </div>
    </div>
  );
}
