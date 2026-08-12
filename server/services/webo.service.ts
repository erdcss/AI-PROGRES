/**
 * Webo — desteklenen sitelerden keşfedilen, henüz Shopify'a aktarılmamış ürünler.
 * Web: şema/izleme. Mobil: ürün kartları.
 */
import { pool } from "../db";
import {
  WEB_HOOK_SITES,
  matchWebHookSite,
  normalizeProductTitle,
  normalizeSourceUrl,
} from "@shared/web-hooks-sites";

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
  source?: "product-pool" | "trendyol" | "discovery" | string;
};

export type WeboEventInput = {
  level?: "info" | "warn" | "error" | "ok";
  siteId?: string | null;
  siteName?: string | null;
  message: string;
  meta?: Record<string, unknown>;
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

    CREATE TABLE IF NOT EXISTS webo_events (
      id SERIAL PRIMARY KEY,
      level TEXT NOT NULL DEFAULT 'info',
      site_id TEXT,
      site_name TEXT,
      message TEXT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS webo_events_created_idx
      ON webo_events (created_at DESC);
  `);
  tableReady = true;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Kaynak URL veya başlık Shopify mağazasında / transfer kaydında var mı? */
export async function isAlreadyOnShopify(input: {
  sourceUrl?: string;
  title?: string;
  sku?: string | null;
}): Promise<{ found: boolean; shopifyProductId?: string; via?: string }> {
  if (!pool) return { found: false };
  const url = normalizeSourceUrl(String(input.sourceUrl || ""));
  const titleNorm = normalizeProductTitle(String(input.title || ""));
  const sku = String(input.sku || "").trim();

  try {
    if (url) {
      const byUrl = await pool.query(
        `
        SELECT shopify_product_id::text AS id, 'memory_url' AS via FROM shopify_memory_products
          WHERE source_url IS NOT NULL AND (
            source_url = $1
            OR regexp_replace(source_url, '/$', '') = $1
          )
        LIMIT 1
        `,
        [url],
      );
      if (byUrl.rows[0]?.id) {
        return { found: true, shopifyProductId: String(byUrl.rows[0].id), via: "memory_url" };
      }

      const byTransfer = await pool.query(
        `
        SELECT shopify_product_id::text AS id FROM shopify_transferred_products
          WHERE source_url IS NOT NULL AND (
            source_url = $1
            OR regexp_replace(source_url, '/$', '') = $1
          )
        LIMIT 1
        `,
        [url],
      );
      if (byTransfer.rows[0]?.id) {
        return {
          found: true,
          shopifyProductId: String(byTransfer.rows[0].id),
          via: "transferred_url",
        };
      }
    }

    if (sku) {
      const bySku = await pool.query(
        `
        SELECT shopify_product_id::text AS id FROM shopify_memory_products
          WHERE sku IS NOT NULL AND lower(sku) = lower($1)
        LIMIT 1
        `,
        [sku],
      );
      if (bySku.rows[0]?.id) {
        return { found: true, shopifyProductId: String(bySku.rows[0].id), via: "memory_sku" };
      }
    }

    if (titleNorm.length >= 8) {
      const byTitle = await pool.query(
        `
        SELECT shopify_product_id::text AS id FROM shopify_memory_products
          WHERE lower(regexp_replace(regexp_replace(title, '[^\\w\\sÇĞİÖŞÜçğıöşü]', '', 'g'), '\\s+', ' ', 'g'))
              = $1
        LIMIT 1
        `,
        [titleNorm],
      );
      if (byTitle.rows[0]?.id) {
        return { found: true, shopifyProductId: String(byTitle.rows[0].id), via: "memory_title" };
      }
    }
  } catch (err) {
    console.warn("[webo] shopify check failed:", err instanceof Error ? err.message : err);
  }

  return { found: false };
}

/** Shopify'da olan Webo kayıtlarını kuyruktan düşür (pending → transferred). */
export async function purgeWeboAlreadyOnShopify(): Promise<number> {
  await ensureWeboTable();
  if (!pool) return 0;

  const pending = await pool.query(
    `SELECT id, source_url, title, sku FROM webo_products WHERE shopify_product_id IS NULL LIMIT 500`,
  );
  let marked = 0;
  for (const row of pending.rows) {
    const hit = await isAlreadyOnShopify({
      sourceUrl: String(row.source_url || ""),
      title: String(row.title || ""),
      sku: row.sku ? String(row.sku) : null,
    });
    if (!hit.found || !hit.shopifyProductId) continue;
    await pool.query(
      `UPDATE webo_products
       SET shopify_product_id = $1, transferred_at = COALESCE(transferred_at, NOW()), updated_at = NOW()
       WHERE id = $2 AND shopify_product_id IS NULL`,
      [hit.shopifyProductId, row.id],
    );
    marked += 1;
  }
  return marked;
}

export async function appendWeboEvent(input: WeboEventInput): Promise<void> {
  try {
    await ensureWeboTable();
    await pool!.query(
      `INSERT INTO webo_events (level, site_id, site_name, message, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        input.level || "info",
        input.siteId || null,
        input.siteName || null,
        String(input.message || "").slice(0, 500),
        JSON.stringify(input.meta || {}),
      ],
    );
    // eski logları budamak
    await pool!.query(
      `DELETE FROM webo_events WHERE id < (
         SELECT COALESCE(MAX(id), 0) - 400 FROM webo_events
       )`,
    );
  } catch (err) {
    console.warn("[webo] event log failed:", err instanceof Error ? err.message : err);
  }
}

