import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Layers3, Loader2, PackageSearch, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type DiscoveryProduct = {
  productId: string;
  url: string;
  title?: string;
  image?: string;
};

type DiscoveryResponse = {
  success: boolean;
  requestedCount?: number;
  foundCount?: number;
  candidateCount?: number;
  pagesScanned?: number;
  products?: DiscoveryProduct[];
  reserveProducts?: DiscoveryProduct[];
  warnings?: string[];
  message?: string;
};

const QUICK_COUNTS = [20, 50, 100, 250];
const EXACT_TARGET_STORAGE_KEY = "trendyol_category_exact_target";
const EXACT_READY_STORAGE_KEY = "trendyol_category_exact_ready";

function findManualRow(input: HTMLElement): HTMLElement | null {
  const inputWrap = input.parentElement;
  if (!inputWrap) return null;
  const row = inputWrap.parentElement;
  return row instanceof HTMLElement ? row : null;
}

function findDropZone(manualRow: HTMLElement): HTMLElement | null {
  const container = manualRow.parentElement;
  if (!container) return null;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>("div"));
  return (
    candidates.find(
      (el) =>
        el.className.includes("border-dashed") &&
        el.textContent?.toLocaleLowerCase("tr-TR").includes("url sürükle"),
    ) || null
  );
}

function trendyolProductId(value: string): string | null {
  return value.match(/-p-(\d+)/i)?.[1] || null;
}

function queuedProductIds(manualRow: HTMLElement): Set<string> {
  const root = manualRow.parentElement || document.body;
  const ids = new Set<string>();
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[title]"))) {
    const title = element.getAttribute("title") || "";
    if (!title.includes("trendyol.com")) continue;
    const id = trendyolProductId(title);
    if (id) ids.add(id);
  }
  return ids;
}

function currentPreviewCount(): number {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of buttons) {
    const text = button.textContent || "";
    const match = text.match(/CSV\s+OLARAK\s+DIŞA\s+AKTAR\s*\((\d+)\)/i);
    if (match?.[1]) return Number(match[1]) || 0;
  }
  return 0;
}

function isBulkScrapeRunning(): boolean {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).some((button) => {
    const text = button.textContent?.toLocaleUpperCase("tr-TR") || "";
    return text.includes("VERİLER ÇEKİLİYOR") || text.includes("ÜRÜNLER HAZIRLANIYOR");
  });
}

