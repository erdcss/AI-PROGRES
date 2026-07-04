/**
 * Trendyol varyant kaynak probu — fast API, script JSON, DOM (Puppeteer)
 */
import type { Page } from "puppeteer";
import { isConfirmedClothingProduct } from "@shared/clothing-keywords";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";
import { VALID_SIZE_LABEL } from "./variant-shape-normalizer";
import { resolveTrendyolSourceIds } from "./shopify-source-key";
import { isValidTrendyolProductTitle } from "./trendyol-title-utils";
import { filterValidProductImages } from "./trendyol-image-utils";

export const APPAREL_TEXT_REGEX =
  /elbise|tişört|t-shirt|pantolon|etek|gömlek|ceket|ayakkabı|sneaker|bluz|kazak|mont|şort|body|takım/i;

export interface DomSizeProbeButton {
  text: string;
  tagName: string;
  className: string;
  parentClassName: string;
  disabled: boolean;
  ariaDisabled: string | null;
  pointerEvents: string;
  opacity: string;
  textDecoration: string;
  html?: string;
}

export interface DomSizeProbeResult {
  started: boolean;
  success: boolean;
  error?: string;
  rawCount: number;
  sampleRawTexts: string[];
  filteredSizes: string[];
  stateSizes?: string[];
  filteredButtons: DomSizeProbeButton[];
  html?: string;
}

export interface ScriptVariantProbeResult {
  scriptCount: number;
  matchedKeys: string[];
  extractedSizes: string[];
  extractedColors: string[];
  variantCount: number;
  sampleKeys: string[];
}

export interface VariantSourceProbeContext {
  mode?: string;
  fastSizes?: string[];
  sparseVariantDetected?: boolean;
  forcingFullVariantScrape?: boolean;
  browserWorkerEnabled?: boolean;
  puppeteerStarted?: boolean;
  domProbeStarted?: boolean;
  domProbeUrl?: string;
  domProbeSuccess?: boolean;
  domProbeError?: string;
  domSizeButtonsRaw?: string;
  domSizeButtonsFiltered?: string;
  scriptSizes?: string;
}

export function logVariantSourceProbe(ctx: VariantSourceProbeContext): void {
  if (ctx.mode) console.log(`[VariantSourceProbe] mode=${ctx.mode}`);
  if (ctx.fastSizes) console.log(`[VariantSourceProbe] fastSizes=${ctx.fastSizes.join(",") || "none"}`);
  if (ctx.sparseVariantDetected !== undefined) {
    console.log(`[VariantSourceProbe] sparseVariantDetected=${ctx.sparseVariantDetected}`);
  }
  if (ctx.forcingFullVariantScrape !== undefined) {
    console.log(`[VariantSourceProbe] forcingFullVariantScrape=${ctx.forcingFullVariantScrape}`);
  }
  if (ctx.browserWorkerEnabled !== undefined) {
    console.log(`[VariantSourceProbe] browserWorkerEnabled=${ctx.browserWorkerEnabled}`);
  }
  if (ctx.puppeteerStarted !== undefined) {
    console.log(`[VariantSourceProbe] puppeteerStarted=${ctx.puppeteerStarted}`);
  }
  if (ctx.domProbeStarted !== undefined) {
    console.log(`[VariantSourceProbe] domProbeStarted=${ctx.domProbeStarted}`);
  }
  if (ctx.domProbeUrl) console.log(`[VariantSourceProbe] domProbeUrl=${ctx.domProbeUrl}`);
  if (ctx.domProbeSuccess !== undefined) {
    console.log(`[VariantSourceProbe] domProbeSuccess=${ctx.domProbeSuccess}`);
  }
  if (ctx.domProbeError) console.log(`[VariantSourceProbe] domProbeError=${ctx.domProbeError}`);
  if (ctx.domSizeButtonsRaw !== undefined) {
    console.log(`[VariantSourceProbe] domSizeButtonsRaw=${ctx.domSizeButtonsRaw || "none"}`);
  }
  if (ctx.domSizeButtonsFiltered !== undefined) {
    console.log(`[VariantSourceProbe] domSizeButtonsFiltered=${ctx.domSizeButtonsFiltered || "none"}`);
  }
  if (ctx.scriptSizes) console.log(`[VariantSourceProbe] scriptSizes=${ctx.scriptSizes}`);
}

