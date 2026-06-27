/**
 * Trendyol slicing-attributes (renk/beden) parse — __PRODUCT_DETAIL_APP_INITIAL_STATE__ + DOM
 */

import type { CheerioAPI, Cheerio } from "cheerio";

export interface SlicingOption {
  name: string;
  inStock: boolean;
}

export interface SlicingAttributesData {
  colors: SlicingOption[];
  sizes: SlicingOption[];
}

function isOutOfStockFlag(raw: unknown): boolean {
  if (raw === false || raw === 0 || raw === "0") return true;
  const s = String(raw ?? "").toLowerCase();
  return (
    s === "outofstock" ||
    s === "soldout" ||
    s === "sold_out" ||
    s === "false" ||
    s.includes("tükendi") ||
    s.includes("tukendi")
  );
}

function itemInStock(item: Record<string, unknown>): boolean {
  const stockState = item.stockState ?? item.stock ?? item.availability;
  if (stockState != null && isOutOfStockFlag(stockState)) return false;
  if (item.inStock === false || item.available === false || item.selectable === false) return false;
  if (item.disabled === true) return false;
  return true;
}

function optionName(item: Record<string, unknown>): string {
  const val =
    item.attributeValue ??
    item.attributeBeautifiedValue ??
    item.value ??
    item.name ??
    item.beautifiedValue ??
    "";
  return String(val).trim();
}

export function parseSlicingAttributesFromProduct(product: unknown): SlicingAttributesData {
  const colors: SlicingOption[] = [];
  const sizes: SlicingOption[] = [];
  if (!product || typeof product !== "object") return { colors, sizes };

  const sliced = (product as { slicedAttributes?: unknown[] }).slicedAttributes;
  if (!Array.isArray(sliced)) return { colors, sizes };

  for (const attr of sliced) {
    if (!attr || typeof attr !== "object") continue;
    const record = attr as Record<string, unknown>;
    const attrName = String(record.attributeName ?? record.name ?? "").toLowerCase();
    const attrType = String(record.attributeType ?? "").toLowerCase();
    const isColor =
      attrName === "renk" ||
      attrName === "color" ||
      attrType === "color" ||
      attrType === "colour";
    const isSize =
      attrName === "beden" ||
      attrName === "size" ||
      attrName.includes("yaş") ||
      attrName.includes("yas") ||
      attrType === "size";

    const items = record.attributes ?? record.items ?? record.values;
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const name = optionName(rec);
      if (!name || name.length > 40) continue;
      const entry = { name, inStock: itemInStock(rec) };
      if (isColor) colors.push(entry);
      else if (isSize) sizes.push(entry);
    }
  }

  return { colors, sizes };
}

export function parseSlicingAttributesFromHtml(htmlContent: string): SlicingAttributesData {
  const empty: SlicingAttributesData = { colors: [], sizes: [] };
  const patterns = [
    /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
    /__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
  ];
  for (const pattern of patterns) {
    const match = htmlContent.match(pattern);
    if (!match?.[1]) continue;
    try {
      const state = JSON.parse(match[1]);
      const parsed = parseSlicingAttributesFromProduct(state?.product ?? state);
      if (parsed.colors.length > 0 || parsed.sizes.length > 0) return parsed;
    } catch {
      /* try next pattern */
    }
  }
  return empty;
}

export function isDomElementOutOfStock($el: Cheerio<unknown>): boolean {
  if ($el.is("[disabled]") || $el.attr("aria-disabled") === "true") return true;
  const cls = ($el.attr("class") || "").toLowerCase();
  if (
    cls.includes("disabled") ||
    cls.includes("sold-out") ||
    cls.includes("soldout") ||
    cls.includes("out-of-stock") ||
    cls.includes("not-available") ||
    cls.includes("unavailable") ||
    cls.includes("no-stock")
  ) {
    return true;
  }
  if ($el.find('[class*="sold"], [class*="out-of-stock"], [class*="disabled"]').length > 0) {
    return true;
  }
  const parent = $el.parent();
  if (parent.length && isDomElementOutOfStock(parent)) return true;
  return false;
}

/** slicing-attributes renk görsellerinden tüm renk adlarını çıkarır */
export function extractColorsFromSlicingDom($: CheerioAPI): string[] {
  const colors: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined) => {
    const name = raw?.trim();
    if (!name || name.length > 40 || /^\d+$/.test(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    colors.push(name);
  };

  const selectors = [
    'a.slicing-attributes__item img[alt]',
    '.slicing-attributes img[alt]',
    '[data-testid="slicing-attribute-section"] img[alt]',
    '[class*="slicing-attribute"] img[alt]',
    '[data-testid*="color"] img[alt]',
    '.color-variants img[alt]',
    '[class*="color-variant"] img[alt]',
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => push($(el).attr("alt")));
  }

  $('[data-testid="slicing-attribute-section"], .slicing-attributes, [class*="slicing-attribute"]').each(
    (_, section) => {
      const label = $(section).find("span, label, h3, p").first().text().toLowerCase();
      if (!label.includes("renk") && !label.includes("color")) return;
      $(section)
        .find("img[alt], button[title], a[title], [aria-label]")
        .each((__, el) => {
          const $el = $(el);
          push($el.attr("alt") || $el.attr("title") || $el.attr("aria-label") || undefined);
        });
    },
  );

  const renkSection = $('[data-testid="slicing-attribute-section"], .slicing-attributes, [class*="slicing-attribute"]')
    .filter((_, el) => {
      const label = $(el).find("span, label, h3, p").first().text().toLowerCase();
      return label.includes("renk") || label.includes("color");
    });
  renkSection.find("img[alt], button[title], a[title], [aria-label]").each((_, el) => {
    const $el = $(el);
    push($el.attr("alt") || $el.attr("title") || $el.attr("aria-label") || undefined);
  });

  return colors;
}

