/**
 * Trendyol slicing-attributes (renk/beden) parse — __PRODUCT_DETAIL_APP_INITIAL_STATE__ + DOM
 */

import type { CheerioAPI, Cheerio } from "cheerio";
import { getTrendyolProductFromState, parseTrendyolProductDetailState } from "./trendyol-product-state";

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

  const mergeOption = (list: SlicingOption[], entry: SlicingOption) => {
    const key = entry.name.toLowerCase();
    const existing = list.find((x) => x.name.toLowerCase() === key);
    if (existing) {
      existing.inStock = existing.inStock || entry.inStock;
      return;
    }
    list.push(entry);
  };

  const sliced = (product as { slicedAttributes?: unknown[] }).slicedAttributes;
  if (Array.isArray(sliced)) {
    for (const attr of sliced) {
      if (!attr || typeof attr !== "object") continue;
      const record = attr as Record<string, unknown>;
      const attrName = String(record.attributeName ?? record.name ?? "").toLowerCase();
      const attrType = String(record.attributeType ?? record.type ?? "").toLowerCase();
      const isColor =
        attrName === "renk" ||
        attrName === "color" ||
        attrType === "color" ||
        attrType === "colour" ||
        attrType === "1";
      const isSize =
        attrName === "beden" ||
        attrName === "size" ||
        attrName.includes("yaş") ||
        attrName.includes("yas") ||
        attrType === "size" ||
        attrType === "2";

      const items = record.attributes ?? record.items ?? record.values;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const name = optionName(rec);
        if (!name || name.length > 40) continue;
        const entry = { name, inStock: itemInStock(rec) };
        if (isColor) mergeOption(colors, entry);
        else if (isSize) mergeOption(sizes, entry);
      }
    }
  }

  const flatVariants = (product as { variants?: unknown[] }).variants;
  if (Array.isArray(flatVariants)) {
    for (const item of flatVariants) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const attrType = rec.attributeType;
      const name = optionName(rec);
      if (!name) continue;
      const entry = { name, inStock: itemInStock(rec) };
      if (attrType === 1 || attrType === "1") mergeOption(colors, entry);
      else if (attrType === 2 || attrType === "2") mergeOption(sizes, entry);
      else {
        const attrName = String(rec.attributeName ?? "").toLowerCase();
        if (attrName === "renk" || attrName === "color") mergeOption(colors, entry);
        else if (attrName === "beden" || attrName === "size") mergeOption(sizes, entry);
      }
    }
  }

  const otherMerchants = (product as { otherMerchants?: unknown[] }).otherMerchants;
  if (Array.isArray(otherMerchants)) {
    for (const merchant of otherMerchants) {
      if (!merchant || typeof merchant !== "object") continue;
      const rec = merchant as Record<string, unknown>;
      for (const key of ["color", "renk", "variantName", "name", "title"]) {
        const val = String(rec[key] ?? "").trim();
        if (val && val.length < 40) mergeOption(colors, { name: val, inStock: true });
      }
    }
  }

  const directColor = String(
    (product as Record<string, unknown>).color ??
      (product as Record<string, unknown>).renk ??
      "",
  ).trim();
  if (directColor) mergeOption(colors, { name: directColor, inStock: true });

  const colorOptions = (product as { colorOptions?: unknown[] }).colorOptions;
  if (Array.isArray(colorOptions)) {
    for (const opt of colorOptions) {
      if (typeof opt === "string") {
        const name = opt.trim();
        if (name) mergeOption(colors, { name, inStock: true });
        continue;
      }
      if (!opt || typeof opt !== "object") continue;
      const rec = opt as Record<string, unknown>;
      const name = optionName(rec) || String(rec.text ?? rec.label ?? "").trim();
      if (name) mergeOption(colors, { name, inStock: itemInStock(rec) });
    }
  }

  return { colors, sizes };
}

function collectVariantSourceRecords(product: unknown): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  if (product && typeof product === "object") {
    sources.push(product as Record<string, unknown>);
    const rec = product as Record<string, unknown>;
    const ml = rec.merchantListing;
    if (ml && typeof ml === "object") sources.push(ml as Record<string, unknown>);
    const state = rec.product;
    if (state && typeof state === "object") sources.push(state as Record<string, unknown>);
  }
  return sources;
}

