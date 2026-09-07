import { sanitizeShopifyTags } from "./shopify-tag-sanitizer";
import { cleanTrendyolCategoryPath } from "./trendyol-category-path";

/** MARKT-GO koleksiyon koşulu ile aynı etiket anahtarı (boşluk → tire). */
export function normalizeTagKey(tag: string): string {
  return String(tag || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "-");
}

/** Ürün tipi (en spesifik) */
const PRODUCT_TYPE_RULES: Array<{ tag: string; mid: string; re: RegExp }> = [
  { tag: "yüzük", mid: "aksesuar", re: /y[uü]z[uü]k|ring\b/i },
  { tag: "kolye", mid: "aksesuar", re: /kolye|necklace/i },
  { tag: "küpe", mid: "aksesuar", re: /k[uü]pe|earring/i },
  { tag: "bileklik", mid: "aksesuar", re: /bileklik|bracelet/i },
  { tag: "saat", mid: "aksesuar", re: /\bsaat\b|watch\b/i },
  { tag: "kemer", mid: "aksesuar", re: /\bkemer\b|belt\b/i },
  { tag: "şapka", mid: "aksesuar", re: /şapka|sapka|cap\b|hat\b/i },
  { tag: "cüzdan", mid: "aksesuar", re: /c[uü]zdan|wallet/i },
  { tag: "tişört", mid: "giyim", re: /tiş[oö]rt|tisort|t[\s-]?shirt/i },
  { tag: "sweatshirt", mid: "giyim", re: /sweatshirt|hoodie|kap[uü]şon/i },
  { tag: "elbise", mid: "giyim", re: /elbise|dress/i },
  { tag: "pantolon", mid: "giyim", re: /pantolon|jean|eşofman|jogger/i },
  { tag: "gömlek", mid: "giyim", re: /g[oö]mlek|shirt(?!\s*t)/i },
  { tag: "etek", mid: "giyim", re: /\betek\b|skirt/i },
  { tag: "mont", mid: "giyim", re: /\bmont\b|kaban|parka|yağmurluk/i },
  { tag: "ceket", mid: "giyim", re: /ceket|blazer|jacket/i },
  { tag: "ayakkabı", mid: "ayakkabı", re: /ayakkab[iı]|sneaker|bot\b|çizme|loafer|sandalet|terlik/i },
  { tag: "çanta", mid: "çanta", re: /çanta|canta|backpack|sırt\s*çanta/i },
  { tag: "krem", mid: "kozmetik", re: /\bkrem\b|serum|ruj|makyaj|maskara/i },
  { tag: "parfüm", mid: "kozmetik", re: /parf[uü]m/i },
  { tag: "kulaklık", mid: "elektronik", re: /kulakl[iı]k|bluetooth/i },
  { tag: "oyuncak", mid: "oyuncak", re: /oyuncak|lego|puzzle|peluş|pelus/i },
];

const GENDER_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "kadın", re: /kad[iı]n|bayan|woman|women|kız\b|kiz\b/i },
  { tag: "erkek", re: /erkek|\bmen\b|\bman\b|oğlan|oglan/i },
  { tag: "çocuk", re: /çocuk|cocuk|bebek|kids|baby/i },
];

const MATERIAL_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "pamuk", re: /pamuk|cotton/i },
  { tag: "polyester", re: /polyester|poliester/i },
  { tag: "deri", re: /\bderi\b|leather/i },
  { tag: "süet", re: /s[uü]et|suede/i },
  { tag: "keten", re: /keten|linen/i },
  { tag: "yün", re: /y[uü]n|wool/i },
  { tag: "metal", re: /metal|paslanmaz|krom|chrom|alt[iı]n|g[uü]m[uü]ş|gold|silver/i },
  { tag: "plastik", re: /plastik|abs\b|pvc/i },
];

const PATTERN_STYLE_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "oversize", re: /oversize|bol\s*kesim/i },
  { tag: "slim fit", re: /slim\s*fit|dar\s*kesim/i },
  { tag: "regular fit", re: /regular\s*fit|normal\s*kesim/i },
  { tag: "baskılı", re: /bask[iı]l[iı]|print(ed)?/i },
  { tag: "düz renk", re: /d[uü]z\s*renk|plain/i },
  { tag: "çizgili", re: /çizgili|striped/i },
  { tag: "desenli", re: /desenli|patterned/i },
];

