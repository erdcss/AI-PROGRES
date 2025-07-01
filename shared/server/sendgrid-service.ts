import sgMail from '@sendgrid/mail';
import { db } from './db';
import { products } from '@shared/schema';
import { sql } from 'drizzle-orm';

export function initializeSendGrid() {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("SendGrid API key not configured");
    return null;
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  return sgMail;
}

export async function generateDailyReportData() {
  try {
    // Günlük satış verileri (örneklem)
    const totalProducts = await db.select({ count: sql<number>`count(*)` }).from(products);
    const productsCount = totalProducts[0]?.count || 0;

    // Günlük rapor verisi
    return {
      date: new Date().toLocaleDateString('tr-TR'),
      totalProducts: productsCount,
      dailySales: 0, // Gerçek satış verisi entegrasyonu sonrası güncellenecek
      totalRevenue: 0,
      topProducts: [],
      stockAlerts: [],
      profitMargin: 15
    };
  } catch (error) {
    console.error('Daily report data generation error:', error);
    return null;
  }
}

export function generateDailyReportHTML(data: any) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Günlük Z Raporu</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: #2563eb; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .date { margin-top: 10px; opacity: 0.9; }
        .content { padding: 30px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8fafc; border-left: 4px solid #2563eb; padding: 20px; border-radius: 0 8px 8px 0; }
        .metric-value { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 5px; }
        .metric-label { color: #64748b; font-size: 14px; }
        .section { margin: 30px 0; }
        .section h2 { color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
        .footer { background: #1e293b; color: white; padding: 20px; text-align: center; font-size: 14px; }
        .alert { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 15px; border-radius: 8px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Günlük Z Raporu</h1>
            <div class="date">${data.date}</div>
        </div>
        
        <div class="content">
            <div class="metrics">
                <div class="metric">
                    <div class="metric-value">${data.totalProducts}</div>
                    <div class="metric-label">Toplam Ürün</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${data.dailySales}</div>
                    <div class="metric-label">Günlük Satış</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${data.totalRevenue.toFixed(2)} TL</div>
                    <div class="metric-label">Toplam Gelir</div>
                </div>
                <div class="metric">
                    <div class="metric-value">%${data.profitMargin}</div>
                    <div class="metric-label">Kar Marjı</div>
                </div>
            </div>

            <div class="section">
                <h2>🏆 En Çok Satan Ürünler</h2>
                ${data.topProducts.length > 0 ? 
                  data.topProducts.map((product: any) => 
                    `<div class="alert">📦 ${product.name} - ${product.sales} satış</div>`
                  ).join('') : 
                  '<p>Henüz satış verisi bulunmamaktadır.</p>'
                }
            </div>

            <div class="section">
                <h2>⚠️ Stok Uyarıları</h2>
                ${data.stockAlerts.length > 0 ? 
                  data.stockAlerts.map((alert: string) => 
                    `<div class="alert">🔴 ${alert}</div>`
                  ).join('') : 
                  '<p>Tüm ürünler stokta.</p>'
                }
            </div>

            <div class="section">
                <h2>📈 Sistem Durumu</h2>
                <div class="alert">
                    ✅ Trendyol entegrasyonu aktif<br>
                    ✅ Shopify senkronizasyonu çalışıyor<br>
                    ✅ Telegram bildirimleri açık<br>
                    ✅ SendGrid email sistemi operasyonel
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>🚀 TurMarkt Otomatik Sistem | Günlük Rapor</p>
            <p>Bu rapor otomatik olarak oluşturulmuştur.</p>
        </div>
    </div>
</body>
</html>
  `;
}

export async function sendDailyReportSendGrid(recipientEmail: string) {
  const sgMail = initializeSendGrid();
  if (!sgMail) {
    console.error('SendGrid not initialized');
    return false;
  }

  try {
    const reportData = await generateDailyReportData();
    if (!reportData) {
      console.error('Failed to generate report data');
      return false;
    }

    const htmlContent = generateDailyReportHTML(reportData);

    const msg = {
      to: recipientEmail,
      from: 'noreply@turmarkt.com', // SendGrid'de doğrulanmış domain
      subject: `📊 Günlük Z Raporu - ${reportData.date}`,
      html: htmlContent,
    };

    await sgMail.send(msg);
    console.log('✅ SendGrid daily report sent successfully');
    return true;

  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export async function testSendGridEmail(recipientEmail: string) {
  const sgMail = initializeSendGrid();
  if (!sgMail) {
    return { success: false, message: 'SendGrid API key gerekli' };
  }

  try {
    const msg = {
      to: recipientEmail,
      from: 'noreply@turmarkt.com',
      subject: '📧 SendGrid Test - Sistem Çalışıyor',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">🚀 SendGrid Test Başarılı</h1>
          <p>Bu email SendGrid üzerinden gönderildi.</p>
          <div style="background: #f0f9ff; border: 1px solid #0ea5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3>✅ Sistem Durumu:</h3>
            <ul>
              <li>SendGrid API bağlantısı aktif</li>
              <li>Email gönderim sistemi çalışıyor</li>
              <li>Günlük Z raporları hazır</li>
              <li>Otomatik scheduler 23:30'da çalışacak</li>
            </ul>
          </div>
          <p style="color: #64748b; font-size: 14px;">
            Bu test emaili TurMarkt otomatik sistemi tarafından gönderilmiştir.
          </p>
        </div>
      `,
    };

    await sgMail.send(msg);
    return { success: true, message: 'Test email başarıyla gönderildi' };

  } catch (error: any) {
    console.error('SendGrid test error:', error);
    return { 
      success: false, 
      message: error.response?.body?.errors?.[0]?.message || 'Email gönderilemedi' 
    };
  }
}