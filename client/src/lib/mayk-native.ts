/**
 * Native WebView capability flag. A plain mobile browser keeps the existing
 * responsive web UI, while M.A.Y.K gets the dedicated touch-first workspace.
 */
export function isMaykNativeApp(): boolean {
  return typeof navigator !== "undefined" && (
    /MAYK-IOS/i.test(navigator.userAgent) ||
    (typeof window !== "undefined" && Boolean((window as Window & { __MAYK_NATIVE_APP__?: boolean }).__MAYK_NATIVE_APP__))
  );
}
