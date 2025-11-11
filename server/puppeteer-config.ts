import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { PuppeteerLaunchOptions } from 'puppeteer';

/**
 * Get Chromium executable path with intelligent fallback
 * Priority: 1) Puppeteer cache, 2) System Chrome, 3) undefined (Puppeteer default)
 */
export function getChromiumPath(): string | undefined {
  // Priority 1: Puppeteer cache
  const puppeteerCachePath = path.join(process.env.HOME || '/home/runner', '.cache/puppeteer/chrome');
  
  try {
    if (fs.existsSync(puppeteerCachePath)) {
      const versions = fs.readdirSync(puppeteerCachePath).sort().reverse();
      if (versions.length > 0) {
        const chromePath = path.join(puppeteerCachePath, versions[0], 'chrome-linux64/chrome');
        if (fs.existsSync(chromePath)) {
          console.log(`✅ Using Puppeteer Chrome: ${chromePath}`);
          return chromePath;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to locate Puppeteer Chrome cache:', (error as Error).message);
  }
  
  // Priority 2: System chromium
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
    // Silently continue to fallback
  }
  
  // Priority 3: Let Puppeteer decide
  console.log('ℹ️ No explicit Chrome found, using Puppeteer default');
  return undefined;
}

/**
 * Build standard Puppeteer launch options with optional overrides
 */
export function buildLaunchOptions(overrides: Partial<PuppeteerLaunchOptions> = {}): PuppeteerLaunchOptions {
  const defaults: PuppeteerLaunchOptions = {
    headless: true,
    executablePath: getChromiumPath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
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