function collectAllVariantItems(product: unknown): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const push = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const rec = raw as Record<string, unknown>;
    const key = JSON.stringify([
      rec.itemNumber ?? rec.id,
      rec.attributeName,
      rec.attributeValue,
      rec.attributes,
      rec.color,
      rec.size,
    ]);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(rec);
  };

  for (const source of collectVariantSourceRecords(product)) {
    for (const key of [
      "allVariants",
      "variants",
      "sizeVariants",
      "colorVariants",
      "winningVariantCombinations",
      "variantCombinations",
      "skuList",
      "skus",
    ]) {
      const list = source[key];
      if (Array.isArray(list)) list.forEach(push);
    }
    const sliced = source.slicedAttributes;
    if (Array.isArray(sliced)) {
      for (const attr of sliced) {
        if (!attr || typeof attr !== "object") continue;
        const attrRec = attr as Record<string, unknown>;
        const nested = attrRec.attributes ?? attrRec.items ?? attrRec.values;
        if (Array.isArray(nested)) nested.forEach(push);
      }
    }
  }

  return items;
}

export function parseSlicingAttributesFromHtml(htmlContent: string): SlicingAttributesData {
  const colors: SlicingOption[] = [];
  const sizes: SlicingOption[] = [];

  const mergeOption = (list: SlicingOption[], entry: SlicingOption) => {
    const key = entry.name.toLowerCase();
    const existing = list.find((x) => x.name.toLowerCase() === key);
    if (existing) {
      existing.inStock = existing.inStock || entry.inStock;
      return;
    }
    list.push(entry);
  };

  const state = parseTrendyolProductDetailState(htmlContent);
  const product = getTrendyolProductFromState(htmlContent);
  const sources: unknown[] = [
    product,
    product && typeof product === "object"
      ? (product as Record<string, unknown>).merchantListing
      : null,
    state && typeof state === "object"
      ? (state as Record<string, unknown>).merchantListing
      : null,
    state,
  ];

  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    const parsed = parseSlicingAttributesFromProduct(src);
    for (const c of parsed.colors) mergeOption(colors, c);
    for (const s of parsed.sizes) mergeOption(sizes, s);
  }

  return { colors, sizes };
}

