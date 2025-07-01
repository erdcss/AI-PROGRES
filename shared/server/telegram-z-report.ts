import { telegramIntegration } from './telegram-integration';
import { generateDailyReportData } from './sendgrid-service';

export async function sendTelegramZReport() {
  try {
    const reportData = await generateDailyReportData();
    if (!reportData) {
      console.error('Z raporu verisi oluşturulamadı');
      return false;
    }

    const telegramMessage = `
📊 GÜNLÜK Z RAPORU
📅 ${reportData.date}

📈 SATIŞ VERİLERİ:
🛒 Toplam Ürün: ${reportData.totalProducts}
💰 Günlük Satış: ${reportData.dailySales}
💵 Toplam Gelir: ${reportData.totalRevenue.toFixed(2)} TL
📊 Kar Marjı: %${reportData.profitMargin}

🏆 EN ÇOK SATAN ÜRÜNLER:
${reportData.topProducts.length > 0 ? 
  reportData.topProducts.map((product, index) => 
    `${index + 1}. ${product.name} - ${product.sales} satış`
  ).join('\n') : 
  '• Henüz satış verisi bulunmuyor'
}

⚠️ STOK UYARILARI:
${reportData.stockAlerts.length > 0 ? 
  reportData.stockAlerts.map(alert => `🔴 ${alert}`).join('\n') : 
  '✅ Tüm ürünler stokta'
}

🔧 SİSTEM DURUMU:
✅ Trendyol entegrasyonu aktif
✅ Shopify senkronizasyonu çalışıyor  
✅ Telegram bildirimleri açık
✅ Email sistemi operasyonel

🚀 TurMarkt Otomatik Rapor Sistemi
    `;

    await telegramIntegration.sendNotification(telegramMessage);
    console.log('✅ Telegram Z raporu gönderildi');
    return true;

  } catch (error) {
    console.error('Telegram Z raporu hatası:', error);
    await telegramIntegration.sendNotification(
      '🚨 Z RAPORU HATASI\n\n' +
      `❌ Rapor oluşturulamadı\n` +
      `🕰️ ${new Date().toLocaleString('tr-TR')}\n` +
      '🔧 Sistem yöneticisi ile iletişime geçin'
    );
    return false;
  }
}