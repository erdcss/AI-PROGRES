import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes-fixed";
import { setupVite, serveStatic, log } from "./vite";
import * as pathModule from "path";
import { fileURLToPath } from 'url';
import * as fs from 'fs';

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

// Direct CSV endpoints - MUST be before Vite middleware
app.get('/api/preview/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
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
    const dataRows = rows.slice(1, 4).map(row => parseCSVRow(row));
    
    console.log('📋 Parsed Data:', {
      headers: headers.length,
      rows: dataRows.length,
      sampleRow: dataRows[0]?.slice(0, 3)
    });
    
    const response = {
      headers: headers.slice(0, 5),
      rows: dataRows,
      totalRows: rows.length - 1,
      filename,
      debug: {
        filePath,
        contentLength: csvContent.length,
        rawHeaders: headers.length,
        rawRows: dataRows.length
      }
    };
    
    res.setHeader('Content-Type', 'application/json');
    return res.json(response);
  } catch (error) {
    console.error('❌ CSV preview error:', error);
    return res.status(500).json({ message: "CSV önizleme hatası", error: String(error) });
  }
});

app.get('/api/download/shopify-urunler.csv', (req, res) => {
  const workspaceFile = '/home/runner/workspace/shopify-urunler.csv';
  const tempFile = '/home/runner/workspace/temp/shopify-urunler.csv';
  
  // Copy from temp to workspace if needed
  if (!fs.existsSync(workspaceFile) && fs.existsSync(tempFile)) {
    fs.copyFileSync(tempFile, workspaceFile);
  }
  
  if (fs.existsSync(workspaceFile)) {
    const csvContent = fs.readFileSync(workspaceFile, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="shopify-urunler.csv"',
      'Cache-Control': 'no-cache'
    });
    res.end(csvContent);
  } else {
    res.status(404).send('CSV file not found');
  }
});

// API kök dizini için bilgi mesajı
app.get('/api', (req, res) => {
  res.send('Ürün Çekme Uygulaması API Çalışıyor! API rotalarını kullanabilirsiniz.');
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
  const server = await registerRoutes(app);

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
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serving the app on port 5000
  // this serves both the API and the client.
  // Port 5000 is expected by the Replit workflow
  const port = 5000;
  
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

  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Please visit the application at http://localhost:${port}`);
  });
})();
