export const SESSION_KEY = "turmarkt_app_session";
const LEGACY_SESSION_KEY = "lastLogin";
export const SESSION_ACTIVE_KEY = "turmarkt_session_active";
/** Oturum süresi: 24 saat */
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

type SessionData = {
  createdAt: number;
  expiresAt: number;
};

const listeners = new Set<() => void>();
let lastNotifiedLoggedIn: boolean | undefined;
let lastSessionTouchAt = 0;

function notifySessionChange() {
  listeners.forEach((listener) => listener());
}

function notifyLoginStateIfChanged() {
  const loggedIn = peekValidAppSession();
  if (lastNotifiedLoggedIn === loggedIn) return;
  lastNotifiedLoggedIn = loggedIn;
  notifySessionChange();
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
  try {
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
  } catch {
    return null;
  }
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
  markSessionActive();
  localStorage.removeItem(LEGACY_SESSION_KEY);
  return session;
}

function peekSession(): SessionData | null {
  return readSession();
}

function isSessionValid(session: SessionData | null): boolean {
  return session !== null && session.expiresAt > now();
}

/** İlk render için localStorage + sessionStorage (turmarkt_session_active) okuması */
export function getInitialLoggedInState(): boolean {
  return getAppSessionSnapshot();
}

export function getAppSessionSnapshot(): boolean {
  return peekValidAppSession();
}

export function getAppSessionServerSnapshot(): boolean {
  return getAppSessionSnapshot();
}

function removeSessionStorage() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  try {
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

function markSessionActive() {
  try {
    sessionStorage.setItem(SESSION_ACTIVE_KEY, "1");
  } catch {
    // ignore
  }
}

function hasActiveSessionFlag(): boolean {
  try {
    return sessionStorage.getItem(SESSION_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Render sırasında güvenle çağrılabilir — yan etkisiz okuma */
export function peekValidAppSession(): boolean {
  try {
    if (isSessionValid(peekSession())) {
      return true;
    }
    return hasActiveSessionFlag();
  } catch {
    return hasActiveSessionFlag();
  }
}

/** localStorage boşalırsa oturumu geri yazar — yalnızca useEffect içinden çağırın */
export function ensureAppSessionRestored(): void {
  if (isSessionValid(peekSession())) return;
  if (!hasActiveSessionFlag()) return;
  saveAppSession();
}

if (typeof window !== "undefined") {
  migrateLegacySession();
  lastNotifiedLoggedIn = peekValidAppSession();
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
    markSessionActive();
    lastSessionTouchAt = timestamp;
    notifyLoginStateIfChanged();
  } catch {
    // localStorage unavailable (private mode, quota, etc.)
  }
}

export function touchAppSession() {
  if (!peekValidAppSession()) return;

  const timestamp = now();
  if (timestamp - lastSessionTouchAt < SESSION_TOUCH_INTERVAL_MS) {
    return;
  }
  lastSessionTouchAt = timestamp;

  try {
    writeSession({
      createdAt: timestamp,
      expiresAt: timestamp + SESSION_DURATION_MS,
    });
    markSessionActive();
  } catch {
    // ignore
  }
}

export function clearAppSession() {
  try {
    removeSessionStorage();
    notifyLoginStateIfChanged();
  } catch {
    // ignore
  }
}

/** Süresi dolmuş oturumu temizler; aktif oturum bayrağı varsa yeniler */
export function pruneExpiredAppSession(): boolean {
  const session = peekSession();
  if (isSessionValid(session)) {
    return true;
  }

  if (hasActiveSessionFlag()) {
    saveAppSession();
    return true;
  }

  if (session) {
    try {
      removeSessionStorage();
    } catch {
      /* ignore */
    }
    notifyLoginStateIfChanged();
  }
  return false;
}

export function hasValidAppSession(): boolean {
  return pruneExpiredAppSession();
}

export function subscribeAppSession(callback: () => void) {
  listeners.add(callback);

  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === LEGACY_SESSION_KEY) {
      lastNotifiedLoggedIn = peekValidAppSession();
      callback();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}