/** product.allVariants / SKU kombinasyonlarından renk×beden matrisi */
export function parseSkuComboVariantsFromProduct(product: unknown): SlicingVariant[] {
  const variants: SlicingVariant[] = [];
  const seen = new Set<string>();

  for (const rec of collectAllVariantItems(product)) {
    const attrName = String(rec.attributeName ?? rec.name ?? "").toLowerCase();
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

    if (!color && !size) {
      if (attrName === "renk" || attrName === "color") {
        color = optionName(rec);
      } else if (
        attrName === "beden" ||
        attrName === "size" ||
        attrName.includes("yaş") ||
        attrName.includes("yas")
      ) {
        size = optionName(rec);
      } else {
        color = String(rec.color ?? "").trim();
        size = String(rec.size ?? rec.value ?? "").trim();
      }
    }

    if (!color && !size) continue;

    const stockCount = rec.stock ?? rec.stockCount ?? rec.quantity;
    const inStock =
      stockCount != null
        ? Number(stockCount) > 0
        : itemInStock(rec);

    const key = `${color.toLowerCase()}::${size.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({ color, colorCode: "", size, inStock });
  }

  return variants;
}

/** product.allVariants içinden beden + stok bilgisi */
export function parseSizeVariantsFromProduct(product: unknown): SlicingOption[] {
  const sizes: SlicingOption[] = [];
  const seen = new Set<string>();

  for (const rec of collectAllVariantItems(product)) {
    const attrName = String(rec.attributeName ?? rec.name ?? "").toLowerCase();
    const attrs = rec.attributes as Record<string, unknown> | undefined;
    let name = "";

    if (attrs && typeof attrs === "object") {
      name = String(
        attrs.BEDEN ?? attrs.Beden ?? attrs.beden ?? attrs.size ?? attrs.SIZE ?? "",
      ).trim();
    }
    if (!name) {
      const isSize =
        attrName === "beden" ||
        attrName === "size" ||
        attrName.includes("yaş") ||
        attrName.includes("yas");
      if (!isSize) continue;
      name = optionName(rec);
    }
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const stockCount = rec.stock ?? rec.stockCount ?? rec.quantity;
    const inStock =
      stockCount != null ? Number(stockCount) > 0 : itemInStock(rec);
    sizes.push({ name, inStock });
  }

  return sizes;
}

export function isDomElementOutOfStock($el: Cheerio<unknown>): boolean {
  if ($el.is("[disabled]") || $el.attr("aria-disabled") === "true") return true;
  const cls = ($el.attr("class") || "").toLowerCase();
  if (
    cls.includes("disabled") ||
    cls.includes("passive") ||
    cls.includes("sold-out") ||
    cls.includes("soldout") ||
    cls.includes("out-of-stock") ||
    cls.includes("not-available") ||
    cls.includes("unavailable") ||
    cls.includes("no-stock") ||
    cls.includes("tukendi") ||
    cls.includes("tükendi")
  ) {
    return true;
  }
  const text = ($el.text() || "").toLowerCase();
  if (/tükendi|tukendi|stokta yok|gelince haber ver/.test(text)) return true;

  const parent = $el.parent();
  if (parent.length) {
    const pCls = (parent.attr("class") || "").toLowerCase();
    if (
      pCls.includes("disabled") ||
      pCls.includes("passive") ||
      pCls.includes("sold-out") ||
      pCls.includes("out-of-stock")
    ) {
      return true;
    }
  }
  return false;
}

/** slicing-attributes renk görsellerinden tüm renk adlarını çıkarır */
export function extractColorsFromSlicingDom($: CheerioAPI): string[] {
  return extractColorsWithStockFromDom($).map((c) => c.name);
}

/** slicing-attributes DOM — renk + stok durumu */
export function extractColorsWithStockFromDom($: CheerioAPI): SlicingOption[] {
  const colors: SlicingOption[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined, $context?: Cheerio<unknown>) => {
    const name = raw?.trim();
    if (!name || name.length > 40 || /^\d+$/.test(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const inStock = $context ? !isDomElementOutOfStock($context) : true;
    colors.push({ name, inStock });
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
    $(sel).each((_, el) => {
      const $el = $(el);
      const $parent = $el.closest('a, button, [role="button"]');
      push($el.attr("alt"), ($parent.length ? $parent : $el) as Cheerio<unknown>);
    });
  }

  $('[data-testid="slicing-attribute-section"], .slicing-attributes, [class*="slicing-attribute"]').each(
    (_, section) => {
      const $section = $(section);
      const label = $section.find("span, label, h3, p").first().text().toLowerCase();
      if (!label.includes("renk") && !label.includes("color")) return;
      $section.find("img[alt], button[title], a[title], [aria-label]").each((__, el) => {
        const $el = $(el);
        push($el.attr("alt") || $el.attr("title") || $el.attr("aria-label") || undefined, $el);
      });
    },
  );

  return colors;
}

/** JSON-LD ProductGroup / Product içinden renk×beden */
export function extractVariantsFromJsonLd(html: string): SlicingVariant[] {
  const variants: SlicingVariant[] = [];
  const seen = new Set<string>();
  const push = (color: string, size: string, inStock: boolean) => {
    const key = `${color.toLowerCase()}::${size.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({ color, colorCode: "", size, inStock });
  };

  const scripts = [
    ...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];

  for (const match of scripts) {
    try {
      const data = JSON.parse(match[1]);
      const roots = Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];

      for (const root of roots) {
        if (!root || typeof root !== "object") continue;

        if (root["@type"] === "ProductGroup" && Array.isArray(root.hasVariant)) {
          for (const variant of root.hasVariant) {
            const color = String(variant?.color ?? "").trim();
            if (!color) continue;
            let sizes: string[] = [];
            if (Array.isArray(variant?.size)) {
              sizes = variant.size.map(String).filter((s) => s && s !== "Standart");
            } else if (typeof variant?.size === "string" && variant.size !== "Standart") {
              sizes = [variant.size];
            }
            if (sizes.length === 0) sizes = [""];
            const inStock =
              !variant?.offers?.availability ||
              !String(variant.offers.availability).includes("OutOfStock");
            for (const size of sizes) push(color, size, inStock);
          }
        }

        if (root["@type"] === "Product") {
          const color = String(root.color ?? "").trim();
          let sizes: string[] = [];
          if (Array.isArray(root.size)) sizes = root.size.map(String).filter(Boolean);
          else if (typeof root.size === "string" && root.size) sizes = [root.size];

          if (color && sizes.length > 0) {
            for (const size of sizes) push(color, size, true);
          } else if (Array.isArray(root.hasVariant)) {
            for (const variant of root.hasVariant) {
              const vColor = String(variant?.color ?? color).trim();
              const vSize = String(variant?.size ?? "").trim();
              if (vColor || vSize) push(vColor, vSize, true);
            }
          }
        }
      }
    } catch {
      /* skip malformed JSON-LD */
    }
  }

  return variants;
}

