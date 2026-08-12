/**
 * Webo — desteklenen sitelerden çekilen, henüz Shopify'a aktarılmamış ürünler.
 * Web: şema/izleme. Mobil: ürün kartları.
 */
import { pool } from "../db";
import { WEB_HOOK_SITES, matchWebHookSite } from "@shared/web-hooks-sites";

export type WeboProductInput = {
  sourceUrl: string;
  title: string;
  siteName?: string;
  siteLogoUrl?: string;
  price?: number | null;
  salePrice?: number | null;
  currency?: string;
  imageUrl?: string | null;
  images?: string[];
  brand?: string | null;
  sku?: string | null;
  source?: "product-pool" | "trendyol" | string;
};

let tableReady = false;

export async function ensureWeboTable(): Promise<void> {
  if (tableReady || !pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webo_products (
      id SERIAL PRIMARY KEY,
      source_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      site_name TEXT NOT NULL DEFAULT '',
      site_logo_url TEXT NOT NULL DEFAULT '',
      price NUMERIC(12, 2),
      sale_price NUMERIC(12, 2),
      currency TEXT NOT NULL DEFAULT 'TRY',
      image_url TEXT,
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      brand TEXT,
      sku TEXT,
      source TEXT NOT NULL DEFAULT 'product-pool',
      shopify_product_id TEXT,
      transferred_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS webo_products_pending_idx
      ON webo_products (created_at DESC)
      WHERE shopify_product_id IS NULL;
  `);
  tableReady = true;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Çekim sonrası Shopify'a gitmeyen ürünü Webo kuyruğuna yazar. */
export async function upsertWeboProduct(input: WeboProductInput): Promise<{ id: number } | null> {
  try {
    await ensureWeboTable();
    const sourceUrl = String(input.sourceUrl || "").trim();
    const title = String(input.title || "").trim();
    if (!sourceUrl || !title) return null;

    const site = matchWebHookSite(sourceUrl);
    const siteName = String(input.siteName || site?.name || "").trim() || "Kaynak";
    const siteLogoUrl = String(input.siteLogoUrl || site?.logoUrl || "").trim();
    const salePrice = num(input.salePrice) ?? num(input.price);
    const price = num(input.price) ?? salePrice;
    const images = Array.isArray(input.images)
      ? input.images.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 8)
      : [];
    const imageUrl =
      String(input.imageUrl || "").trim() ||
      images[0] ||
      null;
    const source = String(input.source || site?.source || "product-pool");

    const result = await pool!.query(
      `
      INSERT INTO webo_products (
        source_url, title, site_name, site_logo_url, price, sale_price, currency,
        image_url, images, brand, sku, source, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9::jsonb, $10, $11, $12, NOW()
      )
      ON CONFLICT (source_url) DO UPDATE SET
        title = EXCLUDED.title,
        site_name = EXCLUDED.site_name,
        site_logo_url = EXCLUDED.site_logo_url,
        price = COALESCE(EXCLUDED.price, webo_products.price),
        sale_price = COALESCE(EXCLUDED.sale_price, webo_products.sale_price),
        currency = EXCLUDED.currency,
        image_url = COALESCE(EXCLUDED.image_url, webo_products.image_url),
        images = EXCLUDED.images,
        brand = COALESCE(EXCLUDED.brand, webo_products.brand),
        sku = COALESCE(EXCLUDED.sku, webo_products.sku),
        source = EXCLUDED.source,
        updated_at = NOW()
      WHERE webo_products.shopify_product_id IS NULL
      RETURNING id
      `,
      [
        sourceUrl,
        title,
        siteName,
        siteLogoUrl,
        price,
        salePrice,
        String(input.currency || "TRY"),
        imageUrl,
        JSON.stringify(images),
        input.brand ? String(input.brand) : null,
        input.sku ? String(input.sku) : null,
        source,
      ],
    );
    const id = Number(result.rows[0]?.id);
    return Number.isFinite(id) && id > 0 ? { id } : null;
  } catch (err) {
    console.warn("[webo] upsert failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function markWeboTransferred(input: {
  sourceUrl?: string;
  id?: number;
  shopifyProductId: string;
}): Promise<void> {
  try {
    await ensureWeboTable();
    const shopifyProductId = String(input.shopifyProductId || "").trim();
    if (!shopifyProductId) return;
    if (input.id && Number.isFinite(input.id)) {
      await pool!.query(
        `UPDATE webo_products
         SET shopify_product_id = $1, transferred_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [shopifyProductId, input.id],
      );
      return;
    }
    const url = String(input.sourceUrl || "").trim();
    if (!url) return;
    await pool!.query(
      `UPDATE webo_products
       SET shopify_product_id = $1, transferred_at = NOW(), updated_at = NOW()
       WHERE source_url = $2`,
      [shopifyProductId, url],
    );
  } catch (err) {
    console.warn("[webo] mark transferred failed:", err instanceof Error ? err.message : err);
  }
}

