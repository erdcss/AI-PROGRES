/** Değişiklik değerlerini okunabilir metne çevirir */

import {
  buildTrackingVariantLabel,
  isPlaceholderColor,
  isPlaceholderSize,
} from "@shared/trendyol-variant-utils";
import { buildChangeDiagnosis } from "@shared/tracking-change-diagnosis";
import { formatTryPrice, type PricePairDisplay, buildPricePairDisplay } from "@shared/tracking-price-display";

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
    if (changeType.includes("stock") || changeType.includes("available")) {
      return value ? "Stokta" : "Tükendi";
    }
    return value ? "Var" : "Yok";
  }

  if (typeof value === "string") {
    if (changeType.includes("price") && /^\d+(\.\d+)?$/.test(value)) {
      return `${Number(value).toLocaleString("tr-TR")} ₺`;
    }
    return value.length > 160 ? `${value.slice(0, 157)}…` : value;
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
  if (oldText === "—" && newText === "—") return "Detay yok";
  if (oldText === "—") return newText;
  if (newText === "—") return oldText;
  return `${oldText} → ${newText}`;
}

export type ChangeDiffParts = {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
  summary: string;
  diagnosis: string;
  advice: string | null;
  headline: string;
  priceDisplay?: PricePairDisplay | null;
};

export function getChangeDiffParts(
  changeType: string,
  oldValue: unknown,
  newValue: unknown,
  options?: {
    fieldName?: string | null;
    variantLabel?: string | null;
    storedReason?: string | null;
    profitMarginPercent?: number | null;
    priceDisplay?: PricePairDisplay | null;
  },
): ChangeDiffParts {
  const oldText = formatChangeValue(oldValue, changeType);
  const newText = formatChangeValue(newValue, changeType);
  const diagnosis = buildChangeDiagnosis({
    changeType,
    fieldName: options?.fieldName,
    oldValue,
    newValue,
    variantLabel: options?.variantLabel,
    storedReason: options?.storedReason,
    profitMarginPercent: options?.profitMarginPercent,
  });

  let oldLabel = "Önce";
  let newLabel = "Sonra";
  if (changeType.includes("price")) {
    oldLabel = "Eski alış";
    newLabel = "Yeni alış";
  } else if (changeType === "variant_stock_changed") {
    oldLabel = "Eski stok durumu";
    newLabel = "Yeni stok durumu";
  } else if (changeType.includes("stock") || changeType.includes("available")) {
    oldLabel = "Eski durum";
    newLabel = "Yeni durum";
  } else if (changeType.includes("title")) {
    oldLabel = "Eski başlık";
    newLabel = "Yeni başlık";
  } else if (changeType === "variant_added") {
    oldLabel = "Önce";
    newLabel = "Eklenen";
  } else if (changeType === "variant_removed") {
    oldLabel = "Kaldırılan";
    newLabel = "Sonra";
  }

  const priceDisplay =
    options?.priceDisplay ??
    (changeType.includes("price")
      ? buildPricePairDisplay(oldValue, newValue, options?.profitMarginPercent)
      : null);

  return {
    oldText,
    newText,
    oldLabel,
    newLabel,
    summary: diagnosis.headline,
    diagnosis: diagnosis.diagnosis,
    advice: diagnosis.advice,
    headline: diagnosis.headline,
    priceDisplay,
  };
}

export function formatPricePairLines(priceDisplay: PricePairDisplay | null | undefined): {
  costLine: string | null;
  saleLine: string | null;
  marginLine: string | null;
} {
  if (!priceDisplay) return { costLine: null, saleLine: null, marginLine: null };
  const costLine =
    priceDisplay.costOld != null && priceDisplay.costNew != null
      ? `${formatTryPrice(priceDisplay.costOld)} → ${formatTryPrice(priceDisplay.costNew)}`
      : null;
  const saleLine =
    priceDisplay.saleOld != null && priceDisplay.saleNew != null
      ? `${formatTryPrice(priceDisplay.saleOld)} → ${formatTryPrice(priceDisplay.saleNew)}`
      : null;
  const marginLine =
    priceDisplay.marginPercent != null ? `%${priceDisplay.marginPercent} kâr marjı` : null;
  return { costLine, saleLine, marginLine };
}

export function simplifyChangeReason(
  reason: string | null | undefined,
  changeType: string,
  extras?: {
    fieldName?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    variantLabel?: string | null;
    profitMarginPercent?: number | null;
  },
): string | null {
  const diagnosis = buildChangeDiagnosis({
    changeType,
    fieldName: extras?.fieldName,
    oldValue: extras?.oldValue ?? null,
    newValue: extras?.newValue ?? null,
    variantLabel: extras?.variantLabel,
    storedReason: reason,
    profitMarginPercent: extras?.profitMarginPercent,
  });
  return diagnosis.diagnosis;
}

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  price_changed: "Fiyat",
  stock_changed: "Stok",
  variant_added: "Yeni varyant",
  variant_removed: "Varyant kalktı",
  variant_price_changed: "Varyant fiyatı",
  variant_stock_changed: "Varyant stoku",
  title_changed: "Başlık",
  image_changed: "Görsel",
  price: "Fiyat",
  stock: "Stok",
  title: "Başlık",
  image: "Görsel",
};

export const CHANGE_STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  manual_review: "Kontrol gerekli",
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
