import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger, type UserConfig } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
// TEMPORARY WORKAROUND: Cannot import viteConfig due to top-level await causing parsing errors
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isReplit = process.env.REPL_ID !== undefined;
const viteLogger = createLogger();

// Override error handler to prevent process.exit(1)
const originalError = viteLogger.error;
viteLogger.error = (msg: string, options?: any) => {
  // Log to stderr synchronously to ensure it's visible
  process.stderr.write(`❌ VITE ERROR: ${msg}\n`);
  if (options?.error) {
    process.stderr.write(`Error details: ${options.error.stack || options.error}\n`);
  }
  // Call original error but don't let it exit the process
  try {
    originalError.call(viteLogger, msg, options);
  } catch (e) {
    // Ignore if it tries to exit
  }
  // Throw instead of exit so we can catch it
  throw new Error(`Vite error: ${msg}`);
};

// WORKAROUND: Inline Vite config factory to bypass vite.config.ts top-level await issue
// This mirrors vite.config.ts but skips the problematic @replit/vite-plugin-cartographer
function createInlineViteConfig(): UserConfig {
  return {
    plugins: [
      react(),
      ...(isReplit ? [runtimeErrorOverlay()] : []),
      themePlugin(),
      // Cartographer plugin intentionally skipped - it uses top-level await which breaks config parsing
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "..", "client", "src"),
        "@shared": path.resolve(__dirname, "..", "shared"),
      },
    },
    root: path.resolve(__dirname, "..", "client"),
    server: {
      watch: {
        ignored: [
          path.resolve(__dirname, "..", "server") + "/**",
          path.resolve(__dirname, "..", "dist") + "/**",
          path.resolve(__dirname, "..", "temp") + "/**",
          path.resolve(__dirname, "..", "exports") + "/**",
          path.resolve(__dirname, "..", "data") + "/**",
        ],
      },
    },
    build: {
      outDir: path.resolve(__dirname, "..", "dist"),
      emptyOutDir: true,
    },
  };
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupViteForReplit(app: Express, server: Server) {
  const replitHost = process.env.REPL_SLUG && process.env.REPL_OWNER 
    ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : undefined;

  const serverOptions = {
    middlewareMode: true,
    hmr: replitHost ? {
      server,
      host: replitHost,
      protocol: 'wss' as const,
      clientPort: 443,
    } : { server },
    allowedHosts: true as const,
  };

  console.log(`🔧 Vite HMR Config: ${replitHost ? `Replit mode (${replitHost})` : 'Local mode'}`);
  process.stderr.write(`🔧 Using inline Vite config (bypassing vite.config.ts top-level await issue)\n`);

  const vite = await createViteServer({
    ...createInlineViteConfig(),
    configFile: false,
    customLogger: viteLogger,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
