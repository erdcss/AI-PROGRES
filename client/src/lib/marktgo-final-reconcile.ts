const AUTO_SEND_STORAGE_KEY = "trendyol_auto_marktgo_enabled";
const EXACT_TARGET_STORAGE_KEY = "trendyol_category_exact_target";
const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";
const AUTO_TRIGGER_ATTR = "data-auto-marktgo-triggered";
const STABLE_READY_MS = 7_000;
const CHECK_INTERVAL_MS = 1_500;

const readySince = new Map<string, number>();
const reconciled = new Set<string>();
let started = false;

function scopedKey(base: string, tabId?: string): string {
  return tabId ? `${base}:${tabId}` : base;
}

function readPositiveInt(base: string, tabId?: string): number | null {
  try {
    const raw = sessionStorage.getItem(scopedKey(base, tabId));
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  } catch {
    return null;
  }
}

function autoSendEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_SEND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function previewCountFromUi(root: HTMLElement): number {
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>("button"))) {
    const text = button.textContent || "";
    const match = text.match(/CSV\s+OLARAK\s+DIŞA\s+AKTAR\s*\((\d+)\)/i);
    if (match?.[1]) return Number(match[1]) || 0;
  }
  return 0;
}

function isBulkDestinationButton(button: HTMLButtonElement, target: number): boolean {
  const text = (button.textContent || "").toLocaleUpperCase("tr-TR");
  if (text.includes("CSV OLARAK")) return false;
  if (!text.includes(`(${target})`)) return false;
  return text.includes("MARKT-GO") || text.includes("YÜKLE") || text.includes("AKTAR");
}

function scopeRoots(): Array<{ root: HTMLElement; tabId?: string }> {
  const tabs = Array.from(document.querySelectorAll<HTMLElement>("[data-app-tab-id]"));
  if (tabs.length > 0) {
    return tabs.map((root) => ({ root, tabId: root.dataset.appTabId }));
  }
  return [{ root: document.body }];
}

function hasIndividualAutoSendInFlight(root: HTMLElement): boolean {
  return Boolean(root.querySelector(`button[${AUTO_TRIGGER_ATTR}="true"]`));
}

function reconcileScope(root: HTMLElement, tabId?: string): void {
  const identity = tabId || "main";
  const target = readPositiveInt(EXACT_TARGET_STORAGE_KEY, tabId);
  const ready = readPositiveInt(EXACT_READY_STORAGE_KEY, tabId);
  const previews = previewCountFromUi(root);
  const cycleKey = `${identity}:${target || 0}`;

  if (!target || ready !== target || previews !== target) {
    readySince.delete(cycleKey);
    reconciled.delete(cycleKey);
    return;
  }

  if (reconciled.has(cycleKey)) return;
  if (hasIndividualAutoSendInFlight(root)) {
    readySince.set(cycleKey, Date.now());
    return;
  }

  const since = readySince.get(cycleKey) ?? Date.now();
  if (!readySince.has(cycleKey)) readySince.set(cycleKey, since);
  if (Date.now() - since < STABLE_READY_MS) return;

  const bulkButton = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => isBulkDestinationButton(button, target));
  if (!bulkButton || bulkButton.disabled || bulkButton.getAttribute("aria-disabled") === "true") return;

  // Tekil otomatik gönderim bazı ürünleri kaçırsa bile, exact çekim tamamlandığında
  // tüm hedef listeyi bir kez toplu senkronize et. MARKT-GO sync idempotent/upsert olduğu
  // için önceden gönderilenler güncellenir, kaçan ürünler tamamlanır.
  reconciled.add(cycleKey);
  bulkButton.dataset.autoMarktgoFinalReconcile = "true";
  bulkButton.click();
}

function runFinalReconcile(): void {
  if (!autoSendEnabled()) {
    readySince.clear();
    reconciled.clear();
    return;
  }
  for (const { root, tabId } of scopeRoots()) reconcileScope(root, tabId);
}

export function startMarktGoFinalReconcile(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.setInterval(runFinalReconcile, CHECK_INTERVAL_MS);
  window.setTimeout(runFinalReconcile, 1_000);
}

startMarktGoFinalReconcile();
