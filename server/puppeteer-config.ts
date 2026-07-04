import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { PuppeteerLaunchOptions } from "puppeteer";
import { isCloudRuntime } from "@shared/deploy-runtime";

const NIXOS_CHROMIUM =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser";

export type ChromiumSource =
  | "env"
  | "puppeteer-builtin"
  | "puppeteer-cache"
  | "system-chrome"
  | "system-edge"
  | "nixos"
  | "linux-path"
  | "none";

export type ChromiumResolution = {
  path: string | undefined;
  source: ChromiumSource;
  exists: boolean;
  platform: NodeJS.Platform;
  tried: string[];
};

function fileExists(candidate: string | undefined | null): candidate is string {
  return Boolean(candidate && fs.existsSync(candidate));
}

function pushTried(tried: string[], label: string, candidate?: string | null) {
  tried.push(candidate ? `${label}:${candidate}` : `${label}:missing`);
}

function tryPuppeteerBuiltin(tried: string[]): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require("puppeteer") as {
      executablePath?: () => string;
      default?: { executablePath?: () => string };
    };
    const fn = puppeteer.executablePath ?? puppeteer.default?.executablePath;
    const bundled = fn?.();
    pushTried(tried, "puppeteer-builtin", bundled);
    if (fileExists(bundled)) return bundled;
  } catch {
    pushTried(tried, "puppeteer-builtin", "import-failed");
  }
  return undefined;
}

