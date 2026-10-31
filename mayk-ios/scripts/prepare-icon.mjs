import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultIcon = path.join(root, "assets", "default-icon.svg");
const iconFile = path.join(root, "assets", "icon.png");
const splashFile = path.join(root, "assets", "splash.png");
const site = (process.env.EXPO_PUBLIC_MAYK_WEB_URL || "https://progres.turmarkt.com").replace(/\/$/, "");
const iconUrl = new URL("/api/mayk/branding/icon.png", site);
const requireRemote = process.env.MAYK_REQUIRE_REMOTE_ICON === "1";
let source = await fs.readFile(defaultIcon);
let remote = false;

try {
  const response = await fetch(iconUrl, { signal: AbortSignal.timeout(12000), headers: { Accept: "image/png" } });
  if (!response.ok || !String(response.headers.get("content-type")).startsWith("image/png")) {
    throw new Error(`Logo endpoint status: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > 4 * 1024 * 1024) throw new Error("Logo dosyası geçersiz");
  const metadata = await sharp(data).metadata();
  if (metadata.format !== "png" || metadata.width !== 1024 || metadata.height !== 1024) {
    throw new Error("Logo 1024x1024 PNG olmalı");
  }
  source = data;
  remote = true;
} catch (error) {
  if (requireRemote) throw new Error(`Sistem Durumu logosu alınamadı: ${error.message}`);
  console.warn("[M.A.Y.K] Admin logosu henüz hazır değil; varsayılan simge kullanılacak:", error.message);
}
await fs.mkdir(path.dirname(iconFile), { recursive: true });
await sharp(source).resize(1024, 1024, { fit: "contain", background: "#081327" })
  .flatten({ background: "#081327" }).removeAlpha().png().toFile(iconFile);
await sharp(iconFile).resize(512, 512, { fit: "contain", background: "#081327" })
  .png().toFile(splashFile);
console.log(`[M.A.Y.K] iOS icon ready: ${remote ? iconUrl.href : "fallback"}`);
