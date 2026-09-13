import { toast } from "@/hooks/use-toast";

const EXACT_TARGET_STORAGE_KEY = "trendyol_category_exact_target";
const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";

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
