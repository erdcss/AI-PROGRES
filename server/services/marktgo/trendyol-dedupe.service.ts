import { triggerMarktGoCatalogReconcile } from "./reconcile.service";
import { getMarktGoClientForConnection } from "./connection.service";

export type ExistingTrendyolProduct = {
  productId: string;
  externalProductId: string;
  sourceUrl: string;
};

export function extractTrendyolProductId(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const urlMatch = text.match(/-p-(\d+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const idMatch = text.match(/^trendyol[_:-](\d+)$/i);
  return idMatch?.[1] || null;
}

export function trendyolStableLocalProductId(productId: unknown): string | null {
  const id = String(productId || "").replace(/\D/g, "");
  return id ? `trendyol_${id}` : null;
}

/**
 * Strict/fail-closed duplicate guard.
 * We verify MARKT-GO is reachable, then read the live catalog and build a set of
 * Trendyol product ids already present there. If the check cannot be completed,
 * callers must stop rather than risk creating duplicates.
 */
export async function loadExistingTrendyolProductsFromMarktGo(): Promise<
  Map<string, ExistingTrendyolProduct>
> {
  // Throws when connection/config/auth is unavailable. This is intentional:
  // duplicate protection is strict and must never silently fail open.
  await getMarktGoClientForConnection();

  const reconcile = await triggerMarktGoCatalogReconcile(true);
  if (!reconcile || !reconcile.success) {
    throw new Error(
      reconcile?.message ||
        "MARKT-GO katalog kontrolü yapılamadı. Tekrar ürün ekleme riski nedeniyle işlem durduruldu.",
    );
  }

  const existing = new Map<string, ExistingTrendyolProduct>();
  for (const product of reconcile.products || []) {
    const fromSource = extractTrendyolProductId(product.sourceUrl);
    const fromPoolId = extractTrendyolProductId(product.poolId);
    const productId = fromSource || fromPoolId;
    if (!productId || existing.has(productId)) continue;
    existing.set(productId, {
      productId,
      externalProductId: String(product.externalProductId || ""),
      sourceUrl: String(product.sourceUrl || ""),
    });
  }

  return existing;
}
