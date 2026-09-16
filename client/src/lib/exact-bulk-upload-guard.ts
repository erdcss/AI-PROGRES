import { toast } from "@/hooks/use-toast";

const EXACT_TARGET_STORAGE_KEY = "trendyol_category_exact_target";
const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";
const AUTO_SEND_STORAGE_KEY = "trendyol_auto_marktgo_enabled";
const AUTO_SENT_STORAGE_KEY = "trendyol_auto_marktgo_sent_ids";
const LEGACY_AUTO_TOGGLE_ATTR = "data-trendyol-auto-marktgo-toggle";
const SETTINGS_BUTTON_ATTR = "data-trendyol-settings-button";
const SETTINGS_OVERLAY_ATTR = "data-trendyol-settings-overlay";
const SETTINGS_PANEL_ATTR = "data-trendyol-settings-panel";
const ORIGINAL_MARKTGO_ATTR = "data-trendyol-original-marktgo";
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

function findHeaderRow(): HTMLElement | null {
  const homeButton = document.querySelector<HTMLElement>('[data-testid="button-home"]');
  if (!homeButton) return null;

  let node = homeButton.parentElement;
  while (node && node !== document.body) {
    if (node.classList.contains("justify-between") && node.classList.contains("items-center")) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function findOriginalMarktGoButton(): HTMLButtonElement | null {
  const marked = document.querySelector<HTMLButtonElement>(`button[${ORIGINAL_MARKTGO_ATTR}]`);
  if (marked) return marked;

  const headerRow = findHeaderRow();
  if (!headerRow) return null;

  const candidate = Array.from(headerRow.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    if (button.hasAttribute(SETTINGS_BUTTON_ATTR)) return false;
    const text = (button.textContent || "").trim().toLocaleUpperCase("tr-TR");
    return text.startsWith("MARKT-GO ·") || text === "MARKT-GO";
  });

  if (candidate) candidate.setAttribute(ORIGINAL_MARKTGO_ATTR, "true");
  return candidate ?? null;
}

function findAutoTagSwitch(): HTMLButtonElement | null {
  const container = document.querySelector<HTMLElement>('[data-testid="toggle-auto-tag"]');
  if (!container) return null;
  return (
    container.querySelector<HTMLButtonElement>('[data-testid="switch-auto-tag"]') ||
    container.querySelector<HTMLButtonElement>('button[role="switch"]') ||
    container.querySelector<HTMLButtonElement>("button")
  );
}

function readAutoTagEnabled(): boolean {
  const toggle = findAutoTagSwitch();
  if (!toggle) return false;
  return toggle.getAttribute("aria-checked") === "true" || toggle.dataset.state === "checked";
}

function setDisplayNone(element: HTMLElement | null): void {
  if (element && element.style.display !== "none") element.style.display = "none";
}

function hideLegacyTrendyolControls(): void {
  setDisplayNone(document.querySelector<HTMLElement>('[data-testid="button-telegram-notifications"]'));
  setDisplayNone(document.querySelector<HTMLElement>('[data-testid="toggle-auto-tag"]'));
  setDisplayNone(findOriginalMarktGoButton());

  document.querySelectorAll<HTMLButtonElement>(`button[${LEGACY_AUTO_TOGGLE_ATTR}]`).forEach((button) => {
    button.remove();
  });
}

function settingsButtonSvg(): string {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1a1.7 1.7 0 0 0-1.4-1.66 1.7 1.7 0 0 0-1.6.47l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.76 8.2a1.7 1.7 0 0 0-.47-1.6l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.8 4.76a1.7 1.7 0 0 0 1.6-.47l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.17.38.48.7.86.9.27.14.57.2.87.2H21v4h-.1a1.7 1.7 0 0 0-1.5.9Z"/>
    </svg>`;
}

function createSettingsButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(SETTINGS_BUTTON_ATTR, "true");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "trendyol-settings-panel");
  button.innerHTML = `${settingsButtonSvg()}<span>Ayarlar</span>`;
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.gap = "8px";
  button.style.height = "36px";
  button.style.padding = "0 16px";
  button.style.borderRadius = "6px";
  button.style.border = "1px solid rgba(63,63,70,.9)";
  button.style.background = "rgba(39,39,42,.42)";
  button.style.color = "#d4d4d8";
  button.style.fontSize = "14px";
  button.style.fontWeight = "500";
  button.style.cursor = "pointer";
  button.style.transition = "background .18s ease,border-color .18s ease,color .18s ease";
  button.addEventListener("mouseenter", () => {
    button.style.background = "rgba(39,39,42,.75)";
    button.style.borderColor = "#52525b";
    button.style.color = "#f4f4f5";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "rgba(39,39,42,.42)";
    button.style.borderColor = "rgba(63,63,70,.9)";
    button.style.color = "#d4d4d8";
  });
  button.addEventListener("click", () => setSettingsPanelOpen(true));
  return button;
}

function createToggleButton(role: "auto-tag" | "auto-send"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.settingsToggle = role;
  button.setAttribute("role", "switch");
  button.style.position = "relative";
  button.style.width = "44px";
  button.style.height = "24px";
  button.style.border = "1px solid #3f3f46";
  button.style.borderRadius = "999px";
  button.style.padding = "0";
  button.style.cursor = "pointer";
  button.style.transition = "all .18s ease";

  const knob = document.createElement("span");
  knob.dataset.settingsToggleKnob = "true";
  knob.style.position = "absolute";
  knob.style.top = "3px";
  knob.style.left = "3px";
  knob.style.width = "16px";
  knob.style.height = "16px";
  knob.style.borderRadius = "999px";
  knob.style.background = "#d4d4d8";
  knob.style.transition = "transform .18s ease";
  button.appendChild(knob);

  return button;
}

function createSettingRow(params: {
  title: string;
  description: string;
  action: HTMLElement;
  role: string;
}): HTMLDivElement {
  const row = document.createElement("div");
  row.dataset.settingsRow = params.role;
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "16px";
  row.style.padding = "16px";
  row.style.border = "1px solid #27272a";
  row.style.borderRadius = "10px";
  row.style.background = "rgba(24,24,27,.72)";

  const copy = document.createElement("div");
  copy.style.minWidth = "0";
  copy.style.flex = "1";

  const title = document.createElement("div");
  title.textContent = params.title;
  title.style.color = "#f4f4f5";
  title.style.fontSize = "14px";
  title.style.fontWeight = "600";

  const description = document.createElement("div");
  description.textContent = params.description;
  description.style.color = "#71717a";
  description.style.fontSize = "12px";
  description.style.lineHeight = "1.45";
  description.style.marginTop = "4px";

  copy.append(title, description);
  row.append(copy, params.action);
  return row;
}

function createSettingsPanel(): void {
  if (document.querySelector(`[${SETTINGS_PANEL_ATTR}]`)) return;

  const overlay = document.createElement("div");
  overlay.setAttribute(SETTINGS_OVERLAY_ATTR, "true");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483000";
  overlay.style.background = "rgba(0,0,0,.52)";
  overlay.style.backdropFilter = "blur(2px)";
  overlay.style.opacity = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.transition = "opacity .2s ease";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) setSettingsPanelOpen(false);
  });

  const panel = document.createElement("aside");
  panel.id = "trendyol-settings-panel";
  panel.setAttribute(SETTINGS_PANEL_ATTR, "true");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Trendyol ayarları");
  panel.style.position = "absolute";
  panel.style.top = "0";
  panel.style.right = "0";
  panel.style.width = "min(390px, 92vw)";
  panel.style.height = "100%";
  panel.style.padding = "20px";
  panel.style.boxSizing = "border-box";
  panel.style.background = "#09090b";
  panel.style.borderLeft = "1px solid #27272a";
  panel.style.boxShadow = "-24px 0 60px rgba(0,0,0,.35)";
  panel.style.transform = "translateX(100%)";
  panel.style.transition = "transform .22s ease";
  panel.style.overflowY = "auto";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.marginBottom = "22px";

  const heading = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "Ayarlar";
  title.style.margin = "0";
  title.style.color = "#fafafa";
  title.style.fontSize = "20px";
  title.style.fontWeight = "650";
  const subtitle = document.createElement("p");
  subtitle.textContent = "Trendyol aktarım ve entegrasyon seçenekleri";
  subtitle.style.margin = "5px 0 0";
  subtitle.style.color = "#71717a";
  subtitle.style.fontSize = "12px";
  heading.append(title, subtitle);

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Ayarları kapat");
  close.textContent = "×";
  close.style.width = "34px";
  close.style.height = "34px";
  close.style.borderRadius = "8px";
  close.style.border = "1px solid #27272a";
  close.style.background = "#18181b";
  close.style.color = "#a1a1aa";
  close.style.fontSize = "24px";
  close.style.lineHeight = "28px";
  close.style.cursor = "pointer";
  close.addEventListener("click", () => setSettingsPanelOpen(false));
  header.append(heading, close);

  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gap = "12px";

  const marktGoAction = document.createElement("button");
  marktGoAction.type = "button";
  marktGoAction.dataset.settingsAction = "marktgo";
  marktGoAction.style.minWidth = "96px";
  marktGoAction.style.height = "34px";
  marktGoAction.style.padding = "0 12px";
  marktGoAction.style.borderRadius = "7px";
  marktGoAction.style.border = "1px solid #3f3f46";
  marktGoAction.style.background = "#18181b";
  marktGoAction.style.color = "#d4d4d8";
  marktGoAction.style.fontSize = "12px";
  marktGoAction.style.fontWeight = "600";
  marktGoAction.style.cursor = "pointer";
  marktGoAction.addEventListener("click", () => {
    const original = findOriginalMarktGoButton();
    if (!original) {
      toast({
        title: "MARKT-GO ayarı bulunamadı",
        description: "Sayfayı yenileyip tekrar deneyin.",
        variant: "destructive",
      });
      return;
    }
    setSettingsPanelOpen(false);
    window.setTimeout(() => original.click(), 40);
  });

  const autoTagToggle = createToggleButton("auto-tag");
  autoTagToggle.addEventListener("click", () => {
    const original = findAutoTagSwitch();
    if (!original) {
      toast({
        title: "Otomatik etiket ayarı bulunamadı",
        description: "Sayfayı yenileyip tekrar deneyin.",
        variant: "destructive",
      });
      return;
    }
    original.click();
    window.setTimeout(syncSettingsPanel, 40);
  });

  const autoSendToggle = createToggleButton("auto-send");
  autoSendToggle.addEventListener("click", () => {
    const nextEnabled = !autoSendEnabled();
    saveAutoSendEnabled(nextEnabled);
    syncSettingsPanel();

    toast({
      title: nextEnabled ? "Otomatik MARKT-GO gönderimi açıldı" : "Otomatik MARKT-GO gönderimi kapatıldı",
      description: nextEnabled
        ? "Hazır olan ve bundan sonra çekilen uygun ürünler onay beklemeden tek tek gönderilecek."
        : "Yeni ürünler otomatik gönderilmeyecek; manuel yükleme butonları kullanılabilir.",
      duration: 5000,
    });

    if (nextEnabled) window.setTimeout(runAutoSendCycle, 50);
  });

  content.append(
    createSettingRow({
      title: "MARKT-GO",
      description: "Bağlantı, API ve sağlık kontrolü ayarları",
      action: marktGoAction,
      role: "marktgo",
    }),
    createSettingRow({
      title: "Otomatik Etiket",
      description: "Çekilen ürünlere eşleşen koleksiyon etiketlerini otomatik uygula",
      action: autoTagToggle,
      role: "auto-tag",
    }),
    createSettingRow({
      title: "Otomatik Gönderim",
      description: "Hazır ürünleri onay beklemeden MARKT-GO'ya tek tek gönder",
      action: autoSendToggle,
      role: "auto-send",
    }),
  );

  panel.append(header, content);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function setSettingsPanelOpen(open: boolean): void {
  createSettingsPanel();
  const overlay = document.querySelector<HTMLElement>(`[${SETTINGS_OVERLAY_ATTR}]`);
  const panel = document.querySelector<HTMLElement>(`[${SETTINGS_PANEL_ATTR}]`);
  const button = document.querySelector<HTMLButtonElement>(`button[${SETTINGS_BUTTON_ATTR}]`);
  if (!overlay || !panel) return;

  overlay.dataset.open = String(open);
  overlay.style.opacity = open ? "1" : "0";
  overlay.style.pointerEvents = open ? "auto" : "none";
  panel.style.transform = open ? "translateX(0)" : "translateX(100%)";
  button?.setAttribute("aria-expanded", String(open));
  if (open) syncSettingsPanel();
}

function paintToggle(button: HTMLButtonElement | null, enabled: boolean, mode: "neutral" | "auto-send" = "neutral"): void {
  if (!button) return;
  const ariaChecked = String(enabled);
  const dataState = enabled ? "checked" : "unchecked";
  if (button.getAttribute("aria-checked") !== ariaChecked) {
    button.setAttribute("aria-checked", ariaChecked);
  }
  if (button.dataset.state !== dataState) {
    button.dataset.state = dataState;
  }

  if (mode === "auto-send") {
    button.style.background = enabled ? "#991b1b" : "#166534";
    button.style.borderColor = enabled ? "#ef4444" : "#22c55e";
  } else {
    button.style.background = enabled ? "#3f3f46" : "#18181b";
    button.style.borderColor = enabled ? "#71717a" : "#3f3f46";
  }

  const knob = button.querySelector<HTMLElement>('[data-settings-toggle-knob="true"]');
  if (knob) knob.style.transform = enabled ? "translateX(20px)" : "translateX(0)";
}

function syncSettingsPanel(): void {
  const panel = document.querySelector<HTMLElement>(`[${SETTINGS_PANEL_ATTR}]`);
  if (!panel) return;

  const originalMarktGo = findOriginalMarktGoButton();
  const marktGoAction = panel.querySelector<HTMLButtonElement>('[data-settings-action="marktgo"]');
  if (marktGoAction) {
    const label = (originalMarktGo?.textContent || "MARKT-GO").replace(/\s+/g, " ").trim();
    const nextText = label.includes("·") ? label.split("·").slice(1).join("·").trim() : "Ayarları Aç";
    if (marktGoAction.textContent !== nextText) marktGoAction.textContent = nextText;
    const connected = /bağlı/i.test(label) && !/bağlan/i.test(label);
    marktGoAction.style.borderColor = connected ? "rgba(5,150,105,.65)" : "#3f3f46";
    marktGoAction.style.color = connected ? "#6ee7b7" : "#d4d4d8";
  }

  paintToggle(panel.querySelector<HTMLButtonElement>('[data-settings-toggle="auto-tag"]'), readAutoTagEnabled());
  paintToggle(panel.querySelector<HTMLButtonElement>('[data-settings-toggle="auto-send"]'), autoSendEnabled(), "auto-send");
}

function ensureSettingsUi(): void {
  const headerRow = findHeaderRow();
  if (!headerRow || !isTrendyolScraperScope(document.body)) return;

  hideLegacyTrendyolControls();
  createSettingsPanel();

  let button = headerRow.querySelector<HTMLButtonElement>(`button[${SETTINGS_BUTTON_ATTR}]`);
  if (!button) {
    button = createSettingsButton();
    headerRow.appendChild(button);
  }

  syncSettingsPanel();
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
  ensureSettingsUi();
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
    attributeFilter: ["disabled", "aria-disabled", "aria-checked", "data-state"],
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
