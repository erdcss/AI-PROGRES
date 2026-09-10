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

function directMarktGoConfig(): { baseUrl: string; token: string } | null {
  const token = String(process.env.MARKTGO_ACCESS_TOKEN || "").trim();
  if (!token) return null;
  return {
    token,
    baseUrl: normalizeBaseUrl(
      process.env.MARKTGO_API_BASE_URL || "https://api.turmarkt.com/api/v1/external",
    ),
  };
}

class CatalogHttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    this.status = status;
    this.body = body;
  }
}

function isExpiredOrInvalidToken(error: unknown): boolean {
  const status = Number((error as { status?: unknown })?.status || 0);
  const text = String(
    (error as { body?: unknown })?.body ||
      (error as { message?: unknown })?.message ||
      "",
  ).toLowerCase();
  return status === 401 || text.includes("invalid_token") || text.includes("expired token");
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
    if (!response.ok) throw new CatalogHttpError(response.status, text);
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

async function loadCatalogWithFetchConfig(baseUrl: string, token: string): Promise<Map<string, ExistingTrendyolProduct>> {
  const existing = new Map<string, ExistingTrendyolProduct>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await fetchCatalogPage(baseUrl, token, page);
    const items = listItems(payload);

    for (const item of items) {
      const parsed = parseRemoteProduct(item);
      if (!parsed || existing.has(parsed.productId)) continue;
      existing.set(parsed.productId, parsed);
    }

    if (items.length === 0 || !hasMorePages(payload, items.length)) break;
  }

  return existing;
}

async function loadCatalogWithActiveConnection(): Promise<Map<string, ExistingTrendyolProduct>> {
  if (!String(process.env.DATABASE_URL || "").trim()) {
    throw new Error(
      "MARKT-GO access token süresi dolmuş. Yerel .env içindeki MARKTGO_ACCESS_TOKEN değerini güncelleyin veya DATABASE_URL ile kayıtlı aktif MARKT-GO bağlantısını kullanılabilir hale getirin.",
    );
  }

  const { getMarktGoClientForConnection } = await import("./connection.service");
  const { client } = await getMarktGoClientForConnection();
  const existing = new Map<string, ExistingTrendyolProduct>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await client.get<unknown>(`/products?page=${page}&limit=${PAGE_LIMIT}`);
    const items = listItems(payload);

    for (const item of items) {
      const parsed = parseRemoteProduct(item);
      if (!parsed || existing.has(parsed.productId)) continue;
      existing.set(parsed.productId, parsed);
    }

    if (items.length === 0 || !hasMorePages(payload, items.length)) break;
  }

  return existing;
}

/**
 * Strict/fail-closed duplicate guard for Trendyol category bulk import.
 * 1) Prefer MARKTGO_ACCESS_TOKEN from env for the fastest path.
 * 2) If that token is missing/expired/invalid and DATABASE_URL exists, fall back
 *    to the program's active MARKT-GO connection stored in the database.
 * 3) If neither credential source is usable, stop instead of risking duplicates.
 */
export async function loadExistingTrendyolProductsFromMarktGo(): Promise<
  Map<string, ExistingTrendyolProduct>
> {
  const direct = directMarktGoConfig();

  if (direct) {
    try {
      const existing = await loadCatalogWithFetchConfig(direct.baseUrl, direct.token);
      console.info(`[marktgo-dedupe] canlı katalog env token ile tarandı, trendyol ürünleri=${existing.size}`);
      return existing;
    } catch (error) {
      if (!isExpiredOrInvalidToken(error)) {
        throw new Error(
          `MARKT-GO canlı katalog kontrolü başarısız. Duplicate riski nedeniyle işlem durduruldu: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      console.warn("[marktgo-dedupe] MARKTGO_ACCESS_TOKEN geçersiz/süresi dolmuş, aktif bağlantıya fallback deneniyor");
    }
  }

  try {
    const existing = await loadCatalogWithActiveConnection();
    console.info(`[marktgo-dedupe] canlı katalog aktif MARKT-GO bağlantısı ile tarandı, trendyol ürünleri=${existing.size}`);
    return existing;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `MARKT-GO duplicate kontrolü için geçerli kimlik bilgisi bulunamadı. ${message}`,
    );
  }
}
