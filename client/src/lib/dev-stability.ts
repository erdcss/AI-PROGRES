/**
 * Yerel geliştirmede istenmeyen tam sayfa yenilemelerini engeller.
 */
const RELOAD_GUARD_KEY = "turmarkt_last_reload_ts";
const USER_RELOAD_KEY = "turmarkt_user_reload";
const MIN_RELOAD_GAP_MS = 2500;

/** Kullanıcı "Sayfayı Yenile" gibi bilinçli yenileme yapmadan önce çağırın */
export function markUserInitiatedReload(): void {
  try {
    sessionStorage.setItem(USER_RELOAD_KEY, "1");
  } catch {
    /* ignore */
  }
}

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
    /* ignore */
  }
}

function blockAutomaticPageReload(): void {
  const nativeReload = Location.prototype.reload;

  Location.prototype.reload = function patchedReload(this: Location) {
    try {
      if (sessionStorage.getItem(USER_RELOAD_KEY) === "1") {
        sessionStorage.removeItem(USER_RELOAD_KEY);
        return nativeReload.call(this);
      }
    } catch {
      /* ignore */
    }

    console.warn("[dev-stability] Otomatik sayfa yenilemesi engellendi.");
  };
}

function disableViteHotApi(): void {
  const hot = import.meta.hot;
  if (!hot) return;

  hot.invalidate = () => {
    console.warn("[dev-stability] HMR invalidate engellendi.");
  };

  const noop = () => {};
  hot.accept = noop;
  hot.acceptDeps = noop;
  hot.dispose = noop;
  hot.on = noop;
  hot.off = noop;
  hot.send = noop;
}

function blockViteHmrReloadWhenDisabled(): void {
  if (import.meta.env.VITE_HMR === "true") return;

  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  window.WebSocket = function PatchedWebSocket(
    url: string | URL,
    protocols?: string | string[],
  ) {
    const ws = new NativeWebSocket(url, protocols);
    const urlText = String(url);

    if (!urlText.includes("/ws")) {
      ws.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          if (
            payload?.type === "full-reload" ||
            payload?.type === "update" ||
            payload?.type === "prune"
          ) {
            event.stopImmediatePropagation();
            event.preventDefault();
            console.warn(
              "[dev-stability] Vite HMR yenilemesi engellendi:",
              payload.type,
            );
          }
        } catch {
          /* not JSON */
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
  blockAutomaticPageReload();
  disableViteHotApi();
  blockViteHmrReloadWhenDisabled();
}
