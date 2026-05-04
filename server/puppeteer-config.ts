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
  // Priority 0: NixOS sistem Chromium (libglib ve diğer kütüphaneler tam)
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

  // Priority 2: Puppeteer cache (son çare — NixOS'ta libglib eksik olabilir)
  const puppeteerCachePath = path.join(process.env.HOME || '/home/runner', '.cache/puppeteer/chrome');
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
    protocolTimeout: 120000, // 120s — production deployment için yeterli süre
    timeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--single-process',
      '--disable-extensions'
    ]
  };
  
  // Merge args if provided
  if (overrides.args) {
    defaults.args = [...(defaults.args || []), ...overrides.args];
  }
  
  return { ...defaults, ...overrides, args: defaults.args };
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