export function isLikelyApparelProduct(
  result: Record<string, unknown>,
  url: string,
): boolean {
  const blob = `${result.title || ""} ${result.category || ""} ${result.description || ""}`;
  if (APPAREL_TEXT_REGEX.test(blob)) return true;
  return isConfirmedClothingProduct(String(result.title || ""), url);
}

export function uniqueValidSizes(sizes: string[]): string[] {
  const out: string[] = [];
  for (const raw of sizes) {
    const t = String(raw || "").trim();
    if (!t || !VALID_SIZE_LABEL.test(t)) continue;
    const norm = t.toUpperCase() === "STD" ? "Standart" : t.toUpperCase();
    const key = norm.toUpperCase();
    if (!out.some((x) => x.toUpperCase() === key)) out.push(norm);
  }
  return out;
}

export function countValidSizesFromAnySource(result: Record<string, unknown>): number {
  return extractFastSizes(result).length;
}

export function extractFastSizes(result: Record<string, unknown>): string[] {
  const sizes = new Set<string>();
  const v = result.variants;
  if (v && typeof v === "object") {
    const sanitized = sanitizeTrendyolVariants(v, {
      productTitle: String(result.title || ""),
    });
    for (const s of sanitized.sizes ?? []) {
      if (VALID_SIZE_LABEL.test(s)) sizes.add(s);
    }
    for (const item of sanitized.allVariants ?? []) {
      if (item.size && VALID_SIZE_LABEL.test(item.size)) sizes.add(item.size);
    }
    const stockMap = (v as Record<string, unknown>).stockMap;
    if (stockMap && typeof stockMap === "object") {
      for (const key of Object.keys(stockMap as Record<string, boolean>)) {
        const part = key.split("-").pop() || key;
        if (VALID_SIZE_LABEL.test(part)) sizes.add(part);
      }
    }
  }
  if (Array.isArray(result.domSizeButtons)) {
    for (const s of result.domSizeButtons as string[]) {
      if (VALID_SIZE_LABEL.test(s)) sizes.add(s);
    }
  }
  return uniqueValidSizes([...sizes]);
}

const SCRIPT_SIZE_KEYS =
  /"attributeName"\s*:\s*"(?:Beden|Size)"[\s\S]*?"attributeValue"\s*:\s*"([^"]+)"/gi;

export function probeScriptVariantsFromHtml(html: string): ScriptVariantProbeResult {
  const matchedKeys = new Set<string>();
  const extractedSizes = new Set<string>();
  const extractedColors = new Set<string>();
  const sampleKeys: string[] = [];

  const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) ?? [];
  console.log(`[ScriptVariantProbe] scriptCount=${scriptMatches.length}`);

  for (const script of scriptMatches) {
    for (const key of [
      "variants",
      "allVariants",
      "productVariants",
      "variantAttributes",
      "slicingAttributes",
      "attributes",
      "attributeValue",
      "size",
      "sizeName",
      "Beden",
    ]) {
      if (script.includes(key)) matchedKeys.add(key);
    }

    let m: RegExpExecArray | null;
    SCRIPT_SIZE_KEYS.lastIndex = 0;
    while ((m = SCRIPT_SIZE_KEYS.exec(script)) !== null) {
      const size = m[1]?.trim();
      if (size && VALID_SIZE_LABEL.test(size)) extractedSizes.add(size);
    }

    const sizeNameMatches = script.matchAll(
      /"(?:sizeName|size|beden|attributeValue)"\s*:\s*"(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d{2})"/gi,
    );
    for (const sm of sizeNameMatches) {
      const size = sm[1]?.trim();
      if (size && VALID_SIZE_LABEL.test(size)) extractedSizes.add(size);
    }

    const colorMatches = script.matchAll(
      /"(?:colorName|color|renk)"\s*:\s*"([^"]{2,40})"/gi,
    );
    for (const cm of colorMatches) {
      const c = cm[1]?.trim();
      if (c && !/renk bilgisi yok/i.test(c)) extractedColors.add(c);
    }
  }

  const keys = [...matchedKeys];
  const sizes = uniqueValidSizes([...extractedSizes]);
  console.log(`[ScriptVariantProbe] matchedKeys=${keys.join(",") || "none"}`);
  console.log(`[ScriptVariantProbe] extractedSizes=${sizes.join(",") || "none"}`);
  console.log(`[ScriptVariantProbe] extractedColors=${[...extractedColors].join(",") || "none"}`);

  return {
    scriptCount: scriptMatches.length,
    matchedKeys: keys,
    extractedSizes: sizes,
    extractedColors: [...extractedColors],
    variantCount: sizes.length,
    sampleKeys: keys.slice(0, 12),
  };
}

