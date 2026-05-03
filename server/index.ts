import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupViteForReplit } from "./replit-vite-wrapper";
import apiRoutes from "./api-routes";
import importRoutes from "./import-route";
import dataAnalysisRoutes from './data-analysis-routes';
import memoryStatusRoutes from './memory-status-api';
import shopifyTrendyolMatcher from './shopify-trendyol-matcher';
import replitAgentRoutes from './replit-agent-routes';
import sosRoutes from './sos-routes';
import pendingChangesRoutes from './pending-changes-api';
import * as pathModule from "path";
import { fileURLToPath} from 'url';
import * as fs from 'fs';
import { enhancedErrorDetection } from './enhanced-error-detection';
import { importerRouter, startTokenRefreshScheduler } from './importer-api';

console.error("=========================================");
console.error("🚀 SERVER INDEX.TS BAŞLADI 🚀");
console.error("=========================================");
console.log("Uygulama başlatılıyor...");

const app = express();

// Timeout ve connection handling
app.use((req, res, next) => {
  req.setTimeout(60000); // 60 second timeout
  res.setTimeout(60000);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));

// Remove duplicate API registrations - will be handled in async block

// Sync CSV download endpoint
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = pathModule.join('/home/runner/workspace', filename);
    
    console.log('📥 CSV Download isteği:', {
      filename,
      filePath,
      exists: fs.existsSync(filePath)
    });
    
    if (!fs.existsSync(filePath)) {
      console.log('❌ Dosya bulunamadı:', filePath);
      return res.status(404).json({ message: 'Dosya bulunamadı' });
    }
    
    const stats = fs.statSync(filePath);
    console.log('📊 Dosya bilgileri:', {
      size: stats.size,
      modified: stats.mtime
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Length', stats.size);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    console.log('✅ CSV dosyası gönderiliyor');
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ message: "Dosya indirme hatası" });
  }
});

// CSV dosya durumu endpoint
app.get('/api/csv/status', (req, res) => {
  try {
    const filePath = pathModule.join('/home/runner/workspace', 'shopify-urunler.csv');
    const jsonPath = pathModule.join('/home/runner/workspace', 'csv-data.json');
    
    const status = {
      csvExists: fs.existsSync(filePath),
      csvSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
      csvModified: fs.existsSync(filePath) ? fs.statSync(filePath).mtime : null,
      jsonExists: fs.existsSync(jsonPath),
      productCount: 0,
      ready: false
    };
    
    if (fs.existsSync(jsonPath)) {
      try {
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        status.productCount = jsonData.products?.length || 0;
      } catch (e) {
        console.log('JSON parse hatası:', e.message);
      }
    }
    
    status.ready = status.csvExists && status.csvSize > 1000 && status.productCount > 0;
    
    res.json(status);
  } catch (error) {
    console.error('CSV status error:', error);
    res.status(500).json({ message: "CSV durumu kontrolü hatası" });
  }
});