export async function listPendingWeboProducts(limit = 60) {
  await ensureWeboTable();
  const safe = Math.min(100, Math.max(1, Number(limit) || 60));
  const result = await pool!.query(
    `SELECT id, source_url, title, site_name, site_logo_url, price, sale_price, currency,
            image_url, images, brand, sku, source, created_at, updated_at
     FROM webo_products
     WHERE shopify_product_id IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [safe],
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    sourceUrl: String(r.source_url),
    title: String(r.title),
    siteName: String(r.site_name || ""),
    siteLogoUrl: String(r.site_logo_url || ""),
    price: r.price != null ? Number(r.price) : null,
    salePrice: r.sale_price != null ? Number(r.sale_price) : null,
    currency: String(r.currency || "TRY"),
    imageUrl: r.image_url ? String(r.image_url) : null,
    images: Array.isArray(r.images) ? r.images : [],
    brand: r.brand ? String(r.brand) : null,
    sku: r.sku ? String(r.sku) : null,
    source: String(r.source || "product-pool"),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getWeboProductById(id: number) {
  await ensureWeboTable();
  const result = await pool!.query(
    `SELECT * FROM webo_products WHERE id = $1 LIMIT 1`,
    [id],
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    sourceUrl: String(r.source_url),
    title: String(r.title),
    siteName: String(r.site_name || ""),
    siteLogoUrl: String(r.site_logo_url || ""),
    price: r.price != null ? Number(r.price) : null,
    salePrice: r.sale_price != null ? Number(r.sale_price) : null,
    currency: String(r.currency || "TRY"),
    imageUrl: r.image_url ? String(r.image_url) : null,
    images: Array.isArray(r.images) ? r.images : [],
    brand: r.brand ? String(r.brand) : null,
    sku: r.sku ? String(r.sku) : null,
    source: String(r.source || "product-pool"),
    shopifyProductId: r.shopify_product_id ? String(r.shopify_product_id) : null,
  };
}

/** Web yönetim paneli — ürün kartı yok, canlı şema + sayaçlar */
export async function getWebHooksSchema() {
  await ensureWeboTable();
  const [pending, transferredToday, lastRows] = await Promise.all([
    pool!.query(`SELECT COUNT(*)::int AS c FROM webo_products WHERE shopify_product_id IS NULL`),
    pool!.query(
      `SELECT COUNT(*)::int AS c FROM webo_products
       WHERE transferred_at IS NOT NULL AND transferred_at >= date_trunc('day', NOW())`,
    ),
    pool!.query(
      `SELECT site_name, COUNT(*)::int AS pending
       FROM webo_products
       WHERE shopify_product_id IS NULL
       GROUP BY site_name
       ORDER BY pending DESC`,
    ),
  ]);

  const pendingBySite = new Map<string, number>();
  for (const row of lastRows.rows) {
    pendingBySite.set(String(row.site_name || ""), Number(row.pending) || 0);
  }

  const sites = WEB_HOOK_SITES.map((s) => ({
    ...s,
    pendingCount: pendingBySite.get(s.name) || 0,
    status: "watching" as const,
  }));

  return {
    updatedAt: new Date().toISOString(),
    pipeline: [
      { id: "sites", label: "Desteklenen siteler", status: "ok" },
      { id: "discover", label: "Ürün çekimi", status: "ok" },
      { id: "filter", label: "Shopify filtresi (yalnızca aktarılmamış)", status: "ok" },
      { id: "mobile", label: "Mobil Webo kuyruğu", status: "ok" },
      { id: "transfer", label: "Shopify aktarım", status: "ok" },
    ],
    counts: {
      sites: WEB_HOOK_SITES.length,
      pending: Number(pending.rows[0]?.c ?? 0),
      transferredToday: Number(transferredToday.rows[0]?.c ?? 0),
      productPoolSites: WEB_HOOK_SITES.filter((s) => s.source === "product-pool").length,
      trendyolSites: WEB_HOOK_SITES.filter((s) => s.source === "trendyol").length,
    },
    sites,
    notes: [
      "Web paneli yalnızca canlı şema ve sayaçları gösterir; ürün kartları mobilde (Webo) listelenir.",
      "Ürün havuzu ve Trendyol çekimleri Shopify'a gönderilmeden Webo kuyruğuna düşer.",
    ],
  };
}
