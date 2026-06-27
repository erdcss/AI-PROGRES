import { pool } from "./db";

export const CORE_DB_TABLES = [
  "products",
  "product_variants",
  "shopify_memory_products",
  "url_tracking",
  "monitoring_schedules",
  "shopify_credentials",
] as const;

export type CoreDbTable = (typeof CORE_DB_TABLES)[number];

type DbFeatureState = {
  ready: boolean;
  missingTables: string[];
  checkedAt: number;
  pushAttempted: boolean;
};

let state: DbFeatureState = {
  ready: false,
  missingTables: [...CORE_DB_TABLES],
  checkedAt: 0,
  pushAttempted: false,
};

const CHECK_TTL_MS = 60_000;

export function isPgMissingRelationError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  return err?.code === "42P01" || /relation .* does not exist/i.test(String(err?.message ?? ""));
}

export function getMissingTableFromError(error: unknown): string | null {
  const message = String((error as { message?: string })?.message ?? "");
  const match = message.match(/relation "([^"]+)" does not exist/i);
  return match?.[1] ?? null;
}

export async function tableExists(tableName: string): Promise<boolean> {
  if (!pool) return false;

  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass('public.${tableName}') IS NOT NULL AS exists`,
  );
  return Boolean(result.rows[0]?.exists);
}

export async function findMissingCoreTables(): Promise<string[]> {
  if (!pool) return [...CORE_DB_TABLES];

  const missing: string[] = [];
  for (const table of CORE_DB_TABLES) {
    if (!(await tableExists(table))) {
      missing.push(table);
    }
  }
  return missing;
}

export function isDbFeatureReady(): boolean {
  return state.ready;
}

export function getDbFeatureState(): Readonly<DbFeatureState> {
  return state;
}

export async function refreshDbFeatureState(force = false): Promise<DbFeatureState> {
  if (!pool) {
    state = {
      ready: false,
      missingTables: [...CORE_DB_TABLES],
      checkedAt: Date.now(),
      pushAttempted: state.pushAttempted,
    };
    return state;
  }

  if (!force && state.checkedAt > 0 && Date.now() - state.checkedAt < CHECK_TTL_MS) {
    return state;
  }

  const missingTables = await findMissingCoreTables();
  state = {
    ready: missingTables.length === 0,
    missingTables,
    checkedAt: Date.now(),
    pushAttempted: state.pushAttempted,
  };
  return state;
}

export async function assertCoreTablesReady(tableNames: CoreDbTable[] | string[]): Promise<boolean> {
  if (!pool) return false;

  for (const table of tableNames) {
    if (!(await tableExists(table))) {
      return false;
    }
  }
  return true;
}

export function markSchemaPushAttempted(): void {
  state = { ...state, pushAttempted: true };
}

export function logMissingTableOnce(context: string, tableName: string): void {
  console.warn(
    `⚠️ ${context}: "${tableName}" tablosu yok — DB özelliği atlandı (npm run db:push veya sunucu otomatik kurulumu)`,
  );
}

let warnedContexts = new Set<string>();

export function warnDbFeatureSkipped(context: string, missingTables: string[]): void {
  const key = `${context}:${missingTables.join(",")}`;
  if (warnedContexts.has(key)) return;
  warnedContexts.add(key);
  console.warn(
    `⚠️ ${context} devre dışı — eksik tablolar: ${missingTables.join(", ")}`,
  );
}
