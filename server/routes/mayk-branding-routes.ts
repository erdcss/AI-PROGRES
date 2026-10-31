import { Router } from "express";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { requireAppAuth } from "../multi-user-auth";

const router = Router();
const BUCKET = "mayk-branding";
const ICON_PATH = "icons/mayk.png";
const MAX_BYTES = 4 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function getStorage() {
  return getSupabaseAdmin();
}

router.get("/branding", requireAppAuth, async (_req, res) => {
  const client = getStorage();
  if (!client) {
    return res.json({ success: true, configured: false, hasIcon: false, appName: "M.A.Y.K" });
  }
  const { data, error } = await client.storage.from(BUCKET).list("icons", { search: "mayk.png", limit: 10 });
  if (error && !/not found/i.test(error.message)) {
    return res.status(503).json({ success: false, message: "Logo depolama bilgisi okunamadı" });
  }
  const icon = data?.find(item => item.name === "mayk.png");
  return res.json({
    success: true,
    configured: true,
    appName: "M.A.Y.K",
    hasIcon: Boolean(icon),
    iconUrl: icon ? "/api/mayk/branding/icon.png" : null,
    updatedAt: icon?.updated_at ?? null,
  });
});

// Publicly readable icon only; credentials and storage keys never leave the server.
// The TestFlight build pipeline downloads this exact file before compiling the binary.
router.get("/branding/icon.png", async (_req, res) => {
  const client = getStorage();
  if (!client) return res.status(503).json({ success: false, message: "Logo depolama yapılandırılmamış" });
  try {
    const { data, error } = await client.storage.from(BUCKET).download(ICON_PATH);
    if (error || !data) return res.status(404).json({ success: false, message: "Henüz M.A.Y.K logosu yüklenmedi" });
    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(buffer);
  } catch (error) {
    console.error("[mayk] icon read failed", error);
    return res.status(503).json({ success: false, message: "Logo okunamadı" });
  }
});

router.post("/branding/icon", requireAppAuth, async (req, res) => {
  if (req.appAuth?.systemRole !== "admin") {
    return res.status(403).json({ success: false, message: "Yalnızca sistem yöneticisi uygulama logosunu değiştirebilir" });
  }

  // Protect cookie-authenticated upload from cross-site requests.
  const origin = req.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const requestHost = req.get("x-forwarded-host") || req.get("host");
      if (!requestHost || originHost.toLowerCase() !== requestHost.toLowerCase()) {
        return res.status(403).json({ success: false, message: "Geçersiz istek kaynağı" });
      }
    } catch {
      return res.status(403).json({ success: false, message: "Geçersiz istek kaynağı" });
    }
  }

  const source = req.body?.imageBase64;
  if (typeof source !== "string" || source.length > MAX_BYTES * 1.4 + 100) {
    return res.status(400).json({ success: false, message: "En fazla 4 MB PNG dosyası yükleyin" });
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if (!match) return res.status(400).json({ success: false, message: "PNG biçiminde dosya gereklidir" });
  const image = Buffer.from(match[1], "base64");
  if (!image.length || image.length > MAX_BYTES ||
      image.length < 33 || !image.subarray(0, 8).equals(PNG_SIGNATURE) ||
      image.toString("ascii", 12, 16) !== "IHDR" ||
      image.readUInt32BE(16) !== 1024 || image.readUInt32BE(20) !== 1024) {
    return res.status(400).json({ success: false, message: "Görsel tam olarak 1024×1024 PNG ve en fazla 4 MB olmalıdır" });
  }

  const client = getStorage();
  if (!client) return res.status(503).json({ success: false, message: "SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY eksik" });
  try {
    const bucket = await client.storage.getBucket(BUCKET);
    if (!bucket.data) {
      const created = await client.storage.createBucket(BUCKET, {
        public: false, fileSizeLimit: "4MB", allowedMimeTypes: ["image/png"],
      });
      if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
    }
    const uploaded = await client.storage.from(BUCKET).upload(ICON_PATH, image, {
      contentType: "image/png", cacheControl: "60", upsert: true,
    });
    if (uploaded.error) throw uploaded.error;
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      success: true, appName: "M.A.Y.K",
      iconUrl: "/api/mayk/branding/icon.png",
      message: "Logo kaydedildi. Yeni iPhone ana ekran simgesi sonraki iOS/TestFlight derlemesinde kullanılır.",
    });
  } catch (error) {
    console.error("[mayk] logo upload failed", error);
    return res.status(503).json({ success: false, message: "Logo kalıcı depoya yüklenemedi" });
  }
});
export default router;
