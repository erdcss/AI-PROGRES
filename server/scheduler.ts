import { sendDailyReport, generateDailyReport } from './email-service';
import { sendDailyReportSendGrid } from './sendgrid-service';
import { telegramIntegration } from './telegram-integration';
import { sendTelegramZReport } from './telegram-z-report';

class DailyScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private reportEmail: string = 'e2943592@gmail.com'; // Güncellenmiş email

  constructor() {
    this.startDailyScheduler();
  }

  setReportEmail(email: string) {
    this.reportEmail = email;
    console.log(`📧 Daily report email updated to: ${email}`);
  }

  private startDailyScheduler() {
    // Her gün saat 23:30'da rapor gönder
    const scheduleDaily = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 30, 0, 0); // 23:30:00

      const msUntilTomorrow = tomorrow.getTime() - now.getTime();
      
      setTimeout(async () => {
        await this.sendDailyReport();
        // Bir sonraki gün için programla
        this.startDailyScheduler();
      }, msUntilTomorrow);

      console.log(`📅 Next daily report scheduled for: ${tomorrow.toLocaleString('tr-TR')}`);
    };

    scheduleDaily();
  }

  async sendDailyReport(): Promise<boolean> {
    try {
      console.log('📊 Günlük rapor gönderiliyor...');
      
      // SendGrid ile gönderim önceliği
      const sendGridSuccess = await sendDailyReportSendGrid(this.reportEmail);
      
      if (sendGridSuccess) {
        console.log('✅ SendGrid ile günlük rapor başarıyla gönderildi');
        
        // Telegram Z raporu gönder
        await sendTelegramZReport();
        
        return true;
      } else {
        console.log('⚠️ SendGrid başarısız, Gmail alternatifi deneniyor...');
        const reportData = await generateDailyReport();
        const gmailSuccess = await sendDailyReport(reportData, this.reportEmail);
        
        if (gmailSuccess) {
          console.log('✅ Gmail ile günlük rapor başarıyla gönderildi');
          
          // Telegram Z raporu gönder
          await sendTelegramZReport();
          
          return true;
        } else {
          console.log('❌ Tüm email servisleri başarısız');
          
          // Telegram'da hata bildirimi ve yine de Z raporu dene
          await sendTelegramZReport();
          await telegramIntegration.sendNotification(
            '⚠️ EMAIL SERVİSİ HATASI\n\n' +
            `📧 Hedef: ${this.reportEmail}\n` +
            `🕰️ Zaman: ${new Date().toLocaleString('tr-TR')}\n` +
            '❌ Email gönderilemedi\n' +
            '✅ Telegram raporu gönderildi\n\n' +
            '🔧 Email ayarlarını kontrol edin'
          );
          
          return false;
        }
      }
    } catch (error) {
      console.error('Daily report error:', error);
      return false;
    }
  }

  // Test için manuel rapor gönderme
  async sendTestReport(): Promise<boolean> {
    console.log('🧪 Sending test daily report...');
    try {
      const reportData = await generateDailyReport();
      const success = await sendDailyReport(reportData, this.reportEmail);
      
      // Test Telegram bildirimi
      if (success) {
        await telegramIntegration.sendNotification(
          '🧪 TEST Z RAPORU\n\n' +
          `📧 Email: ${this.reportEmail}\n` +
          `🕰️ Test Zamanı: ${new Date().toLocaleString('tr-TR')}\n` +
          '✅ Test raporu başarıyla gönderildi\n\n' +
          '📋 Bu bir test mesajıdır. Günlük raporlar 23:30\'da otomatik gönderilecek.'
        );
      }
      
      console.log(`Test report result: ${success ? 'SUCCESS' : 'FAILED'}`);
      return success;
    } catch (error) {
      console.error('Test report error:', error);
      return false;
    }
  }

  // Scheduler'ı durdur
  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      console.log('📅 Daily scheduler stopped');
    }
  }
}

export const dailyScheduler = new DailyScheduler();