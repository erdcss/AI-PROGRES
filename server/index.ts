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

// CSV download route - MUST be before Vite middleware
app.get('/csv/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!filename.endsWith('.csv')) {
    return res.status(400).send('Invalid file type');
  }
  
  const filepath = pathModule.join(process.cwd(), 'temp', filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).send('File not found');
  }
  
  const csvContent = fs.readFileSync(filepath, 'utf8');
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache'
  });
  res.send(csvContent);
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
