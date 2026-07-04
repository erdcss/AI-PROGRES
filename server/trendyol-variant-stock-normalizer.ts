/**
 * Merkezi Trendyol varyant stok normalizasyon servisi
 */
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { getTrendyolProductFromState } from "./trendyol-product-state";
import {
  buildVariantMatrixFromSlicingData,
  buildVariantsFromSlicing,
  extractColorsWithStockFromDom,
  extractSizesWithStockFromDom,
  isDomElementOutOfStock,
  parseSlicingAttributesFromProduct,
  parseSkuComboVariantsFromProduct,
} from "./trendyol-slicing-parser";

export interface TrendyolVariantStockItem {
  color: string;
  size: string;
  key: string;
  inStock: boolean;
  disabledReason?: string;
  source: "dom" | "script-json" | "api" | "fallback";
}

export interface TrendyolVariantStockResult {
  colors: string[];
  sizes: string[];
  variants: TrendyolVariantStockItem[];
  stockMap: Record<string, boolean>;
  availableVariants: TrendyolVariantStockItem[];
  outOfStockVariants: TrendyolVariantStockItem[];
  productInStock: boolean;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export interface PuppeteerStockSnapshot {
  colors: Array<{ name: string; inStock: boolean }>;
  sizesByColor: Record<
    string,
    Array<{ name: string; inStock: boolean; disabledReason?: string }>
  >;
  productInStock: boolean;
  source: "dom";
}

export interface NormalizeStockInput {
  html?: string;
  $?: CheerioAPI;
  product?: Record<string, unknown> | null;
  puppeteerSnapshot?: PuppeteerStockSnapshot | null;
  url?: string;
  productTitle?: string;
}

export interface StockSummaryPayload {
  productInStock: boolean;
  totalVariants: number;
  inStockVariants: number;
  outOfStockVariants: number;
  confidence: "high" | "medium" | "low";
}

const DEFAULT_COLOR = "Tek Renk";

const SIZE_PATTERN =
  /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|STD|STANDART|TEK\s*EBAT|TEK\s*BEDEN|ONE\s*SIZE|OS|\d{2,3})$/i;

const REJECTED_SIZE_TEXT =
  /sepete ekle|şimdi al|son \d+ ürün|kupon|popüler|yorum|marka|açıklama|fiyat|tl$/i;

const SCRIPT_STOCK_KEYS = [
  "stock",
  "quantity",
  "available",
  "isAvailable",
  "sellable",
  "isSellable",
  "inStock",
  "selectable",
  "disabled",
  "stockState",
  "stockCount",
  "availableQuantity",
];

export function buildVariantStockKey(color: string, size: string): string {
  const c = (color || DEFAULT_COLOR).trim();
  const s = size.trim();
  return `${c}-${s}`;
}

export function isValidTrendyolSizeLabel(text: unknown): boolean {
  if (text == null) return false;
  const t = String(text).trim();
  if (!t || t.length > 12) return false;
  if (REJECTED_SIZE_TEXT.test(t)) return false;
  return SIZE_PATTERN.test(t);
}

