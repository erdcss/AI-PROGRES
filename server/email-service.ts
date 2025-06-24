import nodemailer from 'nodemailer';

// Gmail SMTP configuration
const createGmailTransporter = () => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("Gmail credentials not configured");
    return null;
  }

  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
};

interface DailyReportData {
  date: string;
  totalProducts: number;
  totalRevenue: number;
  totalProfit: number;
  topProducts: Array<{
    name: string;
    sales: number;
    revenue: number;
    profit: number;
  }>;
  stockAlerts: Array<{
    name: string;
    currentStock: number;
    variant: string;
  }>;
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    const transporter = createGmailTransporter();
    if (!transporter) {
      console.log('Gmail credentials not configured, skipping email');
      return false;
    }

    await transporter.sendMail({
      from: params.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    
    console.log(`✅ Email sent successfully to ${params.to}`);
    return true;
  } catch (error) {
    console.error('Gmail email error:', error);
    return false;
  }
}

export async function sendDailyReport(reportData: DailyReportData, recipientEmail: string): Promise<boolean> {
  const fromEmail = process.env.GMAIL_USER || 'turmarkt@gmail.com'; // Gmail hesabı

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .header p { margin: 5px 0 0 0; opacity: 0.9; }
        .content { padding: 30px 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; }
        .stat-number { font-size: 24px; font-weight: bold; color: #28a745; margin-bottom: 5px; }
        .stat-label { color: #6c757d; font-size: 14px; }
        .section { margin-bottom: 30px; }
        .section h3 { color: #495057; border-bottom: 2px solid #e9ecef; padding-bottom: 10px; margin-bottom: 15px; }
        .product-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f1f1; }
        .product-name { font-weight: 500; color: #495057; }
        .product-stats { color: #6c757d; font-size: 14px; }
        .alert-item { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 12px; margin-bottom: 8px; }
        .alert-title { font-weight: 500; color: #856404; }
        .alert-details { color: #856404; font-size: 14px; margin-top: 4px; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 12px; }
        .footer a { color: #667eea; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Günlük Z Raporu</h1>
          <p>${reportData.date}</p>
        </div>
        
        <div class="content">
          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${reportData.totalProducts}</div>
              <div class="stat-label">Toplam Ürün</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${reportData.totalRevenue.toLocaleString('tr-TR')} ₺</div>
              <div class="stat-label">Toplam Cirο</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${reportData.totalProfit.toLocaleString('tr-TR')} ₺</div>
              <div class="stat-label">Toplam Kar</div>
            </div>
          </div>

          ${reportData.topProducts.length > 0 ? `
          <div class="section">
            <h3>🏆 En Çok Satan Ürünler</h3>
            ${reportData.topProducts.map(product => `
            <div class="product-item">
              <div class="product-name">${product.name}</div>
              <div class="product-stats">${product.sales} satış • ${product.revenue.toLocaleString('tr-TR')} ₺ ciro • ${product.profit.toLocaleString('tr-TR')} ₺ kar</div>
            </div>
            `).join('')}
          </div>
          ` : ''}

          ${reportData.stockAlerts.length > 0 ? `
          <div class="section">
            <h3>⚠️ Stok Uyarıları</h3>
            ${reportData.stockAlerts.map(alert => `
            <div class="alert-item">
              <div class="alert-title">${alert.name}</div>
              <div class="alert-details">${alert.variant} - Kalan: ${alert.currentStock} adet</div>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="footer">
          <p>Bu rapor Turmarkt otomatik sistem tarafından oluşturulmuştur.</p>
          <p><a href="https://turmarkt.com">turmarkt.com</a> | Otomatik E-posta Bildirimi</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
GÜNLÜK Z RAPORU - ${reportData.date}

ÖZET:
- Toplam Ürün: ${reportData.totalProducts}
- Toplam Ciro: ${reportData.totalRevenue.toLocaleString('tr-TR')} ₺
- Toplam Kar: ${reportData.totalProfit.toLocaleString('tr-TR')} ₺

${reportData.topProducts.length > 0 ? `
EN ÇOK SATAN ÜRÜNLER:
${reportData.topProducts.map(p => `- ${p.name}: ${p.sales} satış, ${p.revenue.toLocaleString('tr-TR')} ₺ ciro`).join('\n')}
` : ''}

${reportData.stockAlerts.length > 0 ? `
STOK UYARILARI:
${reportData.stockAlerts.map(a => `- ${a.name} (${a.variant}): ${a.currentStock} adet kaldı`).join('\n')}
` : ''}

Bu rapor otomatik olarak oluşturulmuştur.
  `;

  return await sendEmail({
    to: recipientEmail,
    from: fromEmail,
    subject: `📊 Günlük Z Raporu - ${reportData.date}`,
    html: htmlContent,
    text: textContent
  });
}

export async function generateDailyReport(): Promise<DailyReportData> {
  // Bu fonksiyon database'den günlük verileri çekecek
  const today = new Date().toLocaleDateString('tr-TR');
  
  // Mock data - gerçekte database'den çekilecek
  return {
    date: today,
    totalProducts: 15,
    totalRevenue: 12450.50,
    totalProfit: 1867.58,
    topProducts: [
      { name: "Tanay Ceylon Çayı 750gr", sales: 8, revenue: 4830.00, profit: 630.00 },
      { name: "Çaykur Altınbaş Çay 500gr", sales: 5, revenue: 2310.00, profit: 385.00 },
      { name: "Premium Siyah Çay", sales: 3, revenue: 1425.75, profit: 213.86 }
    ],
    stockAlerts: [
      { name: "Ceylon Çayı", currentStock: 5, variant: "750gr" },
      { name: "Earl Grey", currentStock: 2, variant: "500gr" }
    ]
  };
}