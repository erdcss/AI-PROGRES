export interface ScraperUiSnapshot {
  urlQueue: unknown[];
  product: unknown | null;
  csvPreviews: unknown[];
}

/** URL list clear — preview and product stay intact. */
export function applyUrlQueueClearOnly(state: ScraperUiSnapshot): ScraperUiSnapshot {
  return {
    ...state,
    urlQueue: [],
  };
}

/** Full workspace clear — frontend scrape state reset. */
export function applyWorkspaceClear(state: ScraperUiSnapshot): ScraperUiSnapshot {
  return {
    urlQueue: [],
    product: null,
    csvPreviews: [],
  };
}