function isRecordOutOfStock(rec: Record<string, unknown>): boolean {
  if (rec.inStock === false || rec.isSellable === false || rec.sellable === false) return true;
  if (rec.available === false || rec.isAvailable === false || rec.selectable === false) return true;
  if (rec.disabled === true) return true;

  const stock = rec.stock ?? rec.stockCount ?? rec.quantity ?? rec.availableQuantity;
  if (typeof stock === "number" && stock <= 0) return true;

  const stockState = String(rec.stockState ?? rec.availability ?? "").toLowerCase();
  if (
    stockState.includes("outofstock") ||
    stockState.includes("soldout") ||
    stockState.includes("tükendi") ||
    stockState.includes("tukendi")
  ) {
    return true;
  }
  return false;
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const name = n.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function parseScriptJsonVariants(html: string): TrendyolVariantStockItem[] {
  const items: TrendyolVariantStockItem[] = [];
  const seen = new Set<string>();

  const push = (
    color: string,
    size: string,
    inStock: boolean,
    disabledReason?: string,
  ) => {
    const c = color.trim() || DEFAULT_COLOR;
    const s = size.trim();
    if (!s && !c) return;
    const key = buildVariantStockKey(c, s);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      color: c,
      size: s,
      key,
      inStock,
      disabledReason,
      source: "script-json",
    });
  };

  const tryParseObject = (obj: unknown, depth = 0): void => {
    if (!obj || typeof obj !== "object" || depth > 8) return;
    const rec = obj as Record<string, unknown>;

    const attrs = rec.attributes as Record<string, unknown> | undefined;
    let color = "";
    let size = "";
    if (attrs && typeof attrs === "object") {
      color = String(
        attrs.RENK ?? attrs.Renk ?? attrs.renk ?? attrs.color ?? attrs.COLOR ?? "",
      ).trim();
      size = String(
        attrs.BEDEN ?? attrs.Beden ?? attrs.beden ?? attrs.size ?? attrs.SIZE ?? "",
      ).trim();
    }

    if (!color) {
      const attrName = String(rec.attributeName ?? "").toLowerCase();
      const val = String(
        rec.attributeValue ?? rec.attributeBeautifiedValue ?? rec.value ?? "",
      ).trim();
      if (attrName === "renk" || attrName === "color") color = val;
      if (
        attrName === "beden" ||
        attrName === "size" ||
        attrName.includes("yaş") ||
        attrName.includes("yas")
      ) {
        size = val;
      }
    }

    if (!color) color = String(rec.color ?? rec.renk ?? "").trim();
    if (!size) size = String(rec.size ?? "").trim();

    const hasStockField = SCRIPT_STOCK_KEYS.some((k) => rec[k] !== undefined);
    if ((color || size) && (hasStockField || color && size)) {
      const inStock = !isRecordOutOfStock(rec);
      if (size && isValidTrendyolSizeLabel(size)) {
        push(color, size, inStock);
      } else if (color && !size) {
        push(color, "", inStock);
      }
    }

    for (const key of [
      "allVariants",
      "variants",
      "productVariants",
      "sizeVariants",
      "colorVariants",
      "winningVariantCombinations",
      "variantCombinations",
      "skuList",
      "skus",
      "slicedAttributes",
      "attributes",
      "variantAttributes",
      "slicingAttributes",
    ]) {
      const child = rec[key];
      if (Array.isArray(child)) {
        for (const entry of child) {
          if (key === "slicedAttributes" && entry && typeof entry === "object") {
            const attrRec = entry as Record<string, unknown>;
            const nested = attrRec.attributes ?? attrRec.items ?? attrRec.values;
            if (Array.isArray(nested)) nested.forEach((n) => tryParseObject(n, depth + 1));
          } else {
            tryParseObject(entry, depth + 1);
          }
        }
      } else if (child && typeof child === "object") {
        tryParseObject(child, depth + 1);
      }
    }

    if (rec.product && typeof rec.product === "object") {
      tryParseObject(rec.product, depth + 1);
    }
    if (rec.merchantListing && typeof rec.merchantListing === "object") {
      tryParseObject(rec.merchantListing, depth + 1);
    }
  };

  const product = getTrendyolProductFromState(html);
  if (product) tryParseObject(product);

  const stateMarker = "__PRODUCT_DETAIL_APP_INITIAL_STATE__";
  const idx = html.indexOf(stateMarker);
  if (idx !== -1) {
    const slice = html.slice(idx, idx + 500_000);
    const jsonMatch = slice.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        tryParseObject(JSON.parse(jsonMatch[0]));
      } catch {
        /* balanced parse fallback below */
      }
    }
  }

  const attrPattern =
    /"attributeName"\s*:\s*"(?:Beden|Size|Renk|Color)"[\s\S]*?"attributeValue"\s*:\s*"([^"]+)"[\s\S]*?(?:"stockState"\s*:\s*"([^"]+)"|"inStock"\s*:\s*(true|false)|"stock"\s*:\s*(\d+))/gi;
  for (const match of html.matchAll(attrPattern)) {
    const value = match[1]?.trim();
    if (!value) continue;
    const stockState = match[2];
    const inStockFlag = match[3];
    const stockNum = match[4];
    let inStock = true;
    if (stockState && /out|sold|tükendi|tukendi/i.test(stockState)) inStock = false;
    if (inStockFlag === "false") inStock = false;
    if (stockNum === "0") inStock = false;
    if (isValidTrendyolSizeLabel(value)) {
      push("", value, inStock, inStock ? undefined : "script regex");
    }
  }

  return items;
}

