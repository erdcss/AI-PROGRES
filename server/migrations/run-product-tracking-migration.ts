import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";
import {
  PRODUCT_TRACKING_MIGRATION_SQL,
  PRODUCT_TRACKING_SETTINGS_SQL,
  PRODUCT_TRACKING_TABLES,
  augmentMigrationSql,
  migrationSqlIncludesSettingsTables,
} from "./product-tracking-sql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ProductTrackingMigrationStatus = {
  applied: boolean;
  sqlSource: "file" | "embedded" | "none";
  sqlPath: string | null;
  triedPaths: string[];
  tables: Record<string, boolean>;
  allTablesReady: boolean;
  error: string | null;
};

let migrationRan = false;
let lastStatus: ProductTrackingMigrationStatus | null = null;

function buildCandidatePaths(): string[] {
  const cwd = process.cwd();
  const candidates = [
    "/app/migrations/0001_product_tracking_system.sql",
    path.join(cwd, "migrations", "0001_product_tracking_system.sql"),
    path.join(cwd, "dist", "migrations", "0001_product_tracking_system.sql"),
    path.join(__dirname, "0001_product_tracking_system.sql"),
    path.join(__dirname, "..", "..", "migrations", "0001_product_tracking_system.sql"),
    path.join(__dirname, "..", "migrations", "0001_product_tracking_system.sql"),
    path.resolve("migrations", "0001_product_tracking_system.sql"),
  ];
  return [...new Set(candidates)];
}

function resolveMigrationSql(): {
  sql: string;
  source: "file" | "embedded";
  path: string | null;
  triedPaths: string[];
} {
  const triedPaths = buildCandidatePaths();

  for (const candidate of triedPaths) {
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, "utf8");
      const sql = augmentMigrationSql(raw);
      if (!migrationSqlIncludesSettingsTables(raw)) {
        console.log(`📄 Product tracking migration SQL bulundu (eski): ${candidate}`);
      } else {
        console.log(`📄 Product tracking migration SQL bulundu: ${candidate}`);
      }
      return { sql, source: "file", path: candidate, triedPaths };
    }
  }

  console.warn("⚠️ Product tracking migration SQL dosyası bulunamadı — embedded fallback");
  return {
    sql: PRODUCT_TRACKING_MIGRATION_SQL,
    source: "embedded",
    path: null,
    triedPaths,
  };
}

async function verifyTables(): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (!pool) {
    for (const t of PRODUCT_TRACKING_TABLES) result[t] = false;
    return result;
  }

  for (const table of PRODUCT_TRACKING_TABLES) {
    const q = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass('public.${table}') IS NOT NULL AS exists`,
    );
    result[table] = Boolean(q.rows[0]?.exists);
  }
  return result;
}

async function applySql(sql: string): Promise<void> {
  if (!pool) throw new Error("no_database_pool");
  await pool.query(sql);
}

export function getProductTrackingMigrationStatus(): ProductTrackingMigrationStatus {
  if (lastStatus) return lastStatus;
  return {
    applied: false,
    sqlSource: "none",
    sqlPath: null,
    triedPaths: buildCandidatePaths(),
    tables: Object.fromEntries(PRODUCT_TRACKING_TABLES.map((t) => [t, false])),
    allTablesReady: false,
    error: "Migration henüz çalıştırılmadı",
  };
}

export async function isMissingRelationError(err: unknown, table?: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("does not exist")) return false;
  return table ? msg.includes(table) : true;
}

export async function tableExists(tableName: string): Promise<boolean> {
  if (!pool) return false;
  const q = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.${tableName}') IS NOT NULL AS exists`,
  );
  return Boolean(q.rows[0]?.exists);
}

/** Settings tabloları eksikse migration'ı tekrar dener */
export async function ensureProductTrackingTablesReady(): Promise<boolean> {
  const tables = await verifyTables();
  const settingsOk = tables.tracking_settings && tables.scrape_gateway_settings;
  if (settingsOk && PRODUCT_TRACKING_TABLES.every((t) => tables[t])) {
    return true;
  }
  return runProductTrackingMigration(true);
}

export async function runProductTrackingMigration(force = false): Promise<boolean> {
  if (!pool) {
    console.error("❌ Product tracking migration atlandı: DATABASE_URL / pool yok");
    lastStatus = {
      applied: false,
      sqlSource: "none",
      sqlPath: null,
      triedPaths: buildCandidatePaths(),
      tables: Object.fromEntries(PRODUCT_TRACKING_TABLES.map((t) => [t, false])),
      allTablesReady: false,
      error: "no_database_pool",
    };
    return false;
  }

  if (!force && migrationRan && lastStatus?.allTablesReady) {
    return true;
  }

  const { sql, source, path: sqlPath, triedPaths } = resolveMigrationSql();

  try {
    await applySql(sql);

    let tables = await verifyTables();
    const missingSettings =
      !tables.tracking_settings || !tables.scrape_gateway_settings;

    if (missingSettings) {
      console.warn("⚠️ Settings tabloları eksik — supplement SQL uygulanıyor");
      await applySql(PRODUCT_TRACKING_SETTINGS_SQL);
      tables = await verifyTables();
    }

    migrationRan = true;
    const allTablesReady = PRODUCT_TRACKING_TABLES.every((t) => tables[t]);

    lastStatus = {
      applied: true,
      sqlSource: source,
      sqlPath,
      triedPaths,
      tables,
      allTablesReady,
      error: allTablesReady ? null : "Bazı tablolar oluşturulamadı",
    };

    if (allTablesReady) {
      console.log(
        "✅ Product tracking migration uygulandı — 8 tablo hazır:",
        PRODUCT_TRACKING_TABLES.join(", "),
      );
    } else {
      const missing = PRODUCT_TRACKING_TABLES.filter((t) => !tables[t]);
      console.error("❌ Product tracking migration sonrası eksik tablolar:", missing.join(", "));
    }

    return allTablesReady;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Product tracking migration hatası:", message);

    try {
      await applySql(PRODUCT_TRACKING_SETTINGS_SQL);
    } catch (supplementErr) {
      console.error("❌ Settings supplement SQL hatası:", supplementErr);
    }

    const tables = await verifyTables().catch(() =>
      Object.fromEntries(PRODUCT_TRACKING_TABLES.map((t) => [t, false])),
    );

    lastStatus = {
      applied: false,
      sqlSource: source,
      sqlPath,
      triedPaths,
      tables,
      allTablesReady: PRODUCT_TRACKING_TABLES.every((t) => tables[t]),
      error: message,
    };
    return lastStatus.allTablesReady;
  }
}

export async function refreshProductTrackingTableStatus(): Promise<ProductTrackingMigrationStatus> {
  if (!pool) return getProductTrackingMigrationStatus();
  const tables = await verifyTables();
  const allTablesReady = PRODUCT_TRACKING_TABLES.every((t) => tables[t]);
  lastStatus = {
    ...(lastStatus ?? getProductTrackingMigrationStatus()),
    tables,
    allTablesReady,
  };
  return lastStatus;
}