/** page.evaluate — Trendyol JS state slicedAttributes beden listesi */
export function stateSizeProbeEvaluateScript(): string[] {
  const sizeRegex =
    /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|32|34|36|38|40|42|44|46|48|50|52|Standart|STD|Tek Ebat)$/i;
  const sizes: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const t = raw.trim();
    if (!t || !sizeRegex.test(t)) return;
    const norm = t.toUpperCase() === "STD" ? "Standart" : t;
    const key = norm.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    sizes.push(norm);
  };

  const win = window as unknown as {
    __PRODUCT_DETAIL_APP_INITIAL_STATE__?: { product?: Record<string, unknown> };
  };
  const product = win.__PRODUCT_DETAIL_APP_INITIAL_STATE__?.product;
  if (!product) return sizes;

  const sliced = product.slicedAttributes;
  if (Array.isArray(sliced)) {
    for (const attr of sliced) {
      if (!attr || typeof attr !== "object") continue;
      const rec = attr as Record<string, unknown>;
      const attrName = String(rec.attributeName ?? rec.name ?? "").toLowerCase();
      const isSize =
        attrName === "beden" ||
        attrName === "size" ||
        attrName.includes("yaş") ||
        attrName.includes("yas");
      if (!isSize) continue;
      const items = rec.attributes ?? rec.items ?? rec.values;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const val = String(
          (item as Record<string, unknown>).attributeValue ??
            (item as Record<string, unknown>).value ??
            "",
        );
        push(val);
      }
    }
  }

  const variants = product.variants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (!v || typeof v !== "object") continue;
      const rec = v as Record<string, unknown>;
      if (rec.attributeType === 2 || rec.attributeType === "2") {
        push(String(rec.attributeValue ?? rec.value ?? ""));
      }
    }
  }

  return sizes;
}

export function extractSizesFromPuppeteerSnapshot(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const rec = snapshot as { sizesByColor?: Record<string, Array<{ name?: string }>> };
  const sizes: string[] = [];
  for (const list of Object.values(rec.sizesByColor ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const name = String(item?.name ?? "").trim();
      if (name && VALID_SIZE_LABEL.test(name)) sizes.push(name);
    }
  }
  return uniqueValidSizes(sizes);
}

export async function collectSizesFromHtml(html: string): Promise<string[]> {
  const sizes = new Set<string>();

  const scriptProbe = probeScriptVariantsFromHtml(html);
  for (const s of scriptProbe.extractedSizes) sizes.add(s);

  const { parseSlicingAttributesFromHtml } = await import("./trendyol-slicing-parser");
  const slicing = parseSlicingAttributesFromHtml(html);
  for (const s of slicing.sizes) {
    if (VALID_SIZE_LABEL.test(s.name)) sizes.add(s.name);
  }

  try {
    const cheerio = await import("cheerio");
    const { detectRealStockStatus } = await import("./real-stock-detector");
    const $ = cheerio.load(html);
    const real = detectRealStockStatus($, html);
    for (const v of real) {
      if (v.size && VALID_SIZE_LABEL.test(v.size)) sizes.add(v.size);
    }
  } catch {
    /* optional */
  }

  return uniqueValidSizes([...sizes]);
}

