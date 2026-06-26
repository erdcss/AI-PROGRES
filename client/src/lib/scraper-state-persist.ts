const STORAGE_KEY = "turmarkt_scraper_state_v1";
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

export type ScraperPersistedState = {
  product: unknown | null;
  csvPreviews: unknown[];
  url: string;
  scrapingMode: "single" | "multi-url";
  workflowStep: string | null;
  savedAt: number;
};

export function saveScraperState(
  state: Omit<ScraperPersistedState, "savedAt">,
): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // quota / private mode
  }
}

export function loadScraperState(
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): ScraperPersistedState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ScraperPersistedState;
    if (!parsed || typeof parsed.savedAt !== "number") {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (Date.now() - parsed.savedAt > maxAgeMs) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

export function clearScraperState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