const FEATURE_NAME_TO_TAG: Array<{ names: RegExp; tagFromValue?: boolean; tag?: string }> = [
  { names: /materyal|malzeme|kumaş|kumas|material/i, tagFromValue: true },
  { names: /renk|color/i, tagFromValue: true },
  { names: /kullanım\s*alan|kullanim\s*alan|usage/i, tagFromValue: true },
  { names: /menşei|mensei|origin/i, tagFromValue: true },
  { names: /cinsiyet|gender/i, tagFromValue: true },
  { names: /sezon|season/i, tagFromValue: true },
  { names: /yaş\s*grub|yas\s*grub|age/i, tagFromValue: true },
  { names: /desen|pattern/i, tagFromValue: true },
  { names: /yaka\s*tipi|collar/i, tagFromValue: true },
  { names: /kol\s*tipi|sleeve/i, tagFromValue: true },
  { names: /su\s*geçirmez|waterproof/i, tag: "su geçirmez" },
  { names: /organik|organic/i, tag: "organik" },
];

/** Ana kategori kovası */
const MAIN_CATEGORY_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "Kozmetik", re: /kozmetik|krem|ruj|makyaj|serum|parf[uü]m|şampuan|sampuan|g[uü]zellik|beauty/i },
  { tag: "Elektronik", re: /elektronik|kulakl[iı]k|telefon|laptop|tablet|\btv\b|bluetooth|şarj|sarj/i },
  { tag: "Oyuncak", re: /oyuncak|lego|puzzle|peluş|pelus/i },
  { tag: "Spor", re: /spor|fitness|yoga|koşu|kosu|antrenman/i },
  { tag: "Ev & Yaşam", re: /ev\s*&\s*yaşam|mobilya|mutfak|yatak|dekor|havlu|aydınlatma/i },
  { tag: "Bahçe & Yapı Market", re: /bah[cç]e|yap[iı]\s*market|h[iı]rdavat|banyo\s*yap[iı]|yap[iı]\s*malzem/i },
  {
    tag: "Moda",
    re: /tiş[oö]rt|tisort|elbise|pantolon|g[oö]mlek|ayakkab[iı]|çanta|canta|mont|ceket|giyim|moda|sweatshirt|y[uü]z[uü]k|kolye|k[uü]pe|aksesuar/i,
  },
];

const MID_FROM_PATH: Array<{ mid: string; re: RegExp }> = [
  { mid: "aksesuar", re: /aksesuar|tak[iı]|m[uü]cevher|jewelry/i },
  { mid: "giyim", re: /giyim|giysi|clothing|apparel/i },
  { mid: "ayakkabı", re: /ayakkab/i },
  { mid: "çanta", re: /çanta|canta/i },
  { mid: "kozmetik", re: /kozmetik|g[uü]zellik/i },
  { mid: "elektronik", re: /elektronik/i },
];

function normalizeFeatureValueTag(value: string, known: string[]): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
  if (!cleaned || cleaned.length < 2) return "";
  if (/trendyol/i.test(cleaned)) return "";
  return resolveKnownTagSpelling(cleaned, known);
}

export function tagsFromProductFeatures(
  features: Array<{ name?: string; key?: string; value?: string }> | undefined,
  knownCollectionTags: string[] = [],
): string[] {
  if (!Array.isArray(features) || !features.length) return [];
  const known = knownCollectionTags.filter((t) => t && !/trendyol/i.test(t));
  const out: string[] = [];

  for (const row of features) {
    const name = String(row.name || row.key || "").trim();
    const value = String(row.value || "").trim();
    if (!name || !value) continue;
    if (/trendyol/i.test(name) || /trendyol/i.test(value)) continue;

    for (const rule of FEATURE_NAME_TO_TAG) {
      if (!rule.names.test(name)) continue;
      if (rule.tag) {
        out.push(resolveKnownTagSpelling(rule.tag, known));
      } else if (rule.tagFromValue) {
        const tag = normalizeFeatureValueTag(value, known);
        if (tag) out.push(tag);
      }
      break;
    }
  }

  return sanitizeShopifyTags(out);
}

