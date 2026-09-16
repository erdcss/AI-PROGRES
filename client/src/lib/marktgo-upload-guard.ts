const AUTO_SENT_STORAGE_KEY = "trendyol_auto_marktgo_sent_ids";
const AUTO_TRIGGER_ATTR = "data-auto-marktgo-triggered";
const SYNC_PATH = "/api/marktgo/products/sync";
const IMAGE_RETRY_MS = 60_000;
const MAX_AUTO_RETRY_MS = 60_000;
const REQUEST_RETRY_DELAYS_MS = [0, 1_500, 4_000, 9_000];

const retryAttempts = new Map<string, number>();
let installed = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function readSentIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(AUTO_SENT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeSentIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem(AUTO_SENT_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* sessionStorage unavailable */
  }
}

function previewIdFromButton(button: HTMLButtonElement): { key: string; previewId: string } | null {
  let node: HTMLElement | null = button.parentElement;
  let depth = 0;

  while (node && node !== document.body && depth < 14) {
    const input = node.querySelector<HTMLInputElement>('input[data-testid^="input-add-tag-"]');
    if (input) {
      const testId = input.getAttribute("data-testid") || "";
      const previewId = testId.replace(/^input-add-tag-/, "").trim();
      if (!previewId) return null;
      const tab = input.closest<HTMLElement>("[data-app-tab-id]");
      return {
        key: `${tab?.dataset.appTabId || "main"}:${previewId}`,
        previewId,
      };
    }
    node = node.parentElement;
    depth += 1;
  }

  return null;
}

function currentAutoSendContext(): { button: HTMLButtonElement; key: string; previewId: string } | null {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`button[${AUTO_TRIGGER_ATTR}="true"]`),
  );
  if (!buttons.length) return null;

  const button =
    [...buttons].reverse().find(
      (candidate) => candidate.disabled || candidate.getAttribute("aria-disabled") === "true",
    ) || buttons[buttons.length - 1];
  const identity = previewIdFromButton(button);
  if (!identity) return null;
  return { button, ...identity };
}

function clearAutoMarker(button: HTMLButtonElement | null | undefined): void {
  if (!button) return;
  delete button.dataset.autoMarktgoTriggered;
  button.removeAttribute(AUTO_TRIGGER_ATTR);
}

function scheduleAutoRetry(
  context: { button: HTMLButtonElement; key: string } | null,
  delayOverride?: number,
): void {
  if (!context) return;
  clearAutoMarker(context.button);

  const attempts = (retryAttempts.get(context.key) || 0) + 1;
  retryAttempts.set(context.key, attempts);
  const delay =
    delayOverride ?? Math.min(MAX_AUTO_RETRY_MS, 4_000 * Math.max(1, 2 ** (attempts - 1)));

  // Otomatik gönderim ürünü tıklamadan önce "sent" listesine koyuyor. Gerçek istek
  // tüm denemelerden sonra başarısızsa anahtarı silip ürünü yeniden kuyruğa alıyoruz.
  window.setTimeout(() => {
    const ids = readSentIds();
    if (!ids.delete(context.key)) return;
    writeSentIds(ids);
  }, delay);
}

function markAutoSendSuccess(context: { button: HTMLButtonElement; key: string } | null): void {
  if (!context) return;
  retryAttempts.delete(context.key);
  clearAutoMarker(context.button);
  // Başarıda exact-bulk-upload-guard'ın sent kaydı korunur.
}

function collectHttpImageUrls(value: unknown, out: string[], depth = 0): void {
  if (value == null || depth > 6) return;
  if (typeof value === "string") {
    const url = value.trim();
    if (/^https?:\/\//i.test(url)) out.push(url);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectHttpImageUrls(item, out, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const row = value as Record<string, unknown>;
  for (const key of ["images", "image", "imageUrl", "featuredImage", "imagesByColor"]) {
    if (row[key] != null) collectHttpImageUrls(row[key], out, depth + 1);
  }
  for (const key of ["variants", "canonicalProduct", "colorFamily"]) {
    if (row[key] != null) collectHttpImageUrls(row[key], out, depth + 1);
  }
}

function payloadHasProductImage(init?: RequestInit): boolean | null {
  if (typeof init?.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body) as Record<string, unknown>;
    const product = parsed.product && typeof parsed.product === "object"
      ? (parsed.product as Record<string, unknown>)
      : parsed;
    const images: string[] = [];
    collectHttpImageUrls(product, images);
    return images.length > 0;
  } catch {
    return null;
  }
}

function syntheticImageError(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "MARKT-GO aktarımı durduruldu: üründe gerçek ürün görseli bulunamadı. Ürün görselsiz gönderilmedi.",
      code: "missing_product_image",
    }),
    {
      status: 422,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function cloneRequestInit(init?: RequestInit): RequestInit | undefined {
  if (!init) return undefined;
  // Body burada JSON string olduğundan her retry'da güvenle yeniden kullanılabilir.
  return { ...init, headers: init.headers };
}

async function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    if (!signal) return;
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export function installMarktGoUploadGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (!url.includes(SYNC_PATH)) return nativeFetch(input, init);

    const context = currentAutoSendContext();
    const hasImage = payloadHasProductImage(init);

    // Hiç görseli olmayan ürün MARKT-GO'da oluşturulmasın. Kaynak veri sonradan
    // tamamlanırsa otomatik gönderim ürünü yeniden deneyecek.
    if (hasImage === false) {
      scheduleAutoRetry(context, IMAGE_RETRY_MS);
      return syntheticImageError();
    }

    let lastResponse: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < REQUEST_RETRY_DELAYS_MS.length; attempt += 1) {
      const delay = REQUEST_RETRY_DELAYS_MS[attempt] || 0;
      if (delay > 0) await wait(delay, init?.signal);

      try {
        const response = await nativeFetch(input, cloneRequestInit(init));
        lastResponse = response;

        let success = response.ok;
        try {
          const body = await response.clone().json() as Record<string, unknown>;
          if (body.success === false) success = false;
        } catch {
          // JSON olmayan yanıtı HTTP durumuna göre değerlendir.
        }

        if (success) {
          markAutoSendSuccess(context);
          return response;
        }

        // 4xx doğrulama/iş kuralı hatalarını tekrar tekrar göndermeyelim.
        if (!isRetryableStatus(response.status)) {
          scheduleAutoRetry(context, response.status === 422 ? IMAGE_RETRY_MS : undefined);
          return response;
        }
      } catch (error) {
        lastError = error;
        if (error instanceof DOMException && error.name === "AbortError") {
          scheduleAutoRetry(context);
          throw error;
        }
      }
    }

    // 100'lü toplu aktarımda geçici ağ/429/5xx yüzünden ürün sessizce kaybolmasın.
    // Tüm istemci denemeleri bittiğinde otomatik moddaysa tekrar ana kuyruğa alınır.
    scheduleAutoRetry(context);
    if (lastResponse) return lastResponse;
    throw lastError instanceof Error ? lastError : new Error("MARKT-GO bağlantı hatası");
  };
}

installMarktGoUploadGuard();
