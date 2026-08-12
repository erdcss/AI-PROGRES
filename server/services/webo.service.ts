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
  siteId?: string;
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
  tags?: string[];
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
  await pool.query(`
    ALTER TABLE webo_products ADD COLUMN IF NOT EXISTS site_id TEXT;
    ALTER TABLE webo_products ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  tableReady = true;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Ürün görseli URL'sini normalize et (//cdn, relative path). */
export function normalizeMediaUrl(raw: unknown, baseUrl?: string): string | null {
  const s = String(raw || "").trim();
  if (!s || s === "null" || s === "undefined") return null;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (baseUrl && (s.startsWith("/") || !s.includes(" "))) {
    try {
      const abs = new URL(s, baseUrl).toString();
      if (abs.startsWith("http")) return abs;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function pickWeboImage(
  imageUrl: unknown,
  images: unknown,
  sourceUrl?: string,
  siteLogoUrl?: string,
): string | null {
  const base = sourceUrl || undefined;
  const list = Array.isArray(images) ? images : [];
  const logo = String(siteLogoUrl || "").trim();
  const candidates = [imageUrl, ...list];
  for (const c of candidates) {
    const u = normalizeMediaUrl(c, base);
    if (!u) continue;
    if (logo && u === logo) continue;
    if (/favicon|logo\.(png|svg|ico)/i.test(u)) continue;
    return u;
  }
  return null;
}

function normalizeWeboImages(images: unknown, sourceUrl?: string): string[] {
  const list = Array.isArray(images) ? images : [];
  const out: string[] = [];
  for (const item of list) {
    const u = normalizeMediaUrl(item, sourceUrl);
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= 8) break;
  }
  return out;
}

export function normalizeWeboTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => String(t || "").trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20);
}

export function mergeWeboTags(existing: string[], add: string[]): string[] {
  const out = [...normalizeWeboTags(existing)];
  for (const t of normalizeWeboTags(add)) {
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

export function buildWeboShopifyTags(product: {
  tags?: string[];
  siteName?: string;
  source?: string;
}): string {
  const base = ["webo", product.siteName, product.source].filter(Boolean) as string[];
  return mergeWeboTags(base, product.tags || []).join(", ");
}

function mapWeboRow(r: Record<string, unknown>) {
  const sourceUrl = String(r.source_url);
  const siteLogoUrl = String(r.site_logo_url || "");
  const images = normalizeWeboImages(r.images, sourceUrl);
  const imageUrl =
    pickWeboImage(r.image_url, images, sourceUrl, siteLogoUrl) || images[0] || null;
  return {
    id: Number(r.id),
    sourceUrl,
    title: String(r.title),
    siteId: r.site_id ? String(r.site_id) : null,
    siteName: String(r.site_name || ""),
    siteLogoUrl,
    price: r.price != null ? Number(r.price) : null,
    salePrice: r.sale_price != null ? Number(r.sale_price) : null,
    currency: String(r.currency || "TRY"),
    imageUrl,
    images,
    brand: r.brand ? String(r.brand) : null,
    sku: r.sku ? String(r.sku) : null,
    source: String(r.source || "discovery"),
    tags: normalizeWeboTags(r.tags),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
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

    if (url) {
      const byProducts = await pool.query(
        `
        SELECT shopify_product_id::text AS id FROM products
        WHERE trendyol_url IS NOT NULL
          AND (
            trendyol_url = $1
            OR regexp_replace(trendyol_url, '/$', '') = $1
            OR (source_url IS NOT NULL AND (
              source_url = $1
              OR regexp_replace(source_url, '/$', '') = $1
            ))
          )
        LIMIT 1
        `,
        [url],
      );
      if (byProducts.rows[0]?.id) {
        return { found: true, shopifyProductId: String(byProducts.rows[0].id), via: "products_url" };
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
    const siteId = String(input.siteId || site?.id || "").trim() || null;
    const siteName = String(input.siteName || site?.name || "").trim() || "Kaynak";
    const siteLogoUrl = String(input.siteLogoUrl || site?.logoUrl || "").trim();
    const salePrice = num(input.salePrice) ?? num(input.price);
    const price = num(input.price) ?? salePrice;
    const images = Array.isArray(input.images)
      ? input.images
          .map((u) => normalizeMediaUrl(u, sourceUrl))
          .filter((u): u is string => Boolean(u))
          .slice(0, 8)
      : [];
    const imageUrl = normalizeMediaUrl(input.imageUrl, sourceUrl) || images[0] || null;
    const source = String(input.source || site?.source || "discovery");

    const result = await pool!.query(
      `
      INSERT INTO webo_products (
        source_url, title, site_id, site_name, site_logo_url, price, sale_price, currency,
        image_url, images, brand, sku, source, tags, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10::jsonb, $11, $12, $13, $14::jsonb, NOW()
      )
      ON CONFLICT (source_url) DO UPDATE SET
        title = EXCLUDED.title,
        site_id = COALESCE(EXCLUDED.site_id, webo_products.site_id),
        site_name = EXCLUDED.site_name,
        site_logo_url = EXCLUDED.site_logo_url,
        price = COALESCE(EXCLUDED.price, webo_products.price),
        sale_price = COALESCE(EXCLUDED.sale_price, webo_products.sale_price),
        currency = EXCLUDED.currency,
        image_url = COALESCE(EXCLUDED.image_url, webo_products.image_url),
        images = CASE
          WHEN EXCLUDED.images IS NOT NULL AND jsonb_array_length(EXCLUDED.images) > 0
          THEN EXCLUDED.images
          ELSE webo_products.images
        END,
        brand = COALESCE(EXCLUDED.brand, webo_products.brand),
        sku = COALESCE(EXCLUDED.sku, webo_products.sku),
        source = EXCLUDED.source,
        tags = CASE
          WHEN EXCLUDED.tags IS NOT NULL AND EXCLUDED.tags::text != '[]'
          THEN EXCLUDED.tags
          ELSE webo_products.tags
        END,
        updated_at = NOW()
      WHERE webo_products.shopify_product_id IS NULL
      RETURNING id
      `,
      [
        sourceUrl,
        title,
        siteId,
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
        JSON.stringify(normalizeWeboTags(input.tags)),
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

export async function listPendingWeboProducts(limit = 60, siteId?: string | null) {
  await ensureWeboTable();
  await purgeWeboAlreadyOnShopify().catch(() => 0);
  const safe = Math.min(200, Math.max(1, Number(limit) || 60));
  const siteFilter = String(siteId || "").trim() || null;

  const result = await pool!.query(
    `
    SELECT w.id, w.source_url, w.title, w.site_id, w.site_name, w.site_logo_url, w.price, w.sale_price, w.currency,
           w.image_url, w.images, w.brand, w.sku, w.source, w.tags, w.created_at, w.updated_at
    FROM webo_products w
    WHERE w.shopify_product_id IS NULL
      AND ($2::text IS NULL OR w.site_id = $2 OR w.site_name = $2)
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
        SELECT 1 FROM products p
        WHERE p.trendyol_url IS NOT NULL
          AND (
            p.trendyol_url = w.source_url
            OR regexp_replace(p.trendyol_url, '/$', '') = regexp_replace(w.source_url, '/$', '')
            OR (p.source_url IS NOT NULL AND (
              p.source_url = w.source_url
              OR regexp_replace(p.source_url, '/$', '') = regexp_replace(w.source_url, '/$', '')
            ))
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM shopify_memory_products m2
        WHERE length(trim(w.title)) >= 8
          AND lower(regexp_replace(regexp_replace(w.title, '[^\\w\\sÇĞİÖŞÜçğıöşü]', '', 'g'), '\\s+', ' ', 'g'))
            = lower(regexp_replace(regexp_replace(m2.title, '[^\\w\\sÇĞİÖŞÜçğıöşü]', '', 'g'), '\\s+', ' ', 'g'))
      )
    ORDER BY w.site_name ASC, w.created_at DESC
    LIMIT $1
    `,
    [safe, siteFilter],
  );
  return result.rows.map((r) => mapWeboRow(r));
}

export async function getWeboSiteCatalog() {
  await ensureWeboTable();
  const counts = await pool!.query(
    `
    SELECT site_id, site_name, site_logo_url, COUNT(*)::int AS pending
    FROM webo_products
    WHERE shopify_product_id IS NULL
    GROUP BY site_id, site_name, site_logo_url
    `,
  );
  const byId = new Map<string, number>();
  for (const row of counts.rows) {
    const id = String(row.site_id || row.site_name || "");
    if (id) byId.set(id, Number(row.pending) || 0);
  }
  return WEB_HOOK_SITES.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    logoUrl: s.logoUrl,
    source: s.source,
    pendingCount: byId.get(s.id) ?? byId.get(s.name) ?? 0,
  }));
}

export async function repairIncompleteWeboProducts(limit = 30): Promise<number> {
  await ensureWeboTable();
  const safe = Math.min(60, Math.max(1, Number(limit) || 30));
  const rows = await pool!.query(
    `
    SELECT id, source_url, title, site_id, site_name, site_logo_url
    FROM webo_products
    WHERE shopify_product_id IS NULL
      AND (
        image_url IS NULL OR trim(image_url) = ''
        OR sale_price IS NULL OR sale_price <= 0
      )
    ORDER BY updated_at ASC
    LIMIT $1
    `,
    [safe],
  );

  let repaired = 0;
  for (const row of rows.rows) {
    const sourceUrl = String(row.source_url);
    const candidate = {
      sourceUrl,
      title: String(row.title),
      price: null,
      salePrice: null,
      imageUrl: null,
    };
    try {
      const enriched = await (async () => {
        const host = new URL(sourceUrl).hostname.toLowerCase();
        if (host.includes("trendyol.com")) {
          const { scrapeWithEnhancedMethod } = await import("../enhanced-trendyol-scraper");
          const scraped = await scrapeWithEnhancedMethod(sourceUrl);
          if (scraped) {
            const images = (scraped.images || []).filter((u) => u?.startsWith("http"));
            const salePrice = Number(scraped.price) > 0 ? Number(scraped.price) : null;
            return {
              sourceUrl,
              title: scraped.title || candidate.title,
              price: salePrice,
              salePrice,
              imageUrl: normalizeMediaUrl(images[0], sourceUrl),
              images,
              brand: scraped.brand || null,
            };
          }
        }
        const { scrapeProductPoolUrl } = await import("../product-pool/scrape");
        const scraped = await scrapeProductPoolUrl(sourceUrl);
        const images = Array.isArray(scraped.images) ? scraped.images : [];
        return {
          sourceUrl: scraped.sourceUrl || sourceUrl,
          title: scraped.title || candidate.title,
          price: scraped.price ?? scraped.salePrice,
          salePrice: scraped.salePrice ?? scraped.price,
          imageUrl: normalizeMediaUrl(images[0], sourceUrl),
          images,
          brand: scraped.brand ?? null,
          sku: scraped.sku ?? undefined,
        };
      })();

      const hasPrice = Number(enriched.salePrice || enriched.price || 0) > 0;
      const hasImage = Boolean(enriched.imageUrl || enriched.images?.length);
      if (!hasPrice && !hasImage) continue;

      const site = matchWebHookSite(sourceUrl);
      await pool!.query(
        `
        UPDATE webo_products SET
          title = COALESCE($2, title),
          price = COALESCE($3, price),
          sale_price = COALESCE($4, sale_price),
          image_url = COALESCE($5, image_url),
          images = CASE
            WHEN $6::jsonb IS NOT NULL AND jsonb_array_length($6::jsonb) > 0 THEN $6::jsonb
            ELSE images
          END,
          brand = COALESCE($7, brand),
          sku = COALESCE($8, sku),
          site_id = COALESCE(site_id, $9),
          site_name = COALESCE(site_name, $10),
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          row.id,
          enriched.title,
          enriched.price,
          enriched.salePrice,
          enriched.imageUrl,
          JSON.stringify(
            (enriched.images || [])
              .map((u) => normalizeMediaUrl(u, sourceUrl))
              .filter((u): u is string => Boolean(u)),
          ),
          enriched.brand || null,
          enriched.sku || null,
          site?.id || row.site_id,
          site?.name || row.site_name,
        ],
      );
      repaired += 1;
    } catch {
      /* skip */
    }
  }
  return repaired;
}

