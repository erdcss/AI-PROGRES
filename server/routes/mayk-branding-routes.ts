import { createHash } from "node:crypto";
import { Router } from "express";
import { pool } from "../db";
import { requireAppAuth } from "../multi-user-auth";

// M.A.Y.K icons are stored in the same persistent Railway PostgreSQL database
// as AI PROGRES accounts and workspaces. They never depend on Supabase Storage/RLS.
const router = Router();
const ICON_KEY = "ios-app-icon";
const MAX_BYTES = 4 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let schemaReady: Promise<void> | null = null;

export function ensureMaykBrandingTable(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      if (!pool) throw new Error("DATABASE_URL missing");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mayk_branding_assets (
          asset_key TEXT PRIMARY KEY CHECK (asset_key = 'ios-app-icon'),
          content BYTEA NOT NULL,
          mime_type TEXT NOT NULL DEFAULT 'image/png',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_by UUID
        )
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function validateMaykIcon(source: unknown): { data?: Buffer; error?: string } {
  if (typeof source !== "string" || source.length > MAX_BYTES * 1.4 + 100) {
    return { error: "En fazla 4 MB PNG dosyası yükleyin" };
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if (!match) return { error: "PNG biçiminde dosya gereklidir" };
  const image = Buffer.from(match[1], "base64");
  if (
    image.length < 33 || image.length > MAX_BYTES ||
    !image.subarray(0, 8).equals(PNG_SIGNATURE) ||
    image.toString("ascii", 12, 16) !== "IHDR" ||
    image.readUInt32BE(16) !== 1024 ||
    image.readUInt32BE(20) !== 1024
  ) {
    return { error: "Görsel 1024×1024 PNG ve en fazla 4 MB olmalıdır" };
  }
  return { data: image };
}

router.get("/branding", requireAppAuth, async (_req, res) => {
  try {
    await ensureMaykBrandingTable();
    const result = await pool!.query<{ updated_at: Date }>(
      "SELECT updated_at FROM mayk_branding_assets WHERE asset_key=$1 LIMIT 1",
      [ICON_KEY],
    );
    const item = result.rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      success: true,
      configured: true,
      appName: "M.A.Y.K",
      hasIcon: Boolean(item),
      iconUrl: item ? "/api/mayk/branding/icon.png" : null,
      updatedAt: item?.updated_at ?? null,
      storage: "railway-postgres",
    });
  } catch (error) {
    console.error("[mayk] branding read failed", error);
    return res.status(503).json({ success: false, message: "Railway veritabanına ulaşılamıyor" });
  }
});

// Public read, because EAS downloads the icon when building iOS/TestFlight.
// There is no public write endpoint: uploads remain system-admin-only.
router.get("/branding/icon.png", async (req, res) => {
  try {
    await ensureMaykBrandingTable();
    const result = await pool!.query<{ content: Buffer; updated_at: Date }>(
      "SELECT content, updated_at FROM mayk_branding_assets WHERE asset_key=$1 LIMIT 1",
      [ICON_KEY],
    );
    const item = result.rows[0];
    if (!item) return res.status(404).json({ success: false, message: "Henüz M.A.Y.K logosu yüklenmedi" });
    const etag = '"' + createHash("sha256").update(item.content).digest("hex") + '"';
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.setHeader("Content-Type", "image/png");
    return res.send(item.content);
  } catch (error) {
    console.error("[mayk] icon read failed", error);
    return res.status(503).json({ success: false, message: "Logo Railway veritabanından okunamadı" });
  }
});

router.post("/branding/icon", requireAppAuth, async (req, res) => {
  if (req.appAuth?.systemRole !== "admin") {
    return res.status(403).json({ success: false, message: "Yalnızca sistem yöneticisi logoyu değiştirebilir" });
  }
  // Prevent cross-origin form submissions with the app's session cookie.
  const origin = req.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const forwardedHost = req.get("x-forwarded-host") || req.get("host");
      if (!forwardedHost || originHost.toLowerCase() !== forwardedHost.toLowerCase()) {
        return res.status(403).json({ success: false, message: "Geçersiz istek kaynağı" });
      }
    } catch {
      return res.status(403).json({ success: false, message: "Geçersiz istek kaynağı" });
    }
  }

  const { data, error } = validateMaykIcon(req.body?.imageBase64);
  if (!data || error) return res.status(400).json({ success: false, message: error });
  try {
    await ensureMaykBrandingTable();
    await pool!.query(
      `INSERT INTO mayk_branding_assets (asset_key, content, mime_type, updated_at, updated_by)
       VALUES ($1, $2, 'image/png', NOW(), $3)
       ON CONFLICT (asset_key)
       DO UPDATE SET content=EXCLUDED.content, mime_type=EXCLUDED.mime_type,
                     updated_at=NOW(), updated_by=EXCLUDED.updated_by`,
      [ICON_KEY, data, req.appAuth!.userId],
    );
    const verified = await pool!.query<{ bytes: number }>(
      "SELECT octet_length(content)::int AS bytes FROM mayk_branding_assets WHERE asset_key=$1",
      [ICON_KEY],
    );
    if (Number(verified.rows[0]?.bytes) !== data.length) {
      console.error("[mayk] icon verification failed");
      return res.status(503).json({ success: false, message: "Logo kayıt doğrulaması başarısız" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      success: true,
      appName: "M.A.Y.K",
      iconUrl: "/api/mayk/branding/icon.png",
      storage: "railway-postgres",
      message: "Logo Railway PostgreSQL veritabanına kaydedildi. iPhone ana ekran simgesi sonraki TestFlight derlemesinde güncellenir.",
    });
  } catch (err) {
    console.error("[mayk] database icon upload failed", err);
    return res.status(503).json({ success: false, message: "Logo Railway PostgreSQL veritabanına kaydedilemedi" });
  }
});

export default router;