/** page.evaluate içinde çalışır — tüm beden butonlarını tarar (sadece selected değil) */
export function domSizeProbeEvaluateScript(): DomSizeProbeResult {
  const sizeRegex =
    /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|32|34|36|38|40|42|44|46|48|50|52|Standart|STD|Tek Ebat)$/i;
  const rejectRegex =
    /sepete|ekle|kupon|favori|yorum|kargo|satıcı|fiyat|ürün|son\s+\d+|stok|beden\s+seç|tüm bedenler|önerilen/i;

  const selectors = [
    '[data-testid*="size"]',
    '[data-test*="size"]',
    '[class*="size"]',
    '[class*="Size"]',
    '[class*="variant"]',
    '[class*="Variant"]',
    '[class*="sp-itm"]',
    ".sp-itm",
    ".size-variant",
    ".variant-options button",
    ".product-size button",
    ".pr-in-sz button",
    ".pr-in-sz span",
    ".slicing-attribute-section-value button",
    ".slicing-attribute-section-value a",
    "button",
    '[role="button"]',
    "li",
    "span",
  ];

  const nodes = Array.from(document.querySelectorAll(selectors.join(",")));

  const raw = nodes.map((el) => {
    const htmlEl = el as HTMLElement;
    const text = (htmlEl.innerText || htmlEl.textContent || "").trim();
    const style = window.getComputedStyle(htmlEl);
    const parent = htmlEl.parentElement;

    return {
      text,
      tagName: el.tagName,
      className: String((el as HTMLElement).className || ""),
      parentClassName: String(parent?.className || ""),
      disabled: Boolean((el as HTMLButtonElement).disabled),
      ariaDisabled: el.getAttribute("aria-disabled"),
      pointerEvents: style.pointerEvents,
      opacity: style.opacity,
      textDecoration: style.textDecorationLine,
      html: (el as HTMLElement).outerHTML?.slice(0, 300),
    };
  });

  const filtered = raw
    .map((x) => ({ ...x, text: x.text.replace(/\s+/g, " ").trim() }))
    .filter((x) => x.text && x.text.length <= 20)
    .filter((x) => !rejectRegex.test(x.text))
    .filter((x) => sizeRegex.test(x.text));

  const uniqueSizes = Array.from(new Set(filtered.map((x) => x.text.toUpperCase())));

  return {
    started: true,
    success: uniqueSizes.length > 0,
    rawCount: raw.length,
    sampleRawTexts: raw.map((x) => x.text).filter(Boolean).slice(0, 80),
    filteredSizes: uniqueSizes,
    filteredButtons: filtered,
  };
}

export async function probeTrendyolDomSizes(page: Page): Promise<DomSizeProbeResult> {
  try {
    await page.waitForSelector("body", { timeout: 10_000 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2500));
    try {
      await page.waitForFunction(
        'document.querySelectorAll("button, [role=button], .pr-in-sz span, .sp-itm").length > 0',
        { timeout: 8000 },
      );
    } catch {
      /* hydrate timeout — still probe */
    }
    const result = await page.evaluate(domSizeProbeEvaluateScript);
    let stateSizes: string[] = [];
    try {
      stateSizes = await page.evaluate(stateSizeProbeEvaluateScript);
    } catch {
      stateSizes = [];
    }
    const mergedFiltered = uniqueValidSizes([...result.filteredSizes, ...stateSizes]);
    return {
      ...result,
      started: true,
      success: mergedFiltered.length > 0,
      filteredSizes: mergedFiltered,
      stateSizes,
    };
  } catch (err) {
    return {
      started: true,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      rawCount: 0,
      sampleRawTexts: [],
      filteredSizes: [],
      filteredButtons: [],
    };
  }
}

