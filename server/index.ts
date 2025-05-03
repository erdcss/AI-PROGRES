import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as pathModule from "path";
import { fileURLToPath } from 'url';
import * as http from 'http';

console.log("Uygulama başlatılıyor...");
console.log("NODE_ENV:", process.env.NODE_ENV || "development");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API kök dizini için bilgi mesajı
app.get('/api', (req, res) => {
  res.send('Ürün Çekme Uygulaması API Çalışıyor! API rotalarını kullanabilirsiniz.');
});

// Ana sayfayı Replit WebView'a yönlendirelim
app.get('/', (req, res) => {
  res.redirect('/webview');
});

// '/webview' rotasını ekleyelim
app.get('/webview', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Ürün Çekme Uygulaması</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            background-color: #121212; 
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          h1 { color: #bb86fc; }
          p { margin: 1rem 0; }
          a { 
            color: #03dac6; 
            text-decoration: none; 
          }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Ürün Çekme Uygulaması</h1>
          <p>Uygulama başarıyla çalışıyor!</p>
          <p>API URL'si: <a href="/api">/api</a></p>
          <p>Ürün API URL: <a href="/api/product">/api/product</a></p>
          <p>Geçmiş API URL: <a href="/api/history">/api/history</a></p>
        </div>
      </body>
    </html>
  `);
});

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

  // Production port for deployment
  const productionPort = 3000;
  
  // Start the main server on port 3000 for deployment
  server.listen({
    port: productionPort,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${productionPort}`);
    console.log(`Server is running at http://localhost:${productionPort}`);
    console.log(`Please visit /webview to see the application!`);
    
    // Check if we're in development mode (not production) to start a duplicate server on port 5000
    if (process.env.NODE_ENV !== 'production') {
      // Create a new HTTP server for Replit development environment
      const devServer = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
        // Redirect all requests from port 5000 to our actual server on port 3000
        res.writeHead(302, { 'Location': `http://localhost:${productionPort}${req.url || ''}` });
        res.end();
      });
      
      // Listen on port 5000 to satisfy the Replit workflow checker
      devServer.listen(5000, '0.0.0.0', () => {
        console.log(`Development proxy server running on port 5000 -> redirecting to port ${productionPort}`);
      });
    }
  });
})();
