import { telegramIntegration } from './telegram-integration';

export async function sendCSVUploadNotification(data: {
  totalProducts: number;
  totalVariants: number;
  filename: string;
  uploadedToShopify?: boolean;
}) {
  try {
    const message = 
      `📊 CSV TOPLU YÜKLEME TAMAMLANDI\n\n` +
      `📁 Dosya: ${data.filename}\n` +
      `📦 Toplam Ürün: ${data.totalProducts}\n` +
      `🎯 Toplam Varyant: ${data.totalVariants}\n` +
      `💰 Kar Marjı: %15 uygulandı\n` +
      `📈 Satış Fiyatı: Otomatik hesaplandı\n\n` +
      (data.uploadedToShopify ? 
        `✅ Shopify'a yüklendi\n` +
        `🔗 Ürünler mağazada aktif\n` +
        `📱 Stok takibi başlatıldı` :
        `📋 CSV dosyası hazır\n` +
        `⬆️ Shopify'a yüklenmeye hazır`
      ) +
      `\n\n🚀 TurMarkt Otomasyonu`;

    await telegramIntegration.sendNotification(message);
    console.log('CSV upload notification sent via Telegram');
    return true;
  } catch (error) {
    console.error('Failed to send CSV upload notification:', error);
    return false;
  }
}

export async function sendBulkProcessingNotification(data: {
  processedCount: number;
  totalCount: number;
  currentProduct: string;
  batchNumber: number;
}) {
  try {
    const progress = Math.round((data.processedCount / data.totalCount) * 100);
    
    const message = 
      `⚙️ TOPLU İŞLEM DEVAM EDİYOR\n\n` +
      `📊 İlerleme: ${data.processedCount}/${data.totalCount} (%${progress})\n` +
      `📦 Şu An: ${data.currentProduct}\n` +
      `🔢 Batch: ${data.batchNumber}\n` +
      `⏳ Durum: İşleniyor...\n\n` +
      `🚀 TurMarkt Otomasyonu`;

    await telegramIntegration.sendNotification(message);
    console.log('Bulk processing notification sent via Telegram');
    return true;
  } catch (error) {
    console.error('Failed to send bulk processing notification:', error);
    return false;
  }
}