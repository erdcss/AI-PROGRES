export function formatMoney(value: unknown, currency = "TRY"): string {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n} ₺`;
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatDateTime(iso);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "az önce";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} gün önce`;
  return formatDateTime(iso);
}

/** Price delta: down = positive (green), up = negative (red) for monitoring */
export function priceDeltaDirection(
  oldValue: unknown,
  newValue: unknown,
): "up" | "down" | "flat" | null {
  const toNum = (v: unknown): number | null => {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.price != null) return toNum(o.price);
    }
    const n = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const a = toNum(oldValue);
  const b = toNum(newValue);
  if (a == null || b == null) return null;
  if (b < a) return "down";
  if (b > a) return "up";
  return "flat";
}

export function isPriceChangeType(changeType?: string): boolean {
  const t = String(changeType || "");
  return t.includes("price");
}

export function isStockChangeType(changeType?: string): boolean {
  const t = String(changeType || "");
  return t.includes("stock");
}

export function isVariantChangeType(changeType?: string): boolean {
  const t = String(changeType || "");
  return t.startsWith("variant") || t.includes("variant");
}

export function isImportantChangeType(changeType?: string): boolean {
  const t = String(changeType || "");
  return (
    t.includes("price") ||
    t.includes("stock") ||
    t.includes("removed") ||
    t.includes("error")
  );
}

export function domainFromUrl(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).slice(0, 40);
  }
}

export function formatChangeValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.price != null) return formatMoney(o.price);
    if (o.stock != null) return String(o.stock);
    if (typeof o.available === "boolean") return o.available ? "Stokta" : "Tükendi";
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  const asNum = Number(v);
  if (Number.isFinite(asNum) && String(v).match(/^\d+(\.\d+)?$/)) {
    return formatMoney(asNum);
  }
  return String(v);
}

export function changeTypeLabel(changeType: string): string {
  const map: Record<string, string> = {
    price_changed: "Fiyat",
    stock_changed: "Stok",
    title_changed: "Başlık",
    variant_price_changed: "Varyant fiyat",
    variant_stock_changed: "Varyant stok",
    variant_changed: "Varyant",
    variant_added: "Varyant eklendi",
    variant_removed: "Varyant silindi",
    product_removed: "Ürün kaldırıldı",
    product_out_of_stock: "Stok bitti",
    source_unavailable: "Satıştan kalktı",
    tracking_error: "Takip hatası",
    shopify_sync_error: "Shopify senkron",
  };
  return map[changeType] || changeType;
}

export function changeStatusLabel(status?: string | null): string {
  const map: Record<string, string> = {
    pending: "Beklemede",
    manual_review: "Manuel inceleme",
    failed: "Başarısız",
    ignored: "Yok sayıldı",
    approved: "Onaylandı",
    applied: "Uygulandı",
    rejected: "Reddedildi",
    superseded: "Güncellendi",
  };
  const key = String(status || "").toLowerCase();
  return map[key] || (status ? String(status) : "—");
}

export function uniqueImageUrls(
  ...groups: Array<string | null | undefined | Array<string | null | undefined>>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const arr = Array.isArray(g) ? g : [g];
    for (const raw of arr) {
      const u = String(raw || "").trim();
      if (!u || !/^https?:\/\//i.test(u)) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

export function marketplaceLabel(raw?: string | null): string {
  const s = String(raw || "").toLowerCase();
  if (s.includes("trendyol")) return "Trendyol";
  if (s.includes("amazon")) return "Amazon";
  if (s.includes("n11")) return "N11";
  if (s.includes("pazarama")) return "Pazarama";
  if (s.includes("idefix")) return "İdefix";
  if (s.includes("ptt")) return "PTT AVM";
  if (s.includes("hepegitim")) return "Hepegitim";
  return raw || "Diğer";
}

/** orvianmonitor://product/123 | orvianmonitor://change/456 */
export function parseDeepLink(url: string): { kind: "product" | "change"; id: number } | null {
  try {
    const normalized = String(url || "").trim();
    const m = normalized.match(
      /^(?:orvianmonitor:\/\/|https?:\/\/orvianmonitor\/?)(product|change)\/(\d+)/i,
    );
    if (m) {
      const id = Number(m[2]);
      if (!Number.isFinite(id) || id <= 0) return null;
      return { kind: m[1].toLowerCase() as "product" | "change", id };
    }
    const parsed = new URL(
      normalized.replace(/^orvianmonitor:\/\//i, "https://deep.link/"),
    );
    const parts = `${parsed.hostname}${parsed.pathname}`
      .split("/")
      .filter(Boolean);
    const kind = parts[0]?.toLowerCase();
    const id = Number(parts[1]);
    if ((kind === "product" || kind === "change") && Number.isFinite(id) && id > 0) {
      return { kind, id };
    }
    return null;
  } catch {
    return null;
  }
}

export function badgeCountFromNotifications(n: {
  pendingChangesCount?: number;
  lastChanges?: unknown[];
}): number {
  if (typeof n.pendingChangesCount === "number") return Math.max(0, n.pendingChangesCount);
  return Array.isArray(n.lastChanges) ? n.lastChanges.length : 0;
}
