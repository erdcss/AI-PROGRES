// Platform Detection System
// Automatically detects source platform from URL and provides platform-specific information

export interface PlatformInfo {
  name: string;
  displayName: string;
  color: string;
  icon: string;
  baseUrl: string;
}

export const SUPPORTED_PLATFORMS: Record<string, PlatformInfo> = {
  trendyol: {
    name: 'trendyol',
    displayName: 'Trendyol',
    color: '#FF6000',
    icon: '🛒',
    baseUrl: 'https://www.trendyol.com'
  },
  hepsiburada: {
    name: 'hepsiburada',
    displayName: 'Hepsiburada',
    color: '#FF6000',
    icon: '🛍️',
    baseUrl: 'https://www.hepsiburada.com'
  },
  n11: {
    name: 'n11',
    displayName: 'N11',
    color: '#7B2CBF',
    icon: '🏪',
    baseUrl: 'https://www.n11.com'
  },
  gittigidiyor: {
    name: 'gittigidiyor',
    displayName: 'GittiGidiyor',
    color: '#FFD23F',
    icon: '🛻',
    baseUrl: 'https://www.gittigidiyor.com'
  },
  amazon: {
    name: 'amazon',
    displayName: 'Amazon',
    color: '#FF9900',
    icon: '📦',
    baseUrl: 'https://www.amazon.com.tr'
  }
};

/**
 * Detects platform from URL
 */
export function detectPlatform(url: string): string {
  if (!url) return 'trendyol';
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('trendyol.com')) return 'trendyol';
  if (urlLower.includes('hepsiburada.com')) return 'hepsiburada';
  if (urlLower.includes('n11.com')) return 'n11';
  if (urlLower.includes('gittigidiyor.com')) return 'gittigidiyor';
  if (urlLower.includes('amazon.com.tr')) return 'amazon';
  
  // Default fallback
  return 'trendyol';
}

/**
 * Gets platform information
 */
export function getPlatformInfo(platform: string): PlatformInfo {
  return SUPPORTED_PLATFORMS[platform] || SUPPORTED_PLATFORMS.trendyol;
}

/**
 * Extracts product ID from platform URL
 */
export function extractProductId(url: string, platform: string): string {
  try {
    switch (platform) {
      case 'trendyol':
        // Trendyol: https://www.trendyol.com/marka/urun-adi-p-123456
        const trendyolMatch = url.match(/\/p-(\d+)/);
        return trendyolMatch ? trendyolMatch[1] : '';
        
      case 'hepsiburada':
        // Hepsiburada: https://www.hepsiburada.com/urun-adi-p-HBV00000123456
        const hepsiburadaMatch = url.match(/\/p-([A-Z0-9]+)/);
        return hepsiburadaMatch ? hepsiburadaMatch[1] : '';
        
      case 'n11':
        // N11: https://www.n11.com/urun/urun-adi-123456
        const n11Match = url.match(/\/urun\/[^\/]+-(\d+)/);
        return n11Match ? n11Match[1] : '';
        
      case 'gittigidiyor':
        // GittiGidiyor: https://www.gittigidiyor.com/urun/urun-adi_123456
        const gittigidiyorMatch = url.match(/_(\d+)$/);
        return gittigidiyorMatch ? gittigidiyorMatch[1] : '';
        
      case 'amazon':
        // Amazon: https://www.amazon.com.tr/dp/B08N5WRWNW
        const amazonMatch = url.match(/\/dp\/([A-Z0-9]+)/);
        return amazonMatch ? amazonMatch[1] : '';
        
      default:
        return '';
    }
  } catch (error) {
    console.error('Product ID extraction error:', error);
    return '';
  }
}

/**
 * Validates if URL belongs to supported platform
 */
export function isSupportedPlatform(url: string): boolean {
  const platform = detectPlatform(url);
  return platform in SUPPORTED_PLATFORMS;
}

/**
 * Gets platform-specific color for UI
 */
export function getPlatformColor(platform: string): string {
  const info = getPlatformInfo(platform);
  return info.color;
}

/**
 * Gets platform display name
 */
export function getPlatformDisplayName(platform: string): string {
  const info = getPlatformInfo(platform);
  return info.displayName;
}