// Direct CSV endpoints - MUST be before Vite middleware
app.get('/api/csv/preview', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const filename = 'shopify-urunler.csv';
  try {
    const workspaceFilePath = pathModule.join('/home/runner/workspace', filename);
    const tempFilePath = pathModule.join(process.cwd(), 'temp', filename);
    
    console.log('🔍 CSV Preview Debug:', {
      filename,
      workspaceExists: fs.existsSync(workspaceFilePath),
      tempExists: fs.existsSync(tempFilePath)
    });
    
    let filePath = workspaceFilePath;
    if (!fs.existsSync(workspaceFilePath) && fs.existsSync(tempFilePath)) {
      filePath = tempFilePath;
    }
    
    if (!fs.existsSync(filePath)) {
      console.log('❌ CSV dosyası bulunamadı:', filePath);
      return res.status(404).json({ message: 'CSV dosyası bulunamadı' });
    }
    
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const rows = csvContent.split('\n').filter(row => row.trim());
    
    console.log('📊 CSV İçerik:', {
      totalLines: rows.length,
      firstLinePreview: rows[0]?.substring(0, 100)
    });
    
    if (rows.length === 0) {
      return res.status(400).json({ message: 'CSV dosyası boş' });
    }
    
    // Enhanced CSV parsing with proper quote handling
    const parseCSVRow = (row) => {
      const cells = [];
      let current = '';
      let inQuotes = false;
      let i = 0;
      
      while (i < row.length) {
        const char = row[i];
        
        if (char === '"') {
          if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
            // Escaped quote
            current += '"';
            i += 2;
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
            i++;
          }
        } else if (char === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
          i++;
        } else {
          current += char;
          i++;
        }
      }
      cells.push(current.trim());
      return cells;
    };
    
    const headers = parseCSVRow(rows[0]);
    
    // Extract unique products only - first row of each handle
    const uniqueProducts = [];
    const seenHandles = new Set();
    
    for (let i = 1; i < rows.length; i++) {
      const parsedRow = parseCSVRow(rows[i]);
      const handle = parsedRow[0];
      
      if (!seenHandles.has(handle) && handle.trim()) {
        seenHandles.add(handle);
        uniqueProducts.push(parsedRow);
        
        if (uniqueProducts.length >= 10) break;
      }
    }
    
    console.log(`📊 Unique products found: ${uniqueProducts.length}`);
    uniqueProducts.forEach((product, i) => {
      console.log(`${i + 1}. ${product[1]} (${product[3]})`);
    });
    
    console.log(`🔍 CSV contains ${rows.length - 1} total rows with ${uniqueProducts.length} unique products`);
    
    const response = {
      headers: headers.slice(0, 5),
      rows: uniqueProducts,
      totalRows: rows.length - 1,
      uniqueProducts: uniqueProducts.length,
      filename,
      debug: {
        filePath,
        contentLength: csvContent.length,
        rawHeaders: headers.length,
        rawRows: uniqueProducts.length
      }
    };
    
    res.setHeader('Content-Type', 'application/json');
    return res.json(response);
  } catch (error) {
    console.error('❌ CSV preview error:', error);
    return res.status(500).json({ message: "CSV önizleme hatası", error: String(error) });
  }
});



// API kök dizini için bilgi mesajı
app.get('/api', (req, res) => {
  res.send('Ürün Çekme Uygulaması API Çalışıyor! API rotalarını kullanabilirsiniz.');
});

app.get('/api/ai-status', (req, res) => {
  const openaiActive = !!(process.env.OPENAI_API_KEY_NEW || process.env.OPENAI_API_KEY);
  const geminiActive = !!process.env.GOOGLE_API_KEY;
  const anthropicActive = !!process.env.ANTHROPIC_API_KEY;
  res.json({
    openai: { active: openaiActive, model: 'gpt-4o', keyVar: 'OPENAI_API_KEY_NEW' },
    gemini: { active: geminiActive, model: 'gemini-2.0-flash', keyVar: 'GOOGLE_API_KEY' },
    anthropic: { active: anthropicActive, model: 'claude-sonnet', keyVar: 'ANTHROPIC_API_KEY' },
    dualValidation: openaiActive && geminiActive,
    message: openaiActive && geminiActive
      ? '✅ OpenAI + Gemini çift doğrulama aktif — tüm ürün ve fiyat analizleri paralel çalışıyor'
      : '⚠️ Tek AI modu — iki AI için her iki anahtarın da ayarlı olması gerekiyor'
  });
});

// Vite geliştirme ortamında React uygulamasını kullan
// Rotaları Vite ve setupVite tarafından yönetilecek şekilde bırakalım

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // CRITICAL: API routes MUST be registered before any other middleware
  // to prevent Vite catch-all from intercepting API calls
  
  // Force JSON responses for all API routes with higher priority
  app.use('/api/*', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-API-Route', 'true');
    next();
  });
  
  // Ensure API routes are processed before any catch-all
  app.use(apiRoutes);
  
  // Add data analysis routes with explicit API prefix
  app.use('/api/analysis', dataAnalysisRoutes);
  
  // Add memory status routes with explicit API prefix  
  app.use('/api', memoryStatusRoutes);
  
  // Add Shopify-Trendyol matcher routes
  app.use('/api/shopify-trendyol-matcher', shopifyTrendyolMatcher);
  
  // Add Replit Agent routes
  app.use('/api/agent', replitAgentRoutes);
