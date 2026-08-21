/**
 * AES-256-GCM at-rest encryption for integration tokens.
 * Never log plaintext. Format: enc:v1:<iv>:<tag>:<cipher> (base64url)
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const explicit =
    process.env.MARKTGO_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit && explicit.length >= 16) {
    return createHash("sha256").update(explicit).digest();
  }
  const fallback = process.env.DATABASE_URL?.trim() || "ai-progres-local-dev";
  return createHash("sha256").update(`marktgo-token:${fallback}`).digest();
}

export function encryptSecret(plain: string): string {
  const text = String(plain || "");
  if (!text) throw new Error("Boş token şifrelenemez");
  if (text.startsWith(PREFIX)) return text;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  const raw = String(stored || "");
  if (!raw.startsWith(PREFIX)) return raw;
  const parts = raw.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Şifreli token bozuk");
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskToken(token: string): string {
  const t = String(token || "").trim();
  if (!t) return "";
  const last4 = t.slice(-4);
  const prefix = t.startsWith("mgt_test_")
    ? "mgt_test_"
    : t.startsWith("mgt_live_")
      ? "mgt_live_"
      : t.startsWith("tm_test_")
        ? "tm_test_"
        : t.startsWith("tm_live_")
          ? "tm_live_"
          : t.slice(0, Math.min(8, t.length));
  return `${prefix}••••••••••${last4}`;
}

export function tokenLast4(token: string): string {
  return String(token || "").trim().slice(-4);
}

export function looksLikeMarktGoToken(token: string): boolean {
  const t = String(token || "").trim();
  return (
    t.startsWith("mgt_live_") ||
    t.startsWith("mgt_test_") ||
    t.startsWith("tm_live_") ||
    t.startsWith("tm_test_")
  );
}

export function redactSecrets(value: string): string {
  return String(value || "")
    .replace(/mgt_(live|test)_[A-Za-z0-9_-]+/g, "mgt_$1_***")
    .replace(/tm_(live|test)_[A-Za-z0-9_-]+/g, "tm_$1_***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}
