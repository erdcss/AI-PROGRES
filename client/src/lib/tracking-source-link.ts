/**
 * Tracking source navigation; only valid public HTTP(S) product URLs are opened.
 * The iOS app uses a native in-app browser; desktop opens a separate tab.
 */
import { isMaykNativeApp } from "./mayk-native";

type MaykBridge = Window & {
  ReactNativeWebView?: { postMessage(message: string): void };
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
  if (isMaykNativeApp() && bridge.ReactNativeWebView?.postMessage) {
    bridge.ReactNativeWebView.postMessage(
      JSON.stringify({ type: "mayk-open-source", url: source }),
    );
    return true;
  }
  const tab = window.open(source, "_blank", "noopener,noreferrer");
  if (!tab) {
    // Pop-up blocker: keep navigation possible from the same user gesture.
    window.location.assign(source);
  }
  return true;
}