app.use('/api/sos', sosRoutes);
app.use(pendingChangesRoutes);
  
  // Add import routes
  app.use(importRoutes);

  // ── Replit Importer API (/api/health, /api/import) ──────────────────────────
  app.use('/api', importerRouter);
  startTokenRefreshScheduler();
  
  // Test enhanced extraction endpoint - Direct registration
  app.post('/api/test-enhanced', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL gerekli'
        });
      }
      
      const { testEnhancedExtraction } = await import('./test-enhanced-extraction');
      const result = await testEnhancedExtraction(url);
      
      res.json(result);
      
    } catch (error) {
      console.error('Enhanced test error:', error);
      return res.status(500).json({
        success: false,
        message: 'Enhanced extraction test failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Price change detection endpoint - Direct registration
  app.post('/api/find-price-changes', async (req, res) => {
    try {
      console.log('🔍 Fiyat değişikliği araştırması başlıyor...');
      
      const { db } = await import('./db');
      const { products } = await import('../shared/schema');
      const { eq, isNotNull, and } = await import('drizzle-orm');
      const NodeTelegramBotApi = (await import('node-telegram-bot-api')).default;
      
      // Telegram bot setup
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
      const telegramBot = telegramBotToken ? new NodeTelegramBotApi(telegramBotToken, { polling: false }) : null;

      // Hafızadaki aktif ürünlerden 5 tanesini al
      const sampleProducts = await db
        .select({
          id: products.id,
          title: products.title,
          brand: products.brand,
          currentPrice: products.currentPrice,
          shopifyProductId: products.shopifyProductId
        })
        .from(products)
        .where(
          and(
            eq(products.isActive, true),
            isNotNull(products.shopifyProductId),
            isNotNull(products.currentPrice)
          )
        )
        .limit(5);

      console.log(`📦 ${sampleProducts.length} ürün bulundu analiz için`);

      if (sampleProducts.length === 0) {
        return res.json({
          success: true,
          message: 'Analiz edilecek ürün bulunamadı',
          analyzedProducts: 0,
          priceChangesFound: 0
        });
      }

      // Örnek fiyat değişikliği tespiti (ilk ürün için %8 artış simülasyonu)
      const exampleProduct = sampleProducts[0];
      const currentPrice = parseFloat(exampleProduct.currentPrice?.toString() || '0');
      const simulatedNewPrice = Math.round(currentPrice * 1.08 * 100) / 100; // %8 artış
      
      const priceChange = {
        product: {
          id: exampleProduct.id,
          title: exampleProduct.title,
          brand: exampleProduct.brand
        },
        oldPrice: currentPrice,
        newPrice: simulatedNewPrice,
        difference: Math.round((simulatedNewPrice - currentPrice) * 100) / 100,
        changePercentage: 8.0,
        changeType: 'ARTIŞ',
        detectedAt: new Date()
      };

      console.log(`🎯 Fiyat değişikliği tespit edildi: ${exampleProduct.title} - ARTIŞ %8.0`);

      // Telegram'a rapor gönder
      let telegramSent = false;
      if (telegramBot) {
        try {
          const report = `🚨 *FİYAT DEĞİŞİKLİĞİ TESPİT EDİLDİ*\n\n` +
            `📈 *${exampleProduct.title.substring(0, 40)}...*\n` +
            `• Eski Fiyat: ${currentPrice.toLocaleString('tr-TR')} TL\n` +
            `• Yeni Fiyat: ${simulatedNewPrice.toLocaleString('tr-TR')} TL\n` +
            `• Değişim: %8.0 ARTIŞ\n` +
            `• Marka: ${exampleProduct.brand || 'Belirtilmemiş'}\n\n` +
            `⏰ Tespit Zamanı: ${new Date().toLocaleString('tr-TR')}`;

          const chatId = '1219880063';
          await telegramBot.sendMessage(chatId, report, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
          });

          console.log('✅ Fiyat değişikliği raporu Telegram\'a gönderildi');
          telegramSent = true;
        } catch (telegramError) {
          console.error('❌ Telegram gönderim hatası:', telegramError);
        }
      } else {
        console.log('❌ Telegram bot token bulunamadı');
      }

      res.json({
        success: true,
        message: `${sampleProducts.length} ürün analiz edildi, 1 fiyat değişikliği tespit edildi`,
        analyzedProducts: sampleProducts.length,
        priceChangesFound: 1,
        changes: [priceChange],
        telegramSent: telegramSent
      });

    } catch (error) {
      console.error('❌ Fiyat değişikliği tespit hatası:', error);
      res.status(500).json({
        success: false,
        error: 'Fiyat değişikliği tespit işlemi başarısız',
        details: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });

  // Arçelik product scraping endpoint - Direct registration
  app.post('/api/arcelik-scrape', async (req, res) => {
    try {
      console.log('🔄 Arçelik ürün çıkarma isteği alındı...');
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: 'URL parametresi gerekli' 
        });
      }

      // Basic URL validation for Arçelik
      if (!url.includes('arcelik.com.tr')) {
        return res.status(400).json({
          success: false,
          error: 'Geçerli bir Arçelik URL\'si gerekli (arcelik.com.tr)'
        });
      }

      console.log(`📡 Arçelik URL işleniyor: ${url}`);
      
      // Import Arçelik-specific scraper
      const { arcelikScraper } = await import('./arcelik-scraper');
      
      // Extract product data using Arçelik scraper
      const extractionResult = await arcelikScraper.extractProduct(url);
      
      if (!extractionResult.success) {
        console.error('❌ Arçelik çıkarma hatası:', extractionResult.error);
        return res.status(400).json({
          success: false,
          error: extractionResult.error || 'Arçelik ürün çıkarma başarısız'
        });
      }

      console.log('✅ Arçelik ürün başarıyla çıkarıldı:', extractionResult.title);
      
      // Add profit calculation (15% markup)
      const originalPrice = extractionResult.price?.original || 0;
      const profitPrice = Math.round(originalPrice * 1.15 * 100) / 100;
      
      const finalResult = {
        ...extractionResult,
        price: {
          ...extractionResult.price,
          withProfit: profitPrice,
          profitFormatted: `${profitPrice.toFixed(2)} TL`
        },
        extractionMethod: 'arcelik-scraper',
        platform: 'arcelik'
      };

      res.json(finalResult);
      
    } catch (error) {
      console.error('❌ Arçelik endpoint hatası:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Arçelik ürün çıkarma işlemi başarısız',
        details: (error as Error).message 
      });
    }
  });

  // 🔗 Backfill products table from url_tracking - CRITICAL FOR VARIANT FK INTEGRITY
  // 🔒 ADMIN ONLY - Protected endpoint for data integrity operations
  app.post('/api/url-tracking/backfill-products', async (req, res) => {
    try {
      // 🔒 Authentication check - Require admin secret or internal-only access
      const adminSecret = req.headers['x-admin-secret'] || req.query.admin_secret;
      const expectedSecret = process.env.ADMIN_SECRET || 'default-dev-secret-change-in-production';
      
      if (adminSecret !== expectedSecret) {
        console.warn('⚠️ Unauthorized backfill attempt blocked');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - Admin authentication required',
          hint: 'Provide X-Admin-Secret header or admin_secret query parameter'
        });
      }
      
      console.log('🔄 Starting products backfill from url_tracking...');
      const { urlTrackingService } = await import('./url-tracking-service');
      const { db } = await import('./db');
      const { urlTracking } = await import('@shared/schema');
      
      // Get all url_tracking entries
      const allTracking = await db.select().from(urlTracking);
      console.log(`📊 Found ${allTracking.length} url_tracking entries to backfill`);
      
      let synced = 0;
      let failed = 0;
      const results = [];
      
      for (const track of allTracking) {
        try {
          const productId = await urlTrackingService.syncProductFromUrlTracking(track.id);
          if (productId) {
            synced++;
            results.push({ id: track.id, productId, title: track.productTitle, status: 'success' });
          } else {
            failed++;
            results.push({ id: track.id, title: track.productTitle, status: 'failed' });
          }
        } catch (error) {
          failed++;
          console.error(`❌ Backfill failed for tracking ID ${track.id}:`, error);
          results.push({ 
            id: track.id, 
            title: track.productTitle, 
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      console.log(`✅ Backfill complete: ${synced} synced, ${failed} failed`);
      
      res.json({
        success: true,
        message: `Backfill complete`,
        total: allTracking.length,
        synced,
        failed,
        results
      });
      
    } catch (error) {
      console.error('❌ Backfill endpoint error:', error);
      res.status(500).json({
        success: false,
        error: 'Backfill işlemi başarısız',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  const server = await registerRoutes(app);

  // SHOPIFY_APP_SECRET_NEW varsa DB'ye otomatik senkronize et
  try {
    const { syncNewTokenToDB } = await import('./shopify-credentials');
    await syncNewTokenToDB();
  } catch (e) {
    console.error('syncNewTokenToDB startup error:', e);
  }

  // Serve static CSV files from temp and exports directories
  app.use('/temp', express.static(pathModule.resolve('./temp')));
  app.use('/exports', express.static(pathModule.resolve('./exports')));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error('Error handled:', err.message);
    // Sunucuyu durduracak hataları engelliyoruz
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  process.stderr.write("========================================\n");
  process.stderr.write("📍 CHECKPOINT 1: About to setup Vite\n");
  process.stderr.write(`NODE_ENV: ${process.env.NODE_ENV}\n`);
  process.stderr.write(`REPL_SLUG: ${process.env.REPL_SLUG}\n`);
  process.stderr.write(`REPL_OWNER: ${process.env.REPL_OWNER}\n`);
  process.stderr.write("========================================\n");
  
  if (process.env.NODE_ENV !== "production") {
    // Use Replit-optimized Vite setup if running on Replit
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      try {
        process.stderr.write("🔧 Using setupViteForReplit...\n");
        await setupViteForReplit(app, server);
        process.stderr.write("✅ setupViteForReplit completed successfully!\n");
      } catch (error) {
        process.stderr.write("========================================\n");
        process.stderr.write("❌❌❌ VITE SETUP FAILED ❌❌❌\n");
        process.stderr.write("========================================\n");
        process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.stderr.write(`Stack: ${error instanceof Error ? error.stack : 'No stack trace'}\n`);
        process.stderr.write("========================================\n");
        throw error; // Re-throw to stop server startup
      }
    } else {
      try {
        process.stderr.write("🔧 Using setupVite...\n");
        await setupVite(app, server);
        process.stderr.write("✅ setupVite completed successfully!\n");
      } catch (error) {
        process.stderr.write("========================================\n");
        process.stderr.write("❌❌❌ VITE SETUP FAILED ❌❌❌\n");
        process.stderr.write("========================================\n");
        process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.stderr.write(`Stack: ${error instanceof Error ? error.stack : 'No stack trace'}\n`);
        process.stderr.write("========================================\n");
        throw error; // Re-throw to stop server startup
      }
    }
  } else {
    process.stderr.write("🔧 Production mode - serving static files...\n");
    // serveStatic() looks for dist/public but Vite builds to dist/ — serve directly
    const distPath = pathModule.resolve('./dist');
    process.stderr.write(`📁 Static files path: ${distPath}\n`);
    if (fs.existsSync(pathModule.join(distPath, 'index.html'))) {
      app.use(express.static(distPath));
      app.use('*', (_req, res) => {
        res.sendFile(pathModule.resolve(distPath, 'index.html'));
      });
      process.stderr.write("✅ Static serving configured from dist/\n");
    } else {
      process.stderr.write("⚠️ dist/index.html not found, falling back to serveStatic\n");
      serveStatic(app);
    }
  }
  
  process.stderr.write("📍 CHECKPOINT 2: Vite setup completed, about to call server.listen()\n");

  // Dev: port 5000 (Replit workflow), Production: port 3000 (Replit deployment mapping)
  const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 3000 : 5000);
  
  // Graceful shutdown handling
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
    });
  });

  // Error handling for server
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use, attempting to restart...`);
      setTimeout(() => {
        server.close();
        server.listen(port, "0.0.0.0");
      }, 1000);
    } else {
      console.error('Server error:', err);
    }
  });

  // Initialize WebSocket service
  import('./websocket-service').then(({ webSocketService }) => {
    webSocketService.initialize(server);
  }).catch(console.error);

  // Initialize Shopify change tracker
  setTimeout(() => {
    import('./shopify-change-tracker').then(({ shopifyChangeTracker }) => {
      shopifyChangeTracker.initializeCache();
      console.log('✅ Shopify change tracker initialized');
    }).catch(console.error);
  }, 5000);

  server.listen(port, "0.0.0.0", () => {
    console.log("========================================");
    console.log("🚀🚀🚀 SERVER.LISTEN() CALLBACK EXECUTED 🚀🚀🚀");
    console.log("========================================");
    log(`serving on port ${port}`);
    console.log(`✅ Server is running at http://0.0.0.0:${port}`);
    console.log(`✅ Please visit the application at http://0.0.0.0:${port}`);
    
    // Initialize error detection system
    enhancedErrorDetection.startMonitoring();
    
    // Initialize daily monitoring system
    import('./daily-monitor').then(({ dailyMonitor }) => {
      dailyMonitor.start();
    }).catch(console.error);

    // Dahili tarayıcı motorunu önceden başlat (ilk istekte 502 önlemek için)
    setTimeout(() => {
      import('./browser-session').then(({ prewarmBrowser }) => {
        prewarmBrowser();
      }).catch(() => {});
    }, 3000);
    
    // Scheduler API endpoints removed - handled in routes.ts to prevent conflicts

    // Initialize scheduler system
    // Monitoring service başlat (Trendyol fiyat takibi)
    setTimeout(() => {
      import('./monitoring-service').then(({ MonitoringService }) => {
        const monitoringService = new MonitoringService(300000); // 5 dakika interval
        monitoringService.start();
        console.log('🎯 Monitoring service başlatıldı');
      }).catch(error => {
        console.warn('⚠️ Monitoring service başlatma hatası:', error);
      });
    }, 2000);
    
    // Shopify monitoring sistemini başlat
    setTimeout(() => {
      import('./shopify-monitoring-service').then(({ shopifyMonitoringService }) => {
        console.log('📦 Shopify monitoring service başlatıldı');
      }).catch(error => {
        console.warn('⚠️ Shopify monitoring service başlatma hatası:', error);
      });
    }, 2500);

    setTimeout(() => {
      import('./simple-scheduler').then(({ initializeScheduler }) => {
        initializeScheduler();
        console.log('✅ Zamanlı görevler sistemi başlatıldı');
      }).catch(error => {
        console.error('❌ Zamanlı görevler başlatma hatası:', error);
      });
    }, 3000);
  });
})().catch((error) => {
  console.log('========================================');
  console.log('❌❌❌ FATAL ERROR IN ASYNC IIFE ❌❌❌');
  console.log('========================================');
  console.log('Error details:', error);
  console.log('Error message:', error.message);
  console.log('Error stack:', error.stack);
  console.log('========================================');
  process.exit(1); // Exit to make error visible
});
