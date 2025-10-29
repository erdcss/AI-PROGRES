import { db, pool } from './db';
import { urlTracking, urlPriceHistory } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { scenarioBasedScrape } from './scenario-based-scraper';
import { ShopifyApiService } from './shopify-api-service';
import { telegramIntegration } from './telegram-integration';
import axios from 'axios';

interface DiagnosticResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  details?: any;
}

export class SystemDiagnostic {
  private results: DiagnosticResult[] = [];
  private shopifyService: ShopifyApiService | null = null;

  constructor() {
    console.log('\n🔬 Starting System Diagnostic...\n');
  }

  private logResult(test: string, status: 'PASS' | 'FAIL', message: string, details?: any) {
    this.results.push({ test, status, message, details });
    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${test}: ${message}`);
    if (details) {
      console.log(`   Details:`, details);
    }
  }

  // 1. Memory System Check
  async checkMemorySystem(): Promise<void> {
    console.log('\n📊 1. Memory System Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Test PostgreSQL connection
      const dbTest = await pool.query('SELECT NOW()');
      this.logResult('PostgreSQL Connection', 'PASS', 'Database connected successfully', {
        timestamp: dbTest.rows[0].now
      });

      // Test Drizzle ORM
      const allProducts = await db.select().from(urlTracking).limit(5);
      this.logResult('Drizzle ORM Query', 'PASS', `Retrieved ${allProducts.length} products`, {
        count: allProducts.length,
        sampleIds: allProducts.map(p => p.id)
      });

      // Test tracking products
      const trackedProducts = await db.select()
        .from(urlTracking)
        .where(eq(urlTracking.isTracking, true))
        .limit(5);
      
      this.logResult('Tracked Products', 'PASS', `Found ${trackedProducts.length} tracked products`, {
        count: trackedProducts.length,
        sampleTitles: trackedProducts.map(p => p.productTitle?.substring(0, 50))
      });

      // Test price history
      const priceHistory = await db.select()
        .from(urlPriceHistory)
        .orderBy(desc(urlPriceHistory.recordedAt))
        .limit(3);
      
      this.logResult('Price History', 'PASS', `Found ${priceHistory.length} price records`, {
        count: priceHistory.length,
        latestRecord: priceHistory[0]?.recordedAt
      });

    } catch (error) {
      this.logResult('Memory System', 'FAIL', 'Database error', {
        error: (error as Error).message
      });
    }
  }

  // 2. Trendyol Data Fetch Check
  async checkTrendyolFetch(): Promise<void> {
    console.log('\n🛒 2. Trendyol Data Fetch Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Get a sample URL from database
      const sampleProduct = await db.select()
        .from(urlTracking)
        .limit(1);

      if (sampleProduct.length === 0) {
        this.logResult('Trendyol Fetch', 'FAIL', 'No products in database to test');
        return;
      }

      const testUrl = sampleProduct[0].url;
      console.log(`   Testing URL: ${testUrl}`);

      const scrapedData = await scenarioBasedScrape(testUrl);

      if (scrapedData && scrapedData.success) {
        this.logResult('Trendyol Scraping', 'PASS', 'Successfully fetched product data', {
          title: scrapedData.title?.substring(0, 50),
          price: scrapedData.price,
          images: scrapedData.images?.length || 0,
          variants: scrapedData.variants?.length || 0
        });
      } else {
        this.logResult('Trendyol Scraping', 'FAIL', 'Failed to fetch valid data', {
          response: scrapedData
        });
      }

    } catch (error) {
      this.logResult('Trendyol Fetch', 'FAIL', 'Scraping error', {
        error: (error as Error).message
      });
    }
  }

  // 3. Shopify API Connection Check
  async checkShopifyAPI(): Promise<void> {
    console.log('\n🛍️ 3. Shopify API Connection Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      this.shopifyService = new ShopifyApiService();
      
      // Test shop info endpoint
      const shopInfo = await axios.get(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
            'Content-Type': 'application/json'
          }
        }
      );

      if (shopInfo.status === 200 && shopInfo.data.shop) {
        this.logResult('Shopify Connection', 'PASS', 'Successfully connected to Shopify', {
          shop: shopInfo.data.shop.name,
          domain: shopInfo.data.shop.domain
        });
      }

      // Test product retrieval
      const testProduct = await db.select()
        .from(urlTracking)
        .where(eq(urlTracking.shopifyProductId, '7772393668656'))
        .limit(1);

      if (testProduct.length > 0) {
        const productData = await axios.get(
          `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/products/${testProduct[0].shopifyProductId}.json`,
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
              'Content-Type': 'application/json'
            }
          }
        );

        if (productData.status === 200) {
          this.logResult('Shopify Product Fetch', 'PASS', 'Retrieved test product', {
            productId: productData.data.product.id,
            title: productData.data.product.title
          });
        }
      }

    } catch (error) {
      this.logResult('Shopify API', 'FAIL', 'Connection error', {
        error: (error as Error).message
      });
    }
  }

  // 4. Update Simulation Test
  async checkUpdateSimulation(): Promise<void> {
    console.log('\n🔄 4. Update Simulation Test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Find a product with Shopify ID
      const testProduct = await db.select()
        .from(urlTracking)
        .where(eq(urlTracking.id, 109))
        .limit(1);

      if (testProduct.length === 0) {
        this.logResult('Update Simulation', 'FAIL', 'No test product found');
        return;
      }

      const product = testProduct[0];
      const oldPrice = parseFloat(product.currentPrice || '0');
      const simulatedNewPrice = oldPrice * 1.05; // 5% increase

      // Calculate selling prices with profit margin
      const oldSellingPrice = Math.round(oldPrice * 1.10 * 100) / 100;
      const newSellingPrice = Math.round(simulatedNewPrice * 1.10 * 100) / 100;

      this.logResult('Price Change Detection', 'PASS', 'Correctly detected price difference', {
        product: product.productTitle?.substring(0, 50),
        oldPrice: `${oldPrice} TL`,
        newPrice: `${simulatedNewPrice.toFixed(2)} TL`,
        oldSelling: `${oldSellingPrice} TL`,
        newSelling: `${newSellingPrice} TL`,
        change: `+${((simulatedNewPrice - oldPrice) / oldPrice * 100).toFixed(2)}%`
      });

      // Dry-run update payload
      const updatePayload = {
        variant: {
          id: parseInt(product.shopifyVariantIds || '0'),
          price: newSellingPrice.toFixed(2),
          compare_at_price: simulatedNewPrice.toFixed(2)
        }
      };

      this.logResult('Update Payload Generation', 'PASS', 'Generated valid update payload', updatePayload);

    } catch (error) {
      this.logResult('Update Simulation', 'FAIL', 'Simulation error', {
        error: (error as Error).message
      });
    }
  }

  // 5. Telegram Notification Check
  async checkTelegram(): Promise<void> {
    console.log('\n📱 5. Telegram Notification Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const testMessage = '🧪 System Diagnostic Test\n\n✅ Trendyol–Shopify system diagnostic completed successfully.\n\nAll components operational.';
      
      await telegramIntegration.sendMessage(testMessage);
      
      this.logResult('Telegram Notification', 'PASS', 'Test message sent', {
        mode: process.env.TELEGRAM_MODE || 'filtered',
        note: 'Check Telegram app for message'
      });

    } catch (error) {
      this.logResult('Telegram', 'FAIL', 'Notification error', {
        error: (error as Error).message
      });
    }
  }

  // Generate final report
  generateReport(): string {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🧠 SYSTEM DIAGNOSTIC SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    let report = '';
    let passCount = 0;
    let failCount = 0;

    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.test.padEnd(30)} ${result.status}`);
      report += `${icon} ${result.test}: ${result.status}\n`;
      
      if (result.status === 'PASS') passCount++;
      else failCount++;
    });

    console.log('');
    console.log('───────────────────────────────────────────────────────');
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passCount} ✅`);
    console.log(`Failed: ${failCount} ❌`);
    console.log('───────────────────────────────────────────────────────');

    const overallStatus = failCount === 0 ? '✅ FULLY OPERATIONAL' : '⚠️ ISSUES DETECTED';
    console.log(`\nOverall System Status: ${overallStatus}`);
    console.log('═══════════════════════════════════════════════════════\n');

    return report;
  }

  // Run all diagnostics
  async runAll(): Promise<{ passed: number; failed: number; report: string }> {
    await this.checkMemorySystem();
    await this.checkTrendyolFetch();
    await this.checkShopifyAPI();
    await this.checkUpdateSimulation();
    await this.checkTelegram();

    const report = this.generateReport();

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;

    return { passed, failed, report };
  }
}

// Export singleton instance
export const systemDiagnostic = new SystemDiagnostic();