async function waitForBulkScrapeToSettle(timeoutMs = 45 * 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let stableIdleTicks = 0;
  await new Promise((resolve) => setTimeout(resolve, 600));

  while (Date.now() < deadline) {
    if (isBulkScrapeRunning()) {
      stableIdleTicks = 0;
    } else {
      stableIdleTicks += 1;
      if (stableIdleTicks >= 4) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Toplu ürün çekiminin tamamlanması beklenirken zaman aşımı oluştu");
}

async function waitForQueuedProductIds(
  manualRow: HTMLElement,
  expectedIds: string[],
  timeoutMs = 1_500,
): Promise<string[]> {
  const uniqueIds = [...new Set(expectedIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const present = queuedProductIds(manualRow);
    const missing = uniqueIds.filter((id) => !present.has(id));
    if (missing.length === 0) return [];
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  const present = queuedProductIds(manualRow);
  return uniqueIds.filter((id) => !present.has(id));
}

async function queueUrlsViaExistingDropFlow(
  urls: string[],
  manualRow: HTMLElement,
): Promise<string[]> {
  const dropZone = findDropZone(manualRow);
  const expectedIds = urls.map(trendyolProductId).filter((id): id is string => Boolean(id));
  if (!dropZone || urls.length === 0 || expectedIds.length === 0) return urls;

  try {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", urls.join("\n"));
    transfer.setData("text/uri-list", urls.join("\n"));
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    });
    dropZone.dispatchEvent(event);

    const missingIds = await waitForQueuedProductIds(manualRow, expectedIds, 1_500);
    if (missingIds.length === 0) return [];

    const missingSet = new Set(missingIds);
    return urls.filter((url) => {
      const id = trendyolProductId(url);
      return !id || missingSet.has(id);
    });
  } catch (error) {
    console.warn("[CategoryBulk] drop injection failed", error);
    return urls;
  }
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForSingleQueuedId(
  manualRow: HTMLElement,
  productId: string,
  timeoutMs = 900,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (queuedProductIds(manualRow).has(productId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return queuedProductIds(manualRow).has(productId);
}

async function queueUrlsViaManualFlow(urls: string[], manualRow: HTMLElement) {
  const input = manualRow.querySelector<HTMLInputElement>("[data-testid='input-product-url']");
  const addButton = manualRow.querySelector<HTMLButtonElement>("[data-testid='button-add-url']");
  if (!input || !addButton) throw new Error("Mevcut URL ekleme alanı bulunamadı");

  for (const url of urls) {
    const productId = trendyolProductId(url);
    if (productId && queuedProductIds(manualRow).has(productId)) continue;

    let queued = false;
    for (let attempt = 0; attempt < 3 && !queued; attempt += 1) {
      setReactInputValue(input, url);
      await new Promise((resolve) => setTimeout(resolve, 30));
      addButton.click();

      if (productId) {
        queued = await waitForSingleQueuedId(manualRow, productId, 1_100);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 120));
        queued = input.value.trim() === "";
      }
    }

    if (!queued) {
      throw new Error(`Ürün URL'si ana çekim listesine eklenemedi: ${url}`);
    }
  }
}

async function ensureUrlsAreQueued(urls: string[], manualRow: HTMLElement) {
  const expectedIds = urls.map(trendyolProductId).filter((id): id is string => Boolean(id));
  let missingUrls = await queueUrlsViaExistingDropFlow(urls, manualRow);

  if (missingUrls.length > 0) {
    console.warn(`[CategoryBulk] drop akışında ${missingUrls.length} URL eksik kaldı; manual fallback çalışıyor`);
    await queueUrlsViaManualFlow(missingUrls, manualRow);
  }

  const stillMissingIds = await waitForQueuedProductIds(manualRow, expectedIds, 1_800);
  if (stillMissingIds.length > 0) {
    missingUrls = urls.filter((url) => {
      const id = trendyolProductId(url);
      return id ? stillMissingIds.includes(id) : false;
    });
    throw new Error(
      `${stillMissingIds.length} ürün URL'si listeye eklenemedi. Çekim güvenlik için başlatılmadı.${
        missingUrls[0] ? ` İlk eksik: ${missingUrls[0]}` : ""
      }`,
    );
  }
}

async function clickExistingFetchButton(): Promise<boolean> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    const button = buttons.find((item) => {
      const text = item.textContent?.toLocaleUpperCase("tr-TR") || "";
      return text.includes("ÜRÜN VERİLERİNİ ÇEK") || text.includes("VERİLERİ ÇEK");
    });
    if (button && !button.disabled) {
      button.click();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function removeFailedQueueRows(manualRow: HTMLElement): number {
  const root = manualRow.parentElement || document.body;
  const rows = new Set<HTMLElement>();
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[title*='trendyol.com']"))) {
    const row = element.parentElement;
    if (!row) continue;
    const text = row.textContent?.toLocaleLowerCase("tr-TR") || "";
    if (text.includes("hata")) rows.add(row);
  }

  let removed = 0;
  for (const row of rows) {
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("button"));
    const removeButton = buttons[buttons.length - 1];
    if (removeButton && !removeButton.disabled) {
      removeButton.click();
      removed += 1;
    }
  }
  return removed;
}

function clearTrendyolWorkspaceStorage() {
  const exactKeys = [
    "turmarkt_scraper_state_v1",
    "turmarkt_scraper_queue",
    "turmarkt_scraper_previews",
    "turmarkt_last_scraped_product",
    "turmarkt_scraper_last_url",
  ];
  const prefixes = [
    "turmarkt_scraper_",
    "trendyol_bulk_",
    "trendyol_category_",
  ];

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of exactKeys) storage.removeItem(key);
      const toRemove: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) toRemove.push(key);
      }
      toRemove.forEach((key) => storage.removeItem(key));
    } catch {
      // Storage erişimi engelliyse UI reset yine devam eder.
    }
  }
}

