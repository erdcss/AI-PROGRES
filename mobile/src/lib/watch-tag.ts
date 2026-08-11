export type WatchTag = "red" | "green";

export const WATCH_TAG_INTERVAL_MINUTES: Record<WatchTag, number> = {
  red: 15,
  green: 60,
};

export const GREEN_NOTIFY_THROTTLE_MS = 10 * 60_000;

export function parseWatchTag(value: unknown): WatchTag | null {
  const s = String(value || "").trim().toLowerCase();
  if (s === "red" || s === "kırmızı" || s === "kirmizi") return "red";
  if (s === "green" || s === "yeşil" || s === "yesil") return "green";
  return null;
}

export function watchTagLabel(tag: WatchTag | null | undefined): string {
  if (tag === "red") return "Kırmızı";
  if (tag === "green") return "Yeşil";
  return "";
}

export function isImportantWatchChange(changeType?: string): boolean {
  const t = String(changeType || "");
  return (
    t.includes("price") ||
    t.includes("stock") ||
    t.includes("removed") ||
    t.includes("error")
  );
}

export function shouldNotifyForWatchTag(
  tag: WatchTag | null | undefined,
  changeType: string,
  lastNotifiedAt?: number | null,
  now = Date.now(),
): boolean {
  if (tag === "red") return true;
  if (tag === "green") {
    if (isImportantWatchChange(changeType)) return true;
    if (lastNotifiedAt == null) return true;
    return now - lastNotifiedAt >= GREEN_NOTIFY_THROTTLE_MS;
  }
  return true;
}
