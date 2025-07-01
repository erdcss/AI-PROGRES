import { Router } from 'express';
import { FilteredTelegramNotifier } from './filtered-telegram-notifier';

const filteredTelegramNotifier = new FilteredTelegramNotifier();

const router = Router();

// Disconnect Shopify API
router.post('/disconnect-shopify', async (req, res) => {
  try {
    // Log the operation for security
    console.log('🚨 S.O.S: Shopify bağlantısı kesiliyor...');
    
    // Clear Shopify environment variables or set them to inactive
    // This is a soft disconnect - doesn't permanently delete credentials
    process.env.SHOPIFY_DISABLE = 'true';
    
    // Send Telegram notification
    await filteredTelegramNotifier.sendSOSAlert(
      'Shopify API bağlantısı devre dışı bırakıldı. Otomatik senkronizasyon durduruldu.'
    );
    
    console.log('✅ Shopify bağlantısı devre dışı bırakıldı');
    
    res.json({
      success: true,
      message: 'Shopify bağlantısı başarıyla kesildi',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Shopify bağlantısı kesme hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Shopify bağlantısı kesilemedi'
    });
  }
});

// Disconnect Telegram Bot
router.post('/disconnect-telegram', async (req, res) => {
  try {
    // Log the operation for security
    console.log('🚨 S.O.S: Telegram bağlantısı kesiliyor...');
    
    // Send final notification before disconnecting
    await filteredTelegramNotifier.sendSOSAlert(
      'Telegram bot bağlantısı devre dışı bırakılıyor. Bu son bildirimdir.'
    );
    
    // Disable Telegram functionality
    process.env.TELEGRAM_DISABLE = 'true';
    
    console.log('✅ Telegram bağlantısı devre dışı bırakıldı');
    
    res.json({
      success: true,
      message: 'Telegram bağlantısı başarıyla kesildi',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Telegram bağlantısı kesme hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Telegram bağlantısı kesilemedi'
    });
  }
});

// System Status Check for S.O.S Panel
router.get('/status', async (req, res) => {
  try {
    const status = {
      shopify: {
        connected: !process.env.SHOPIFY_DISABLE,
        lastCheck: new Date().toISOString()
      },
      telegram: {
        connected: !process.env.TELEGRAM_DISABLE,
        lastCheck: new Date().toISOString()
      },
      database: {
        connected: true, // Assuming DB is always connected if server is running
        lastCheck: new Date().toISOString()
      }
    };
    
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ S.O.S status check hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Sistem durumu kontrol edilemedi'
    });
  }
});

// Emergency System Reset (requires confirmation)
router.post('/emergency-reset', async (req, res) => {
  try {
    const { confirmationCode } = req.body;
    
    // Simple confirmation code for emergency reset
    if (confirmationCode !== 'EMERGENCY_RESET_CONFIRMED') {
      return res.status(403).json({
        success: false,
        error: 'Geçersiz onay kodu'
      });
    }
    
    console.log('🚨 S.O.S: ACİL SİSTEM RESET başlatılıyor...');
    
    // Reset all system flags
    delete process.env.SHOPIFY_DISABLE;
    delete process.env.TELEGRAM_DISABLE;
    
    // Send emergency notification
    await filteredTelegramNotifier.sendSOSAlert(
      'ACİL SİSTEM RESET tamamlandı. Tüm bağlantılar yeniden etkinleştirildi.'
    );
    
    console.log('✅ Acil sistem reset tamamlandı');
    
    res.json({
      success: true,
      message: 'Acil sistem reset başarıyla tamamlandı',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Acil sistem reset hatası:', error);
    res.status(500).json({
      success: false,
      error: 'Acil sistem reset gerçekleştirilemedi'
    });
  }
});

export default router;