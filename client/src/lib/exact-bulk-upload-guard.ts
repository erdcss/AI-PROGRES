import { toast } from "@/hooks/use-toast";

const EXACT_TARGET_STORAGE_KEY = "trendyol_category_exact_target";
const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";
const AUTO_SEND_STORAGE_KEY = "trendyol_auto_marktgo_enabled";
const AUTO_SENT_STORAGE_KEY = "trendyol_auto_marktgo_sent_ids";
const AUTO_TOGGLE_ATTR = "data-trendyol-auto-marktgo-toggle";
const AUTO_SCAN_INTERVAL_MS = 900;

let autoSendCycleBusy = false;
let refreshScheduled = false;

function scopedKey(base: string, tabId?: string): string {
  return tabId ? `${base}:${tabId}` : base;
}

function tabScopeFor(element: Element): { root: HTMLElement; tabId?: string } {
  const root = element.closest<HTMLElement>("[data-app-tab-id]");
  return root ? { root, tabId: root.dataset.appTabId } : { root: document.body };
}

function previewCountFromUi(root: HTMLElement): number {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of buttons) {
    const text = button.textContent || "";
    const match = text.match(/CSV\s+OLARAK\s+DIŞA\s+AKTAR\s*\((\d+)\)/i);
    if (match?.[1]) return Number(match[1]) || 0;
  }
  return 0;
}

function exactTarget(tabId?: string): number | null {
  try {
    const raw = sessionStorage.getItem(scopedKey(EXACT_TARGET_STORAGE_KEY, tabId));
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  } catch {
    return null;
  }
}

function exactReady(tabId?: string): number | null {
  try {
    const raw = sessionStorage.getItem(scopedKey(EXACT_READY_STORAGE_KEY, tabId));
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  } catch {
    return null;
  }
}

function isBulkDestinationButton(button: HTMLButtonElement): boolean {
  const text = button.textContent?.toLocaleUpperCase("tr-TR") || "";
  if (!/\(\d+\)/.test(text)) return false;
  if (text.includes("CSV OLARAK")) return false;
  return text.includes("MARKT-GO") || text.includes("YÜKLE") || text.includes("AKTAR");
}

function isTrendyolScraperScope(root: HTMLElement): boolean {
  if (window.location.pathname.toLocaleLowerCase("tr-TR").includes("trendyol")) return true;
  return Boolean(root.querySelector('input[placeholder*="trendyol.com" i]'));
}

function autoSendEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_SEND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveAutoSendEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SEND_STORAGE_KEY, String(enabled));
  } catch {
    /* localStorage kullanılamıyorsa yalnız mevcut oturumda UI çalışır */
  }
}

function loadAutoSentIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(AUTO_SENT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveAutoSentIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem(AUTO_SENT_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* sessionStorage kullanılamıyorsa tekrar koruması DOM ömrüyle sınırlı kalır */
  }
}

function renderAutoToggle(button: HTMLButtonElement, enabled: boolean): void {
  button.setAttribute("aria-pressed", String(enabled));
  button.title = enabled
    ? "Açık: çekilen her uygun ürün onay beklemeden anında MARKT-GO'ya gönderilir"
    : "Kapalı: ürünler yalnız manuel olarak MARKT-GO'ya gönderilir";
  button.textContent = enabled ? "OTOMATİK GÖNDERİM: AÇIK" : "OTOMATİK GÖNDERİM: KAPALI";

  button.style.height = "42px";
  button.style.padding = "0 18px";
  button.style.borderRadius = "8px";
  button.style.border = enabled ? "1px solid #ef4444" : "1px solid #22c55e";
  button.style.background = enabled ? "#991b1b" : "#166534";
  button.style.color = "#ffffff";
  button.style.fontSize = "12px";
  button.style.fontWeight = "700";
  button.style.letterSpacing = "0.02em";
  button.style.whiteSpace = "nowrap";
  button.style.cursor = "pointer";
  button.style.boxShadow = enabled
    ? "0 0 0 1px rgba(239,68,68,.14), 0 6px 18px rgba(127,29,29,.24)"
    : "0 0 0 1px rgba(34,197,94,.12), 0 6px 18px rgba(20,83,45,.20)";
}

function syncAllAutoToggles(): void {
  const enabled = autoSendEnabled();
  document
    .querySelectorAll<HTMLButtonElement>(`button[${AUTO_TOGGLE_ATTR}]`)
    .forEach((button) => renderAutoToggle(button, enabled));
}

