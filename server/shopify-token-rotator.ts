/**
 * Geriye dönük uyumluluk — tüm mantık shopify-token-manager'da.
 */

import {
  getShopifyTokenLifecycleStatus,
  getValidShopifyAccessToken,
  proactiveRefreshShopifyToken,
  warmUpShopifyToken,
} from './shopify-token-manager';

export function autoRefreshIfNeeded(force = false): void {
  proactiveRefreshShopifyToken(force).catch((err) =>
    console.error('❌ SHOPIFY TOKEN: Auto-refresh failed:', err.message),
  );
}

/** @deprecated warmUpShopifyToken kullanın */
export function startShopifyTokenAutoRefresh(): void {
  warmUpShopifyToken();
}

export async function fetchAccessTokenViaClientCredentials(): Promise<string | null> {
  try {
    const token = await getValidShopifyAccessToken({ forceRefresh: true });
    return token.accessToken;
  } catch {
    return null;
  }
}

export async function rotateShopifyToken(): Promise<{
  success: boolean;
  newToken?: string;
  method?: string;
  error?: string;
}> {
  const result = await proactiveRefreshShopifyToken(true);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  try {
    const token = await getValidShopifyAccessToken();
    return {
      success: true,
      newToken: token.accessToken,
      method: result.source || token.source,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Token alınamadı',
    };
  }
}

export function getTokenStatus(): ReturnType<typeof getShopifyTokenLifecycleStatus> {
  return getShopifyTokenLifecycleStatus();
}
