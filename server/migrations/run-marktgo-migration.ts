import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MARKTGO_TABLES = [
  "integration_connections",
  "integration_product_mappings",
  "integration_variant_mappings",
  "integration_category_mappings",
] as const;

function buildCandidatePaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "migrations", "0004_marktgo_integration.sql"),
    path.join(cwd, "dist", "migrations", "0004_marktgo_integration.sql"),
    path.join(__dirname, "0004_marktgo_integration.sql"),
    path.join(__dirname, "..", "migrations", "0004_marktgo_integration.sql"),
    path.join(__dirname, "..", "..", "migrations", "0004_marktgo_integration.sql"),
  ];
}

function resolveSql(): { sql: string; path: string | null } {
  for (const candidate of buildCandidatePaths()) {
    if (fs.existsSync(candidate)) {
      return { sql: fs.readFileSync(candidate, "utf8"), path: candidate };
    }
  }
  throw new Error(
    "MARKT-GO migration SQL bulunamadı — migrations/0004_marktgo_integration.sql",
  );
}

let migrationRan = false;

export async function runMarktGoMigration(force = false): Promise<boolean> {
  if (migrationRan && !force) return true;
  if (!pool) {
    console.warn("⚠️ MARKT-GO migration atlandı: DATABASE_URL yok");
    return false;
  }

  try {
    const { sql, path: sqlPath } = resolveSql();
    await pool.query(sql);
    migrationRan = true;
    console.log(`✅ MARKT-GO migration uygulandı${sqlPath ? `: ${sqlPath}` : ""}`);
    return true;
  } catch (err) {
    console.error("❌ MARKT-GO migration hatası:", (err as Error).message);
    return false;
  }
}