/** Ham HTML içinde attributeType 1/2 flat varyant kayıtları */
export function extractVariantsFromSlicingRegex(html: string): SlicingVariant[] {
  const colors: SlicingOption[] = [];
  const sizes: SlicingOption[] = [];

  const mergeOption = (list: SlicingOption[], name: string, inStock: boolean) => {
    const key = name.toLowerCase();
    const existing = list.find((x) => x.name.toLowerCase() === key);
    if (existing) {
      existing.inStock = existing.inStock || inStock;
      return;
    }
    list.push({ name, inStock });
  };

  const itemPattern =
    /\{[^{}]*"attributeType"\s*:\s*(1|2|"Color"|"Size")[^{}]*"attributeValue"\s*:\s*"([^"]+)"[^{}]*\}/g;

  for (const match of html.matchAll(itemPattern)) {
    const type = match[1];
    const value = match[2]?.trim();
    if (!value || value.length > 40) continue;
    const chunk = match[0];
    const inStock = !/OutOfStock|outofstock|soldout|tükendi|tukendi/i.test(chunk);
    if (type === "1" || type === "Color") mergeOption(colors, value, inStock);
    else mergeOption(sizes, value, inStock);
  }

  const slicedColorPattern =
    /"attributeName"\s*:\s*"(?:Renk|Color)"[\s\S]*?"attributeValue"\s*:\s*"([^"]+)"/gi;
  for (const match of html.matchAll(slicedColorPattern)) {
    const value = match[1]?.trim();
    if (value) mergeOption(colors, value, true);
  }

  const slicedSizePattern =
    /"attributeName"\s*:\s*"(?:Beden|Size)"[\s\S]*?"attributeValue"\s*:\s*"([^"]+)"/gi;
  for (const match of html.matchAll(slicedSizePattern)) {
    const value = match[1]?.trim();
    if (value) mergeOption(sizes, value, true);
  }

  const variants: SlicingVariant[] = [];
  if (colors.length > 0 && sizes.length > 0) {
    for (const color of colors) {
      for (const size of sizes) {
        variants.push({
          color: color.name,
          colorCode: "",
          size: size.name,
          inStock: color.inStock && size.inStock,
        });
      }
    }
  } else if (sizes.length > 0) {
    for (const size of sizes) {
      variants.push({
        color: "",
        colorCode: "",
        size: size.name,
        inStock: size.inStock,
      });
    }
  } else if (colors.length > 0) {
    for (const color of colors) {
      variants.push({
        color: color.name,
        colorCode: "",
        size: "",
        inStock: color.inStock,
      });
    }
  }

  return variants;
}

export interface SlicingVariant {
  color: string;
  colorCode: string;
  size: string;
  inStock: boolean;
}

function mergeSlicingOptions(...lists: SlicingOption[][]): SlicingOption[] {
  const merged: SlicingOption[] = [];
  const mergeOption = (entry: SlicingOption) => {
    const key = entry.name.toLowerCase();
    const existing = merged.find((x) => x.name.toLowerCase() === key);
    if (existing) {
      existing.inStock = existing.inStock || entry.inStock;
      return;
    }
    merged.push({ ...entry });
  };
  for (const list of lists) {
    for (const item of list) mergeOption(item);
  }
  return merged;
}

