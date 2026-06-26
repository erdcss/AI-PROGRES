import { config } from "dotenv";
import fs from "fs";
import path from "path";

process.env.NODE_ENV = "production";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}

const required = ["DATABASE_URL"];
const recommended = [
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_STORE_URL",
  "OPENAI_API_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`⚠️ Deploy: ${key} tanımlı değil — bazı özellikler çalışmayabilir`);
  }
}

for (const key of recommended) {
  if (!process.env[key]) {
    console.warn(`ℹ️ Deploy: ${key} eksik (isteğe bağlı)`);
  }
}

console.log(`🚀 Production başlatılıyor (PORT=${process.env.PORT || "3000"})`);
await import("../dist/index.js");
