import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { pool, testConnection } from "./db";
import {
  CORE_DB_TABLES,
  findMissingCoreTables,
  markSchemaPushAttempted,
  refreshDbFeatureState,
} from "./db-health";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

function runDrizzlePush(): boolean {
  console.log("📦 Veritabanı şeması oluşturuluyor (drizzle-kit push)...");

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["drizzle-kit", "push", "--force"],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    console.error(
      "❌ drizzle-kit push başarısız. Manuel: npm run db:push",
    );
    return false;
  }

  return true;
}

/**
 * Eksik tablolar varsa drizzle push ile oluşturur.
 * Sunucu başlamadan önce bir kez çağrılmalıdır.
 */
export async function ensureDatabaseSchema(): Promise<boolean> {
  if (!pool) {
    console.warn("⚠️ DATABASE_URL yok — veritabanı şeması atlandı");
    return false;
  }

  await testConnection();

  let missing = await findMissingCoreTables();
  if (missing.length === 0) {
    await refreshDbFeatureState(true);
    console.log("✅ Veritabanı tabloları hazır");
    return true;
  }

  console.warn(`⚠️ Eksik veritabanı tabloları (${missing.length}): ${missing.join(", ")}`);
  markSchemaPushAttempted();

  const pushed = runDrizzlePush();
  if (!pushed) {
    await refreshDbFeatureState(true);
    return false;
  }

  missing = await findMissingCoreTables();
  await refreshDbFeatureState(true);

  if (missing.length === 0) {
    console.log(`✅ ${CORE_DB_TABLES.length} çekirdek tablo oluşturuldu / doğrulandı`);
    return true;
  }

  console.error(`❌ Hâlâ eksik tablolar: ${missing.join(", ")}`);
  return false;
}