/** slicedAttributes renk×beden — SKU kombinasyon stoku öncelikli */
export function buildVariantMatrixFromSlicingData(
  slicing: SlicingAttributesData,
  skuVariants: SlicingVariant[] = [],
): SlicingVariant[] {
  const colors = slicing.colors.filter((c) => c.name && c.name !== "Standart" && c.name !== "Varsayılan");
  const sizes = slicing.sizes.filter(
    (s) => s.name && s.name !== "1" && s.name !== "Standart" && s.name !== "Varsayılan",
  );

  const skuWithBoth = skuVariants.filter((v) => v.color?.trim() && v.size?.trim());
  const stockByKey = new Map(
    skuWithBoth.map((v) => [`${v.color.toLowerCase()}::${v.size.toLowerCase()}`, v.inStock]),
  );
  const hasSkuStock = stockByKey.size > 0;

  const variants: SlicingVariant[] = [];

  if (colors.length > 0 && sizes.length > 0) {
    for (const color of colors) {
      for (const size of sizes) {
        const key = `${color.name.toLowerCase()}::${size.name.toLowerCase()}`;
        const inStock = stockByKey.has(key)
          ? stockByKey.get(key)!
          : hasSkuStock
            ? false
            : color.inStock && size.inStock;
        variants.push({ color: color.name, colorCode: "", size: size.name, inStock });
      }
    }
    return variants;
  }

  if (colors.length > 0) {
    for (const color of colors) {
      variants.push({ color: color.name, colorCode: "", size: "", inStock: color.inStock });
    }
    return variants;
  }

  if (sizes.length > 0) {
    for (const size of sizes) {
      variants.push({
        color: "",
        colorCode: "",
        size: size.name,
        inStock: stockByKey.has(`::${size.name.toLowerCase()}`)
          ? stockByKey.get(`::${size.name.toLowerCase()}`)!
          : size.inStock,
      });
    }
  }

  return variants;
}

function mergeSkuVariants(primary: SlicingVariant[], secondary: SlicingVariant[]): SlicingVariant[] {
  const byKey = new Map<string, SlicingVariant>();
  const keyOf = (v: SlicingVariant) => `${v.color.toLowerCase()}::${v.size.toLowerCase()}`;

  for (const v of [...primary, ...secondary]) {
    const key = keyOf(v);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, v);
      continue;
    }
    existing.inStock = existing.inStock || v.inStock;
    if (!existing.color && v.color) existing.color = v.color;
    if (!existing.size && v.size) existing.size = v.size;
  }

  return [...byKey.values()];
}

