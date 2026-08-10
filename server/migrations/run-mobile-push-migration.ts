import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MOBILE_PUSH_TABLES = ["mobile_push_devices"] as const;

function buildCandidatePaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "migrations", "0003_mobile_push_devices.sql"),
    path.join(cwd, "dist", "migrations", "0003_mobile_push_devices.sql"),
    path.join(__dirname, "0003_mobile_push_devices.sql"),
    path.join(__dirname, "..", "migrations", "0003_mobile_push_devices.sql"),
    path.join(__dirname, "..", "..", "migrations", "0003_mobile_push_devices.sql"),
  ];
}

function resolveSql(): { sql: string; path: string | null } {
  for (const candidate of buildCandidatePaths()) {
    if (fs.existsSync(candidate)) {
      return { sql: fs.readFileSync(candidate, "utf8"), path: candidate };
    }
  }
  throw new Error(
    "Mobile push migration SQL bulunamadı — migrations/0003_mobile_push_devices.sql",
  );
}

let migrationRan = false;

export async function runMobilePushMigration(force = false): Promise<boolean> {
  if (migrationRan && !force) return true;
  if (!pool) {
    console.warn("⚠️ Mobile push migration atlandı: DATABASE_URL yok");
    return false;
  }

  try {
    const { sql, path: sqlPath } = resolveSql();
    await pool.query(sql);
    migrationRan = true;
    console.log(
      `✅ Mobile push migration uygulandı${sqlPath ? `: ${sqlPath}` : ""}`,
    );
    return true;
  } catch (err) {
    console.error("❌ Mobile push migration hatası:", (err as Error).message);
    return false;
  }
}