export async function listWeboEvents(limit = 40) {
  await ensureWeboTable();
  const safe = Math.min(100, Math.max(1, Number(limit) || 40));
  const result = await pool!.query(
    `SELECT id, level, site_id, site_name, message, meta, created_at
     FROM webo_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [safe],
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    level: String(r.level || "info"),
    siteId: r.site_id ? String(r.site_id) : null,
    siteName: r.site_name ? String(r.site_name) : null,
    message: String(r.message || ""),
    meta: r.meta && typeof r.meta === "object" ? r.meta : {},
    createdAt: r.created_at,
  }));
}

/** Çekim/keşif sonrası: yalnızca Shopify'da olmayan ürünü Webo kuyruğuna yazar. */
export async function upsertWeboProduct(
  input: WeboProductInput,
): Promise<{ id: number; skipped?: "shopify" | "invalid" } | null> {
  try {
    await ensureWeboTable();
    const sourceUrl = normalizeSourceUrl(String(input.sourceUrl || ""));
    const title = String(input.title || "").trim();
    if (!sourceUrl || !title) return { id: 0, skipped: "invalid" };

    const already = await isAlreadyOnShopify({
      sourceUrl,
      title,
      sku: input.sku,
    });
    if (already.found) {
      // Varsa satırı transferred işaretle, pending listede gösterme
      if (already.shopifyProductId) {
        await pool!.query(
          `
          INSERT INTO webo_products (
            source_url, title, site_name, site_logo_url, price, sale_price, currency,
            image_url, images, brand, sku, source, shopify_product_id, transferred_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, '[]'::jsonb, $9, $10, $11, $12, NOW(), NOW()
          )
          ON CONFLICT (source_url) DO UPDATE SET
            shopify_product_id = EXCLUDED.shopify_product_id,
            transferred_at = COALESCE(webo_products.transferred_at, NOW()),
            updated_at = NOW()
          `,
          [
            sourceUrl,
            title,
            String(input.siteName || matchWebHookSite(sourceUrl)?.name || "Kaynak"),
            String(input.siteLogoUrl || matchWebHookSite(sourceUrl)?.logoUrl || ""),
            num(input.price),
            num(input.salePrice) ?? num(input.price),
            String(input.currency || "TRY"),
            String(input.imageUrl || "").trim() || null,
            input.brand ? String(input.brand) : null,
            input.sku ? String(input.sku) : null,
            String(input.source || "discovery"),
            already.shopifyProductId,
          ],
        );
      }
      return { id: 0, skipped: "shopify" };
    }

    const site = matchWebHookSite(sourceUrl);
    const siteName = String(input.siteName || site?.name || "").trim() || "Kaynak";
    const siteLogoUrl = String(input.siteLogoUrl || site?.logoUrl || "").trim();
    const salePrice = num(input.salePrice) ?? num(input.price);
    const price = num(input.price) ?? salePrice;
    const images = Array.isArray(input.images)
      ? input.images.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 8)
      : [];
    const imageUrl = String(input.imageUrl || "").trim() || images[0] || null;
    const source = String(input.source || site?.source || "discovery");

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
    const url = normalizeSourceUrl(String(input.sourceUrl || ""));
    if (!url) return;
    await pool!.query(
      `UPDATE webo_products
       SET shopify_product_id = $1, transferred_at = NOW(), updated_at = NOW()
       WHERE source_url = $2 OR regexp_replace(source_url, '/$', '') = $2`,
      [shopifyProductId, url],
    );
  } catch (err) {
    console.warn("[webo] mark transferred failed:", err instanceof Error ? err.message : err);
  }
}

export async function listPendingWeboProducts(limit = 60) {
  await ensureWeboTable();
  const safe = Math.min(100, Math.max(1, Number(limit) || 60));

  // Shopify mağazasında olanları (URL / başlık) pending listeden çıkar
  const result = await pool!.query(
    `
    SELECT w.id, w.source_url, w.title, w.site_name, w.site_logo_url, w.price, w.sale_price, w.currency,
           w.image_url, w.images, w.brand, w.sku, w.source, w.created_at, w.updated_at
    FROM webo_products w
    WHERE w.shopify_product_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM shopify_memory_products m
        WHERE m.source_url IS NOT NULL
          AND (
            m.source_url = w.source_url
            OR regexp_replace(m.source_url, '/$', '') = regexp_replace(w.source_url, '/$', '')
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM shopify_transferred_products t
        WHERE t.source_url IS NOT NULL
          AND (
            t.source_url = w.source_url
            OR regexp_replace(t.source_url, '/$', '') = regexp_replace(w.source_url, '/$', '')
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM shopify_memory_products m2
        WHERE length(trim(w.title)) >= 8
          AND lower(regexp_replace(regexp_replace(w.title, '[^\\w\\sÇĞİÖŞÜçğıöşü]', '', 'g'), '\\s+', ' ', 'g'))
            = lower(regexp_replace(regexp_replace(m2.title, '[^\\w\\sÇĞİÖŞÜçğıöşü]', '', 'g'), '\\s+', ' ', 'g'))
      )
    ORDER BY w.created_at DESC
    LIMIT $1
    `,
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
    source: String(r.source || "discovery"),
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
    source: String(r.source || "discovery"),
    shopifyProductId: r.shopify_product_id ? String(r.shopify_product_id) : null,
  };
}

/** Web yönetim paneli — ürün kartı yok, canlı şema + sayaçlar + olaylar */
export async function getWebHooksSchema(discoveryStatus?: Record<string, unknown>) {
  await ensureWeboTable();
  const [pending, transferredToday, lastRows, events, skippedHint] = await Promise.all([
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
    listWeboEvents(25),
    pool!.query(
      `SELECT COUNT(*)::int AS c FROM webo_products WHERE shopify_product_id IS NOT NULL`,
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

  const running = Boolean(discoveryStatus?.running);
  const enabled = discoveryStatus?.enabled !== false;

  return {
    updatedAt: new Date().toISOString(),
    pipeline: [
      {
        id: "sites",
        label: "Desteklenen siteler",
        status: enabled ? "ok" : "paused",
      },
      {
        id: "discover",
        label: "Otomatik keşif taraması",
        status: running ? "running" : enabled ? "ok" : "paused",
      },
      {
        id: "filter",
        label: "Shopify filtresi (mağazada olanlar elenir)",
        status: "ok",
      },
      {
        id: "mobile",
        label: "Mobil Webo kuyruğu",
        status: "ok",
      },
      {
        id: "transfer",
        label: "Shopify aktarım (mobil)",
        status: "ok",
      },
    ],
    counts: {
      sites: WEB_HOOK_SITES.length,
      pending: Number(pending.rows[0]?.c ?? 0),
      transferredToday: Number(transferredToday.rows[0]?.c ?? 0),
      alreadyOnShopify: Number(skippedHint.rows[0]?.c ?? 0),
      productPoolSites: WEB_HOOK_SITES.filter((s) => s.source === "product-pool").length,
      trendyolSites: WEB_HOOK_SITES.filter((s) => s.source === "trendyol").length,
    },
    discovery: discoveryStatus || null,
    events,
    sites,
    notes: [
      "Webo yalnızca Shopify mağazanızda olmayan yeni keşif ürünlerini listeler.",
      "Desteklenen siteler periyodik taranır; ürün kartları mobilde (Webo) görünür.",
      "Bu sayfa yönetim ve canlı izleme içindir — ürün kartı yoktur.",
    ],
  };
}
