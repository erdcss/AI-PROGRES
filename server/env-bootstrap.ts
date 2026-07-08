/**
 * Must be imported before other server modules so process.env is populated.
 *
 * Resolution order:
 *   1. .env
 *   2. .env.local
 *   3. env (N) backup files, newest first
 */
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const primaryEnvNames = [".env", ".env.local"];
const backupEnvPattern = /^env \(\d+\)$/i;

let loaded = false;
let resolvedEnvPath: string | null = null;

function getMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function resolveServerEnvPath(): string | null {
  for (const fileName of primaryEnvNames) {
    const candidate = path.join(root, fileName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const backups = entries
    .filter((entry) => entry.isFile() && backupEnvPattern.test(entry.name))
    .map((entry) => {
      const filePath = path.join(root, entry.name);
      return {
        filePath,
        fileName: entry.name,
        mtimeMs: getMtimeMs(filePath),
      };
    })
    .sort((a, b) => {
      if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
      return b.fileName.localeCompare(a.fileName, undefined, { numeric: true });
    });

  return backups[0]?.filePath ?? null;
}

export function ensureEnvLoaded(): boolean {
  if (!loaded) {
    resolvedEnvPath = resolveServerEnvPath();
    if (resolvedEnvPath) {
      config({ path: resolvedEnvPath, override: false });
    }
    loaded = true;
  }

  return Boolean(resolvedEnvPath);
}

export function getLoadedEnvFile(): string | null {
  return resolvedEnvPath ? path.basename(resolvedEnvPath) : null;
}

ensureEnvLoaded();
