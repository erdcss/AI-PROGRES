export type ExistingTrendyolProduct = {
  productId: string;
  externalProductId: string;
  sourceUrl: string;
};

const MAX_PAGES = 50;
const PAGE_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 15_000;

export function extractTrendyolProductId(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const urlMatch = text.match(/-p-(\d+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const idMatch = text.match(/^(?:aip[_:-])?trendyol[_:-](\d+)$/i);
  return idMatch?.[1] || null;
}

export function trendyolStableLocalProductId(productId: unknown): string | null {
  const id = String(productId || "").replace(/\D/g, "");
  return id ? `trendyol_${id}` : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function listItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asObject(payload);
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.data)) return root.data;
  const data = asObject(root.data);
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(root.products)) return root.products;
  return [];
}

function extractSourceUrlFromTags(value: unknown): string {
  if (!Array.isArray(value)) return "";
  for (const raw of value) {
    const tag = String(raw || "").trim();
    if (tag.toLowerCase().startsWith("src:")) return tag.slice(4).trim();
  }
  return "";
}

function parseRemoteProduct(raw: unknown): ExistingTrendyolProduct | null {
  const root = asObject(raw);
  const nested = asObject(root.product);
  const data = asObject(root.data);
  const row = Object.keys(nested).length ? nested : Object.keys(data).length ? data : root;

  const sourceUrl = String(
    row.sourceUrl ||
      row.source_url ||
      root.sourceUrl ||
      root.source_url ||
      extractSourceUrlFromTags(row.tags) ||
      extractSourceUrlFromTags(root.tags) ||
      "",
  ).trim();

  const identityCandidates = [
    sourceUrl,
    row.poolId,
    row.pool_id,
    row.localProductId,
    row.local_product_id,
    row.externalId,
    row.external_id,
    root.poolId,
    root.localProductId,
    root.externalId,
    root.external_id,
  ];

  let productId: string | null = null;
  for (const candidate of identityCandidates) {
    productId = extractTrendyolProductId(candidate);
    if (productId) break;
  }
  if (!productId) return null;

  const externalProductId = String(row.id || root.id || row.productId || root.productId || "").trim();
  return { productId, externalProductId, sourceUrl };
}

function hasMorePages(payload: unknown, itemCount: number): boolean {
  const root = asObject(payload);
  const pagination = asObject(root.pagination);
  const meta = asObject(root.meta);
  if (pagination.hasMore === true || pagination.has_more === true) return true;
  if (meta.hasMore === true || meta.has_more === true) return true;
  return itemCount >= PAGE_LIMIT;
}

function normalizeBaseUrl(raw: string): string {
  let value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) value = "https://api.turmarkt.com/api/v1/external";
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  if (!/\/api\/v1\/external$/i.test(value)) {
    value = `${value.replace(/\/api\/v1\/external.*$/i, "")}/api/v1/external`;
    value = value.replace(/([^:]\/)\/+/g, "$1");
  }
  return value;
}

function directMarktGoConfig(): { baseUrl: string; token: string } {
  const token = String(process.env.MARKTGO_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw new Error(
      "MARKTGO_ACCESS_TOKEN tanımlı değil. Duplicate riski nedeniyle kategori toplu çekimi durduruldu.",
    );
  }
  return {
    token,
    baseUrl: normalizeBaseUrl(
      process.env.MARKTGO_API_BASE_URL || "https://api.turmarkt.com/api/v1/external",
    ),
  };
}

async function fetchCatalogPage(baseUrl: string, token: string, page: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/products?page=${page}&limit=${PAGE_LIMIT}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }

    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("MARKT-GO ürün kataloğu geçersiz JSON döndürdü");
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Strict/fail-closed duplicate guard for Trendyol category bulk import.
 * This module has ZERO imports on purpose: no db.ts, no connection.service,
 * no reconcile.service, no MARKT-GO client module. It talks directly to the
 * live MARKT-GO catalog using only MARKTGO_API_BASE_URL + MARKTGO_ACCESS_TOKEN.
 */
export async function loadExistingTrendyolProductsFromMarktGo(): Promise<
  Map<string, ExistingTrendyolProduct>
> {
  const { baseUrl, token } = directMarktGoConfig();
  const existing = new Map<string, ExistingTrendyolProduct>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let payload: unknown;
    try {
      payload = await fetchCatalogPage(baseUrl, token, page);
    } catch (error) {
      throw new Error(
        `MARKT-GO canlı katalog kontrolü başarısız. Duplicate riski nedeniyle işlem durduruldu: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const items = listItems(payload);
    for (const item of items) {
      const parsed = parseRemoteProduct(item);
      if (!parsed || existing.has(parsed.productId)) continue;
      existing.set(parsed.productId, parsed);
    }

    if (items.length === 0 || !hasMorePages(payload, items.length)) break;
  }

  console.info(`[marktgo-dedupe] canlı katalog tamamen DB'siz tarandı, trendyol ürünleri=${existing.size}`);
  return existing;
}
