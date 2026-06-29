const STORAGE_KEY = "turmarkt_recent_urls";
const MAX_URLS = 24;
const UPDATE_EVENT = "turmarkt:url-history-updated";

function readRaw(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch {
    return [];
  }
}

function writeRaw(urls: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  } catch {
    /* quota / private mode */
  }
}

export function getRecentUrls(): string[] {
  return readRaw();
}

export function addRecentUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;

  const next = [trimmed, ...readRaw().filter((entry) => entry !== trimmed)].slice(0, MAX_URLS);
  writeRaw(next);
}

/** Scraper sayfası geçmişi — global URL takibini etkilemez */
export function clearRecentUrls(): void {
  writeRaw([]);
}

export function subscribeRecentUrls(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };

  window.addEventListener(UPDATE_EVENT, listener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(UPDATE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const URL_HISTORY_UPDATE_EVENT = UPDATE_EVENT;
