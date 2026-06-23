import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { PuppeteerLaunchOptions } from 'puppeteer';

// NixOS sistem Chromium yolu — tüm sistem kütüphanelerine erişim var, en güvenilir
const NIXOS_CHROMIUM = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';

/**
 * Get Chromium executable path with intelligent fallback
 * Priority: 0) NixOS system Chromium, 1) System PATH, 2) Puppeteer cache
 */
export function getChromiumPath(): string | undefined {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) {
    console.log(`✅ Using env Chromium: ${envPath}`);
    return envPath;
  }

  // NixOS (Replit) — optional, only if path exists
  if (fs.existsSync(NIXOS_CHROMIUM)) {
    console.log(`✅ Using NixOS Chromium: ${NIXOS_CHROMIUM}`);
    return NIXOS_CHROMIUM;
  }

  // Priority 1: System chromium via PATH
  try {
    const systemChrome = execSync('which chromium-browser || which chromium || which google-chrome', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'] 
    }).trim();
    
    if (systemChrome && fs.existsSync(systemChrome)) {
      console.log(`✅ Using system Chrome: ${systemChrome}`);
      return systemChrome;
    }
  } catch {
    // Silently continue
  }

  // Priority 3: Puppeteer cache (son çare)
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const puppeteerCachePath = homeDir
    ? path.join(homeDir, '.cache/puppeteer/chrome')
    : path.join('/home/runner', '.cache/puppeteer/chrome');
  try {
    if (fs.existsSync(puppeteerCachePath)) {
      const versions = fs.readdirSync(puppeteerCachePath).sort().reverse();
      if (versions.length > 0) {
        const chromePath = path.join(puppeteerCachePath, versions[0], 'chrome-linux64/chrome');
        if (fs.existsSync(chromePath)) {
          console.log(`⚠️ Puppeteer Chrome (NixOS'ta çalışmayabilir): ${chromePath}`);
          return chromePath;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ Puppeteer Chrome cache bulunamadı:', (error as Error).message);
  }

  console.log('ℹ️ Chromium bulunamadı, Puppeteer varsayılanını dener');
  return undefined;
}

/**
 * Build standard Puppeteer launch options with optional overrides
 */
export function buildLaunchOptions(overrides: Partial<PuppeteerLaunchOptions> = {}): PuppeteerLaunchOptions {
  const defaults: PuppeteerLaunchOptions = {
    headless: true,
    executablePath: getChromiumPath(),
    protocolTimeout: 120000,
    timeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      // Anti-detection flags
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--lang=tr-TR',
      '--window-size=1920,1080'
    ]
  };
  
  // Merge args if provided, filtering out --single-process (causes crashes)
  const extraArgs = (overrides.args || []).filter(a => a !== '--single-process');
  defaults.args = [...(defaults.args || []), ...extraArgs];
  
  const { args: _args, ...restOverrides } = overrides;
  return { ...defaults, ...restOverrides, args: defaults.args };
}

/**
 * Ensure Chrome is installed (idempotent)
 * Call this during server bootstrap or first Puppeteer launch
 */
export async function ensureChromium(): Promise<void> {
  try {
    // Check if Chrome already exists
    const chromePath = getChromiumPath();
    if (chromePath && fs.existsSync(chromePath)) {
      console.log('✅ Chrome already available for Puppeteer');
      return;
    }
    
    // Try to check via Puppeteer CLI
    try {
      const list = execSync('npx puppeteer browsers list 2>/dev/null', { encoding: 'utf8' });
      if (list.includes('chrome@')) {
        console.log('✅ Chrome already installed via Puppeteer');
        return;
      }
    } catch {
      // Continue to installation
    }
    
    // Install Chrome
    console.log('📦 Installing Chrome for Puppeteer (this may take a minute)...');
    execSync('npx puppeteer browsers install chrome', { 
      stdio: 'inherit',
      timeout: 120000 // 2 minute timeout
    });
    console.log('✅ Chrome installation complete');
    
  } catch (error) {
    console.error('❌ Failed to ensure Chrome availability:', (error as Error).message);
    console.error('⚠️ Puppeteer will attempt to use default browser, which may fail');
  }
}