/** Trendyol slicing-attributes + puppeteer meta → renk×beden matrisi */
export function buildVariantsFromSlicing(
  $: CheerioAPI,
  htmlContent: string,
): SlicingVariant[] {
  const product = getTrendyolProductFromState(htmlContent);
  const state = parseTrendyolProductDetailState(htmlContent);
  const slicing = parseSlicingAttributesFromHtml(htmlContent);

  const extraSlicingSources: SlicingAttributesData[] = [];
  if (product) extraSlicingSources.push(parseSlicingAttributesFromProduct(product));
  const ml = product?.merchantListing;
  if (ml && typeof ml === "object") {
    extraSlicingSources.push(parseSlicingAttributesFromProduct(ml));
  }
  if (state?.merchantListing && typeof state.merchantListing === "object") {
    extraSlicingSources.push(parseSlicingAttributesFromProduct(state.merchantListing));
  }

  const mergedSlicing: SlicingAttributesData = {
    colors: mergeSlicingOptions(slicing.colors, ...extraSlicingSources.map((s) => s.colors)),
    sizes: mergeSlicingOptions(slicing.sizes, ...extraSlicingSources.map((s) => s.sizes)),
  };

  const skuFromProduct = product ? parseSkuComboVariantsFromProduct(product) : [];
  const skuFromState =
    state?.product && typeof state.product === "object"
      ? parseSkuComboVariantsFromProduct(state.product)
      : [];
  const skuVariants = mergeSkuVariants(skuFromProduct, skuFromState);

  const matrixFromSlicing = buildVariantMatrixFromSlicingData(mergedSlicing, skuVariants);
  if (matrixFromSlicing.length > 0 && skuVariants.filter((v) => v.color && v.size).length === 0) {
    return matrixFromSlicing;
  }
  if (matrixFromSlicing.length > 0 && skuVariants.filter((v) => v.color && v.size).length > 0) {
    return mergeSkuVariants(matrixFromSlicing, skuVariants.filter((v) => v.color && v.size));
  }
  if (skuVariants.filter((v) => v.color && v.size).length > 0) {
    return skuVariants.filter((v) => v.color && v.size);
  }

  const allVariantSizes = product ? parseSizeVariantsFromProduct(product) : [];
  const domColors = extractColorsWithStockFromDom($);
  const domSizes = extractSizesWithStockFromDom($);

  const domSlicing: SlicingAttributesData = {
    colors: mergeSlicingOptions(
      mergedSlicing.colors,
      domColors,
      slicing.colors,
    ),
    sizes: mergeSlicingOptions(
      mergedSlicing.sizes,
      domSizes,
      allVariantSizes,
      slicing.sizes,
    ),
  };

  const colors = mergeColorNames(
    domSlicing.colors.map((c) => c.name),
    domColors.map((c) => c.name),
  );

  const sizeStock = new Map<string, boolean>();
  for (const s of domSlicing.sizes) sizeStock.set(s.name, s.inStock);
  for (const s of allVariantSizes) sizeStock.set(s.name, s.inStock);
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
  for (const c of domSlicing.colors) colorStock.set(c.name.toLowerCase(), c.inStock);
  for (const c of domColors) {
    const key = c.name.toLowerCase();
    const prev = colorStock.get(key);
    colorStock.set(key, prev === undefined ? c.inStock : prev || c.inStock);
  }

  const domColorOptions: SlicingOption[] = colors.map((name) => ({
    name,
    inStock: colorStock.has(name.toLowerCase()) ? colorStock.get(name.toLowerCase())! : true,
  }));
  const domSizeOptions: SlicingOption[] = [
    ...new Set([
      ...domSlicing.sizes.map((s) => s.name),
      ...allVariantSizes.map((s) => s.name),
      ...domSizes.map((s) => s.name),
      ...sizeStock.keys(),
    ]),
  ]
    .filter((s) => s && s !== "1" && s !== "Standart" && s !== "Varsayılan")
    .map((name) => ({
      name,
      inStock: sizeStock.has(name) ? sizeStock.get(name)! : true,
    }));

  const domMatrix = buildVariantMatrixFromSlicingData(
    { colors: domColorOptions, sizes: domSizeOptions },
    skuVariants,
  );
  if (domMatrix.length > 0) return domMatrix;

  const variants: SlicingVariant[] = [];
  if (domColorOptions.length > 0 && domSizeOptions.length > 0) {
    for (const color of domColorOptions) {
      for (const size of domSizeOptions) {
        variants.push({
          color: color.name,
          colorCode: "",
          size: size.name,
          inStock: color.inStock && size.inStock,
        });
      }
    }
  } else if (domColorOptions.length > 0) {
    for (const color of domColorOptions) {
      variants.push({ color: color.name, colorCode: "", size: "", inStock: color.inStock });
    }
  } else if (domSizeOptions.length >= 1) {
    for (const size of domSizeOptions) {
      variants.push({ color: "", colorCode: "", size: size.name, inStock: size.inStock });
    }
  }

  if (variants.length === 0 && product) {
    const skuVariants = parseSkuComboVariantsFromProduct(product);
    if (skuVariants.length > 0) return skuVariants;
  }

  if (variants.length > 0 && product) {
    const skuVariants = parseSkuComboVariantsFromProduct(product);
    if (skuVariants.length > 0) {
      const stockByKey = new Map(
        skuVariants.map((v) => [`${v.color.toLowerCase()}::${v.size.toLowerCase()}`, v.inStock]),
      );
      return variants.map((v) => {
        const key = `${v.color.toLowerCase()}::${v.size.toLowerCase()}`;
        return stockByKey.has(key) ? { ...v, inStock: stockByKey.get(key)! } : v;
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
    '[data-testid="size-variant-item"]',
    '.slicing-attribute-section-value button',
    '.slicing-attribute-section-value span',
    '.slicing-attribute-section-value a',
    '[class*="slicing-attribute"] button',
    '[class*="slicing-attribute"] span',
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
