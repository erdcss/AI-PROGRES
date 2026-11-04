/**
 * Tracking source navigation; only valid public HTTP(S) product URLs are opened.
 * The iOS app uses a native in-app browser; desktop opens a separate tab.
 */
import { isMaykNativeApp } from "./mayk-native";

type MaykBridge = Window & {
  ReactNativeWebView?: { postMessage(message: string): void };
  __MAYK_SOURCE_BROWSER__?: boolean;
};

export function resolveTrackingSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > 8192) return null;
  // Accept product URLs from older scrapers stored without a scheme.
  const absolute = /^https?:\/\//i.test(input)
    ? input
    : /^www\.[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(input)
      ? "https://" + input
      : null;
  if (!absolute) return null;
  try {
    const url = new URL(absolute);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password || url.hostname.includes("..")) return null;
    if (
      /^(localhost|.*\.localhost|.*\.local)$/i.test(url.hostname) ||
      /^127\./.test(url.hostname) ||
      /^(0\.0\.0\.0|::1)$/.test(url.hostname)
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function openTrackingSource(value: unknown): boolean {
  const source = resolveTrackingSourceUrl(value);
  if (!source) return false;
  const bridge = window as MaykBridge;
  if (isMaykNativeApp() && bridge.__MAYK_SOURCE_BROWSER__ && bridge.ReactNativeWebView?.postMessage) {
    bridge.ReactNativeWebView.postMessage(
      JSON.stringify({ type: "mayk-open-source", url: source }),
    );
    return true;
  }
  if (isMaykNativeApp()) {
    // Older WebView builds intercept external navigations and open Safari.
    // target="_blank" is unreliable when multi-window support is disabled.
    window.location.assign(source);
    return true;
  }
  const link = document.createElement("a");
  link.href = source;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
