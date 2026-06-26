/**
 * Yerel geliştirmede istenmeyen tam sayfa yenilemelerini azaltır.
 * HMR kapalıyken Vite istemci mesajlarını ve hızlı reload döngülerini engeller.
 */
const RELOAD_GUARD_KEY = "turmarkt_last_reload_ts";
const MIN_RELOAD_GAP_MS = 2500;

function guardRapidReload(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    const now = Date.now();
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));

    if (last > 0 && now - last < MIN_RELOAD_GAP_MS) {
      console.warn(
        "[dev-stability] Hızlı yenileme algılandı — oturum ve scraper verisi korunuyor.",
      );
    }
  } catch {
    // ignore
  }
}

function blockViteHmrReloadWhenDisabled(): void {
  if (import.meta.env.PROD) return;
  if (import.meta.env.VITE_HMR === "true") return;

  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  window.WebSocket = function PatchedWebSocket(
    url: string | URL,
    protocols?: string | string[],
  ) {
    const ws = new NativeWebSocket(url, protocols);
    const urlText = String(url);

    // Uygulama WebSocket'i (/ws) dokunulmaz; yalnızca Vite HMR bağlantısı filtrelenir
    if (!urlText.includes("/ws")) {
      ws.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          if (payload?.type === "full-reload" || payload?.type === "update") {
            event.stopImmediatePropagation();
            console.warn(
              "[dev-stability] Vite HMR yenilemesi engellendi:",
              payload.type,
            );
          }
        } catch {
          // not JSON — ignore
        }
      });
    }

    return ws;
  } as typeof WebSocket;

  Object.assign(window.WebSocket, NativeWebSocket);
  window.WebSocket.prototype = NativeWebSocket.prototype;
}

export function initDevStability(): void {
  if (import.meta.env.PROD) return;
  guardRapidReload();
  blockViteHmrReloadWhenDisabled();
}
