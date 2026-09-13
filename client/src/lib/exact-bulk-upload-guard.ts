import { toast } from "@/hooks/use-toast";

const EXACT_TARGET_STORAGE_KEY = "trendyol_category_exact_target";
const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";

function previewCountFromUi(): number {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of buttons) {
    const text = button.textContent || "";
    const match = text.match(/CSV\s+OLARAK\s+DIŞA\s+AKTAR\s*\((\d+)\)/i);
    if (match?.[1]) return Number(match[1]) || 0;
  }
  return 0;
}

function exactTarget(): number | null {
  try {
    const raw = sessionStorage.getItem(EXACT_TARGET_STORAGE_KEY);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  } catch {
    return null;
  }
}

function exactReady(): number | null {
  try {
    const raw = sessionStorage.getItem(EXACT_READY_STORAGE_KEY);
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
 * Kategori exact-count işlemi aktifken kısmi ürün listesinin MARKT-GO'ya gitmesini
 * engeller. Örn. hedef 20 ise 19 preview varken kullanıcı butona bassa bile aktarım
 * başlamaz; yedek ürün tamamlandıktan sonra 20/20 olduğunda buton normal çalışır.
 */
document.addEventListener(
  "click",
  (event) => {
    const targetElement = event.target instanceof Element ? event.target : null;
    const button = targetElement?.closest<HTMLButtonElement>("button");
    if (!button || !isBulkDestinationButton(button)) return;

    const target = exactTarget();
    if (!target) return;

    const ready = exactReady();
    const previews = previewCountFromUi();
    if (ready === target && previews === target) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    toast({
      title: "Exact-count tamamlanıyor",
      description: `${target} ürün hedeflendi. Şu an ${previews}/${target} ürün hazır; eksik/fazla adetle MARKT-GO aktarımı başlatılmadı.`,
      variant: "destructive",
      duration: 7000,
    });
  },
  true,
);
