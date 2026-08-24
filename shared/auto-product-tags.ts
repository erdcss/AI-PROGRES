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
];

const GENDER_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "kadın", re: /kad[iı]n|bayan|woman|women|kız\b|kiz\b/i },
  { tag: "erkek", re: /erkek|\bmen\b|\bman\b|oğlan|oglan/i },
  { tag: "unisex", re: /unisex/i },
  { tag: "çocuk", re: /çocuk|cocuk|bebek|kids|baby/i },
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
  knownCollectionTags?: string[];
  existingTags?: string[];
}): string[] {
  const title = String(input.title || "").trim();
  const pathTags = tagsFromCategoryPath(input.categoryPath || undefined, {
    title,
    brand: input.brand,
    knownCollectionTags: input.knownCollectionTags,
  });

  if (!title && !pathTags.length) {
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
  const out: string[] = [...pathTags];
  const known = (input.knownCollectionTags || [])
    .map((t) => String(t || "").trim())
    .filter((t) => t && !/trendyol/i.test(t));

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

  return sanitizeShopifyTags([...(input.existingTags || []), ...out]).slice(0, 18);
}

export function mergeAutoTags(
  existing: string[] | undefined,
  auto: string[],
): string[] {
  return sanitizeShopifyTags([...(existing || []), ...auto]);
}
