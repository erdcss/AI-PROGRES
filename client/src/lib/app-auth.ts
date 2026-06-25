const SESSION_KEY = 'lastLogin';
const SESSION_MS = 30 * 60 * 1000;

/** Uygulama giriş şifresi — Railway'de VITE_APP_PASSWORD ile override edilebilir */
export function getAppPassword(): string {
  return import.meta.env.VITE_APP_PASSWORD || '4434';
}

export function hasValidAppSession(): boolean {
  try {
    const lastLogin = localStorage.getItem(SESSION_KEY);
    if (!lastLogin) return false;
    const ts = parseInt(lastLogin, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SESSION_MS;
  } catch {
    return false;
  }
}

export function saveAppSession(): void {
  localStorage.setItem(SESSION_KEY, Date.now().toString());
}

export function clearAppSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function verifyAppPassword(password: string): boolean {
  return password.trim() === getAppPassword();
}
