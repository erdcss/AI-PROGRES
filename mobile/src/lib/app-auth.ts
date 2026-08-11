const SESSION_KEY = "orvian_app_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

type SessionData = { expiresAt: number };

const listeners = new Set<() => void>();
let memorySession: SessionData | null = null;

function getAppPassword() {
  return String(process.env.EXPO_PUBLIC_APP_PASSWORD || "4434").trim();
}

export function verifyAppPassword(password: string) {
  return String(password || "").trim() === getAppPassword();
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeAuth(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function peekLoggedIn(): boolean {
  return Boolean(memorySession && memorySession.expiresAt > Date.now());
}

async function readStore(): Promise<string | null> {
  try {
    const SecureStore = await import("expo-secure-store");
    return SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

async function writeStore(value: string | null): Promise<void> {
  try {
    const SecureStore = await import("expo-secure-store");
    if (value == null) await SecureStore.deleteItemAsync(SESSION_KEY);
    else await SecureStore.setItemAsync(SESSION_KEY, value);
  } catch {
    /* bellek yeterli */
  }
}

export async function restoreAppSession(): Promise<boolean> {
  try {
    const raw = await readStore();
    if (!raw) return peekLoggedIn();
    const parsed = JSON.parse(raw) as SessionData;
    if (typeof parsed?.expiresAt === "number" && parsed.expiresAt > Date.now()) {
      memorySession = parsed;
      notify();
      return true;
    }
    memorySession = null;
    await writeStore(null);
    notify();
    return false;
  } catch {
    return peekLoggedIn();
  }
}

export async function saveAppSession(): Promise<void> {
  const session = { expiresAt: Date.now() + SESSION_DURATION_MS };
  memorySession = session;
  await writeStore(JSON.stringify(session));
  notify();
}

export async function clearAppSession(): Promise<void> {
  memorySession = null;
  await writeStore(null);
  notify();
}
