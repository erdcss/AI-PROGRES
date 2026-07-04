/**
 * Giyim ürünü tespiti ve sahte beden (S/M/L) filtreleme — sunucu + istemci ortak
 */

export const CLOTHING_KEYWORDS = [
  "tişört", "t-shirt", "tshirt", "thsirt", "tisort",
  "gömlek", "bluz", "atlet", "body",
  "pantolon", "etek", "şort", "tayt", "jean", "kot", "denim",
  "elbise", "tulum",
  "kazak", "mont", "ceket", "hırka", "yelek", "sweatshirt", "hoodie", "polar",
  "trençkot", "kaban", "palto", "eşofman", "kap", "parka",
  "ayakkabı", "çizme", "bot", "sneaker", "terlik", "sandalet", "topuklu",
  "loafer", "mokasen", "babet", "spor ayakkabı",
  "iç giyim", "pijama", "mayo", "bikini", "külot", "sütyen", "boxer",
  "kemer", "eldiven", "şapka", "bere", "atkı",
  "bisiklet yaka", "kısa kol", "uzun kol", "v yaka",
];

/** Trendyol URL slug parçaları — /giyim/ yolu olmasa da giyim sayılır */
export const CLOTHING_URL_SLUG_TOKENS = [
  "tisort", "thsirt", "tshirt", "t-shirt", "gomlek", "pantolon", "elbise",
  "etek", "sort", "esofman", "sweatshirt", "kazak", "mont", "ceket", "hirka",
  "ayakkabi", "terlik", "sandalet", "babet", "sneaker", "pijama", "mayo",
  "kadin-giyim", "erkek-giyim", "cocuk-giyim", "spor-giyim", "ic-giyim",
];

/** Giyim dışı ürünlerde görülmemesi gereken standart beden kısaltmaları */
export const FAKE_CLOTHING_SIZES = ["xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl"];

const CLOTHING_TITLE_NORMALIZE: Array<[RegExp, string]> = [
  [/\bthsirt\b/gi, "tişört"],
  [/\btisort\b/gi, "tişört"],
  [/\btshirt\b/gi, "tişört"],
  [/\bt-shirt\b/gi, "tişört"],
];

function normalizeClothingText(text: string): string {
  let out = (text || "").toLowerCase();
  for (const [pattern, replacement] of CLOTHING_TITLE_NORMALIZE) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function isClothingProduct(title: string): boolean {
  const normalized = normalizeClothingText(title || "");
  return CLOTHING_KEYWORDS.some((kw) => normalized.includes(kw.toLowerCase()));
}

export function isClothingUrl(url: string): boolean {
  const slug = (url || "").toLowerCase();
  if (CLOTHING_URL_SLUG_TOKENS.some((token) => slug.includes(token))) return true;
  const slugAsWords = slug.replace(/-/g, " ");
  return isClothingProduct(slugAsWords);
}

export function isConfirmedClothingProduct(title: string, url?: string): boolean {
  if (isClothingProduct(title)) return true;
  if (url && isClothingUrl(url)) return true;
  return false;
}

export function isStandardClothingSize(size: unknown): boolean {
  if (size == null) return false;
  return FAKE_CLOTHING_SIZES.includes(String(size).trim().toLowerCase());
}
