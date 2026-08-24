import { sanitizeShopifyTags } from "./shopify-tag-sanitizer";

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
    tag: "Moda",
    re: /tiş[oö]rt|tisort|elbise|pantolon|g[oö]mlek|ayakkab[iı]|çanta|canta|mont|ceket|giyim|moda|sweatshirt/i,
  },
];

function titleBlob(title: string, brand?: string, category?: string): string {
  return [title, brand, category]
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

/**
 * Ürün başlığından MARKT-GO koleksiyon koşullarına uygun etiketler üretir.
 * Bilinen koleksiyon etiketleri varsa onlara öncelik verir.
 */
export function generateAutoProductTags(input: {
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  knownCollectionTags?: string[];
  existingTags?: string[];
}): string[] {
  const title = String(input.title || "").trim();
  if (!title) return sanitizeShopifyTags(input.existingTags || []);

  const blob = titleBlob(title, input.brand || undefined, input.category || undefined);
  const out: string[] = [];
  const known = (input.knownCollectionTags || [])
    .map((t) => String(t || "").trim())
    .filter(Boolean);

  for (const tag of known) {
    if (titleContainsTagWords(blob, tag)) out.push(tag);
  }

  const genders = GENDER_RULES.filter((r) => r.re.test(blob)).map((r) => r.tag);
  const types = PRODUCT_TYPE_RULES.filter((r) => r.re.test(blob)).map((r) => r.tag);

  for (const g of genders) out.push(g);
  for (const t of types) out.push(t);

  // "kadın" + "elbise" → "kadın elbise" (koleksiyon koşulları sık böyle)
  for (const g of genders) {
    for (const t of types) {
      const composite = `${g} ${t}`;
      const hit = known.find((k) => normalizeTagKey(k) === normalizeTagKey(composite));
      out.push(hit || composite);
    }
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(blob)) {
      out.push(rule.tag);
      break;
    }
  }

  const brand = String(input.brand || "").trim();
  if (brand && brand.length >= 2 && brand.length <= 40 && !/trendyol/i.test(brand)) {
    out.push(brand);
  }

  return sanitizeShopifyTags([...(input.existingTags || []), ...out]).slice(0, 12);
}

export function mergeAutoTags(
  existing: string[] | undefined,
  auto: string[],
): string[] {
  return sanitizeShopifyTags([...(existing || []), ...auto]);
}
