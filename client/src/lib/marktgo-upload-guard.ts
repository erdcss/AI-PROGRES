const AUTO_SENT_STORAGE_KEY = "trendyol_auto_marktgo_sent_ids";
const AUTO_TRIGGER_ATTR = "data-auto-marktgo-triggered";
const SYNC_PATH = "/api/marktgo/products/sync";
const IMAGE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60_000;

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
    delayOverride ?? Math.min(MAX_RETRY_MS, 4_000 * Math.max(1, 2 ** (attempts - 1)));

  // exact-bulk-upload-guard ürünü istek başlamadan "sent" olarak işaretliyor.
  // Başarısız istekte bu anahtarı kısa bir cooldown sonrasında silerek ürünün
  // tekrar kuyruğa girmesini sağlıyoruz. Cooldown boyunca sıradaki ürünler devam eder.
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
  if (value == null || depth > 5) return;
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
  if (Array.isArray(row.variants)) collectHttpImageUrls(row.variants, out, depth + 1);
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

export function installMarktGoUploadGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (!url.includes(SYNC_PATH)) return nativeFetch(input, init);

    const context = currentAutoSendContext();
    const hasImage = payloadHasProductImage(init);

    if (hasImage === false) {
      scheduleAutoRetry(context, IMAGE_RETRY_MS);
      return syntheticImageError();
    }

    try {
      const response = await nativeFetch(input, init);
      let success = response.ok;

      try {
        const body = await response.clone().json() as Record<string, unknown>;
        if (body.success === false) success = false;
      } catch {
        // JSON olmayan başarılı yanıtı HTTP durumuna göre değerlendir.
      }

      if (success) markAutoSendSuccess(context);
      else scheduleAutoRetry(context);

      return response;
    } catch (error) {
      scheduleAutoRetry(context);
      throw error;
    }
  };
}

installMarktGoUploadGuard();