function extractColorsFromDom($: CheerioAPI, html: string): string[] {
  const colors: string[] = [];

  for (const c of extractColorsWithStockFromDom($)) colors.push(c.name);

  const renkText = html.match(/Renk\s*:\s*([^\n\r,<;]+)/i);
  if (renkText?.[1]) colors.push(renkText[1].trim());

  $('[class*="color"], [data-testid*="color"], .pr-in-cn img[alt]').each((_, el) => {
    const $el = $(el);
    const alt = $el.attr("alt")?.trim();
    const title = $el.attr("title")?.trim();
    if (alt && alt.length < 40) colors.push(alt);
    if (title && title.length < 40) colors.push(title);
  });

  $('meta[name="puppeteer-colors"]').each((_, el) => {
    const content = $(el).attr("content");
    if (content) colors.push(...content.split(",").map((x) => x.trim()).filter(Boolean));
  });
  const current = $('meta[name="puppeteer-current-color"]').attr("content");
  if (current) colors.push(current.trim());

  return uniqueNames(colors.filter((c) => c && !isValidTrendyolSizeLabel(c)));
}

function extractSizesFromDom($: CheerioAPI, html: string): Array<{
  name: string;
  inStock: boolean;
  disabledReason?: string;
}> {
  const sizes: Array<{ name: string; inStock: boolean; disabledReason?: string }> = [];
  const seen = new Set<string>();

  const push = (name: string, inStock: boolean, disabledReason?: string) => {
    if (!isValidTrendyolSizeLabel(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    sizes.push({ name, inStock, disabledReason });
  };

  for (const s of extractSizesWithStockFromDom($)) {
    push(s.name, s.inStock, s.inStock ? undefined : "dom slicing");
  }

  const bedenText = html.match(/Beden\s*:\s*([^\n\r<]+)/i);
  if (bedenText?.[1]) {
    for (const part of bedenText[1].split(/[,;/|]/)) {
      push(part.trim(), true);
    }
  }

  const selectors = [
    ".pr-in-sz button",
    '[data-testid*="size"] button',
    ".slicing-attribute-section-value button",
    ".slicing-attribute-section-value a",
    '[class*="size-variant"] button',
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const text = ($el.text() || $el.attr("title") || $el.attr("aria-label") || "").trim();
      const oos = isDomElementOutOfStock($el);
      push(text, !oos, oos ? "disabled dom button" : undefined);
    });
  }

  const puppeteerSizes = $('meta[name="puppeteer-sizes"]').attr("content");
  if (puppeteerSizes) {
    for (const entry of puppeteerSizes.split(",")) {
      const [sizeVal, stock] = entry.split(":");
      if (sizeVal?.trim()) {
        push(sizeVal.trim(), stock !== "out", stock === "out" ? "puppeteer meta" : undefined);
      }
    }
  }

  return sizes;
}

