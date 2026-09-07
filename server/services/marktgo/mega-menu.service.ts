import { getActiveMarktGoConnection } from "./connection.service";
import { fetchMarktGoAbsoluteJson } from "./client";

export type MegaMenuSubItem = {
  label: string;
  categoryId: number | null;
  href: string;
};

export type MegaMenuGroup = {
  title: string;
  items: MegaMenuSubItem[];
};

export type MegaMenuTop = {
  label: string;
  categoryId: number | null;
  href: string;
  groups: MegaMenuGroup[];
};

export type MegaMenuSummary = {
  syncedAt: string;
  tops: MegaMenuTop[];
  message?: string;
};

export type MegaMenuTagMatch = {
  matchType: "top" | "group" | "item" | "none";
  title: string;
  tops: Array<{
    label: string;
    groups: MegaMenuGroup[];
  }>;
};

let lastMega: MegaMenuSummary | null = null;
let inFlight: Promise<MegaMenuSummary> | null = null;
let lastRunAt = 0;
const MIN_INTERVAL_MS = 60_000;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string {
  return String(v ?? "").trim();
}

function asCatId(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Etiket / mega menü etiketi eşlemesi için Türkçe-normalize anahtar. */
export function normalizeMegaLabelKey(value: string): string {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFC")
    .replace(/&/g, " ")
    .replace(/[+_/|,.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function publicWebSiteSettingsUrl(apiBaseUrl: string): string {
  const trimmed = String(apiBaseUrl || "").trim().replace(/\/+$/, "");
  const origin = trimmed.replace(/\/api\/v1\/external$/i, "").replace(/\/api$/i, "");
  const root = origin || trimmed;
  return `${root}/api/public/web-site-settings`;
}

function parseLink(raw: unknown): MegaMenuSubItem | null {
  const o = asObj(raw);
  if (o.visible === false) return null;
  const label = asString(o.label);
  if (!label) return null;
  const skip = normalizeMegaLabelKey(label)
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
  if (
    skip === "tumunu gor" ||
    skip === "daha fazla gor" ||
    skip === "see all" ||
    skip === "see more"
  ) {
    return null;
  }
  return {
    label,
    categoryId: asCatId(o.categoryId),
    href: asString(o.href) || "",
  };
}

function parseGroup(raw: unknown): MegaMenuGroup | null {
  const o = asObj(raw);
  if (o.visible === false) return null;
  const type = asString(o.type);
  if (type && type !== "category_list" && type !== "link_list") return null;
  const title = asString(o.title);
  const items = asList(o.items)
    .map(parseLink)
    .filter((x): x is MegaMenuSubItem => Boolean(x));
  if (!title && !items.length) return null;
  // Placeholder blocks
  if (items.length === 1 && /yeni kategori|alt kategori/i.test(items[0].label) && !title) {
    return null;
  }
  return { title: title || "Alt kategori", items };
}

function parseTop(raw: unknown): MegaMenuTop | null {
  const o = asObj(raw);
  if (o.enabled === false || o.visible === false) return null;
  const label = asString(o.label);
  if (!label) return null;
  const seen = new Set<string>();
  const groups: MegaMenuGroup[] = [];
  for (const block of asList(o.blocks)) {
    const group = parseGroup(block);
    if (!group || !group.items.length) continue;
    const key = `${normalizeMegaLabelKey(group.title)}::${group.items
      .map((i) => normalizeMegaLabelKey(i.label))
      .join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(group);
  }
  return {
    label,
    categoryId: asCatId(o.categoryId),
    href: asString(o.href) || "",
    groups,
  };
}

function extractMenuItems(payload: unknown): unknown[] {
  const root = asObj(payload);
  const mega = asObj(root.megaMenu);
  const desktop = asObj(mega.desktop);
  const fromDesktop = asList(desktop.menuItems);
  if (fromDesktop.length) return fromDesktop;
  const mobile = asObj(mega.mobile);
  const fromMobile = asList(mobile.menuItems);
  if (fromMobile.length) return fromMobile;
  return asList(mega.menuItems);
}

export function parseMegaMenuSummary(payload: unknown): MegaMenuSummary {
  const tops = extractMenuItems(payload)
    .map(parseTop)
    .filter((x): x is MegaMenuTop => Boolean(x));
  return {
    syncedAt: new Date().toISOString(),
    tops,
    message: tops.length
      ? `${tops.length} üst kategori (kategori sekmesi / mega menü)`
      : "Mega menü boş veya yayınlanmamış",
  };
}

export function getLastMegaMenuSummary(): MegaMenuSummary | null {
  return lastMega;
}

export async function syncMarktGoMegaMenu(force = false): Promise<MegaMenuSummary> {
  if (inFlight) return inFlight;
  if (!force && lastMega && Date.now() - lastRunAt < MIN_INTERVAL_MS) {
    return lastMega;
  }

  lastRunAt = Date.now();
  inFlight = (async () => {
    const conn = await getActiveMarktGoConnection();
    if (!conn?.apiBaseUrl) {
      throw new Error("Aktif MARKT-GO bağlantısı yok");
    }
    const url = publicWebSiteSettingsUrl(conn.apiBaseUrl);
    const payload = await fetchMarktGoAbsoluteJson<unknown>(url);
    const summary = parseMegaMenuSummary(payload);
    lastMega = summary;
    return summary;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * Ürün etiketine göre kategori sekmesindeki alt kategori gruplarını bulur.
 * Öncelik: üst kategori → grup başlığı → yaprak etiket.
 */
export function resolveMegaMenuForTag(
  tops: MegaMenuTop[],
  tag: string,
): MegaMenuTagMatch {
  const key = normalizeMegaLabelKey(tag);
  if (!key || !tops.length) {
    return { matchType: "none", title: tag, tops: [] };
  }

  const topHits = tops.filter((t) => normalizeMegaLabelKey(t.label) === key);
  if (topHits.length) {
    return {
      matchType: "top",
      title: topHits[0].label,
      tops: topHits.map((t) => ({ label: t.label, groups: t.groups })),
    };
  }

  const groupHits: MegaMenuTagMatch["tops"] = [];
  for (const top of tops) {
    const groups = top.groups.filter((g) => normalizeMegaLabelKey(g.title) === key);
    if (groups.length) groupHits.push({ label: top.label, groups });
  }
  if (groupHits.length) {
    return { matchType: "group", title: tag, tops: groupHits };
  }

  const itemHits: MegaMenuTagMatch["tops"] = [];
  for (const top of tops) {
    const groups: MegaMenuGroup[] = [];
    for (const group of top.groups) {
      const hit = group.items.some((i) => normalizeMegaLabelKey(i.label) === key);
      if (hit) groups.push(group);
    }
    if (groups.length) itemHits.push({ label: top.label, groups });
  }
  if (itemHits.length) {
    return { matchType: "item", title: tag, tops: itemHits };
  }

  // Kısmi eşleşme (ör. "tişört" ↔ "Polo Yaka T-shirt")
  const softHits: MegaMenuTagMatch["tops"] = [];
  for (const top of tops) {
    const groups: MegaMenuGroup[] = [];
    for (const group of top.groups) {
      const hit = group.items.some((i) => {
        const lk = normalizeMegaLabelKey(i.label);
        return lk.includes(key) || key.includes(lk);
      });
      if (hit) groups.push(group);
    }
    if (groups.length) softHits.push({ label: top.label, groups });
  }
  if (softHits.length) {
    return { matchType: "item", title: tag, tops: softHits };
  }

  return { matchType: "none", title: tag, tops: [] };
}
