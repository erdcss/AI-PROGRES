/**
 * Giyim ürünü tespiti ve sahte beden (S/M/L) filtreleme — sunucu + istemci ortak
 */

export const CLOTHING_KEYWORDS = [
  "tişört", "t-shirt", "tshirt", "gömlek", "bluz", "atlet", "body",
  "pantolon", "etek", "şort", "tayt", "jean", "kot", "denim",
  "elbise", "tulum",
  "kazak", "mont", "ceket", "hırka", "yelek", "sweatshirt", "hoodie", "polar",
  "trençkot", "kaban", "palto", "eşofman", "kap", "parka",
  "ayakkabı", "çizme", "bot", "sneaker", "terlik", "sandalet", "topuklu",
  "loafer", "mokasen", "babet", "spor ayakkabı",
  "iç giyim", "pijama", "mayo", "bikini", "külot", "sütyen", "boxer",
  "kemer", "eldiven", "şapka", "bere", "atkı",
];

/** Giyim dışı ürünlerde görülmemesi gereken standart beden kısaltmaları */
export const FAKE_CLOTHING_SIZES = ["xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl"];

export function isClothingProduct(title: string): boolean {
  const titleLower = (title || "").toLowerCase();
  return CLOTHING_KEYWORDS.some((kw) => titleLower.includes(kw));
}

export function isStandardClothingSize(size: unknown): boolean {
  if (size == null) return false;
  return FAKE_CLOTHING_SIZES.includes(String(size).trim().toLowerCase());
}
