/** Trendyol fiyat normalizasyonu — aktif ödenecek fiyat + kuruş/TL desteği */

export const TRENDYOL_PROFIT_MARGIN = 0.10;

export type TrendyolPriceKind =
  | "active"
  | "selling"
  | "discounted"
  | "promotional"
  | "original"
  | "list"
  | "coupon"
  | "installment"
  | "other";

export type TrendyolPriceSource =
  | "product_state"
  | "next_data"
  | "merchant_listing"
  | "variant"
  | "dom"
  | "json_ld"
  | "script";

export type TrendyolPriceCandidate = {
  value: number;
  kind: TrendyolPriceKind;
  source: TrendyolPriceSource;
  merchantId?: string;
  variantId?: string;
  text?: string;
  selector?: string;
  confidence: number;
  isMainProduct: boolean;
  isSelectedMerchant: boolean;
  isSelectedVariant: boolean;
};

export type TrendyolResolvedPrice = {
  active: number;
  original: number;
  selling: number;
  discounted: number;
  promotional: number;
  listPrice: number;
  currency: "TRY";
  selectedKind: TrendyolPriceKind | "none";
  selectedSource: TrendyolPriceSource | "none";
  confidence: number;
  reason: string;
  candidates: TrendyolPriceCandidate[];
  merchantId?: string;
};

function readNestedPriceValue(field: unknown): number {
  if (field == null) return 0;
  if (typeof field === "object" && field !== null && "value" in field) {
    return normalizeTrendyolKurus(Number((field as { value: unknown }).value), "api");
  }
  return normalizeTrendyolPriceValue(field);
}

function asId(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const s = String(value).replace(/\D/g, "");
  return s || undefined;
}

export function extractMerchantIdFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return asId(u.searchParams.get("merchantId"));
  } catch {
    const m = String(url).match(/merchantId=(\d+)/i);
    return m?.[1];
  }
}

/** Kupon tutarı / taksit / “X TL indirim” — ürün fiyatı değil */
export function isTrendyolNonProductPriceText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\d+[.,]?\d*\s*tl\s*(kupon|indirim|kazan)/i.test(lower) ||
    /\b(kupon|taksit|ayda|son\s*30\s*g[uü]n|en\s*d[uü]ş[uü]k)\b/i.test(lower) ||
    lower.includes("önerilen") ||
    lower.includes("benzer ürün") ||
    lower.includes("ilgili ürün")
  );
}

/** Plus / sepette / indirimli metin — liste fiyatı değil; aktif aday olabilir */
export function isTrendyolPromotionalPriceText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("sepette") ||
    lower.includes("trendyol plus") ||
    lower.includes("plus'a özel") ||
    lower.includes("plusa özel") ||
    lower.includes("kampanya fiyat") ||
    lower.includes("indirimli fiyat")
  );
}

function pushCandidate(
  list: TrendyolPriceCandidate[],
  partial: Omit<TrendyolPriceCandidate, "confidence"> & { confidence?: number },
) {
  if (!Number.isFinite(partial.value) || partial.value <= 0) return;
  if (partial.value < 29 || partial.value > 500_000) return;
  list.push({
    ...partial,
    confidence: partial.confidence ?? 50,
  });
}

function logCandidate(c: TrendyolPriceCandidate) {
  console.log(
    `[PRICE_CANDIDATE] value=${c.value} kind=${c.kind} source=${c.source}` +
      `${c.merchantId ? ` merchantId=${c.merchantId}` : ""}` +
      ` selectedMerchant=${c.isSelectedMerchant}` +
      ` selectedVariant=${c.isSelectedVariant}` +
      ` mainProduct=${c.isMainProduct}` +
      ` confidence=${c.confidence}`,
  );
}

