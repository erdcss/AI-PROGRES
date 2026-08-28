import { sanitizeShopifyTags } from "./shopify-tag-sanitizer";
import { cleanTrendyolCategoryPath } from "./trendyol-category-path";

/** MARKT-GO koleksiyon koşulu ile aynı etiket anahtarı (boşluk → tire). */
export function normalizeTagKey(tag: string): string {
  return String(tag || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "-");
}

const PRODUCT_TYPE_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "tişört", re: /tiş[oö]rt|tisort|t[\s-]?shirt/i },
  { tag: "sweatshirt", re: /sweatshirt|hoodie|kap[uü]şon/i },
  { tag: "elbise", re: /elbise|dress/i },
  { tag: "pantolon", re: /pantolon|jean|eşofman|jogger/i },
  { tag: "gömlek", re: /g[oö]mlek|shirt(?!\s*t)/i },
  { tag: "etek", re: /\betek\b|skirt/i },
  { tag: "mont", re: /\bmont\b|kaban|parka|yağmurluk/i },
  { tag: "ceket", re: /ceket|blazer|jacket/i },
  { tag: "ayakkabı", re: /ayakkab[iı]|sneaker|bot\b|çizme|loafer|sandalet|terlik/i },
  { tag: "çanta", re: /çanta|canta|backpack|sırt\s*çanta/i },
  { tag: "aksesuar", re: /aksesuar|kolye|k[uü]pe|bileklik|kemer|şapka|sapka|c[uü]zdan/i },
  { tag: "kozmetik", re: /krem|ruj|serum|parf[uü]m|makyaj|şampuan|sampuan|maskara/i },
  { tag: "elektronik", re: /kulakl[iı]k|telefon|laptop|tablet|bluetooth|şarj|sarj|kamera/i },
  { tag: "oyuncak", re: /oyuncak|lego|puzzle|peluş|pelus/i },
  { tag: "spor", re: /spor|fitness|yoga|koşu|kosu|antrenman/i },
  { tag: "banyo", re: /banyo|lavabo|duş|dus|gider|musluk/i },
  { tag: "bahçe", re: /bah[cç]e|yap[iı]\s*market|h[iı]rdavat/i },
  { tag: "duş seti", re: /duş\s*seti|dus\s*seti|shower\s*set/i },
  { tag: "musluk", re: /musluk|batarya|lavabo\s*batary/i },
  { tag: "havlu", re: /havlu|bornoz|peştemal|pestemal/i },
];

const GENDER_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "kadın", re: /kad[iı]n|bayan|woman|women|kız\b|kiz\b/i },
  { tag: "erkek", re: /erkek|\bmen\b|\bman\b|oğlan|oglan/i },
  { tag: "unisex", re: /unisex/i },
  { tag: "çocuk", re: /çocuk|cocuk|bebek|kids|baby/i },
];

const MATERIAL_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "pamuk", re: /pamuk|cotton/i },
  { tag: "polyester", re: /polyester|poliester/i },
  { tag: "deri", re: /\bderi\b|leather/i },
  { tag: "süet", re: /s[uü]et|suede/i },
  { tag: "keten", re: /keten|linen/i },
  { tag: "yün", re: /y[uü]n|wool/i },
  { tag: "metal", re: /metal|paslanmaz|krom|chrom/i },
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

/** Özellik adı → etiket eşlemesi (Trendyol attribute panelinden) */
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

