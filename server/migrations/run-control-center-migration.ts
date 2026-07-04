import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CONTROL_CENTER_TABLES = [
  "import_jobs",
  "import_job_events",
  "tracking_runs",
  "change_groups",
  "shopify_apply_jobs",
  "audit_logs",
] as const;

function buildCandidatePaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "migrations", "0002_control_center_import_system.sql"),
    path.join(cwd, "dist", "migrations", "0002_control_center_import_system.sql"),
    path.join(__dirname, "0002_control_center_import_system.sql"),
    path.join(__dirname, "..", "migrations", "0002_control_center_import_system.sql"),
    path.join(__dirname, "..", "..", "migrations", "0002_control_center_import_system.sql"),
  ];
}

function resolveSql(): { sql: string; path: string | null } {
  for (const candidate of buildCandidatePaths()) {
    if (fs.existsSync(candidate)) {
      return { sql: fs.readFileSync(candidate, "utf8"), path: candidate };
    }
  }
  throw new Error(
    "Control center migration SQL bulunamadı — migrations/0002_control_center_import_system.sql",
  );
}

let migrationRan = false;

export async function runControlCenterMigration(force = false): Promise<boolean> {
  if (migrationRan && !force) return true;
  if (!pool) {
    console.warn("⚠️ Control center migration atlandı: DATABASE_URL yok");
    return false;
  }

  const { sql, path: sqlPath } = resolveSql();
  try {
    await pool.query(sql);
    migrationRan = true;
    console.log(
      `✅ Control center migration uygulandı${sqlPath ? `: ${sqlPath}` : " (embedded)"}`,
    );
    return true;
  } catch (err) {
    console.error("❌ Control center migration hatası:", (err as Error).message);
    return false;
  }
}

export async function verifyControlCenterTables(): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (!pool) {
    for (const t of CONTROL_CENTER_TABLES) result[t] = false;
    return result;
  }
  for (const table of CONTROL_CENTER_TABLES) {
    const q = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [table],
    );
    result[table] = q.rows[0]?.exists === true;
  }
  return result;
}