export interface SlicingVariant {
  color: string;
  colorCode: string;
  size: string;
  inStock: boolean;
}

/** Trendyol slicing-attributes + puppeteer meta → renk×beden matrisi */
export function buildVariantsFromSlicing(
  $: CheerioAPI,
  htmlContent: string,
): SlicingVariant[] {
  const slicing = parseSlicingAttributesFromHtml(htmlContent);
  const domColors = extractColorsFromSlicingDom($);
  const domSizes = extractSizesWithStockFromDom($);

  const colors = mergeColorNames(
    slicing.colors.map((c) => c.name),
    domColors,
  );

  const sizeStock = new Map<string, boolean>();
  for (const s of slicing.sizes) sizeStock.set(s.name, s.inStock);
  for (const s of domSizes) sizeStock.set(s.name, s.inStock);

  const puppeteerColors = $("meta[name='puppeteer-colors']").attr("content");
  const puppeteerCurrent = $("meta[name='puppeteer-current-color']").attr("content");
  const puppeteerSizes = $("meta[name='puppeteer-sizes']").attr("content");

  if (puppeteerColors) {
    for (const c of puppeteerColors.split(",").map((x) => x.trim()).filter(Boolean)) {
      if (!colors.some((x) => x.toLowerCase() === c.toLowerCase())) colors.push(c);
    }
  }
  if (puppeteerCurrent) {
    for (const c of mergeColorNames([puppeteerCurrent])) {
      if (!colors.some((x) => x.toLowerCase() === c.toLowerCase())) colors.push(c);
    }
  }
  if (puppeteerSizes) {
    for (const entry of puppeteerSizes.split(",").map((x) => x.trim()).filter(Boolean)) {
      const [sizeVal, stock] = entry.split(":");
      if (sizeVal?.trim()) sizeStock.set(sizeVal.trim(), stock !== "out");
    }
  }

  const colorStock = new Map<string, boolean>();
  for (const c of slicing.colors) colorStock.set(c.name.toLowerCase(), c.inStock);

  const sizes = [
    ...new Set([
      ...slicing.sizes.map((s) => s.name),
      ...domSizes.map((s) => s.name),
      ...sizeStock.keys(),
    ]),
  ].filter((s) => s && s !== "1" && s !== "Standart" && s !== "Varsayılan");

  const variants: SlicingVariant[] = [];

  if (colors.length > 0 && sizes.length > 0) {
    for (const color of colors) {
      const colorInStock = colorStock.has(color.toLowerCase())
        ? colorStock.get(color.toLowerCase())!
        : true;
      for (const size of sizes) {
        const sizeInStock = sizeStock.has(size) ? sizeStock.get(size)! : true;
        variants.push({
          color,
          colorCode: "",
          size,
          inStock: colorInStock && sizeInStock,
        });
      }
    }
  } else if (colors.length > 0) {
    for (const color of colors) {
      variants.push({
        color,
        colorCode: "",
        size: "",
        inStock: colorStock.has(color.toLowerCase())
          ? colorStock.get(color.toLowerCase())!
          : true,
      });
    }
  } else if (sizes.length >= 2) {
    for (const size of sizes) {
      variants.push({
        color: "",
        colorCode: "",
        size,
        inStock: sizeStock.has(size) ? sizeStock.get(size)! : false,
      });
    }
  }

  return variants;
}

export function extractSizesWithStockFromDom($: CheerioAPI): SlicingOption[] {
  const sizes: SlicingOption[] = [];
  const seen = new Set<string>();

  const sizeSelectors = [
    '[data-testid*="size"] button',
    '[data-testid*="size-variant"]',
    '.slicing-attribute-section-value button',
    '.slicing-attribute-section-value span',
    '.pr-in-sz button',
    '[class*="size-variant"] button',
  ];

  const isValidShoeOrSize = (text: string): boolean => {
    const t = text.trim();
    if (!t || t.length > 12) return false;
    if (/^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i.test(t)) return true;
    if (/^\d{2}$/.test(t)) {
      const n = parseInt(t, 10);
      return n >= 20 && n <= 60;
    }
    if (/^(Tek\s*Beden|One\s*Size|OS|STANDART)$/i.test(t)) return true;
    return false;
  };

  for (const sel of sizeSelectors) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const text = ($el.text() || $el.attr("title") || $el.attr("aria-label") || "").trim();
      if (!isValidShoeOrSize(text)) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      sizes.push({ name: text, inStock: !isDomElementOutOfStock($el) });
    });
  }

  return sizes;
}

export function mergeColorNames(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const c of list) {
      const name = c?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}
