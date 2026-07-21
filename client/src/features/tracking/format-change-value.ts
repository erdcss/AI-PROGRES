/** Değişiklik değerlerini okunabilir metne çevirir */

import {
  buildTrackingVariantLabel,
  isPlaceholderColor,
  isPlaceholderSize,
} from "@shared/trendyol-variant-utils";

function parseChangeValue(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return String(raw);

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object") return parsed;
    return parsed;
  } catch {
    /* devam */
  }

  const braceMatch = trimmed.match(/^@?\{(.+)\}$/s);
  if (braceMatch) {
    const obj: Record<string, string> = {};
    for (const part of braceMatch[1].split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      if (key) obj[key] = val;
    }
    if (Object.keys(obj).length > 0) return obj;
  }

  return trimmed;
}

function isTruthyStock(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "stokta";
  }
  return false;
}

export function formatChangeValue(raw: unknown, changeType: string): string {
  const value = parseChangeValue(raw);
  if (value == null) return "—";

  if (typeof value === "number") {
    if (changeType.includes("price")) return `${value.toLocaleString("tr-TR")} ₺`;
    if (changeType.includes("stock")) return `${value} adet`;
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Var" : "Yok";
  }

  if (typeof value === "string") {
    if (changeType.includes("price") && /^\d+(\.\d+)?$/.test(value)) {
      return `${Number(value).toLocaleString("tr-TR")} ₺`;
    }
    return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("size" in o || "color" in o || "key" in o || "inStock" in o) {
      const color = o.color ? String(o.color) : null;
      const size = o.size ? String(o.size) : null;
      const label = buildTrackingVariantLabel(
        color && !isPlaceholderColor(color) ? color : null,
        size && !isPlaceholderSize(size) ? size : null,
      );
      const parts: string[] = [];
      if (label) parts.push(label);
      if ("inStock" in o) parts.push(isTruthyStock(o.inStock) ? "Stokta" : "Tükendi");
      if (o.price != null && o.price !== "") parts.push(`${o.price} ₺`);
      return parts.join(" · ") || "Yeni varyant";
    }
    const entries = Object.entries(o).filter(([, v]) => v != null && v !== "");
    if (entries.length === 0) return "—";
    if (entries.length <= 3) {
      return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
    }
    return `${entries.length} alan güncellendi`;
  }

  return String(value);
}

export function formatChangeDiff(changeType: string, oldValue: unknown, newValue: unknown): string {
  const oldText = formatChangeValue(oldValue, changeType);
  const newText = formatChangeValue(newValue, changeType);
  if (oldText === "—" && newText === "—") return "Değişiklik detayı yok";
  if (oldText === "—") return newText;
  if (newText === "—") return oldText;
  return `${oldText} → ${newText}`;
}

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  price_changed: "Fiyat değişti",
  stock_changed: "Stok değişti",
  variant_added: "Yeni varyant",
  variant_removed: "Varyant kaldırıldı",
  variant_price_changed: "Varyant fiyatı",
  variant_stock_changed: "Varyant stoku",
  title_changed: "Başlık değişti",
  image_changed: "Görsel değişti",
  price: "Fiyat değişti",
  stock: "Stok değişti",
  title: "Başlık değişti",
  image: "Görsel değişti",
};

export const CHANGE_STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  manual_review: "Manuel inceleme",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  applied: "Uygulandı",
  failed: "Hatalı",
  ignored: "Yok sayıldı",
};

export function changeStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "pending" || status === "manual_review") return "destructive";
  if (status === "approved" || status === "applied") return "default";
  if (status === "failed") return "destructive";
  return "outline";
}