function tryPuppeteerCache(tried: string[]): string | undefined {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (!homeDir) {
    pushTried(tried, "puppeteer-cache", "no-home");
    return undefined;
  }

  const cacheRoot = path.join(homeDir, ".cache", "puppeteer", "chrome");
  pushTried(tried, "puppeteer-cache-root", cacheRoot);
  if (!fs.existsSync(cacheRoot)) return undefined;

  try {
    const versions = fs.readdirSync(cacheRoot).sort().reverse();
    for (const version of versions) {
      const candidates =
        process.platform === "win32"
          ? [path.join(cacheRoot, version, "chrome-win64", "chrome.exe")]
          : process.platform === "darwin"
            ? [
                path.join(cacheRoot, version, "chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
                path.join(cacheRoot, version, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
              ]
            : [path.join(cacheRoot, version, "chrome-linux64", "chrome")];

      for (const candidate of candidates) {
        pushTried(tried, "puppeteer-cache", candidate);
        if (fileExists(candidate)) return candidate;
      }
    }
  } catch (error) {
    pushTried(tried, "puppeteer-cache", (error as Error).message);
  }
  return undefined;
}

function windowsBrowserCandidates(tried: string[]): string[] {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

  const candidates = [
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  for (const candidate of candidates) {
    pushTried(tried, "windows-system", candidate);
  }
  return candidates;
}

function tryLinuxPath(tried: string[]): string | undefined {
  if (process.platform === "win32") return undefined;
  try {
    const systemChrome = execSync(
      "which chromium-browser || which chromium || which google-chrome",
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    ).trim();
    pushTried(tried, "linux-path", systemChrome);
    if (fileExists(systemChrome)) return systemChrome;
  } catch {
    pushTried(tried, "linux-path", "which-failed");
  }
  return undefined;
}

export function resolveChromiumPath(): ChromiumResolution {
  const tried: string[] = [];
  const platform = process.platform;

  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_PATH?.trim();
  pushTried(tried, "env", envPath);
  if (fileExists(envPath)) {
    return { path: envPath, source: "env", exists: true, platform, tried };
  }

  const builtin = tryPuppeteerBuiltin(tried);
  if (fileExists(builtin)) {
    return { path: builtin, source: "puppeteer-builtin", exists: true, platform, tried };
  }

  const cached = tryPuppeteerCache(tried);
  if (fileExists(cached)) {
    return { path: cached, source: "puppeteer-cache", exists: true, platform, tried };
  }

  if (platform === "win32") {
    for (const candidate of windowsBrowserCandidates(tried)) {
      if (fileExists(candidate)) {
        const source: ChromiumSource = candidate.toLowerCase().includes("edge")
          ? "system-edge"
          : "system-chrome";
        return { path: candidate, source, exists: true, platform, tried };
      }
    }
  }

  if (fileExists(NIXOS_CHROMIUM)) {
    return { path: NIXOS_CHROMIUM, source: "nixos", exists: true, platform, tried };
  }

  const linuxPath = tryLinuxPath(tried);
  if (fileExists(linuxPath)) {
    return { path: linuxPath, source: "linux-path", exists: true, platform, tried };
  }

  return { path: undefined, source: "none", exists: false, platform, tried };
}

export function getChromiumPath(): string | undefined {
  const resolution = resolveChromiumPath();
  const isLocalDev = !isCloudRuntime();

  if (resolution.path && resolution.exists) {
    const logPath =
      isLocalDev || process.env.LOG_CHROMIUM_PATH === "true"
        ? resolution.path
        : `${resolution.path.slice(0, 8)}…${resolution.path.slice(-12)}`;
    console.log(`✅ Chromium (${resolution.source}): ${logPath}`);
    return resolution.path;
  }

  console.error("❌ Chromium bulunamadı", {
    platform: resolution.platform,
    triedKinds: ["env", "puppeteer-builtin", "puppeteer-cache", "system-browsers", "linux-path"],
    hint: "npx puppeteer browsers install chrome",
  });
  return undefined;
}

export function getPuppeteerLaunchTimeoutMs(): number {
  if (isCloudRuntime()) {
    return Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS) || 45_000;
  }
  return Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS) || 60_000;
}

/**
 * Build standard Puppeteer launch options with optional overrides
 */
export function buildLaunchOptions(overrides: Partial<PuppeteerLaunchOptions> = {}): PuppeteerLaunchOptions {
  const launchTimeout = getPuppeteerLaunchTimeoutMs();
  const defaults: PuppeteerLaunchOptions = {
    headless: true,
    executablePath: getChromiumPath(),
    protocolTimeout: launchTimeout,
    timeout: launchTimeout,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--lang=tr-TR",
      "--window-size=1920,1080",
    ],
  };

  const extraArgs = (overrides.args || []).filter((a) => a !== "--single-process");
  defaults.args = [...(defaults.args || []), ...extraArgs];

  const { args: _args, ...restOverrides } = overrides;
  return { ...defaults, ...restOverrides, args: defaults.args };
}

/**
 * Ensure Chrome is installed (idempotent)
 */
export async function ensureChromium(): Promise<void> {
  try {
    const resolution = resolveChromiumPath();
    if (resolution.path && resolution.exists) {
      console.log("✅ Chrome already available for Puppeteer");
      return;
    }

    if (process.platform === "win32") {
      try {
        const list = execSync("npx puppeteer browsers list", { encoding: "utf8", shell: true });
        if (list.includes("chrome@")) {
          console.log("✅ Chrome already installed via Puppeteer");
          return;
        }
      } catch {
        // continue
      }
    } else {
      try {
        const list = execSync("npx puppeteer browsers list 2>/dev/null", { encoding: "utf8" });
        if (list.includes("chrome@")) {
          console.log("✅ Chrome already installed via Puppeteer");
          return;
        }
      } catch {
        // continue
      }
    }

    console.log("📦 Installing Chrome for Puppeteer (this may take a minute)...");
    execSync("npx puppeteer browsers install chrome", {
      stdio: "inherit",
      timeout: 180_000,
      shell: process.platform === "win32",
    });
    console.log("✅ Chrome installation complete");
  } catch (error) {
    console.error("❌ Failed to ensure Chrome availability:", (error as Error).message);
    console.error("⚠️ Puppeteer will attempt to use default browser, which may fail");
  }
}
