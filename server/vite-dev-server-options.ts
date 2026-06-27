import type { Server as HttpServer } from "http";
import type { ServerOptions as ViteServerOptions } from "vite";
import viteConfig from "../vite.config";

const isReplit = process.env.REPL_ID !== undefined;
/** Yerel dev: scrape sırasında HMR kopunca tam sayfa yenilemesin (VITE_HMR=true ile açılır) */
const enableHmr = isReplit || process.env.VITE_HMR === "true";

function normalizeWatchIgnored(ignored: string[] = []): string[] {
  const normalized = ignored.map((pattern) => pattern.replace(/\\/g, "/"));
  const extra = [
    "**/temp/**",
    "**/exports/**",
    "**/data/**",
    "**/server/**",
    "**/shared/**",
    "**/dist/**",
    "**/*.csv",
    "**/html_analysis_*.json",
    "**/.canva-token.json",
    "**/.env",
    "**/.env.*",
  ];
  return [...new Set([...normalized, ...extra])];
}

export function buildViteMiddlewareServerOptions(
  httpServer: HttpServer,
): ViteServerOptions {
  const base = viteConfig.server ?? {};
  const baseHmr =
    typeof base.hmr === "object" && base.hmr !== null ? base.hmr : {};

  return {
    ...base,
    middlewareMode: true,
    allowedHosts: true,
    watch: enableHmr
      ? {
          ...base.watch,
          ignored: normalizeWatchIgnored(
            Array.isArray(base.watch?.ignored) ? base.watch.ignored : [],
          ),
        }
      : null,
    hmr: enableHmr
      ? {
          ...baseHmr,
          server: httpServer,
          overlay: false,
          timeout: 300_000,
        }
      : false,
  };
}