export function TrendyolCategoryBulkDrawer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [manualRow, setManualRow] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [count, setCount] = useState(50);
  const [customCount, setCustomCount] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastFound, setLastFound] = useState<number | null>(null);
  const internalClearRef = useRef(false);
  const exactRunTokenRef = useRef(0);

  useEffect(() => {
    let portalHost: HTMLElement | null = null;

    const attach = () => {
      const input = document.querySelector<HTMLElement>("[data-testid='input-product-url']");
      if (!input) {
        if (portalHost) {
          portalHost.remove();
          portalHost = null;
          setHost(null);
          setManualRow(null);
        }
        return;
      }

      const row = findManualRow(input);
      if (!row?.parentElement) return;
      setManualRow(row);

      if (portalHost?.isConnected) return;
      portalHost = document.createElement("div");
      portalHost.dataset.trendyolCategoryBulk = "true";
      portalHost.className = "w-full";
      row.parentElement.insertBefore(portalHost, row);
      setHost(portalHost);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(attach, 1000);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, []);

  useEffect(() => {
    const handleClearWorkspace = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const clearButton = target?.closest<HTMLButtonElement>("[data-testid='button-clear-workspace']");
      if (!clearButton || clearButton.disabled) return;

      exactRunTokenRef.current += 1;
      sessionStorage.removeItem(EXACT_TARGET_STORAGE_KEY);
      sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);
      clearTrendyolWorkspaceStorage();

      if (internalClearRef.current) return;

      setOpen(false);
      setUrl("");
      setCount(50);
      setCustomCount("");
      setLoading(false);
      setLastFound(null);
    };

    document.addEventListener("click", handleClearWorkspace, true);
    return () => document.removeEventListener("click", handleClearWorkspace, true);
  }, []);

  const selectedCount = useMemo(() => {
    const custom = Number(customCount);
    if (customCount.trim() && Number.isFinite(custom)) {
      return Math.max(1, Math.min(500, Math.floor(custom)));
    }
    return count;
  }, [count, customCount]);

  const clearWorkspaceForExactBatch = useCallback(async () => {
    const clearButton = document.querySelector<HTMLButtonElement>("[data-testid='button-clear-workspace']");
    if (!clearButton || clearButton.disabled) {
      const queueClear = document.querySelector<HTMLButtonElement>("[data-testid='button-clear-url-queue']");
      queueClear?.click();
      return;
    }

    internalClearRef.current = true;
    try {
      clearButton.click();
      const deadline = Date.now() + 4_000;
      while (Date.now() < deadline) {
        const queueEmpty = !manualRow || queuedProductIds(manualRow).size === 0;
        if (queueEmpty && currentPreviewCount() === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    } finally {
      internalClearRef.current = false;
    }
  }, [manualRow]);

  const enforceExactScrapeTarget = useCallback(
    async (
      targetCount: number,
      reserveUrls: string[],
      row: HTMLElement,
      runToken: number,
    ) => {
      const reserveQueue = reserveUrls.filter(Boolean);
      const usedReserveIds = new Set<string>();

      for (let cycle = 0; cycle < 30; cycle += 1) {
        if (runToken !== exactRunTokenRef.current) return;
        await waitForBulkScrapeToSettle();
        if (runToken !== exactRunTokenRef.current) return;

        const readyCount = currentPreviewCount();
        if (readyCount === targetCount) {
          sessionStorage.setItem(EXACT_READY_STORAGE_KEY, String(targetCount));
          setLastFound(targetCount);
          toast({
            title: `✅ ${targetCount}/${targetCount} ürün hazır`,
            description: `Exact-count tamamlandı. MARKT-GO'ya gönderimde hedef ${targetCount} üründür.`,
            duration: 6000,
          });
          return;
        }

        if (readyCount > targetCount) {
          sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);
          toast({
            title: "Exact-count güvenlik durdurması",
            description: `${targetCount} ürün istendi fakat ${readyCount} önizleme oluştu. Fazla ürün gönderilmemesi için otomatik süreç durduruldu.`,
            variant: "destructive",
            duration: 9000,
          });
          return;
        }

        const gap = targetCount - readyCount;
        const removed = removeFailedQueueRows(row);
        if (removed > 0) {
          await new Promise((resolve) => setTimeout(resolve, 180));
        }

        const presentIds = queuedProductIds(row);
        const replacements: string[] = [];
        for (const reserveUrl of reserveQueue) {
          const id = trendyolProductId(reserveUrl);
          if (!id || presentIds.has(id) || usedReserveIds.has(id)) continue;
          usedReserveIds.add(id);
          replacements.push(reserveUrl);
          if (replacements.length >= gap) break;
        }

        if (replacements.length < gap) {
          sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);
          toast({
            title: "Yedek ürün havuzu tükendi",
            description: `${targetCount} hedef için ${readyCount} ürün hazırlandı. Eksik ${gap} ürünün yerine yeterli benzersiz yedek bulunamadı; eksik adetle MARKT-GO aktarımı yapmayın.`,
            variant: "destructive",
            duration: 10000,
          });
          return;
        }

        await ensureUrlsAreQueued(replacements, row);
        const queuedNow = queuedProductIds(row).size;
        if (queuedNow !== targetCount) {
          sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);
          throw new Error(
            `Exact-count kuyruk doğrulaması başarısız: hedef=${targetCount}, kuyruk=${queuedNow}`,
          );
        }

        toast({
          title: `Eksik ${gap} ürün yedekleniyor`,
          description: `${replacements.length} yeni kategori ürünü otomatik olarak kuyruğa alındı.`,
          duration: 4000,
        });

        const restarted = await clickExistingFetchButton();
        if (!restarted) {
          throw new Error("Yedek ürünlerin veri çekimi otomatik yeniden başlatılamadı");
        }
      }

      throw new Error("Exact-count işlemi maksimum yenileme döngüsüne ulaştı");
    },
    [],
  );

  const start = useCallback(async () => {
    if (!manualRow) {
      toast({
        title: "Trendyol alanı hazır değil",
        description: "Sayfayı yenileyip tekrar deneyin.",
        variant: "destructive",
      });
      return;
    }

    const categoryUrl = url.trim();
    if (!categoryUrl || !categoryUrl.includes("trendyol.com")) {
      toast({
        title: "Kategori URL'si gerekli",
        description: "Trendyol kategori veya arama URL'sini girin.",
        variant: "destructive",
      });
      return;
    }

    const targetCount = selectedCount;
    setLoading(true);
    setLastFound(null);
    sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);

    try {
      const response = await fetch("/api/trendyol/category/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: categoryUrl, maxProducts: targetCount }),
      });
      const data = (await response.json().catch(() => ({}))) as DiscoveryResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.warnings?.[0] || "Kategori ürünleri bulunamadı");
      }

      const uniqueById = new Map<string, string>();
      for (const product of data.products || []) {
        const productUrl = String(product.url || "").trim();
        const id = String(product.productId || trendyolProductId(productUrl) || "").trim();
        if (!productUrl || !id || uniqueById.has(id)) continue;
        uniqueById.set(id, productUrl);
      }
      const urls = [...uniqueById.values()].slice(0, targetCount);
      if (urls.length !== targetCount) {
        throw new Error(
          `${targetCount} ürün istendi fakat yalnızca ${urls.length} benzersiz ürün hazırlanabildi. Eksik adetle işlem başlatılmadı.`,
        );
      }

      const selectedIds = new Set([...uniqueById.keys()]);
      const reserveById = new Map<string, string>();
      for (const product of data.reserveProducts || []) {
        const productUrl = String(product.url || "").trim();
        const id = String(product.productId || trendyolProductId(productUrl) || "").trim();
        if (!productUrl || !id || selectedIds.has(id) || reserveById.has(id)) continue;
        reserveById.set(id, productUrl);
      }
      const reserveUrls = [...reserveById.values()];

      await clearWorkspaceForExactBatch();
      await ensureUrlsAreQueued(urls, manualRow);

      const exactQueueSize = queuedProductIds(manualRow).size;
      if (exactQueueSize !== targetCount) {
        throw new Error(
          `Kuyruk adedi doğrulanamadı: ${targetCount} istenmesine rağmen ${exactQueueSize} URL var. Çekim başlatılmadı.`,
        );
      }

      setLastFound(targetCount);
      sessionStorage.setItem(EXACT_TARGET_STORAGE_KEY, String(targetCount));

      toast({
        title: `${targetCount}/${targetCount} ürün kuyruğa alındı`,
        description: `Fazla veya eksik ürün kabul edilmeyecek. ${reserveUrls.length} yedek ürün hazır.`,
        duration: 5000,
      });

      const started = await clickExistingFetchButton();
      if (!started) {
        throw new Error(
          "Ürün URL'leri listeye eklendi ancak ana ürün çekme butonu otomatik başlatılamadı.",
        );
      }

      const runToken = exactRunTokenRef.current + 1;
      exactRunTokenRef.current = runToken;
      void enforceExactScrapeTarget(targetCount, reserveUrls, manualRow, runToken).catch((error) => {
        sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);
        toast({
          title: "Exact-count tamamlanamadı",
          description: error instanceof Error ? error.message : "Beklenmeyen hata",
          variant: "destructive",
          duration: 10000,
        });
      });

      setOpen(false);
    } catch (error) {
      sessionStorage.removeItem(EXACT_TARGET_STORAGE_KEY);
      sessionStorage.removeItem(EXACT_READY_STORAGE_KEY);
      toast({
        title: "Toplu ürün ekleme başarısız",
        description: error instanceof Error ? error.message : "Beklenmeyen hata",
        variant: "destructive",
        duration: 9000,
      });
    } finally {
      setLoading(false);
    }
  }, [clearWorkspaceForExactBatch, enforceExactScrapeTarget, manualRow, selectedCount, url]);

  if (!host) return null;

  return createPortal(
    <div className="w-full">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
        className="w-full h-11 justify-between border-zinc-700/80 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
        data-testid="button-trendyol-category-bulk"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Layers3 className="h-4 w-4 text-zinc-500" />
          Toplu Ürün Ekle
          {lastFound ? (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
              {lastFound}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </Button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -6 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <PackageSearch className="h-4 w-4 text-zinc-500" />
                    Trendyol Kategori Toplu Çekim
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Kategori URL'sinden seçtiğiniz adet kadar ürün hazırlanır. Eksik veya fazla adetle işlem tamamlanmaz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-zinc-600 transition hover:bg-zinc-900 hover:text-zinc-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Kategori / Arama URL'si</label>
                  <Input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://www.trendyol.com/kadin-canta-x-g1-c117"
                    className="business-input h-11 border-zinc-800 bg-zinc-900/70 text-sm"
                    disabled={loading}
                    data-testid="input-trendyol-category-url"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-medium text-zinc-400">Çekilecek ürün sayısı</label>
                    <span className="text-xs text-zinc-600">En fazla 500</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {QUICK_COUNTS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setCount(item);
                          setCustomCount("");
                        }}
                        disabled={loading}
                        className={`h-9 rounded-lg border text-xs font-medium transition ${
                          !customCount && count === item
                            ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={customCount}
                    onChange={(event) => setCustomCount(event.target.value)}
                    placeholder="Özel adet yazın (örn. 75)"
                    className="business-input h-10 border-zinc-800 bg-zinc-900/70 text-sm"
                    disabled={loading}
                  />
                </div>

                <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5 text-xs text-zinc-500">
                  Seçili işlem: <span className="font-semibold text-zinc-300">{selectedCount} ürün</span>. Sistem önce eski çalışma alanını temizler, tam {selectedCount} URL ile başlar ve başarısız ürünleri yedek kategori ürünleriyle tamamlar.
                </div>

                <Button
                  type="button"
                  onClick={() => void start()}
                  disabled={loading}
                  className="h-11 w-full bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                  data-testid="button-start-trendyol-category-bulk"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Kategori taranıyor ve exact-count hazırlanıyor...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      İşleme Başla · {selectedCount} Ürün
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    host,
  );
}
