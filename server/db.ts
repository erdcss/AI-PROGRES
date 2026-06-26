import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: connectionString.includes("proxy.rlwy.net")
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : null;

if (!connectionString) {
  console.warn(
    "⚠️ DATABASE_URL tanımlı değil — veritabanı özellikleri devre dışı (scrape/Shopify yine çalışabilir)",
  );
}

const noopDb = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "DATABASE_URL tanımlı değil. Replit/Railway Secrets veya .env dosyasına ekleyin.",
      );
    },
  },
) as ReturnType<typeof drizzle>;

export const db = pool ? drizzle(pool, { schema }) : noopDb;

export async function testConnection() {
  if (!pool) {
    console.warn("⚠️ DATABASE_URL yok — bağlantı testi atlandı");
    return false;
  }
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful", result.rows[0]);
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}