function scoreCandidate(c: TrendyolPriceCandidate): number {
  let score = c.confidence;
  if (c.isMainProduct) score += 20;
  if (c.isSelectedMerchant) score += 25;
  if (c.isSelectedVariant) score += 15;

  switch (c.kind) {
    case "active":
      score += 40;
      break;
    case "selling":
      score += 35;
      break;
    case "discounted":
      score += 30;
      break;
    case "promotional":
      score += 28;
      break;
    case "original":
    case "list":
      score += 5;
      break;
    case "coupon":
    case "installment":
      score -= 100;
      break;
    default:
      score += 10;
  }

  if (c.source === "product_state" || c.source === "merchant_listing") score += 10;
  if (c.source === "json_ld") score += 8;
  if (c.source === "dom") score += 6;
  return score;
}

/**
 * Adaylar arasından aktif ödenecek fiyatı seçer.
 * original/list yalnızca aktif satış adayı yoksa kazanır.
 */
export function selectTrendyolPayablePrice(
  candidates: TrendyolPriceCandidate[],
): TrendyolResolvedPrice {
  const unique = new Map<string, TrendyolPriceCandidate>();
  for (const c of candidates) {
    const key = `${c.kind}|${c.source}|${c.value}|${c.merchantId || ""}|${c.selector || ""}`;
    const prev = unique.get(key);
    if (!prev || scoreCandidate(c) > scoreCandidate(prev)) unique.set(key, c);
  }
  const list = [...unique.values()];
  for (const c of list) logCandidate(c);

  const byKind = (kinds: TrendyolPriceKind[]) =>
    list.filter((c) => kinds.includes(c.kind) && c.kind !== "coupon" && c.kind !== "installment");

  const activePool = byKind(["active", "selling", "discounted", "promotional"]);
  const listPool = byKind(["original", "list"]);
  const otherPool = byKind(["other"]);

  const pickBest = (pool: TrendyolPriceCandidate[]) => {
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
  };

  // Discounted/promotional, selling’den yalnızca seçili satıcıda ve selling yoksa / selling=original ise öne çıkabilir.
  // Körlemesine en düşük fiyat seçilmez.
  let selected = pickBest(activePool);
  if (selected) {
    const selling = pickBest(byKind(["selling"]));
    const discounted = pickBest(byKind(["discounted", "promotional"]));
    const listLike = pickBest(byKind(["original", "list"]));
    if (selling && discounted && selling.value > 0 && discounted.value > 0) {
      const listVal = listLike?.value ?? 0;
      const sellingNearList =
        listVal > 0 && Math.abs(selling.value - listVal) / listVal < 0.03;
      const deepDiscount = discounted.value < selling.value * 0.85;
      if (sellingNearList && deepDiscount) {
        // Üyelik/Plus tuzağı: selling ≈ list, discounted çok düşük → selling
        selected = selling;
      } else if (
        discounted.isSelectedMerchant &&
        discounted.value < selling.value &&
        listVal > 0 &&
        selling.value >= listVal * 0.98
      ) {
        // selling hâlâ liste; discounted seçili satıcının indirimli satış fiyatı
        selected = discounted;
      }
    }
  }

  if (!selected) selected = pickBest(otherPool);
  if (!selected) selected = pickBest(listPool);

  const originals = listPool.map((c) => c.value).filter((v) => v > 0);
  const sellings = byKind(["selling"]).map((c) => c.value);
  const discounteds = byKind(["discounted", "promotional", "active"]).map((c) => c.value);

  const active = selected?.value ?? 0;
  const reason = selected
    ? selected.kind === "original" || selected.kind === "list"
      ? "fallback list/original — no active payable candidate"
      : "selected merchant/variant active payable price"
    : "no_valid_price";

  if (selected) {
    console.log(
      `[PRICE_SELECTED] value=${selected.value} kind=${selected.kind} source=${selected.source} reason=${reason}`,
    );
  }

  return {
    active,
    original: originals.length ? Math.max(...originals) : active,
    selling: sellings.length ? Math.max(...sellings) : 0,
    discounted: discounteds.length ? Math.min(...discounteds) : 0,
    promotional: discounteds.length ? Math.min(...discounteds) : 0,
    listPrice: originals.length ? Math.max(...originals) : 0,
    currency: "TRY",
    selectedKind: selected?.kind ?? "none",
    selectedSource: selected?.source ?? "none",
    confidence: selected ? scoreCandidate(selected) : 0,
    reason,
    candidates: list,
    merchantId: selected?.merchantId,
  };
}

