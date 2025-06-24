import { sendDailyReport, generateDailyReport } from './email-service';

class DailyScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private reportEmail: string = process.env.GMAIL_USER || 'admin@turmarkt.com'; // Gmail hesabı

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
      console.log('📊 Generating daily report...');
      
      const reportData = await generateDailyReport();
      const success = await sendDailyReport(reportData, this.reportEmail);
      
      if (success) {
        console.log(`✅ Daily report sent successfully to ${this.reportEmail}`);
        return true;
      } else {
        console.log('❌ Failed to send daily report');
        return false;
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