export async function addWeboTagsToProducts(ids: number[], tagsToAdd: string[]): Promise<number> {
  await ensureWeboTable();
  const cleanIds = ids.filter((id) => Number.isFinite(id) && id > 0);
  const cleanTags = normalizeWeboTags(tagsToAdd);
  if (!cleanIds.length || !cleanTags.length) return 0;

  let updated = 0;
  for (const id of cleanIds) {
    const cur = await pool!.query(`SELECT tags FROM webo_products WHERE id = $1 LIMIT 1`, [id]);
    if (!cur.rows[0]) continue;
    const merged = mergeWeboTags(cur.rows[0].tags, cleanTags);
    await pool!.query(
      `UPDATE webo_products SET tags = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(merged), id],
    );
    updated += 1;
  }
  return updated;
}

export async function getWeboProductById(id: number) {
  await ensureWeboTable();
  const result = await pool!.query(
    `SELECT * FROM webo_products WHERE id = $1 LIMIT 1`,
    [id],
  );
  const r = result.rows[0];
  if (!r) return null;
  const mapped = mapWeboRow(r);
  return {
    ...mapped,
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
      `SELECT site_id, site_name, COUNT(*)::int AS pending
       FROM webo_products
       WHERE shopify_product_id IS NULL
       GROUP BY site_id, site_name
       ORDER BY pending DESC`,
    ),
    listWeboEvents(25),
    pool!.query(
      `SELECT COUNT(*)::int AS c FROM webo_products WHERE shopify_product_id IS NOT NULL`,
    ),
  ]);

  const pendingBySite = new Map<string, number>();
  for (const row of lastRows.rows) {
    const id = String(row.site_id || row.site_name || "");
    if (id) pendingBySite.set(id, Number(row.pending) || 0);
  }

  const sites = WEB_HOOK_SITES.map((s) => ({
    ...s,
    pendingCount: pendingBySite.get(s.id) ?? pendingBySite.get(s.name) ?? 0,
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