export async function runTrendyolDomSizeProbe(url: string): Promise<DomSizeProbeResult> {
  const { puppeteerAllowed } = await import("@shared/deploy-runtime");
  if (!puppeteerAllowed()) {
    return {
      started: false,
      success: false,
      error: "puppeteer-disabled",
      rawCount: 0,
      sampleRawTexts: [],
      filteredSizes: [],
      filteredButtons: [],
    };
  }

  let browser: Awaited<ReturnType<typeof import("puppeteer-extra").default.launch>> | null = null;
  try {
    const puppeteerExtra = (await import("puppeteer-extra")).default;
    const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
    puppeteerExtra.use(StealthPlugin());
    const { buildLaunchOptions } = await import("./puppeteer-config");
    const { getSessionBrowserFingerprint } = await import("./browser-fingerprint");
    browser = await puppeteerExtra.launch(buildLaunchOptions({ headless: true }));
    const page = await browser.newPage();
    const fp = getSessionBrowserFingerprint();
    await page.setUserAgent(fp.userAgent);
    await page.setViewport(fp.viewport);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const probe = await probeTrendyolDomSizes(page);
    const html = await page.content();
    return { ...probe, html };
  } catch (err) {
    return {
      started: true,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      rawCount: 0,
      sampleRawTexts: [],
      filteredSizes: [],
      filteredButtons: [],
    };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export function applySparseApparelPolicy(
  result: Record<string, unknown>,
  url: string,
): { requiresFullVariantScrape: boolean; rawSizeCount: number } {
  const isLikelyApparel = isLikelyApparelProduct(result, url);
  const rawSizeCount = countValidSizesFromAnySource(result);

  if (isLikelyApparel && rawSizeCount <= 1) {
    result.requiresFullVariantScrape = true;
    result.variantDiagnostics = {
      ...((result.variantDiagnostics as Record<string, unknown>) || {}),
      sparseVariantDetected: true,
      reason: "apparel_product_has_only_one_size_from_fast_scrape",
      fastSizeCount: rawSizeCount,
    };
  }

  return {
    requiresFullVariantScrape: Boolean(result.requiresFullVariantScrape),
    rawSizeCount,
  };
}

/** Kıyafet + tek beden ise DOM/script full tarama zorunlu */
export async function applyFullVariantScrapeToResult(
  url: string,
  result: Record<string, unknown>,
  opts: { html?: string | null; mode?: string; browserWorkerEnabled?: boolean } = {},
): Promise<void> {
  const fastSizes = extractFastSizes(result);
  const policy = applySparseApparelPolicy(result, url);
  const forcing = policy.requiresFullVariantScrape;

  let scriptSizes: string[] = [];
  if (opts.html && opts.html.length > 500) {
    const scriptProbe = probeScriptVariantsFromHtml(opts.html);
    scriptSizes = scriptProbe.extractedSizes;
    result.scriptVariantProbe = scriptProbe;
  }

  logVariantSourceProbe({
    mode: opts.mode ?? "auto-fast",
    fastSizes,
    sparseVariantDetected: forcing,
    forcingFullVariantScrape: forcing,
    browserWorkerEnabled: opts.browserWorkerEnabled,
    scriptSizes: scriptSizes.join(",") || "none",
  });

  if (!forcing && fastSizes.length > 1) return;

  result.fullVariantScrapeAttempted = true;
  const domProbe = await runTrendyolDomSizeProbe(url);

  if (domProbe.html && domProbe.html.length > 5000) {
    const { parseTrendyolCoreFromHtml, mergeTrendyolHtmlCoreIntoResult } = await import(
      "./trendyol-puppeteer-html-merge"
    );
    const fields = {
      hasTitle: Boolean(result.title && isValidTrendyolProductTitle(String(result.title))),
      hasPrice: Boolean(
        (result.price as { original?: number } | undefined)?.original &&
          (result.price as { original: number }).original > 0,
      ),
      hasImages: filterValidProductImages((result.images as string[]) || []).length > 0,
    };
    if (!fields.hasTitle || !fields.hasPrice || !fields.hasImages) {
      const parsed = parseTrendyolCoreFromHtml(domProbe.html, url, "dom-probe-html");
      if (parsed) {
        mergeTrendyolHtmlCoreIntoResult(result, parsed, url);
        console.log(`✅ DOM probe core backfill: title=${Boolean(result.title)} price=${(result.price as any)?.original || 0}`);
      }
    }
  }

  logVariantSourceProbe({
    puppeteerStarted: domProbe.started,
    domProbeStarted: domProbe.started,
    domProbeUrl: url,
    domProbeSuccess: domProbe.success,
    domProbeError: domProbe.error,
    domSizeButtonsRaw: domProbe.sampleRawTexts.slice(0, 30).join("|") || "none",
    domSizeButtonsFiltered: domProbe.filteredSizes.join(",") || "none",
    scriptSizes: domProbe.stateSizes?.join(",") ? `state:${domProbe.stateSizes.join(",")}` : undefined,
  });

  const puppeteerSizes = extractSizesFromPuppeteerSnapshot(result.puppeteerStockSnapshot);

  let htmlMergedSizes: string[] = [];
  const htmlCandidates = [opts.html, domProbe.html].filter(
    (h): h is string => typeof h === "string" && h.length > 500,
  );
  for (const html of htmlCandidates) {
    const fromHtml = await collectSizesFromHtml(html);
    htmlMergedSizes = uniqueValidSizes([...htmlMergedSizes, ...fromHtml]);
    if (!result.htmlContent) result.htmlContent = html;
  }

  let apiSizes: string[] = [];
  if (forcing || fastSizes.length <= 1 || domProbe.filteredSizes.length <= 1) {
    try {
      const { fetchTrendyolProductByUrl } = await import("./trendyol-product-api");
      const apiProduct = await fetchTrendyolProductByUrl(url);
      apiSizes = extractFastSizes({
        variants: apiProduct?.variants,
        title: apiProduct?.title || "",
      });
    } catch {
      /* API fallback optional */
    }
  }

  let merged = uniqueValidSizes([
    ...fastSizes,
    ...scriptSizes,
    ...domProbe.filteredSizes,
    ...(domProbe.stateSizes ?? []),
    ...puppeteerSizes,
    ...htmlMergedSizes,
    ...apiSizes,
  ]);
  result.domProbe = domProbe;

  if (merged.length > fastSizes.length || (forcing && merged.length > 0)) {
    result.domSizeButtons = merged;
    const existing = sanitizeTrendyolVariants(result.variants, {
      productTitle: String(result.title || ""),
    });
    const color = existing.colors?.[0] || "Tek Renk";
    const allVariants = merged.map((size) => {
      const prev = existing.allVariants?.find((v) => v.size?.toUpperCase() === size.toUpperCase());
      const domBtn = domProbe.filteredButtons.find(
        (b) => b.text.toUpperCase() === size.toUpperCase(),
      );
      const oos =
        domBtn?.disabled === true ||
        domBtn?.ariaDisabled === "true" ||
        parseFloat(domBtn?.opacity || "1") < 0.45;
      return { color, size, inStock: prev?.inStock ?? !oos };
    });
    const stockMap: Record<string, boolean> = {};
    for (const v of allVariants) {
      stockMap[`${v.color}-${v.size}`] = v.inStock;
    }
    result.variants = {
      colors: [color],
      sizes: merged,
      allVariants,
      stockMap,
      items: allVariants,
    };
  }

  const stockHtml =
    (typeof domProbe.html === "string" && domProbe.html.length > 500
      ? domProbe.html
      : null) ||
    (opts.html && opts.html.length > 500 ? opts.html : null);

  if (stockHtml) {
    const { applyStockNormalizationToScrapeResult } = await import(
      "./trendyol-variant-stock-normalizer"
    );
    applyStockNormalizationToScrapeResult(result, { html: stockHtml, url });
  }

  const winner =
    domProbe.filteredSizes.length >= scriptSizes.length &&
    domProbe.filteredSizes.length >= fastSizes.length
      ? "dom"
      : scriptSizes.length >= fastSizes.length
        ? "script"
        : "fast";

  result.variantDiagnostics = {
    ...((result.variantDiagnostics as Record<string, unknown>) || {}),
    domSizeButtons: domProbe.filteredSizes,
    rawDomSizeCount: domProbe.filteredSizes.length,
    scriptSizes,
    fullVariantScrapeAttempted: true,
    sizeSourceWinner: winner,
    mergedSizeCount: merged.length,
  };

  if (
    isLikelyApparelProduct(result, url) &&
    merged.length <= 1 &&
    result.fullVariantScrapeAttempted
  ) {
    result.manualReviewRequired = true;
    result.shopifyUploadBlocked = true;
    result.variantExtractionFailed = true;
    result.variantBlockReason =
      "Kıyafet ürünü için sadece 1 beden tespit edildi. Full DOM/API varyant taraması yeterli veri döndürmedi.";
  }
}

export interface TrendyolVariantSourcesDebug {
  urlProductId: string | null;
  parsedProductId: string | null;
  selectedSourceProductId: string;
  sources: {
    fastApi: {
      sizes: string[];
      colors: string[];
      items: unknown[];
      stockMap: Record<string, boolean>;
    };
    scriptJson: ScriptVariantProbeResult;
    domProbe: DomSizeProbeResult & { htmlLength?: number };
    canonical: { sizes: string[]; variantCount: number } | null;
  };
}

export async function collectTrendyolVariantSources(url: string): Promise<TrendyolVariantSourcesDebug> {
  const { fetchTrendyolProductByUrl } = await import("./trendyol-product-api");
  const { buildCanonicalProductForShopify } = await import("./variant-shape-normalizer");

  const apiProduct = await fetchTrendyolProductByUrl(url);
  const fastResult: Record<string, unknown> = {
    title: apiProduct?.title || "",
    variants: apiProduct?.variants,
  };
  const fastSizes = extractFastSizes(fastResult);
  const sanitized = sanitizeTrendyolVariants(apiProduct?.variants, {
    productTitle: apiProduct?.title || "",
  });

  const domProbe = await runTrendyolDomSizeProbe(url);

  const scriptJson =
    domProbe.html && domProbe.html.length > 500
      ? probeScriptVariantsFromHtml(domProbe.html)
      : { scriptCount: 0, matchedKeys: [], extractedSizes: [], extractedColors: [], variantCount: 0, sampleKeys: [] };

  const sourceIds = resolveTrendyolSourceIds(url, apiProduct?.rawProduct?.id);
  const mergedSizes = uniqueValidSizes([
    ...fastSizes,
    ...scriptJson.extractedSizes,
    ...domProbe.filteredSizes,
  ]);

  const canonical = buildCanonicalProductForShopify({
    scrapeResult: {
      title: apiProduct?.title || "Ürün",
      brand: apiProduct?.brand || "",
      price: apiProduct?.price,
      variants: apiProduct?.variants,
      domSizeButtons: mergedSizes,
      variantDiagnostics: {
        domSizeButtons: domProbe.filteredSizes,
        rawDomSizeCount: domProbe.filteredSizes.length,
        scriptSizes: scriptJson.extractedSizes,
        fullVariantScrapeAttempted: true,
        sizeSourceWinner: domProbe.filteredSizes.length > fastSizes.length ? "dom" : "fast",
      },
    },
    sourceUrl: url,
  });

  return {
    urlProductId: sourceIds.urlProductId,
    parsedProductId: sourceIds.parsedProductId,
    selectedSourceProductId: sourceIds.selectedSourceProductId,
    sources: {
      fastApi: {
        sizes: fastSizes,
        colors: sanitized.colors ?? [],
        items: (apiProduct?.variants as Record<string, unknown>)?.items ?? [],
        stockMap:
          ((apiProduct?.variants as Record<string, unknown>)?.stockMap as Record<string, boolean>) ??
          {},
      },
      scriptJson,
      domProbe,
      canonical: canonical
        ? {
            sizes: [...new Set(canonical.variants.map((v) => v.size))],
            variantCount: canonical.variants.length,
          }
        : null,
    },
  };
}