function ensureAutoToggleFor(button: HTMLButtonElement): void {
  const { root } = tabScopeFor(button);
  if (!isTrendyolScraperScope(root)) return;

  const parent = button.parentElement;
  if (!parent) return;
  if (parent.querySelector(`button[${AUTO_TOGGLE_ATTR}]`)) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.setAttribute(AUTO_TOGGLE_ATTR, "true");
  toggle.dataset.autoMarktgoToggle = "true";
  renderAutoToggle(toggle, autoSendEnabled());

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const nextEnabled = !autoSendEnabled();
    saveAutoSendEnabled(nextEnabled);
    syncAllAutoToggles();

    toast({
      title: nextEnabled ? "Otomatik MARKT-GO gönderimi açıldı" : "Otomatik MARKT-GO gönderimi kapatıldı",
      description: nextEnabled
        ? "Hazır olan ve bundan sonra çekilen uygun ürünler onay beklemeden tek tek gönderilecek."
        : "Yeni ürünler otomatik gönderilmeyecek; manuel yükleme butonları kullanılabilir.",
      duration: 5000,
    });

    if (nextEnabled) {
      window.setTimeout(runAutoSendCycle, 50);
    }
  });

  button.insertAdjacentElement("afterend", toggle);
}

function previewIdFromInput(input: HTMLInputElement): string | null {
  const testId = input.getAttribute("data-testid") || "";
  const prefix = "input-add-tag-";
  if (!testId.startsWith(prefix)) return null;
  const id = testId.slice(prefix.length).trim();
  return id || null;
}

function isIndividualDestinationButton(button: HTMLButtonElement): boolean {
  const title = (button.getAttribute("title") || "").toLocaleUpperCase("tr-TR");
  if (!title.includes("MARKT-GO")) return false;
  return title.includes("GÖNDER") || title.includes("YÜKLE") || title.includes("AKTAR");
}

function findIndividualUploadButton(
  input: HTMLInputElement,
  scopeRoot: HTMLElement,
): HTMLButtonElement | null {
  let node: HTMLElement | null = input.parentElement;
  let depth = 0;

  while (node && node !== scopeRoot.parentElement && depth < 12) {
    const candidate = Array.from(node.querySelectorAll<HTMLButtonElement>("button[title]"))
      .find((button) => isIndividualDestinationButton(button));
    if (candidate) return candidate;
    node = node.parentElement;
    depth += 1;
  }

  return null;
}

function runAutoSendCycle(): void {
  if (!autoSendEnabled() || autoSendCycleBusy) return;

  const sentIds = loadAutoSentIds();
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[data-testid^="input-add-tag-"]'),
  );

  for (const input of inputs) {
    const previewId = previewIdFromInput(input);
    if (!previewId) continue;

    const { root, tabId } = tabScopeFor(input);
    if (!isTrendyolScraperScope(root)) continue;

    const sentKey = `${tabId || "main"}:${previewId}`;
    if (sentIds.has(sentKey)) continue;

    const uploadButton = findIndividualUploadButton(input, root);
    if (!uploadButton || uploadButton.disabled || uploadButton.getAttribute("aria-disabled") === "true") {
      continue;
    }

    sentIds.add(sentKey);
    saveAutoSentIds(sentIds);
    uploadButton.dataset.autoMarktgoTriggered = "true";

    autoSendCycleBusy = true;
    uploadButton.click();

    // React yükleme state'i tüm tekil butonları geçici olarak disabled yapar.
    // Kısa süre sonra kilidi bırak; sonraki tarama yalnız yeniden aktif olan ürünü seçer.
    window.setTimeout(() => {
      autoSendCycleBusy = false;
      runAutoSendCycle();
    }, 1200);
    return;
  }
}

function refreshAutoSendUi(): void {
  refreshScheduled = false;

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of buttons) {
    if (isBulkDestinationButton(button)) ensureAutoToggleFor(button);
  }

  syncAllAutoToggles();
  runAutoSendCycle();
}

function scheduleRefresh(): void {
  if (refreshScheduled) return;
  refreshScheduled = true;
  window.requestAnimationFrame(refreshAutoSendUi);
}

function startAutoSendObserver(): void {
  scheduleRefresh();

  const observer = new MutationObserver(() => scheduleRefresh());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "title", "aria-disabled"],
  });

  window.setInterval(() => {
    if (autoSendEnabled()) runAutoSendCycle();
  }, AUTO_SCAN_INTERVAL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAutoSendObserver, { once: true });
} else {
  startAutoSendObserver();
}

/**
 * Kategori exact-count işlemi aktifken yalnız tıklanan sekmenin durumunu kontrol eder.
 * Aynı anda başka sekmelerde devam eden çekimlerin target/ready değerleri karışmaz.
 */
document.addEventListener(
  "click",
  (event) => {
    const targetElement = event.target instanceof Element ? event.target : null;
    const button = targetElement?.closest<HTMLButtonElement>("button");
    if (!button || !isBulkDestinationButton(button)) return;

    const { root, tabId } = tabScopeFor(button);
    const target = exactTarget(tabId);
    if (!target) return;

    const ready = exactReady(tabId);
    const previews = previewCountFromUi(root);
    if (ready === target && previews === target) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    toast({
      title: "Exact-count tamamlanıyor",
      description: `${target} ürün hedeflendi. Bu sekmede şu an ${previews}/${target} ürün hazır; eksik/fazla adetle MARKT-GO aktarımı başlatılmadı.`,
      variant: "destructive",
      duration: 7000,
    });
  },
  true,
);
