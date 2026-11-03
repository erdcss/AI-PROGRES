/**
 * Native WebView capability flag. A plain mobile browser keeps the existing
 * responsive web UI, while M.A.Y.K gets the dedicated touch-first workspace.
 */
export function isMaykNativeApp(): boolean {
  return typeof navigator !== "undefined" && /MAYK-IOS/i.test(navigator.userAgent);
}
