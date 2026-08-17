import type { CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import { getTrendyolProductFromState } from "../trendyol-product-state";
import {
  attributesToFeaturePairs,
  cleanAttributeName,
  cleanAttributeValue,
  isPlausibleAttributePair,
  type ProductAttribute,
  type ProductAttributeSource,
} from "@shared/product-attributes";

type PushOpts = { source: ProductAttributeSource };

function pushAttr(
  out: ProductAttribute[],
  seen: Set<string>,
  rawName: unknown,
  rawValue: unknown,
  opts: PushOpts,
): void {
  const name = cleanAttributeName(String(rawName ?? ""));
  const value = cleanAttributeValue(String(rawValue ?? ""));
  if (!isPlausibleAttributePair(name, value)) return;
  const dedupe = `${name.toLowerCase()}::${value.toLowerCase()}`;
  if (seen.has(dedupe)) return;
  seen.add(dedupe);
  out.push({
    name,
    value,
    source: opts.source,
    position: out.length,
  });
}

function extractFromProductState(product: Record<string, unknown>): ProductAttribute[] {
  const out: ProductAttribute[] = [];
  const seen = new Set<string>();
  const arraySources = [
    product.attributes,
    product.productAttributes,
    product.specifications,
    product.specs,
    product.contentDescriptions,
    product.productFeatures,
    product.merchantListingsAttributes,
  ];

  for (const source of arraySources) {
    if (!Array.isArray(source)) continue;
    for (const attr of source) {
      if (!attr || typeof attr !== "object") continue;
      const a = attr as Record<string, unknown>;
      const key = a.key ?? a.attributeKey ?? a.attributeName ?? a.name ?? a.label ?? a.title;
      let value = a.value ?? a.attributeValue ?? a.text ?? a.description;
      // Nested attributeValues / values arrays (Trendyol variants of property bags)
      if ((value == null || value === "") && Array.isArray(a.attributeValues)) {
        value = (a.attributeValues as unknown[])
          .map((x) => {
            if (typeof x === "string" || typeof x === "number") return String(x);
            if (x && typeof x === "object") {
              const o = x as Record<string, unknown>;
              return String(o.name ?? o.value ?? o.text ?? "");
            }
            return "";
          })
          .filter(Boolean)
          .join(", ");
      }
      pushAttr(out, seen, key, value, { source: "trendyol-json" });
    }
  }

  // Object-map style attributes: { "Kalıp": "Oversize", ... }
  for (const candidate of [product.attributes, product.specs, product.specifications]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const [k, v] of Object.entries(candidate as Record<string, unknown>)) {
      if (v && typeof v === "object") continue;
      pushAttr(out, seen, k, v, { source: "trendyol-json" });
    }
  }

  return out;
}

function extractFromJsonLd($: CheerioAPI): ProductAttribute[] {
  const out: ProductAttribute[] = [];
  const seen = new Set<string>();

  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const raw = $(script).html();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        walkJsonLdNode(node, out, seen);
      }
    } catch {
      /* ignore broken JSON-LD */
    }
  });

  return out;
}

function walkJsonLdNode(
  node: unknown,
  out: ProductAttribute[],
  seen: Set<string>,
): void {
  if (!node || typeof node !== "object") return;
  const data = node as Record<string, unknown>;
  const type = data["@type"];
  const types = Array.isArray(type) ? type.map(String) : [String(type || "")];
  const isProduct = types.some((t) => /Product|ProductGroup/i.test(t));

  if (isProduct && Array.isArray(data.additionalProperty)) {
    for (const prop of data.additionalProperty) {
      if (!prop || typeof prop !== "object") continue;
      const p = prop as Record<string, unknown>;
      const name = p.name;
      const value = p.value ?? p.unitText ?? p.propertyValue;
      pushAttr(out, seen, name, value, { source: "trendyol-jsonld" });
    }
  }

  if (Array.isArray(data.hasVariant)) {
    for (const v of data.hasVariant) walkJsonLdNode(v, out, seen);
  }
  if (Array.isArray(data["@graph"])) {
    for (const g of data["@graph"]) walkJsonLdNode(g, out, seen);
  }
}

function extractFromDom($: CheerioAPI): ProductAttribute[] {
  const out: ProductAttribute[] = [];
  const seen = new Set<string>();

  const itemSelectors = [
    "div.detail-attr-container li.detail-attr-item",
    ".product-detail-attributes .detail-attr-item",
    ".detail-attr-item",
    "div.product-feature-item",
    ".product-feature-list li",
    ".detail-attr",
    ".product-attribute",
    ".spec-item",
  ].join(", ");

  $(itemSelectors).each((_, el) => {
    const keyEl = $(el)
      .find(
        ".attr-key, .detail-attr-item-key, .attr-name, .feature-name, .spec-key, .detail-attr-item-name",
      )
      .first();
    const valueEl = $(el)
      .find(
        ".attr-value, .detail-attr-item-value, .feature-value, .spec-value, .detail-attr-item-value",
      )
      .first();
    if (keyEl.length && valueEl.length) {
      pushAttr(out, seen, keyEl.text(), valueEl.text(), { source: "trendyol-dom" });
      return;
    }
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const colon = text.indexOf(":");
    if (colon > 0 && colon < text.length - 1) {
      pushAttr(out, seen, text.slice(0, colon), text.slice(colon + 1), {
        source: "trendyol-dom",
      });
    }
  });

  $("table.product-features tr, table.detail-attr-table tr").each((_, el) => {
    const key = $(el).find("th, td").eq(0).text();
    const value = $(el).find("td").last().text();
    if (key && value && key !== value) {
      pushAttr(out, seen, key, value, { source: "trendyol-dom" });
    }
  });

  return out;
}

/**
 * Preferred order: product JSON state → JSON-LD → DOM.
 * First non-empty source wins for the whole set (no cross-merge inventing).
 * Within a source, order is preserved. If JSON is empty, fall through.
 */
export function extractTrendyolProductAttributes(html: string, $?: CheerioAPI): ProductAttribute[] {
  const api = $ || cheerio.load(html);
  const product = getTrendyolProductFromState(html);

  if (product) {
    const fromJson = extractFromProductState(product);
    if (fromJson.length > 0) {
      console.log(`[attributes] source=trendyol-json count=${fromJson.length}`);
      return fromJson;
    }
  }

  const fromLd = extractFromJsonLd(api);
  if (fromLd.length > 0) {
    console.log(`[attributes] source=trendyol-jsonld count=${fromLd.length}`);
    return fromLd;
  }

  const fromDom = extractFromDom(api);
  console.log(`[attributes] source=trendyol-dom count=${fromDom.length}`);
  return fromDom;
}

export function extractTrendyolProductFeatures(
  html: string,
  $?: CheerioAPI,
): Array<{ key: string; value: string }> {
  return attributesToFeaturePairs(extractTrendyolProductAttributes(html, $));
}

/** Trendyol API / Browser Worker raw product JSON — HTML gerekmez. */
export function extractTrendyolProductAttributesFromRaw(
  raw: unknown,
): ProductAttribute[] {
  if (!raw || typeof raw !== "object") return [];
  const fromJson = extractFromProductState(raw as Record<string, unknown>);
  if (fromJson.length > 0) {
    console.log(`[attributes] source=trendyol-json count=${fromJson.length}`);
  }
  return fromJson;
}

export function extractTrendyolProductFeaturesFromRaw(
  raw: unknown,
): Array<{ key: string; value: string }> {
  return attributesToFeaturePairs(extractTrendyolProductAttributesFromRaw(raw));
}
