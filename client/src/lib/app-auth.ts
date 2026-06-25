export const SESSION_KEY = "turmarkt_app_session";
const LEGACY_SESSION_KEY = "lastLogin";
const SESSION_DURATION_MS = 30 * 60 * 1000;

type SessionData = {
  createdAt: number;
  expiresAt: number;
};

const listeners = new Set<() => void>();

function notifySessionChange() {
  listeners.forEach((listener) => listener());
}

function now() {
  return Date.now();
}

function getAppPassword() {
  return String(import.meta.env.VITE_APP_PASSWORD || "4434").trim();
}

function writeSession(session: SessionData) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function readSession(): SessionData | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as SessionData;
  if (
    typeof parsed?.expiresAt !== "number" ||
    !Number.isFinite(parsed.expiresAt)
  ) {
    return null;
  }

  return parsed;
}

function migrateLegacySession(): SessionData | null {
  const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
  if (!legacy) return null;

  const lastLoginTime = Number(legacy);
  if (!Number.isFinite(lastLoginTime)) return null;

  const expiresAt = lastLoginTime + SESSION_DURATION_MS;
  if (expiresAt <= now()) return null;

  const session: SessionData = { createdAt: lastLoginTime, expiresAt };
  writeSession(session);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  return session;
}

export function verifyAppPassword(password: string) {
  return String(password || "").trim() === getAppPassword();
}

export function saveAppSession() {
  try {
    const timestamp = now();
    writeSession({
      createdAt: timestamp,
      expiresAt: timestamp + SESSION_DURATION_MS,
    });
    notifySessionChange();
  } catch {
    // localStorage unavailable (private mode, quota, etc.)
  }
}

export function touchAppSession() {
  if (!hasValidAppSession()) return;
  try {
    const timestamp = now();
    writeSession({
      createdAt: timestamp,
      expiresAt: timestamp + SESSION_DURATION_MS,
    });
    notifySessionChange();
  } catch {
    // ignore
  }
}

export function clearAppSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    notifySessionChange();
  } catch {
    // ignore
  }
}

export function hasValidAppSession(): boolean {
  try {
    let session = readSession();
    if (!session) {
      session = migrateLegacySession();
    }
    if (!session) return false;

    if (session.expiresAt <= now()) {
      clearAppSession();
      return false;
    }

    return true;
  } catch {
    clearAppSession();
    return false;
  }
}

export function subscribeAppSession(callback: () => void) {
  listeners.add(callback);

  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === LEGACY_SESSION_KEY) {
      callback();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function getAppSessionSnapshot(): boolean {
  return hasValidAppSession();
}

export function getAppSessionServerSnapshot(): boolean {
  return false;
}
