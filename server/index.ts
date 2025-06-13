import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./fixed-routes";
import { setupVite, serveStatic, log } from "./vite";
import * as pathModule from "path";
import { fileURLToPath } from 'url';
import * as fs from "fs";

console.log("Uygulama başlatılıyor...");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API kök dizini için bilgi mesajı
app.get('/api', (req, res) => {
  res.send('Ürün Çekme Uygulaması API Çalışıyor! API rotalarını kullanabilirsiniz.');
});

// CSV önizleme endpoint'ini erken kaydet (Vite'dan önce)
app.post("/api/csv-preview-file", (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ message: "Dosya adı gerekli" });
    }
    const filePath = pathModule.resolve(process.cwd(), 'temp', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "CSV dosyası bulunamadı" });
    }
    
    // CSV dosyasını oku
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const rows = fileContent.split('\n');
    
    if (rows.length === 0) {
      return res.status(400).json({ message: "CSV dosyası boş" });
    }
    
    // Başlık satırını ayır
    const headers = rows[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
    
    const preview = {
      filePath,
      headers,
      totalRows: rows.length - 1
    };
    
    return res.status(200).json(preview);
  } catch (error) {
    return res.status(500).json({ 
      message: "CSV önizleme hatası", 
      error: String(error) 
    });
  }
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
    console.error('Error:', err);
    // throw err; // Hata fırlatmayı engelliyoruz, bu sunucuyu durdurabiliyor
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
  const port = 5000; // Portu 5000 olarak ayarlıyoruz
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Please visit the application at http://localhost:${port}`);
  });
})();
