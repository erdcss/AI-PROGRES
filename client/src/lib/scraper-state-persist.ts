const STORAGE_KEY = "turmarkt_scraper_state_v1";
/** Scraper verisi 24 saat saklanır (sayfa yenilemesinde kaybolmasın) */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PREVIEW_ROWS = 40;

export type ScraperPersistedState = {
  product: unknown | null;
  csvPreviews: unknown[];
  url: string;
  pendingUrls?: Array<string | { url: string; status?: string; error?: string }>;
  scrapingMode: "single" | "multi-url";
  workflowStep: string | null;
  savedAt: number;
};

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(json: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

function migrateFromSessionStorage(): void {
  try {
    const legacy = sessionStorage.getItem(STORAGE_KEY);
    if (legacy && !readRaw()) {
      writeRaw(legacy);
    }
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function compactPreview(preview: unknown): unknown {
  if (!preview || typeof preview !== "object") return preview;
  const row = preview as Record<string, unknown>;
  const csv = typeof row.csvContent === "string" ? row.csvContent : "";
  return {
    ...row,
    csvContent: csv.length > 12_000 ? `${csv.slice(0, 12_000)}\n...[truncated]` : csv,
  };
}

function buildPayload(state: Omit<ScraperPersistedState, "savedAt">): ScraperPersistedState {
  const csvPreviews = Array.isArray(state.csvPreviews)
    ? state.csvPreviews.slice(0, MAX_PREVIEW_ROWS).map(compactPreview)
    : [];

  return {
    product: state.product ?? null,
    csvPreviews,
    url: state.url ?? "",
    pendingUrls: Array.isArray(state.pendingUrls)
      ? state.pendingUrls.slice(0, 50)
      : [],
    scrapingMode: state.scrapingMode ?? "single",
    workflowStep: state.workflowStep ?? null,
    savedAt: Date.now(),
  };
}

function buildLightPayload(state: Omit<ScraperPersistedState, "savedAt">): ScraperPersistedState {
  const csvPreviews = (Array.isArray(state.csvPreviews) ? state.csvPreviews : [])
    .slice(0, MAX_PREVIEW_ROWS)
    .map((preview) => {
      if (!preview || typeof preview !== "object") return preview;
      const row = preview as Record<string, unknown>;
      return {
        id: row.id,
        productTitle: row.productTitle,
        sourceUrl: row.sourceUrl,
        images: row.images,
        price: row.price,
        brand: row.brand,
        variants: row.variants,
        createdAt: row.createdAt,
        csvContent: "",
      };
    });

  return {
    product: state.product ?? null,
    csvPreviews,
    url: state.url ?? "",
    pendingUrls: Array.isArray(state.pendingUrls)
      ? state.pendingUrls.slice(0, 50)
      : [],
    scrapingMode: state.scrapingMode ?? "single",
    workflowStep: state.workflowStep ?? null,
    savedAt: Date.now(),
  };
}

export function saveScraperState(
  state: Omit<ScraperPersistedState, "savedAt">,
): void {
  migrateFromSessionStorage();

  const full = buildPayload(state);
  if (writeRaw(JSON.stringify(full))) return;

  const light = buildLightPayload(state);
  writeRaw(JSON.stringify(light));
}

export function loadScraperState(
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): ScraperPersistedState | null {
  migrateFromSessionStorage();

  try {
    const raw = readRaw();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ScraperPersistedState;
    if (!parsed || typeof parsed.savedAt !== "number") {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (Date.now() - parsed.savedAt > maxAgeMs) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearScraperState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** URL kuyruğunu anında kaydet (sayfa yenilenince kaybolmasın) */
export function savePendingUrls(
  urls: Array<string | { url: string; status?: string; error?: string }>,
): void {
  const existing = loadScraperState();
  saveScraperState({
    product: existing?.product ?? null,
    csvPreviews: existing?.csvPreviews ?? [],
    url: existing?.url ?? "",
    pendingUrls: urls,
    scrapingMode: existing?.scrapingMode ?? "single",
    workflowStep: existing?.workflowStep ?? null,
  });
}
