import { getDefaultBrowserPlatform } from "./curl-fetch";

export type BrowserFingerprintProfile = {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  secChUaPlatform: string;
  language: string;
  timezone: string;
};

const WINDOWS_FP: BrowserFingerprintProfile = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1920, height: 1080 },
  platform: "Win32",
  secChUaPlatform: '"Windows"',
  language: "tr-TR",
  timezone: "Europe/Istanbul",
};

const MAC_FP: BrowserFingerprintProfile = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1440, height: 900 },
  platform: "MacIntel",
  secChUaPlatform: '"macOS"',
  language: "tr-TR",
  timezone: "Europe/Istanbul",
};

const LINUX_FP: BrowserFingerprintProfile = {
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 768 },
  platform: "Linux x86_64",
  secChUaPlatform: '"Linux"',
  language: "tr-TR",
  timezone: "Europe/Istanbul",
};

let sessionFingerprint: BrowserFingerprintProfile | null = null;

export function getSessionBrowserFingerprint(): BrowserFingerprintProfile {
  if (sessionFingerprint) return sessionFingerprint;
  const platform = getDefaultBrowserPlatform();
  if (platform === "Win32") sessionFingerprint = { ...WINDOWS_FP };
  else if (platform === "MacIntel") sessionFingerprint = { ...MAC_FP };
  else sessionFingerprint = { ...LINUX_FP };
  return sessionFingerprint;
}

export function resetSessionBrowserFingerprint(): void {
  sessionFingerprint = null;
}
