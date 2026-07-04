/**
 * Must be imported before other server modules so process.env is populated.
 */
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

let loaded = false;

export function ensureEnvLoaded(): boolean {
  if (loaded) return fs.existsSync(envPath);
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
  loaded = true;
  return fs.existsSync(envPath);
}

ensureEnvLoaded();
