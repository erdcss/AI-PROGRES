/** Trendyol renk adı temizleme — DOM/UI gürültüsünü filtreler */

const INVALID_COLOR_LABELS = new Set([
  "renk bilgisi yok",
  "renk yok",
  "bilinmiyor",
  "n/a",
  "none",
  "null",
  "undefined",
  "varsayılan",
  "default",
  "tek renk",
  "next",
  "",
]);

const REJECT_COLOR_TEXT =
  /slicing|attribute\s*product|kaydırıcı|içerik\s*göstergesi|kolsuz|vyak|sepete|favori|trendyol|undefined|null|button|slider|carousel|gösterge|daha\s*fazla|t-shirt|tişört|elbise|pantolon|gömlek|oversize|boyfriend|kolsuz|v\s*yaka|yuvarlak|productdetail|variant-option/i;

const SLUG_LIKE = /^[A-Z0-9ÇĞİÖŞÜ]{10,}$/;

const COLOR_ALIASES: Record<string, string> = {
  fusya: "Fuşya",
  kirmizi: "Kırmızı",
  sari: "Sarı",
  yesil: "Yeşil",
  "fistik-yesili": "Fıstık Yeşili",
  "neon-yesili": "Neon Yeşili",
  "neon-sari": "Neon Sarı",
  "gul-kurusu": "Gül Kurusu",
  "mavi-c": "Mavi",
};

export const KNOWN_TRENDYOL_COLORS = [
  "Antrasit",
  "Bej",
  "Beyaz",
  "Bordo",
  "Bronz",
  "Camel",
  "Desenli",
  "Ekru",
  "Fuşya",
  "Gold",
  "Gri",
  "Gümüş",
  "Haki",
  "Hardal",
  "Indigo",
  "Kahve",
  "Kahverengi",
  "Kareli",
  "Krem",
  "Kırmızı",
  "Lacivert",
  "Leopar",
  "Lila",
  "Mavi",
  "Mercan",
  "Mint",
  "Mor",
  "Nude",
  "Pembe",
  "Petrol",
  "Sarı",
  "Siyah",
  "Taş",
  "Turuncu",
  "Vizon",
  "Yeşil",
  "Çizgili",
  "Şampanya",
];

function titleCaseTurkish(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t
    .split(/([\s/-]+)/)
    .map((part) =>
      /^[\s/-]+$/.test(part)
        ? part
        : part.charAt(0).toLocaleUpperCase("tr-TR") +
          part.slice(1).toLocaleLowerCase("tr-TR"),
    )
    .join("");
}

function stripTrailingVariantIndex(raw: string): string {
  const m = raw.match(/^([A-Za-zÇçĞğİıÖöŞşÜü]+)(\d{1,3})$/);
  return m ? m[1] : raw;
}

function findKnownColor(value: string): string | null {
  const lower = value.toLocaleLowerCase("tr-TR");
  for (const color of [...KNOWN_TRENDYOL_COLORS].sort((a, b) => b.length - a.length)) {
    if (lower === color.toLocaleLowerCase("tr-TR")) return color;
  }
  return null;
}

function extractSingleKnownColorFromSlug(raw: string): string | null {
  const lower = raw.toLocaleLowerCase("tr-TR");
  const matches: string[] = [];
  for (const color of [...KNOWN_TRENDYOL_COLORS].sort((a, b) => b.length - a.length)) {
    const cLower = color.toLocaleLowerCase("tr-TR");
    if (lower.includes(cLower)) matches.push(color);
  }
  if (matches.length === 1) return matches[0];
  return null;
}

function isReasonableColorLabel(value: string): boolean {
  if (value.length < 2 || value.length > 22) return false;
  if (/\d{2,}/.test(value)) return false;
  return /^[A-Za-zÇçĞğİıÖöŞşÜü][A-Za-zÇçĞğİıÖöŞşÜü\s\-/]{0,20}[A-Za-zÇçĞğİıÖöŞşÜü]?$/.test(value);
}

/** Kirli Trendyol renk etiketini temizler; geçersizse null */
export function normalizeTrendyolColorName(input: unknown): string | null {
  if (input == null) return null;

  let raw = "";
  if (typeof input === "string") {
    raw = input.trim();
  } else if (typeof input === "object") {
    const o = input as Record<string, unknown>;
    for (const key of ["name", "color", "colorName", "value", "attributeValue", "attributeBeautifiedValue"]) {
      if (typeof o[key] === "string" && o[key]!.trim()) {
        raw = o[key]!.trim();
        break;
      }
    }
  }

  if (!raw) return null;
  raw = raw.replace(/\s+/g, " ").trim();
  if (raw.length > 40) return null;

  const lower = raw.toLocaleLowerCase("tr-TR");
  if (INVALID_COLOR_LABELS.has(lower)) return null;
  if (REJECT_COLOR_TEXT.test(raw)) return null;
  if (COLOR_ALIASES[lower]) return COLOR_ALIASES[lower];

  const knownDirect = findKnownColor(raw);
  if (knownDirect) return knownDirect;

  raw = stripTrailingVariantIndex(raw);
  const knownStripped = findKnownColor(raw);
  if (knownStripped) return knownStripped;

  if (SLUG_LIKE.test(raw) || (!/\s/.test(raw) && raw.length > 12)) {
    return extractSingleKnownColorFromSlug(raw);
  }

  const titled = titleCaseTurkish(raw);
  const knownTitled = findKnownColor(titled);
  if (knownTitled) return knownTitled;

  if (isReasonableColorLabel(titled)) return titled;
  return null;
}

export function isInvalidTrendyolColorName(input: unknown): boolean {
  return normalizeTrendyolColorName(input) === null;
}