function tagsFromTitleHeuristics(blob: string, known: string[]): string[] {
  const out: string[] = [];
  for (const rule of MATERIAL_RULES) {
    if (rule.re.test(blob)) out.push(resolveKnownTagSpelling(rule.tag, known));
  }
  for (const rule of PATTERN_STYLE_RULES) {
    if (rule.re.test(blob)) out.push(resolveKnownTagSpelling(rule.tag, known));
  }
  return out;
}

function titleBlob(title: string, brand?: string, category?: string, path?: string[]): string {
  return [title, brand, category, ...(path || [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

function titleContainsTagWords(blob: string, tag: string): boolean {
  const words = String(tag || "")
    .toLocaleLowerCase("tr-TR")
    .split(/[\s/_-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  if (!words.length) return false;
  return words.every((w) => blob.includes(w));
}

export function resolveKnownTagSpelling(
  segment: string,
  knownCollectionTags: string[],
): string {
  const key = normalizeTagKey(segment);
  if (!key) return segment;
  const exact = knownCollectionTags.find((k) => normalizeTagKey(k) === key);
  if (exact) return exact;

  const segLower = segment.toLocaleLowerCase("tr-TR");
  let best: string | null = null;
  let bestScore = 0;
  for (const known of knownCollectionTags) {
    const k = String(known || "").trim();
    if (!k || /trendyol/i.test(k)) continue;
    const kn = k.toLocaleLowerCase("tr-TR");
    if (segLower === kn) return k;
    // Sadece bilinen etiket, segment içinde geçiyorsa eşle (kısa → uzun yükseltme yapma)
    // "kadın" → "kadın elbise" olmamalı; "kadın elbise" → "kadın elbise" OK
    if (segLower.includes(kn) && kn.length >= 4) {
      const score = kn.length;
      if (score > bestScore) {
        best = k;
        bestScore = score;
      }
    }
  }
  return best || segment;
}

export function tagsFromCategoryPath(
  categoryPath: string[] | undefined,
  opts?: {
    title?: string | null;
    brand?: string | null;
    knownCollectionTags?: string[];
  },
): string[] {
  const path = cleanTrendyolCategoryPath(categoryPath || [], {
    title: opts?.title || undefined,
    brand: opts?.brand || undefined,
  });
  if (!path.length) return [];

  const known = (opts?.knownCollectionTags || [])
    .map((t) => String(t || "").trim())
    .filter((t) => t && !/trendyol/i.test(t));

  const out: string[] = [];
  for (const segment of path) {
    out.push(resolveKnownTagSpelling(segment, known));
  }

  const pathBlob = path.join(" ").toLocaleLowerCase("tr-TR");
  for (const tag of known) {
    if (titleContainsTagWords(pathBlob, tag)) out.push(tag);
  }

  return sanitizeShopifyTags(out);
}

function detectProductType(blob: string): { tag: string; mid: string } | null {
  for (const rule of PRODUCT_TYPE_RULES) {
    if (rule.re.test(blob)) return { tag: rule.tag, mid: rule.mid };
  }
  return null;
}

function detectGenders(blob: string, features?: Array<{ name?: string; key?: string; value?: string }> | null): string[] {
  const found = new Set<string>();
  for (const rule of GENDER_RULES) {
    if (rule.re.test(blob)) found.add(rule.tag);
  }
  if (Array.isArray(features)) {
    for (const row of features) {
      const name = String(row.name || row.key || "");
      const value = String(row.value || "");
      if (!/cinsiyet|gender/i.test(name)) continue;
      for (const rule of GENDER_RULES) {
        if (rule.re.test(value)) found.add(rule.tag);
      }
    }
  }
  // unisex → genderless (her iki cinsiyet)
  if (/unisex/i.test(blob)) return [];
  return [...found];
}

function detectMidCategory(blob: string, path: string[], productMid?: string): string {
  if (productMid) return productMid;
  const pathBlob = path.join(" ");
  for (const rule of MID_FROM_PATH) {
    if (rule.re.test(pathBlob) || rule.re.test(blob)) return rule.mid;
  }
  return "aksesuar";
}

function detectMainCategory(blob: string, path: string[], known: string[]): string {
  for (const seg of path) {
    for (const rule of MAIN_CATEGORY_RULES) {
      if (rule.re.test(seg)) return resolveKnownTagSpelling(rule.tag, known);
    }
  }
  for (const rule of MAIN_CATEGORY_RULES) {
    if (rule.re.test(blob)) return resolveKnownTagSpelling(rule.tag, known);
  }
  return resolveKnownTagSpelling("Moda", known);
}

function pushResolved(out: string[], tag: string, known: string[]) {
  const t = String(tag || "").trim();
  if (!t) return;
  out.push(resolveKnownTagSpelling(t, known));
}

/**
 * Zorunlu yapısal etiketler:
 * - Cinsiyet belli: kadın, aksesuar, yüzük (+ kadın aksesuar, kadın yüzük)
 * - Cinsiyet yok: erkek, kadın, erkek aksesuar, kadın aksesuar, erkek yüzük, kadın yüzük
 */
export function buildStructuralCategoryTags(input: {
  blob: string;
  path: string[];
  known: string[];
  features?: Array<{ name?: string; key?: string; value?: string }> | null;
}): string[] {
  const product = detectProductType(input.blob);
  const mid = detectMidCategory(input.blob, input.path, product?.mid);
  const type = product?.tag || mid;
  const genders = detectGenders(input.blob, input.features);
  const main = detectMainCategory(input.blob, input.path, input.known);
  const out: string[] = [];

  // Her ürüne 1 ana + 1 alt kategori
  pushResolved(out, main, input.known);
  pushResolved(out, mid, input.known);
  if (type !== mid) pushResolved(out, type, input.known);

  if (genders.length > 0) {
    for (const g of genders) {
      pushResolved(out, g, input.known);
      pushResolved(out, `${g} ${mid}`, input.known);
      if (type !== mid) pushResolved(out, `${g} ${type}`, input.known);
    }
  } else {
    // Cinsiyet ayrımı yok → her iki cinsiyet için sabit set
    for (const g of ["erkek", "kadın"] as const) {
      pushResolved(out, g, input.known);
      pushResolved(out, `${g} ${mid}`, input.known);
      if (type !== mid) pushResolved(out, `${g} ${type}`, input.known);
    }
  }

  return out;
}

/**
 * Ürün başlığı + kategori yolundan MARKT-GO koleksiyon koşullarına uygun etiketler.
 * Önce zorunlu ana/alt kategori + cinsiyet yapısı, sonra yakın etiketler.
 */
export function generateAutoProductTags(input: {
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  categoryPath?: string[] | null;
  features?: Array<{ name?: string; key?: string; value?: string }> | null;
  knownCollectionTags?: string[];
  existingTags?: string[];
}): string[] {
  const title = String(input.title || "").trim();
  const known = (input.knownCollectionTags || [])
    .map((t) => String(t || "").trim())
    .filter((t) => t && !/trendyol/i.test(t));

  const pathTags = tagsFromCategoryPath(input.categoryPath || undefined, {
    title,
    brand: input.brand,
    knownCollectionTags: known,
  });
  const featureTags = tagsFromProductFeatures(input.features || undefined, known);

  if (!title && !pathTags.length && !featureTags.length) {
    return sanitizeShopifyTags(input.existingTags || []);
  }

  const path = cleanTrendyolCategoryPath(input.categoryPath || [], {
    title: title || undefined,
    brand: input.brand || undefined,
  });
  const blob = titleBlob(
    title,
    input.brand || undefined,
    input.category || undefined,
    path,
  );

  const structural = buildStructuralCategoryTags({
    blob,
    path,
    known,
    features: input.features,
  });

  const related: string[] = [
    ...pathTags,
    ...featureTags,
    ...tagsFromTitleHeuristics(blob, known),
  ];

  for (const tag of known) {
    if (titleContainsTagWords(blob, tag)) related.push(tag);
  }

  const brand = String(input.brand || "").trim();
  if (brand && brand.length >= 2 && brand.length <= 40 && !/trendyol/i.test(brand)) {
    related.push(brand);
  }

  if (path.length) {
    const leaf = path[path.length - 1];
    if (leaf && !/trendyol/i.test(leaf)) {
      related.push(resolveKnownTagSpelling(leaf, known));
    }
  }

  // Yapısal etiketler önce, yakın etiketler sonra
  return sanitizeShopifyTags([
    ...structural,
    ...(input.existingTags || []),
    ...related,
  ]).slice(0, 28);
}

export function mergeAutoTags(
  existing: string[] | undefined,
  auto: string[],
): string[] {
  return sanitizeShopifyTags([...(existing || []), ...auto]);
}