function buildMatrix(
  colors: string[],
  sizes: string[],
  stockHints: Map<string, { inStock: boolean; reason?: string; source: TrendyolVariantStockItem["source"] }>,
  warnings: string[],
): TrendyolVariantStockItem[] {
  const finalColors = colors.length > 0 ? colors : [DEFAULT_COLOR];
  const finalSizes = sizes.length > 0 ? sizes : [""];
  const variants: TrendyolVariantStockItem[] = [];
  const hasStockHints = stockHints.size > 0;

  for (const color of finalColors) {
    for (const size of finalSizes) {
      const key = buildVariantStockKey(color, size || "");
      const lookupKey = key.toLowerCase();
      const hint =
        stockHints.get(lookupKey) ??
        (size ? stockHints.get(`::${size.toLowerCase()}`) : undefined) ??
        (size ? stockHints.get(`${color.toLowerCase()}::${size.toLowerCase()}`) : undefined);
      let inStock: boolean;
      let source: TrendyolVariantStockItem["source"] = "fallback";
      let disabledReason: string | undefined;

      if (hint) {
        inStock = hint.inStock;
        source = hint.source;
        disabledReason = hint.reason;
      } else if (size) {
        const sizeOnly = stockHints.get(`::${size.toLowerCase()}`);
        if (sizeOnly) {
          inStock = sizeOnly.inStock;
          source = sizeOnly.source;
          disabledReason = sizeOnly.reason;
        } else if (hasStockHints) {
          inStock = false;
          disabledReason = "no stock hint for combination";
          warnings.push(`Stok bilgisi eksik: ${key} — stokta yok varsayıldı`);
        } else {
          inStock = true;
          warnings.push(`Stok bilgisi yok: ${key} — düşük güven`);
        }
      } else {
        inStock = true;
      }

      variants.push({
        color,
        size: size || "",
        key,
        inStock,
        disabledReason,
        source,
      });
    }
  }

  return variants;
}

function collectStockHints(
  scriptItems: TrendyolVariantStockItem[],
  domSizes: Array<{ name: string; inStock: boolean; disabledReason?: string }>,
  slicingMatrix: ReturnType<typeof buildVariantMatrixFromSlicingData>,
  puppeteer?: PuppeteerStockSnapshot | null,
): Map<string, { inStock: boolean; reason?: string; source: TrendyolVariantStockItem["source"] }> {
  const map = new Map<
    string,
    { inStock: boolean; reason?: string; source: TrendyolVariantStockItem["source"] }
  >();

  const set = (
    color: string,
    size: string,
    inStock: boolean,
    source: TrendyolVariantStockItem["source"],
    reason?: string,
  ) => {
    const colorName = color || DEFAULT_COLOR;
    const sizeKey = size.toLowerCase();
    const entry = { inStock, source, reason };
    map.set(`${colorName.toLowerCase()}::${sizeKey}`, entry);
    map.set(buildVariantStockKey(colorName, size).toLowerCase(), entry);
    if (size) map.set(`::${sizeKey}`, entry);
  };

  for (const item of scriptItems) {
    set(item.color, item.size, item.inStock, item.source, item.disabledReason);
  }

  for (const v of slicingMatrix) {
    set(v.color, v.size, v.inStock, "script-json");
  }

  for (const s of domSizes) {
    set("", s.name, s.inStock, "dom", s.disabledReason);
  }

  if (puppeteer) {
    for (const c of puppeteer.colors) {
      const sizes = puppeteer.sizesByColor[c.name] || [];
      for (const s of sizes) {
        set(c.name, s.name, s.inStock, "dom", s.disabledReason);
      }
    }
  }

  return map;
}