const CATEGORY_RULES: Array<{ tag: string; re: RegExp }> = [
  {
    tag: "Kozmetik",
    re: /kozmetik|krem|ruj|makyaj|serum|parf[uü]m|şampuan|sampuan|g[uü]zellik|beauty/i,
  },
  {
    tag: "Elektronik",
    re: /elektronik|kulakl[iı]k|telefon|laptop|tablet|\btv\b|bluetooth|şarj|sarj/i,
  },
  { tag: "Oyuncak", re: /oyuncak|lego|puzzle|peluş|pelus/i },
  { tag: "Spor", re: /spor|fitness|yoga|koşu|kosu|antrenman/i },
  {
    tag: "Ev & Yaşam",
    re: /ev\s*&\s*yaşam|mobilya|mutfak|yatak|dekor|havlu|aydınlatma/i,
  },
  {
    tag: "Bahçe & Yapı Market",
    re: /bah[cç]e|yap[iı]\s*market|h[iı]rdavat|banyo\s*yap[iı]|yap[iı]\s*malzem/i,
  },
  {
    tag: "Moda",
    re: /tiş[oö]rt|tisort|elbise|pantolon|g[oö]mlek|ayakkab[iı]|çanta|canta|mont|ceket|giyim|moda|sweatshirt/i,
  },
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

/** Ürün özelliklerinden (Trendyol attribute panel) etiket önerileri */
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

/** Kategori yolu segmentini bilinen koleksiyon etiket yazımına çevirir. */
export function resolveKnownTagSpelling(
  segment: string,
  knownCollectionTags: string[],
): string {
  const key = normalizeTagKey(segment);
  if (!key) return segment;
  const exact = knownCollectionTags.find((k) => normalizeTagKey(k) === key);
  if (exact) return exact;

  // Bilinen etiket, segment içinde geçiyor veya tersi (kısa eşleşme)
  const segLower = segment.toLocaleLowerCase("tr-TR");
  let best: string | null = null;
  let bestScore = 0;
  for (const known of knownCollectionTags) {
    const k = String(known || "").trim();
    if (!k || /trendyol/i.test(k)) continue;
    const kn = k.toLocaleLowerCase("tr-TR");
    if (segLower === kn) return k;
    if (segLower.includes(kn) || kn.includes(segLower)) {
      const score = Math.min(segLower.length, kn.length);
      if (score > bestScore && score >= 4) {
        best = k;
        bestScore = score;
      }
    }
  }
  return best || segment;
}

/**
 * Breadcrumb kategori yolundan etiket listesi üretir (Trendyol hariç).
 * Kategoriler sayfasındaki bilinen etiket yazımlarına öncelik verir.
 */
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

  // Yol blob'u bilinen koleksiyon etiketlerini de yakalasın
  const pathBlob = path.join(" ").toLocaleLowerCase("tr-TR");
  for (const tag of known) {
    if (titleContainsTagWords(pathBlob, tag)) out.push(tag);
  }

  return sanitizeShopifyTags(out);
}

/**
 * Ürün başlığı + kategori yolundan MARKT-GO koleksiyon koşullarına uygun etiketler.
 * Bilinen koleksiyon etiketleri varsa onlara öncelik verir.
 */
export function generateAutoProductTags(input: {
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  /** Trendyol breadcrumb segmentleri (Trendyol kelimesi olmadan) */
  categoryPath?: string[] | null;
  /** Ürün özellikleri (Trendyol attribute panel) */
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
  const out: string[] = [...pathTags, ...featureTags, ...tagsFromTitleHeuristics(blob, known)];

  for (const tag of known) {
    if (titleContainsTagWords(blob, tag)) out.push(tag);
  }

  const genders = GENDER_RULES.filter((r) => r.re.test(blob)).map((r) => r.tag);
  const types = PRODUCT_TYPE_RULES.filter((r) => r.re.test(blob)).map((r) => r.tag);

  for (const g of genders) out.push(g);
  for (const t of types) out.push(t);

  for (const g of genders) {
    for (const t of types) {
      const composite = `${g} ${t}`;
      const hit = known.find((k) => normalizeTagKey(k) === normalizeTagKey(composite));
      out.push(hit || composite);
    }
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(blob)) {
      out.push(resolveKnownTagSpelling(rule.tag, known));
      break;
    }
  }

  const brand = String(input.brand || "").trim();
  if (brand && brand.length >= 2 && brand.length <= 40 && !/trendyol/i.test(brand)) {
    out.push(brand);
  }

  // leaf kategori (yolun son anlamlı parçası) — marka+kategori birleşikse marka ayrıştır
  if (path.length) {
    const leaf = path[path.length - 1];
    if (leaf && !/trendyol/i.test(leaf)) {
      out.push(resolveKnownTagSpelling(leaf, known));
      if (brand && leaf.toLocaleLowerCase("tr-TR").startsWith(brand.toLocaleLowerCase("tr-TR"))) {
        const withoutBrand = leaf.slice(brand.length).trim();
        if (withoutBrand.length >= 3) {
          out.push(resolveKnownTagSpelling(withoutBrand, known));
        }
      }
    }
  }

  return sanitizeShopifyTags([...(input.existingTags || []), ...out]).slice(0, 24);
}

export function mergeAutoTags(
  existing: string[] | undefined,
  auto: string[],
): string[] {
  return sanitizeShopifyTags([...(existing || []), ...auto]);
}
