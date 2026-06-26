import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isReplit = process.env.REPL_ID !== undefined;
const enableHmr = isReplit || process.env.VITE_HMR === "true";

export default defineConfig({
  root: path.resolve(__dirname, "client"),
  plugins: [
    react({ fastRefresh: enableHmr }),
    ...(isReplit ? [runtimeErrorOverlay()] : []),
    themePlugin(),
    ...(process.env.NODE_ENV !== "production" && isReplit
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@db": path.resolve(__dirname, "./db"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    watch: enableHmr
      ? {
          ignored: [
            "**/server/**",
            "**/dist/**",
            "**/temp/**",
            "**/exports/**",
            "**/data/**",
            "**/.env",
            "**/.env.*",
            "**/.canva-token.json",
            "**/html_analysis_*.json",
            "**/*.csv",
            "**/node_modules/**",
            "**/.git/**",
          ],
        }
      : null,
    hmr: enableHmr
      ? {
          overlay: false,
          ...(isReplit
            ? {
                clientPort: 443,
                protocol: "wss",
              }
            : {}),
        }
      : false,
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  },
});