export function collectTrendyolPriceCandidatesFromProduct(
  product: unknown,
  opts?: { url?: string; selectedMerchantId?: string; selectedVariantId?: string },
): TrendyolPriceCandidate[] {
  const out: TrendyolPriceCandidate[] = [];
  if (!product || typeof product !== "object") return out;

  const root = product as Record<string, unknown>;
  const price = root.price as Record<string, unknown> | undefined;
  const priceInfo = root.priceInfo as Record<string, unknown> | undefined;
  const merchant = root.merchant as Record<string, unknown> | undefined;
  const urlMerchant = extractMerchantIdFromUrl(opts?.url);
  const selectedMerchant =
    opts?.selectedMerchantId ||
    urlMerchant ||
    asId(merchant?.id) ||
    asId(merchant?.merchantId) ||
    asId(root.merchantId);

  const merchantId = asId(merchant?.id) || asId(merchant?.merchantId) || selectedMerchant;
  const isSelectedMerchant =
    !selectedMerchant || !merchantId || String(merchantId) === String(selectedMerchant);

  const add = (
    raw: unknown,
    kind: TrendyolPriceKind,
    source: TrendyolPriceSource,
    confidence: number,
  ) => {
    const value = readNestedPriceValue(raw);
    pushCandidate(out, {
      value,
      kind,
      source,
      merchantId,
      variantId: opts?.selectedVariantId,
      confidence,
      isMainProduct: true,
      isSelectedMerchant,
      isSelectedVariant: true,
    });
  };

  // Aktif satış alanları önce toplanır (seçim aşamasında skorlanır)
  add(price?.sellingPrice, "selling", "product_state", 90);
  add(root.sellingPrice, "selling", "product_state", 88);
  add(priceInfo?.sellingPrice, "selling", "product_state", 86);
  add(merchant?.sellingPrice, "selling", "merchant_listing", 92);
  add(merchant?.price, "selling", "merchant_listing", 85);

  add(price?.discountedPrice, "discounted", "product_state", 80);
  add(root.discountedPrice, "discounted", "product_state", 78);
  add(priceInfo?.discountedPrice, "discounted", "product_state", 76);
  add(merchant?.discountedPrice, "discounted", "merchant_listing", 82);

  add(price?.originalPrice, "original", "product_state", 40);
  add(root.originalPrice, "original", "product_state", 38);
  add(priceInfo?.originalPrice, "original", "product_state", 36);
  add(merchant?.originalPrice, "original", "merchant_listing", 42);
  add(root.listPrice, "list", "product_state", 35);
  add(price?.listPrice, "list", "product_state", 35);

  // merchantListing / otherMerchants — yalnızca seçili merchant
  const listings = Array.isArray(root.merchantListing)
    ? root.merchantListing
    : Array.isArray((root.merchantListing as { merchants?: unknown[] } | undefined)?.merchants)
      ? ((root.merchantListing as { merchants: unknown[] }).merchants)
      : [];
  for (const row of listings) {
    if (!row || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    const mid = asId(m.id) || asId(m.merchantId);
    const selected = !selectedMerchant || !mid || mid === selectedMerchant;
    if (!selected) continue;
    const mp = (m.price || m) as Record<string, unknown>;
    pushCandidate(out, {
      value: readNestedPriceValue(mp.sellingPrice ?? mp.price),
      kind: "selling",
      source: "merchant_listing",
      merchantId: mid,
      confidence: 93,
      isMainProduct: true,
      isSelectedMerchant: true,
      isSelectedVariant: true,
    });
    pushCandidate(out, {
      value: readNestedPriceValue(mp.discountedPrice),
      kind: "discounted",
      source: "merchant_listing",
      merchantId: mid,
      confidence: 84,
      isMainProduct: true,
      isSelectedMerchant: true,
      isSelectedVariant: true,
    });
    pushCandidate(out, {
      value: readNestedPriceValue(mp.originalPrice ?? mp.listPrice),
      kind: "original",
      source: "merchant_listing",
      merchantId: mid,
      confidence: 40,
      isMainProduct: true,
      isSelectedMerchant: true,
      isSelectedVariant: true,
    });
  }

  return out;
}

export function collectTrendyolPriceCandidatesFromHtml(
  html: string,
  opts?: { url?: string },
): TrendyolPriceCandidate[] {
  const out: TrendyolPriceCandidate[] = [];
  if (!html) return out;
  const selectedMerchant = extractMerchantIdFromUrl(opts?.url);

  // Tüm sayfadaki originalPrice/sellingPrice tarama YASAK — öneri kartları karışır.
  // Yalnızca ürün detail state adalarından oku.
  const islands: string[] = [];
  const statePatterns = [
    /__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*(?:<\/script>|$)/i,
    /window\["__PRODUCT_DETAIL_APP_INITIAL_STATE__"\]\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  ];
  for (const re of statePatterns) {
    const m = html.match(re);
    if (m?.[1] && m[1].length > 200) islands.push(m[1]);
  }
  if (islands.length === 0) return out;

  const patterns: Array<{ re: RegExp; kind: TrendyolPriceKind; confidence: number }> = [
    { re: /"sellingPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/g, kind: "selling", confidence: 88 },
    { re: /"discountedPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/g, kind: "discounted", confidence: 78 },
    { re: /"originalPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/g, kind: "original", confidence: 40 },
    { re: /"listPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/g, kind: "list", confidence: 38 },
  ];

  for (const island of islands) {
    for (const { re, kind, confidence } of patterns) {
      re.lastIndex = 0;
      for (const match of island.matchAll(re)) {
        const value = normalizeTrendyolKurus(parseInt(match[1], 10), "api");
        pushCandidate(out, {
          value,
          kind,
          source: "script",
          merchantId: selectedMerchant,
          confidence,
          isMainProduct: true,
          isSelectedMerchant: true,
          isSelectedVariant: true,
        });
      }
    }
  }

  return out;
}

/**
 * Ürün state/API’den aktif ödenecek fiyat (liste fiyatı değil).
 * Geriye dönük isim: eskiden original/list öncelikliydi.
 */
export function extractOriginalTrendyolPriceFromProduct(product: unknown): number {
  if (!product || typeof product !== "object") {
    return normalizeTrendyolPriceValue(product);
  }
  const resolved = selectTrendyolPayablePrice(collectTrendyolPriceCandidatesFromProduct(product));
  return resolved.active;
}

/** HTML script içindeki tüm originalPrice değerleri (benzersiz) — compare-at / fallback */
export function collectOriginalPricesFromHtmlScript(html: string): number[] {
  return collectTrendyolPriceCandidatesFromHtml(html)
    .filter((c) => c.kind === "original" || c.kind === "list")
    .map((c) => c.value)
    .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);
}

export function extractOriginalPriceFromHtmlScript(html: string): number {
  const values = collectOriginalPricesFromHtmlScript(html);
  return values.length === 1 ? values[0] : 0;
}

/**
 * Aktif ödenecek fiyat çözümleyici.
 * Öncelik: active/selling/discounted → DOM/JSON-LD → original/list fallback.
 */
export function resolveTrendyolActivePayablePrice(input: {
  html?: string;
  product?: unknown;
  jsonLdPrice?: number;
  domPrice?: number;
  domActivePrice?: number;
  domListPrice?: number;
  url?: string;
  selectedMerchantId?: string;
  selectedVariantId?: string;
}): TrendyolResolvedPrice {
  const candidates: TrendyolPriceCandidate[] = [];
  const selectedMerchant =
    input.selectedMerchantId || extractMerchantIdFromUrl(input.url);

  if (input.product) {
    candidates.push(
      ...collectTrendyolPriceCandidatesFromProduct(input.product, {
        url: input.url,
        selectedMerchantId: selectedMerchant,
        selectedVariantId: input.selectedVariantId,
      }),
    );
  }

  // Not: input.html üzerinden sayfa geneli sellingPrice/discountedPrice taraması YAPILMAZ.
  // Öneri/carousel ürünleri ana fiyatı kirletiyordu. Kaynaklar: product state + DOM + JSON-LD.

  const addScalar = (
    value: number | undefined,
    kind: TrendyolPriceKind,
    source: TrendyolPriceSource,
    confidence: number,
  ) => {
    if (!value || value <= 0) return;
    pushCandidate(candidates, {
      value,
      kind,
      source,
      merchantId: selectedMerchant,
      confidence,
      isMainProduct: true,
      isSelectedMerchant: true,
      isSelectedVariant: true,
    });
  };

  addScalar(input.domActivePrice, "active", "dom", 88);
  addScalar(input.domPrice, "active", "dom", 70);
  addScalar(input.domListPrice, "list", "dom", 45);
  addScalar(input.jsonLdPrice, "active", "json_ld", 90);

  // 100× kuruş/TL toparlama + JSON-LD/DOM ölçeğine göre script gürültüsünü düşür
  const anchors = candidates
    .filter((c) => c.source === "json_ld" || c.source === "dom" || c.kind === "active")
    .map((c) => c.value)
    .filter((v) => v >= 1000);
  const anchor = anchors.length ? Math.max(...anchors) : 0;

  const values = candidates.map((c) => c.value).filter((v) => v > 0);
  for (const a of values) {
    for (const b of values) {
      if (a >= b) continue;
      if (Math.abs(b / a - 100) < 1.05 && b <= 500_000) {
        for (const c of candidates) {
          if (Math.abs(c.value - a) < 0.001) c.confidence = Math.min(c.confidence, 15);
        }
      }
    }
  }

  if (anchor >= 1000) {
    for (const c of candidates) {
      // Ana ürün 17xxx iken öneri 179.99 gibi küçük script fiyatlarını düşür
      if (c.source === "script" && c.value > 0 && c.value < anchor / 20) {
        c.confidence = Math.min(c.confidence, 10);
        c.isMainProduct = false;
      }
    }
  }

  return selectTrendyolPayablePrice(candidates);
}

/**
 * @deprecated İsim geriye dönük; artık aktif ödenecek fiyatı döner.
 */
export function resolveTrendyolOriginalListPrice(input: {
  html?: string;
  product?: unknown;
  jsonLdPrice?: number;
  domPrice?: number;
  url?: string;
}): number {
  return resolveTrendyolActivePayablePrice(input).active;
}

export function parseTurkishPriceText(text: string): number {
  if (!text) return 0;

  // Saf kupon / indirim tutarı satırları ürün fiyatı değildir
  if (/^\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s*tl\s*(kupon|indirim|kazan)/i.test(text.trim())) {
    return 0;
  }
  if (isTrendyolNonProductPriceText(text) && !/\d{1,3}(?:\.\d{3})+(?:,\d{2})?\s*tl/i.test(text)) {
    return 0;
  }

  let clean = text
    .replace(/[₺]/g, "")
    .replace(/\bTL\b/gi, "")
    .replace(/sepette\s*/gi, "")
    .replace(/trendyol\s*plus\s*/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (!clean) return 0;

  const trThousands = clean.match(/^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/);
  if (trThousands) {
    const intPart = trThousands[1].replace(/\./g, "");
    const dec = trThousands[2].padEnd(2, "0").slice(0, 2);
    return parseFloat(`${intPart}.${dec}`);
  }

  const trThousandsInt = clean.match(/^(\d{1,3}(?:\.\d{3})+)$/);
  if (trThousandsInt) {
    return Number(trThousandsInt[1].replace(/\./g, ""));
  }

  const decimalComma = clean.match(/^(\d+),(\d{1,2})$/);
  if (decimalComma) {
    return parseFloat(`${decimalComma[1]}.${decimalComma[2]}`);
  }

  const decimalDot = clean.match(/^(\d+)\.(\d{1,2})$/);
  if (decimalDot) {
    return parseFloat(`${decimalDot[1]}.${decimalDot[2]}`);
  }

  const embeddedTr = clean.match(/(\d{1,3}(?:\.\d{3})+),(\d{2})/);
  if (embeddedTr) {
    const intPart = embeddedTr[1].replace(/\./g, "");
    return parseFloat(`${intPart}.${embeddedTr[2]}`);
  }

  const embeddedThousands = clean.match(/(\d{1,3}(?:\.\d{3})+)/);
  if (embeddedThousands) {
    return Number(embeddedThousands[1].replace(/\./g, ""));
  }

  const digits = clean.match(/^(\d+)$/);
  if (digits) {
    return Number(digits[1]);
  }

  const anyDigits = clean.match(/(\d+)/);
  if (anyDigits) {
    return Number(anyDigits[1]);
  }

  return 0;
}

export function normalizeTrendyolKurus(
  value: number,
  source: "api" | "dom" = "api",
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (source === "dom") {
    return Math.round(value * 100) / 100;
  }

  // Trendyol API kuruş: 61000 → 610 TL, 27992 → 279.92 TL, 1775500 → 17755 TL
  if (value >= 10000) {
    return Math.round((value / 100) * 100) / 100;
  }

  if (value >= 1000 && Number.isInteger(value) && value % 100 === 0) {
    const asTl = value / 100;
    if (asTl >= 1 && asTl <= 200_000) {
      return Math.round(asTl * 100) / 100;
    }
  }

  return Math.round(value * 100) / 100;
}

function normalizeBareNumericPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  if (!Number.isInteger(value)) {
    return Math.round(value * 100) / 100;
  }

  if (value >= 1_000_000) {
    return normalizeTrendyolKurus(value, "api");
  }

  return Math.round(value * 100) / 100;
}

export function normalizeTrendyolPriceValue(raw: unknown): number {
  if (typeof raw === "number") {
    return normalizeBareNumericPrice(raw);
  }

  if (typeof raw === "string") {
    const fromText = parseTurkishPriceText(raw);
    if (fromText > 0) return fromText;
    const n = Number(raw.replace(/[^\d.,]/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? normalizeBareNumericPrice(n) : 0;
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    // Aktif satış alanlarını önce dene
    for (const key of [
      "sellingPrice",
      "discountedPrice",
      "currentPrice",
      "sale",
      "current",
      "active",
      "withProfit",
      "original",
      "originalPrice",
      "value",
      "amount",
      "formatted",
      "profitFormatted",
    ]) {
      if (record[key] != null) {
        const parsed = normalizeTrendyolPriceValue(record[key]);
        if (parsed > 0) return parsed;
      }
    }
  }

  return 0;
}

export function resolvePositiveTrendyolPrice(raw: unknown): number {
  const price = normalizeTrendyolPriceValue(raw);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export function pickPlausibleTrendyolPrice(a: number, b: number): number {
  if (a <= 0) return b;
  if (b <= 0) return a;

  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  if (lo > 0 && Math.abs(hi / lo - 100) < 1.05) {
    if (hi >= 29 && hi <= 500_000) return hi;
  }

  if (a > b * 20) return b;
  if (b > a * 20) return a;
  return Math.max(a, b);
}

export function formatTryPrice(amount: number): string {
  return `${amount.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

export function buildTrendyolPriceObject(
  originalRaw: unknown,
  profitMargin = TRENDYOL_PROFIT_MARGIN,
  meta?: Partial<TrendyolResolvedPrice>,
) {
  const original = normalizeTrendyolPriceValue(originalRaw);
  const withProfit = Math.round(original * (1 + profitMargin) * 100) / 100;
  return {
    original,
    withProfit,
    currency: "TRY" as const,
    formatted: formatTryPrice(original),
    profitFormatted: formatTryPrice(withProfit),
    active: meta?.active ?? original,
    listPrice: meta?.listPrice,
    selling: meta?.selling,
    discounted: meta?.discounted,
    promotional: meta?.promotional,
    selectedKind: meta?.selectedKind,
    selectedSource: meta?.selectedSource,
    confidence: meta?.confidence,
    priceSource: meta?.selectedSource,
  };
}