export function normalizeTrendyolVariantStock(input: NormalizeStockInput): TrendyolVariantStockResult {
  const warnings: string[] = [];
  const html = input.html || "";
  const $ = input.$ || (html ? cheerio.load(html) : cheerio.load("<html></html>"));
  const product =
    input.product ||
    (html ? getTrendyolProductFromState(html) : null);

  const scriptItems = html ? parseScriptJsonVariants(html) : [];

  let slicingColors: string[] = [];
  let slicingSizes: string[] = [];
  let slicingMatrix: ReturnType<typeof buildVariantMatrixFromSlicingData> = [];

  if (product) {
    const sources = [product];
    const ml = product.merchantListing;
    if (ml && typeof ml === "object") sources.push(ml as Record<string, unknown>);

    const merged = { colors: [] as Array<{ name: string; inStock: boolean }>, sizes: [] as Array<{ name: string; inStock: boolean }> };
    for (const src of sources) {
      const parsed = parseSlicingAttributesFromProduct(src);
      for (const c of parsed.colors) {
        if (!merged.colors.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) {
          merged.colors.push(c);
        }
      }
      for (const s of parsed.sizes) {
        if (!merged.sizes.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) {
          merged.sizes.push(s);
        }
      }
    }

    const sku = parseSkuComboVariantsFromProduct(product);
    slicingMatrix = buildVariantMatrixFromSlicingData(
      { colors: merged.colors, sizes: merged.sizes },
      sku,
    );
    slicingColors = merged.colors.map((c) => c.name);
    slicingSizes = merged.sizes.map((s) => s.name);
  }

  if (slicingMatrix.length === 0 && html) {
    const fromSlicing = buildVariantsFromSlicing($, html);
    slicingMatrix = fromSlicing;
    slicingColors = uniqueNames(fromSlicing.map((v) => v.color).filter(Boolean));
    slicingSizes = uniqueNames(fromSlicing.map((v) => v.size).filter(Boolean));
  }

  const domColors = html ? extractColorsFromDom($, html) : [];
  const domSizes = html ? extractSizesFromDom($, html) : [];

  if (input.puppeteerSnapshot?.colors?.length) {
    domColors.push(...input.puppeteerSnapshot.colors.map((c) => c.name));
  }

  let colors = uniqueNames([
    ...slicingColors,
    ...domColors,
    ...scriptItems.map((v) => v.color).filter(Boolean),
  ]);

  let sizes = uniqueNames([
    ...slicingSizes,
    ...domSizes.map((s) => s.name),
    ...scriptItems.map((v) => v.size).filter((s) => s),
  ]);

  if (colors.length === 0) {
    colors = [DEFAULT_COLOR];
    warnings.push("Renk bulunamadı — Tek Renk kullanıldı");
  } else if (colors.length > 1) {
    colors = colors.filter((c) => c !== DEFAULT_COLOR);
  }

  const stockHints = collectStockHints(
    scriptItems,
    domSizes,
    slicingMatrix,
    input.puppeteerSnapshot,
  );

  let variants = buildMatrix(colors, sizes, stockHints, warnings);

  if (variants.length === 0 && sizes.length > 0) {
    variants = sizes.map((size) => {
      const color = colors[0] || DEFAULT_COLOR;
      const hint = stockHints.get(`::${size.toLowerCase()}`);
      return {
        color,
        size,
        key: buildVariantStockKey(color, size),
        inStock: hint?.inStock ?? true,
        disabledReason: hint?.reason,
        source: hint?.source ?? "fallback",
      } as TrendyolVariantStockItem;
    });
  }

  const stockMap: Record<string, boolean> = {};
  for (const v of variants) {
    stockMap[v.key] = v.inStock;
  }

  const availableVariants = variants.filter((v) => v.inStock);
  const outOfStockVariants = variants.filter((v) => !v.inStock);

  let confidence: TrendyolVariantStockResult["confidence"] = "low";
  const hasScript = scriptItems.length > 0 || slicingMatrix.length > 0;
  const hasDom = domSizes.length > 0 || Boolean(input.puppeteerSnapshot);
  const hasExplicitOos = outOfStockVariants.length > 0;

  if (hasScript && (hasDom || hasExplicitOos)) confidence = "high";
  else if (hasScript || hasDom) confidence = "medium";

  if (confidence === "low" && variants.length > 0) {
    warnings.push("Stok güveni düşük — tüm varyantlar otomatik stokta sayılmadı");
    for (const v of variants) {
      if (v.source === "fallback" && v.inStock) {
        v.inStock = false;
        v.disabledReason = "low confidence — stock unknown";
        stockMap[v.key] = false;
      }
    }
  }

  const productInStock =
    input.puppeteerSnapshot?.productInStock ??
    availableVariants.length > 0;

  return {
    colors,
    sizes,
    variants,
    stockMap,
    availableVariants: variants.filter((v) => v.inStock),
    outOfStockVariants: variants.filter((v) => !v.inStock),
    productInStock,
    confidence,
    warnings: [...new Set(warnings)],
  };
}

