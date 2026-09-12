import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "server/services/marktgo/connection.service.ts");
let src = fs.readFileSync(target, "utf8");

const from = `export async function ensureMarktGoConnectionFromEnv(): Promise<boolean> {\n  const token = String(process.env.MARKTGO_ACCESS_TOKEN || "").trim();\n  if (!token || !looksLikeMarktGoToken(token)) return false;\n  const existing = await getActiveMarktGoConnection();\n  if (existing) return false;\n  await saveMarktGoConnection({\n    name: String(process.env.MARKTGO_CONNECTION_NAME || "MARKT-GO").trim() || "MARKT-GO",\n    apiBaseUrl:\n      process.env.MARKTGO_API_BASE_URL || "https://api.turmarkt.com/api/v1/external",\n    accessToken: token,\n    environment: String(process.env.MARKTGO_ENVIRONMENT || "production").toLowerCase() === "test"\n      ? "test"\n      : "production",\n  });\n  console.info("[marktgo] bağlantı MARKTGO_ACCESS_TOKEN env ile kuruldu");\n  return true;\n}`;

const to = `export async function ensureMarktGoConnectionFromEnv(): Promise<boolean> {\n  const token = String(process.env.MARKTGO_ACCESS_TOKEN || "").trim();\n  if (!token || !looksLikeMarktGoToken(token)) return false;\n\n  const name = String(process.env.MARKTGO_CONNECTION_NAME || "MARKT-GO").trim() || "MARKT-GO";\n  const apiBaseUrl =\n    process.env.MARKTGO_API_BASE_URL || "https://api.turmarkt.com/api/v1/external";\n  const environment =\n    String(process.env.MARKTGO_ENVIRONMENT || "production").toLowerCase() === "test"\n      ? "test"\n      : "production";\n\n  const existing = await getActiveMarktGoConnection();\n  if (existing) {\n    let existingToken = "";\n    try {\n      existingToken = decryptSecret(existing.accessTokenEncrypted).trim();\n    } catch {\n      existingToken = "";\n    }\n\n    const normalizedEnvBaseUrl = normalizeMarktGoBaseUrl(apiBaseUrl);\n    const tokenChanged = existingToken !== token;\n    const baseUrlChanged = normalizeMarktGoBaseUrl(existing.apiBaseUrl) !== normalizedEnvBaseUrl;\n    const environmentChanged = existing.environment !== environment;\n\n    if (!tokenChanged && !baseUrlChanged && !environmentChanged) {\n      return false;\n    }\n\n    await saveMarktGoConnection({\n      id: existing.id,\n      name,\n      apiBaseUrl,\n      accessToken: token,\n      environment,\n      webhookUrl: existing.webhookUrl,\n    });\n    console.info("[marktgo] mevcut bağlantı Railway env değerleriyle güncellendi", {\n      connectionId: existing.id,\n      tokenChanged,\n      baseUrlChanged,\n      environmentChanged,\n    });\n    return true;\n  }\n\n  await saveMarktGoConnection({\n    name,\n    apiBaseUrl,\n    accessToken: token,\n    environment,\n  });\n  console.info("[marktgo] bağlantı MARKTGO_ACCESS_TOKEN env ile kuruldu");\n  return true;\n}`;

if (src.includes(to)) {
  console.log("[marktgo-env-sync] already applied");
  process.exit(0);
}
if (!src.includes(from)) {
  throw new Error("[marktgo-env-sync] ensureMarktGoConnectionFromEnv pattern not found");
}

src = src.replace(from, to);
fs.writeFileSync(target, src);
console.log("[marktgo-env-sync] Railway env token now refreshes existing MARKT-GO DB connection");