export function buildStockSummary(result: TrendyolVariantStockResult): StockSummaryPayload {
  return {
    productInStock: result.productInStock,
    totalVariants: result.variants.length,
    inStockVariants: result.availableVariants.length,
    outOfStockVariants: result.outOfStockVariants.length,
    confidence: result.confidence,
  };
}

export function toLegacyVariantsPayload(result: TrendyolVariantStockResult) {
  return {
    colors: result.colors,
    sizes: result.sizes,
    stockMap: result.stockMap,
    allVariants: result.variants.map((v) => ({
      color: v.color,
      colorCode: "",
      size: v.size,
      inStock: v.inStock,
    })),
    items: result.variants,
  };
}

export function logTrendyolStockResult(url: string, result: TrendyolVariantStockResult): void {
  const summary = buildStockSummary(result);
  console.log(`[TrendyolStock] URL: ${url}`);
  console.log(`[TrendyolStock] Colors: ${result.colors.join(", ") || DEFAULT_COLOR}`);
  console.log(`[TrendyolStock] Sizes: ${result.sizes.join(", ") || "(yok)"}`);
  console.log(
    `[TrendyolStock] In stock: ${summary.inStockVariants}/${summary.totalVariants}`,
  );
  if (result.outOfStockVariants.length > 0) {
    console.log(
      `[TrendyolStock] Out of stock variants: ${result.outOfStockVariants.map((v) => v.key).join(", ")}`,
    );
  }
  console.log(`[TrendyolStock] Confidence: ${result.confidence}`);
  for (const w of result.warnings) {
    console.log(`[TrendyolStock] Warning: ${w}`);
  }
}

/** Mevcut scrape sonucuna stok normalizasyonu uygula */
export function applyStockNormalizationToScrapeResult(
  scrapeResult: Record<string, unknown>,
  input: Omit<NormalizeStockInput, "productTitle"> & { url: string; rawProduct?: Record<string, unknown> | null },
): void {
  const normalized = normalizeTrendyolVariantStock({
    html: input.html,
    $: input.$,
    product: input.product ?? input.rawProduct ?? undefined,
    puppeteerSnapshot: input.puppeteerSnapshot,
    url: input.url,
    productTitle: String(scrapeResult.title || ""),
  });

  logTrendyolStockResult(input.url, normalized);

  const legacy = toLegacyVariantsPayload(normalized);
  scrapeResult.variants = legacy;
  scrapeResult.stockSummary = buildStockSummary(normalized);
  scrapeResult.domSizeButtons = normalized.sizes;
  scrapeResult.variantDiagnostics = {
    ...(scrapeResult.variantDiagnostics as Record<string, unknown> | undefined),
    rawDomSizeCount: normalized.sizes.length,
    domSizeButtons: normalized.sizes,
  };
  scrapeResult.stockAnalysis = {
    ...buildStockSummary(normalized),
    variants: normalized.variants.map((v) => ({
      color: v.color,
      size: v.size,
      inStock: v.inStock,
    })),
    stockMap: normalized.stockMap,
    warnings: normalized.warnings,
  };
}
