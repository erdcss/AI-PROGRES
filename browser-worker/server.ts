import "dotenv/config";
import express from "express";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  COLOR_FAMILY_CONCURRENCY,
  COLOR_FAMILY_MAX_MEMBERS,
  COLOR_FAMILY_MEMBER_HYDRATION_TIMEOUT_MS,
  COLOR_FAMILY_MEMBER_TIMEOUT_MS,
  COLOR_FAMILY_TOTAL_DEADLINE_MS,
  extractColorSiblingCandidatesFromHtml,
  extractColorSiblingCandidatesFromProduct,
  finalizeColorSiblingCandidateList,
  mapPool,
  mergeColorSiblingCandidates,
  normalizeColorSiblingUrl,
  type TrendyolColorSiblingCandidate,
} from "../server/trendyol-color-sibling-extract";
import {
  extractProductIdFromUnknown,
  extractSizesFromProductState,
  isolateMemberVariants,
  normalizeDisplayColorPair,
  resolveColorFromProductState,
  type TrendyolHydratedMemberSnapshot,
} from "../server/trendyol-hydrated-member";
import { filterValidProductImages, normalizeTrendyolImages } from "../shared/trendyol-product-images";

type TrendyolColorFamilyMember = {
  productId: string;
  url: string;
  finalUrl?: string;
  color: string;
  images: string[];
  rawProductJson?: Record<string, unknown> | null;
  html?: string;
  ok: boolean;
  error?: string;
  hydratedSnapshot?: TrendyolHydratedMemberSnapshot;
};

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.BROWSER_WORKER_TOKEN?.trim();
const NAV_TIMEOUT_MS = Number(process.env.BROWSER_NAV_TIMEOUT_MS ?? 40_000);
const STARTED_AT = Date.now();

if (!TOKEN) {
  console.error("BROWSER_WORKER_TOKEN tanımlı değil — worker başlatılamıyor.");
  process.exit(1);
}

let browser: Browser | null = null;
let browserReady = false;

export type BrowserWorkerErrorCategory =
  | "timeout"
  | "blocked"
  | "navigation"
  | "auth"
  | "invalid-url"
  | "unknown";

function extractToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const header = req.headers["x-browser-worker-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    return true;
  }
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === "0.0.0.0") return true;
  return false;
}

export function validatePublicHttpUrl(raw: string): URL {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new Error("invalid-url");
  const u = new URL(trimmed);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid-url");
  if (isPrivateHost(u.hostname)) throw new Error("invalid-url");
  return u;
}

function extractBalancedJsonObject(html: string, startIndex: number): unknown | null {
  const open = html.indexOf("{", startIndex);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseTrendyolProductDetailState(html: string): Record<string, unknown> | null {
  const markers = [
    "window.__PRODUCT_DETAIL_APP_INITIAL_STATE__=",
    "window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ =",
    "__PRODUCT_DETAIL_APP_INITIAL_STATE__=",
    "__PRODUCT_DETAIL_APP_INITIAL_STATE__ =",
  ];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const state = extractBalancedJsonObject(html, idx + marker.length);
    if (state && typeof state === "object") return state as Record<string, unknown>;
  }
  return null;
}

function extractJsonLdFromHtml(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1].trim()));
    } catch {
      // skip invalid blocks
    }
  }
  return results;
}

function buildRawProductJson(state: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!state) return null;
  const product = state.product;
  if (product && typeof product === "object") return product as Record<string, unknown>;
  return state;
}

function collectImagesFromProduct(product: Record<string, unknown> | null): string[] {
  if (!product) return [];
  const nested =
    product.product && typeof product.product === "object"
      ? (product.product as Record<string, unknown>)
      : product;
  const buckets: unknown[] = [];
  for (const key of [
    "images",
    "productImages",
    "galleryImages",
    "imageUrls",
    "imagesList",
    "gallery",
    "medias",
  ]) {
    if (nested[key] != null) buckets.push(nested[key]);
  }
  const media = nested.media;
  if (media && typeof media === "object") {
    buckets.push((media as Record<string, unknown>).images);
  }
  buckets.push(nested.image, nested.imageUrl, nested.thumbnailUrl);
  const raw: string[] = [];
  for (const b of buckets) {
    raw.push(...normalizeTrendyolImages(b));
  }
  return filterValidProductImages(raw);
}

function pickColorName(product: Record<string, unknown> | null, fallback?: string): string {
  const resolved = resolveColorFromProductState(product, fallback);
  return resolved.color || fallback || "";
}

function isProductApiUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("productdetail") ||
    u.includes("discovery-web-productgw-service") ||
    u.includes("discovery-web-productdetailgw-service") ||
    u.includes("webmobileapi/v1/product") ||
    u.includes("/product-detail") ||
    u.includes("/product/") ||
    (u.includes("mobile") && u.includes("product"))
  );
}

function collectApiImages(payload: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    for (const key of [
      "images",
      "productImages",
      "galleryImages",
      "imageUrls",
      "imageUrl",
      "thumbnailUrl",
      "url",
    ]) {
      if (rec[key] != null) out.push(...normalizeTrendyolImages(rec[key]));
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(payload, 0);
  return filterValidProductImages(out);
}

async function waitForMemberHydration(
  page: Page,
  requestedProductId: string,
  hydrationTimeoutMs: number,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (expectedId: string) => {
        const state = (window as unknown as Record<string, unknown>)
          .__PRODUCT_DETAIL_APP_INITIAL_STATE__ as
          | { product?: { id?: unknown; productId?: unknown; contentId?: unknown } }
          | undefined;
        const product = state?.product;
        const stateId = String(product?.productId ?? product?.contentId ?? product?.id ?? "").replace(
          /\D/g,
          "",
        );
        const stateOk = Boolean(product) && (!expectedId || !stateId || stateId === expectedId);

        const galleryOk = Boolean(
          document.querySelector(
            '[data-testid*="gallery"] img, .gallery-container img, .product-slide img, .slick-slide img, .product-image-container img',
          ),
        );

        const sizeOk = Boolean(
          document.querySelector(
            '[data-testid*="size"], [data-test*="size"], .pr-in-sz, .sp-itm, [class*="size-variant"], [class*="slicing-attribute"]',
          ),
        );

        return stateOk || (Boolean(product) && (galleryOk || sizeOk));
      },
      requestedProductId,
      { timeout: hydrationTimeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

async function scrollMemberSectionsIntoView(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const selectors = [
        '[class*="slicing"]',
        '[data-testid*="color"]',
        '[data-testid*="size"]',
        ".pr-in-sz",
        '[class*="gallery"]',
        ".product-slide",
        ".slick-slide",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && "scrollIntoView" in el) {
          (el as HTMLElement).scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        }
      }
    })
    .catch(() => undefined);
  await page.waitForTimeout(450);
}

type DomHydrationExtract = {
  colorLabel: string;
  images: string[];
  srcsetCount: number;
  sizes: Array<{ name: string; inStock: boolean; disabledReason?: string }>;
  galleryFound: boolean;
  sizeSectionFound: boolean;
  stateProductId: string;
  stateColor: string;
};

async function extractDomHydration(page: Page): Promise<DomHydrationExtract> {
  return page.evaluate(() => {
    const VALID_SIZE =
      /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|32|34|36|38|40|42|44|46|48|50|Standart|STD|Tek Ebat)$/i;
    const COMBO_SIZE =
      /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL)\s*[\/\\-]\s*(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i;

    const pickLargestSrcset = (srcset: string): string | null => {
      let best: string | null = null;
      let bestW = -1;
      for (const part of srcset.split(",")) {
        const bits = part.trim().split(/\s+/);
        const url = bits[0];
        if (!url) continue;
        const wMatch = bits[1]?.match(/(\d+)w/i);
        const w = wMatch ? Number(wMatch[1]) : 0;
        if (w >= bestW) {
          bestW = w;
          best = url;
        }
      }
      return best;
    };

    const imgUrlFromEl = (img: Element): string | null => {
      const el = img as HTMLImageElement;
      const attrs = [
        el.getAttribute("src"),
        el.getAttribute("data-src"),
        el.getAttribute("data-original"),
        el.getAttribute("data-lazy-src"),
        el.getAttribute("data-zoom-image"),
      ];
      for (const a of attrs) {
        if (a && a.trim() && !a.startsWith("data:")) return a.trim();
      }
      const srcset =
        el.getAttribute("srcset") ||
        el.getAttribute("data-srcset") ||
        el.parentElement?.querySelector("source")?.getAttribute("srcset");
      if (srcset) return pickLargestSrcset(srcset);
      return null;
    };

    const galleryRoots = [
      ...document.querySelectorAll(
        '[data-testid*="gallery"], .gallery-container, .product-slide-container, .product-images, .base-product-image, [class*="gallery"], [class*="product-image"]',
      ),
    ];
    const imageCandidates: string[] = [];
    let srcsetCount = 0;
    const scanImgs = (root: ParentNode) => {
      root.querySelectorAll("img, source").forEach((el) => {
        if (el.tagName.toLowerCase() === "source") {
          const ss = el.getAttribute("srcset");
          if (ss) {
            const best = pickLargestSrcset(ss);
            if (best) {
              imageCandidates.push(best);
              srcsetCount++;
            }
          }
          return;
        }
        if (el.getAttribute("srcset") || el.getAttribute("data-srcset")) srcsetCount++;
        const u = imgUrlFromEl(el);
        if (u) imageCandidates.push(u);
      });
    };
    if (galleryRoots.length) {
      for (const root of galleryRoots) scanImgs(root);
    } else {
      document
        .querySelectorAll(".slick-slide img, .product-slide img, [class*='zoom'] img")
        .forEach((el) => {
          const u = imgUrlFromEl(el);
          if (u) imageCandidates.push(u);
        });
    }

    const rejectHint =
      /logo|icon|badge|kampanya|cargo|kargo|seller|yorum|review|favicon|avatar|brand/i;
    const images = [...new Set(imageCandidates)].filter((u) => !rejectHint.test(u));

    const sizeRoots = [
      ...document.querySelectorAll(
        '[data-testid*="size"], [data-test*="size"], [data-testid="size-variant-item"], .pr-in-sz, [class*="size-variant"], [class*="slicing-attribute"], [class*="variants"]',
      ),
    ];
    const sizes: Array<{ name: string; inStock: boolean; disabledReason?: string }> = [];
    const seenSize = new Set<string>();
    const pushSize = (name: string, el: Element) => {
      const n = name.trim();
      if ((!VALID_SIZE.test(n) && !COMBO_SIZE.test(n)) || seenSize.has(n.toUpperCase())) return;
      seenSize.add(n.toUpperCase());
      const cls = `${el.className || ""} ${el.getAttribute("aria-disabled") || ""}`.toLowerCase();
      const style = window.getComputedStyle(el);
      const deco = `${style.textDecoration || ""} ${style.textDecorationLine || ""}`.toLowerCase();
      const parentCls = `${el.parentElement?.className || ""}`.toLowerCase();
      const disabled =
        (el as HTMLButtonElement).disabled === true ||
        el.getAttribute("aria-disabled") === "true" ||
        el.getAttribute("data-disabled") === "true" ||
        /disabled|passive|sold-out|outofstock|out-of-stock|tükendi|tukendi|line-through|strikethrough|crossed/.test(
          cls,
        ) ||
        /disabled|passive|line-through|strikethrough/.test(parentCls) ||
        deco.includes("line-through");
      sizes.push({
        name: n,
        inStock: !disabled,
        disabledReason: disabled ? "dom-disabled" : undefined,
      });
    };

    const sizeSelectors =
      '[data-testid*="size"], [data-test*="size"], .pr-in-sz .sp-itm, .sp-itm, [class*="size-variant"] button, [class*="size-variant"] span, button, [role="button"]';
    for (const root of sizeRoots.length ? sizeRoots : [document.body]) {
      // Beden bölümü yoksa body taraması yapma — gürültü riski
      if (root === document.body && sizeRoots.length === 0) break;
      root.querySelectorAll(sizeSelectors).forEach((el) => {
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (text.length > 12) return;
        pushSize(text, el);
      });
    }

    let colorLabel = "";
    const colorLabelEl = Array.from(document.querySelectorAll("span, div, p, li")).find((el) =>
      /^renk\s*:/i.test((el.textContent || "").trim()),
    );
    if (colorLabelEl) {
      colorLabel = (colorLabelEl.textContent || "")
        .replace(/^renk\s*:\s*/i, "")
        .replace(/popüler/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    const state = (window as unknown as Record<string, unknown>)
      .__PRODUCT_DETAIL_APP_INITIAL_STATE__ as
      | { product?: Record<string, unknown> }
      | undefined;
    const product = state?.product;
    const stateProductId = String(
      product?.productId ?? product?.contentId ?? product?.id ?? "",
    ).replace(/\D/g, "");
    const stateColor = String(product?.color ?? product?.renk ?? "").trim();

    return {
      colorLabel,
      images,
      srcsetCount,
      sizes,
      galleryFound: galleryRoots.length > 0 || images.length > 0,
      sizeSectionFound: sizeRoots.length > 0 || sizes.length > 0,
      stateProductId,
      stateColor,
    };
  });
}

async function buildHydratedMemberSnapshot(input: {
  page: Page;
  requestedUrl: string;
  requestedProductId: string;
  candidateColor?: string;
  capturedApiPayloads: unknown[];
  includeHtml: boolean;
  navTimeoutMs: number;
  hydrationTimeoutMs: number;
}): Promise<TrendyolColorFamilyMember> {
  const {
    page,
    requestedUrl,
    requestedProductId,
    candidateColor,
    capturedApiPayloads,
    includeHtml,
    navTimeoutMs,
    hydrationTimeoutMs,
  } = input;

  const warnings: string[] = [];
  let apiResponseCaptured = false;

  const onResponse = async (response: import("playwright").Response) => {
    try {
      const u = response.url();
      if (!isProductApiUrl(u)) return;
      if (response.status() >= 400) return;
      const ct = response.headers()["content-type"] || "";
      if (!ct.includes("json") && !ct.includes("javascript")) return;
      const json = await response.json().catch(() => null);
      if (!json) return;
      const asStr = JSON.stringify(json);
      if (requestedProductId && !asStr.includes(requestedProductId)) return;
      capturedApiPayloads.push(json);
      apiResponseCaptured = true;
    } catch {
      // ignore listener errors
    }
  };

  page.on("response", onResponse);
  try {
    await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: navTimeoutMs });
    const hydrationCompleted = await waitForMemberHydration(
      page,
      requestedProductId,
      hydrationTimeoutMs,
    );
    await scrollMemberSectionsIntoView(page);

    const html = await page.content();
    const state = parseTrendyolProductDetailState(html);
    const rawProductJson = buildRawProductJson(state);
    const dom = await extractDomHydration(page);
    const finalUrl = page.url();

    const resolvedFromState = extractProductIdFromUnknown(rawProductJson) || dom.stateProductId;
    const resolvedProductId = resolvedFromState || requestedProductId;
    const productIdMatched =
      !requestedProductId ||
      !resolvedFromState ||
      resolvedFromState === requestedProductId;

    if (!productIdMatched) {
      warnings.push(
        `productId-mismatch:requested=${requestedProductId}:resolved=${resolvedFromState}`,
      );
    }

    const colorResolved = resolveColorFromProductState(
      rawProductJson,
      dom.colorLabel || dom.stateColor || candidateColor,
    );
    let color = colorResolved.color;
    let colorSource = colorResolved.source;
    let displayColor = colorResolved.displayColor;
    if (!color && candidateColor) {
      const pair = normalizeDisplayColorPair(candidateColor);
      color = pair.normalizedColor || pair.displayColor;
      displayColor = pair.displayColor;
      colorSource = "candidate";
    }
    if (!color && dom.colorLabel) {
      const pair = normalizeDisplayColorPair(dom.colorLabel);
      color = pair.normalizedColor || pair.displayColor;
      displayColor = pair.displayColor;
      colorSource = "dom_label";
    }

    const stateImages = collectImagesFromProduct(rawProductJson);
    const apiImages = filterValidProductImages(
      capturedApiPayloads.flatMap((p) => collectApiImages(p)),
    );
    const domImages = filterValidProductImages(normalizeTrendyolImages(dom.images));
    const rawImageCandidates =
      stateImages.length + apiImages.length + dom.images.length + dom.srcsetCount;

    let images = stateImages.length
      ? stateImages
      : apiImages.length
        ? apiImages
        : domImages;
    let imageSourceWinner = stateImages.length
      ? "state"
      : apiImages.length
        ? "api"
        : domImages.length
          ? "dom"
          : "none";
    // State zayıfsa DOM/API ile zenginleştir (kök görseli kopyalama yok)
    if (images.length < 2 && domImages.length > images.length) {
      images = domImages;
      imageSourceWinner = "dom";
    }
    if (images.length < 2 && apiImages.length > images.length) {
      images = apiImages;
      imageSourceWinner = "api";
    }

    const stateSizes = extractSizesFromProductState(rawProductJson);
    const domSizes = dom.sizes.map((s) => ({
      name: s.name,
      inStock: s.inStock,
      stockCount: null as number | null,
      disabledReason: s.disabledReason,
      source: "dom_button" as const,
    }));
    const sizeMap = new Map(stateSizes.map((s) => [s.name.toUpperCase(), s]));
    for (const s of domSizes) {
      const key = s.name.toUpperCase();
      const existing = sizeMap.get(key);
      if (!existing) {
        sizeMap.set(key, s);
        continue;
      }
      // DOM stok bilgisi daha güncel olabilir
      existing.inStock = s.inStock;
      existing.source = "dom_button";
      if (s.disabledReason) existing.disabledReason = s.disabledReason;
    }
    const sizes = [...sizeMap.values()];

    const isolated = isolateMemberVariants({
      memberColor: color || candidateColor || "Renk",
      memberProductId: productIdMatched ? resolvedProductId : requestedProductId,
      memberUrl: finalUrl || requestedUrl,
      memberImage: images[0],
      sizes,
      rawVariants: sizes.map((s) => ({
        size: s.name,
        inStock: s.inStock,
        stockCount: s.stockCount,
      })),
    });

    const ok = productIdMatched && (Boolean(rawProductJson) || images.length > 0 || sizes.length > 0);
    const effectivelyHydrated =
      hydrationCompleted || images.length > 0 || sizes.length > 0 || Boolean(rawProductJson);
    if (!hydrationCompleted && effectivelyHydrated) {
      // waitForFunction timeout olsa bile DOM/state veri verdiyse tamam say
    } else if (!hydrationCompleted) {
      warnings.push("hydration-timeout");
    }
    if (!images.length) warnings.push("no-images");
    if (!sizes.length) warnings.push("no-sizes");

    const snapshot: TrendyolHydratedMemberSnapshot = {
      requestedUrl,
      finalUrl,
      requestedProductId,
      resolvedProductId: productIdMatched ? resolvedProductId : undefined,
      color: color || candidateColor || "",
      displayColor: displayColor || color || candidateColor || "",
      colorSource: colorSource || "unknown",
      images,
      imageSources: {
        state: stateImages.length,
        api: apiImages.length,
        dom: domImages.length,
        srcset: dom.srcsetCount,
      },
      sizes,
      variants: isolated,
      rawProductJson: rawProductJson ?? undefined,
      diagnostics: {
        hydrationCompleted: effectivelyHydrated,
        productIdMatched,
        rawImageCount: rawImageCandidates,
        validImageCount: images.length,
        rawSizeCount: stateSizes.length + dom.sizes.length,
        validSizeCount: sizes.length,
        apiResponseCaptured,
        stateProductFound: Boolean(rawProductJson),
        domSizeSectionFound: dom.sizeSectionFound,
        galleryFound: dom.galleryFound,
        warnings,
        rawImageCandidates,
        acceptedImageCount: images.length,
        rejectedImageCount: Math.max(0, rawImageCandidates - images.length),
        rejectedImageSamples: [],
        imageSourceWinner,
      },
    };

    console.log(
      `[ColorFamilyDebug] member.productId requested=${requestedProductId} resolved=${resolvedProductId} matched=${productIdMatched}`,
    );
    console.log(
      `[ColorFamilyDebug] member.color ${snapshot.color} source=${snapshot.colorSource}`,
    );
    console.log(
      `[ColorFamilyDebug] member.images count=${images.length} winner=${imageSourceWinner} samples=${images.slice(0, 2).join(" | ")}`,
    );
    console.log(
      `[ColorFamilyDebug] member.sizes ${sizes.map((s) => s.name).join(",") || "(none)"}`,
    );
    console.log(`[ColorFamilyDebug] member.variants ${isolated.length}`);
    if (warnings.length) {
      console.log(`[ColorFamilyDebug] member.warnings ${warnings.join(",")}`);
    }

    return {
      productId: productIdMatched ? resolvedProductId : requestedProductId,
      url: requestedUrl,
      finalUrl,
      color: snapshot.color,
      images,
      rawProductJson: rawProductJson ?? {},
      html: includeHtml ? html : undefined,
      ok: ok && productIdMatched,
      error: productIdMatched ? undefined : "productId-mismatch",
      hydratedSnapshot: snapshot,
    };
  } finally {
    page.off("response", onResponse);
  }
}

/**
 * Href'siz renk swatch'ları için root sayfada tıklama ile productId keşfi.
 * Yalnızca slicing/renk alanındaki öğelere uygulanır.
 */
async function discoverColorCandidatesViaClick(
  page: Page,
  rootProductId: string,
  existing: TrendyolColorSiblingCandidate[],
): Promise<TrendyolColorSiblingCandidate[]> {
  const found: TrendyolColorSiblingCandidate[] = [];
  const known = new Set(existing.map((c) => c.productId));
  known.add(rootProductId);

  const count = await page
    .evaluate(() => {
      const root =
        document.querySelector(
          '[class*="slicing"], [data-testid*="color"], [class*="color-variant"], [class*="renk"]',
        ) || null;
      if (!root) return 0;
      const nodes = root.querySelectorAll(
        'a, button, [role="button"], [data-product-id], [data-content-id], [class*="slicing"]',
      );
      return nodes.length;
    })
    .catch(() => 0);

  const maxClicks = Math.min(count, COLOR_FAMILY_MAX_MEMBERS);
  for (let i = 0; i < maxClicks; i++) {
    try {
      const beforeUrl = page.url();
      const beforeId = await page
        .evaluate(() => {
          const state = (window as unknown as Record<string, unknown>)
            .__PRODUCT_DETAIL_APP_INITIAL_STATE__ as
            | { product?: { productId?: unknown; id?: unknown; contentId?: unknown } }
            | undefined;
          const p = state?.product;
          return String(p?.productId ?? p?.contentId ?? p?.id ?? "").replace(/\D/g, "");
        })
        .catch(() => "");

      const clicked = await page.evaluate((index: number) => {
        const root = document.querySelector(
          '[class*="slicing"], [data-testid*="color"], [class*="color-variant"], [class*="renk"]',
        );
        if (!root) return { ok: false, reason: "no-root" };
        const nodes = [
          ...root.querySelectorAll(
            'a, button, [role="button"], [data-product-id], [data-content-id]',
          ),
        ].filter((el) => {
          const href = (el as HTMLAnchorElement).getAttribute?.("href") || "";
          // Benzer ürün / öneri kartlarını ele
          if (el.closest('[class*="similar"], [class*="recommend"], [class*="carousel"]')) {
            return false;
          }
          // Zaten href ile productId taşıyanları atla — click fallback href'siz içindir
          if (/p-\d{5,}/i.test(href)) return false;
          return true;
        });
        const el = nodes[index] as HTMLElement | undefined;
        if (!el) return { ok: false, reason: "no-el" };
        const label = (el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);
        el.click();
        return { ok: true, label };
      }, i);

      if (!clicked?.ok) continue;

      await page
        .waitForFunction(
          (prev: { url: string; id: string }) => {
            const urlChanged = window.location.href !== prev.url;
            const state = (window as unknown as Record<string, unknown>)
              .__PRODUCT_DETAIL_APP_INITIAL_STATE__ as
              | { product?: { productId?: unknown; id?: unknown; contentId?: unknown } }
              | undefined;
            const p = state?.product;
            const id = String(p?.productId ?? p?.contentId ?? p?.id ?? "").replace(/\D/g, "");
            return urlChanged || (Boolean(id) && id !== prev.id);
          },
          { url: beforeUrl, id: beforeId },
          { timeout: 4000 },
        )
        .catch(() => undefined);

      await page.waitForTimeout(300);
      const afterUrl = page.url();
      const afterId =
        normalizeColorSiblingUrl(afterUrl)?.productId ||
        (await page
          .evaluate(() => {
            const state = (window as unknown as Record<string, unknown>)
              .__PRODUCT_DETAIL_APP_INITIAL_STATE__ as
              | { product?: { productId?: unknown; id?: unknown; contentId?: unknown } }
              | undefined;
            const p = state?.product;
            return String(p?.productId ?? p?.contentId ?? p?.id ?? "").replace(/\D/g, "");
          })
          .catch(() => ""));

      if (afterId && !known.has(afterId)) {
        known.add(afterId);
        const norm =
          normalizeColorSiblingUrl(afterUrl) ||
          normalizeColorSiblingUrl(`https://www.trendyol.com/x/x-p-${afterId}`);
        if (norm) {
          found.push({
            productId: norm.productId,
            url: norm.url,
            color: typeof clicked.label === "string" ? clicked.label : undefined,
            source: "dom.click-fallback",
          });
        }
      }
    } catch {
      // soft-fail per click
    }
  }

  return found;
}

async function fetchColorFamilyMembers(
  context: BrowserContext,
  rootProductId: string,
  candidates: TrendyolColorSiblingCandidate[],
  includeSiblingHtml: boolean,
): Promise<TrendyolColorFamilyMember[]> {
  const deadline = Date.now() + COLOR_FAMILY_TOTAL_DEADLINE_MS;
  const visited = new Set<string>([rootProductId]);
  const toFetch = candidates.filter((c) => {
    if (c.productId === rootProductId) return false;
    if (visited.has(c.productId)) return false;
    visited.add(c.productId);
    return true;
  });

  console.log(`[ColorFamilyDebug] candidates ${candidates.length}`);
  console.log(`[ColorFamily] rootProductId=${rootProductId}`);
  console.log(`[ColorFamily] candidates=${candidates.length}`);

  return mapPool(toFetch, COLOR_FAMILY_CONCURRENCY, async (candidate) => {
    const remaining = deadline - Date.now();
    if (remaining <= 800) {
      console.log(`[ColorFamily] memberFailed=${candidate.productId}:family-deadline`);
      return {
        productId: candidate.productId,
        url: candidate.url,
        color: candidate.color || "",
        images: candidate.images ?? (candidate.image ? [candidate.image] : []),
        ok: false,
        error: "family-deadline",
      } satisfies TrendyolColorFamilyMember;
    }

    const page = await context.newPage();
    try {
      validatePublicHttpUrl(candidate.url);
      if (!candidate.url.includes("trendyol.com")) {
        throw new Error("invalid-url");
      }
      console.log(`[ColorFamilyDebug] member.start ${candidate.productId}`);
      const navTimeout = Math.min(COLOR_FAMILY_MEMBER_TIMEOUT_MS, remaining);
      const hydrationTimeout = Math.min(
        COLOR_FAMILY_MEMBER_HYDRATION_TIMEOUT_MS,
        Math.max(2000, remaining - 1000),
      );
      console.log(
        `[ColorFamilyDebug] member.navigation ${candidate.url} timeout=${navTimeout}`,
      );
      const member = await buildHydratedMemberSnapshot({
        page,
        requestedUrl: candidate.url,
        requestedProductId: candidate.productId,
        candidateColor: candidate.color,
        capturedApiPayloads: [],
        includeHtml: includeSiblingHtml,
        navTimeoutMs: navTimeout,
        hydrationTimeoutMs: hydrationTimeout,
      });
      console.log(
        `[ColorFamily] memberFetched=${member.productId}:${member.color || "?"} ok=${member.ok}`,
      );
      return member;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[ColorFamily] memberFailed=${candidate.productId}:${message}`);
      return {
        productId: candidate.productId,
        url: candidate.url,
        color: candidate.color || "",
        images: candidate.images ?? (candidate.image ? [candidate.image] : []),
        ok: false,
        error: message,
      } satisfies TrendyolColorFamilyMember;
    } finally {
      await page.close().catch(() => undefined);
    }
  });
}

async function ensureBrowser(): Promise<Browser> {
  if (browser && browserReady) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  browserReady = true;
  return browser;
}

async function withPage<T>(fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const b = await ensureBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "tr-TR",
    viewport: { width: 1366, height: 900 },
  });
  try {
    return await fn(context);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function gotoAndRead(
  page: Page,
  url: string,
  timeoutMs: number,
): Promise<{ html: string; finalUrl: string; status: number }> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await page.waitForTimeout(1200);
  const html = await page.content();
  return {
    html,
    finalUrl: page.url(),
    status: response?.status() ?? 0,
  };
}

async function fetchPageHtml(url: string): Promise<{
  html: string;
  finalUrl: string;
  status: number;
  durationMs: number;
}> {
  const start = Date.now();
  return withPage(async (context) => {
    const page = await context.newPage();
    try {
      const result = await gotoAndRead(page, url, NAV_TIMEOUT_MS);
      return {
        ...result,
        durationMs: Date.now() - start,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  });
}

function categorizePlaywrightError(err: unknown): BrowserWorkerErrorCategory {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  if (lower.includes("net::err_blocked") || lower.includes("access denied")) return "blocked";
  if (lower.includes("navigation") || lower.includes("err_name_not_resolved")) return "navigation";
  if (message === "invalid-url") return "invalid-url";
  return "unknown";
}

function extractSiblingCandidates(
  html: string,
  rawProductJson: Record<string, unknown> | null,
  rootUrl: string,
): TrendyolColorSiblingCandidate[] {
  const fromProduct = extractColorSiblingCandidatesFromProduct(rawProductJson, rootUrl);
  const fromHtml = extractColorSiblingCandidatesFromHtml(html);
  return finalizeColorSiblingCandidateList(
    mergeColorSiblingCandidates(fromProduct, fromHtml),
    rootUrl,
    COLOR_FAMILY_MAX_MEMBERS,
  );
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "browser-worker",
    browserReady,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    version: "1.1.0",
  });
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractToken(req);
  if (!token || token !== TOKEN) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      errorCategory: "auth" satisfies BrowserWorkerErrorCategory,
    });
  }
  return next();
}

app.post("/scrape/html", requireAuth, async (req, res) => {
  const start = Date.now();
  try {
    const parsed = validatePublicHttpUrl(String(req.body?.url ?? ""));
    const url = parsed.toString();
    const page = await fetchPageHtml(url);
    return res.json({
      ok: true,
      url,
      finalUrl: page.finalUrl,
      status: page.status,
      html: page.html,
      durationMs: page.durationMs,
    });
  } catch (err) {
    const category = categorizePlaywrightError(err);
    const status = category === "invalid-url" ? 400 : category === "auth" ? 401 : 422;
    return res.status(status).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCategory: category,
      durationMs: Date.now() - start,
    });
  }
});

app.post("/scrape/trendyol", requireAuth, async (req, res) => {
  const start = Date.now();
  try {
    const parsed = validatePublicHttpUrl(String(req.body?.url ?? ""));
    const url = parsed.toString();
    if (!url.includes("trendyol.com")) {
      return res.status(400).json({
        ok: false,
        error: "Trendyol URL gerekli",
        errorCategory: "invalid-url" satisfies BrowserWorkerErrorCategory,
      });
    }

    const includeColorFamily =
      req.body?.includeColorFamily === true ||
      req.body?.includeColorFamily === "true" ||
      req.body?.includeColorFamily === 1;
    const includeSiblingHtml =
      req.body?.includeSiblingHtml === true || req.body?.includeSiblingHtml === "true";

    const rootNorm = normalizeColorSiblingUrl(url);
    const rootProductId = rootNorm?.productId || "";

    let colorSiblingCandidates: TrendyolColorSiblingCandidate[] = [];
    let colorFamilyMembers: TrendyolColorFamilyMember[] | undefined;
    let pageHtml = "";
    let finalUrl = url;
    let statusCode = 0;
    let rawProductJson: Record<string, unknown> | null = null;

    await withPage(async (context) => {
      const page = await context.newPage();
      let rootMember: TrendyolColorFamilyMember | null = null;
      try {
        console.log(`[ColorFamilyDebug] root ${url}`);
        rootMember = await buildHydratedMemberSnapshot({
          page,
          requestedUrl: url,
          requestedProductId: rootProductId,
          candidateColor: undefined,
          capturedApiPayloads: [],
          includeHtml: true,
          navTimeoutMs: NAV_TIMEOUT_MS,
          hydrationTimeoutMs: COLOR_FAMILY_MEMBER_HYDRATION_TIMEOUT_MS,
        });
        pageHtml = rootMember.html || (await page.content());
        finalUrl = rootMember.finalUrl || page.url();
        statusCode = 200;
        rawProductJson =
          (rootMember.rawProductJson as Record<string, unknown> | null) ??
          buildRawProductJson(parseTrendyolProductDetailState(pageHtml));

        colorSiblingCandidates = extractSiblingCandidates(pageHtml, rawProductJson, url);

        // Href'siz swatch keşfi — aday sayısı düşükse click fallback
        if (includeColorFamily && colorSiblingCandidates.length < 2) {
          const clicked = await discoverColorCandidatesViaClick(
            page,
            rootProductId,
            colorSiblingCandidates,
          );
          if (clicked.length) {
            colorSiblingCandidates = finalizeColorSiblingCandidateList(
              mergeColorSiblingCandidates(colorSiblingCandidates, clicked),
              url,
              COLOR_FAMILY_MAX_MEMBERS,
            );
            // Click sonrası root sayfayı tekrar hydrate et
            rootMember = await buildHydratedMemberSnapshot({
              page,
              requestedUrl: url,
              requestedProductId: rootProductId,
              candidateColor: colorSiblingCandidates.find((c) => c.productId === rootProductId)
                ?.color,
              capturedApiPayloads: [],
              includeHtml: true,
              navTimeoutMs: Math.min(NAV_TIMEOUT_MS, 15_000),
              hydrationTimeoutMs: COLOR_FAMILY_MEMBER_HYDRATION_TIMEOUT_MS,
            });
            pageHtml = rootMember.html || pageHtml;
            finalUrl = rootMember.finalUrl || finalUrl;
            rawProductJson =
              (rootMember.rawProductJson as Record<string, unknown> | null) ?? rawProductJson;
          }
        } else if (includeColorFamily) {
          // Ek click adayları (href'siz) — mevcut listeye ekle
          const clicked = await discoverColorCandidatesViaClick(
            page,
            rootProductId,
            colorSiblingCandidates,
          );
          if (clicked.length) {
            colorSiblingCandidates = finalizeColorSiblingCandidateList(
              mergeColorSiblingCandidates(colorSiblingCandidates, clicked),
              url,
              COLOR_FAMILY_MAX_MEMBERS,
            );
          }
        }
      } finally {
        await page.close().catch(() => undefined);
      }

      if (!rawProductJson) {
        const state = parseTrendyolProductDetailState(pageHtml);
        rawProductJson = buildRawProductJson(state);
      }
      if (!colorSiblingCandidates.length) {
        colorSiblingCandidates = extractSiblingCandidates(pageHtml, rawProductJson, url);
      }

      if (includeColorFamily && colorSiblingCandidates.length > 1 && rootProductId) {
        const siblings = await fetchColorFamilyMembers(
          context,
          rootProductId,
          colorSiblingCandidates,
          includeSiblingHtml,
        );
        const rootFallbackColor = pickColorName(
          rawProductJson,
          colorSiblingCandidates.find((c) => c.productId === rootProductId)?.color,
        );
        const rootEntry: TrendyolColorFamilyMember = rootMember?.ok
          ? {
              ...rootMember,
              productId: rootProductId,
              url,
              finalUrl: rootMember.finalUrl || finalUrl,
              color: rootMember.color || rootFallbackColor,
              images:
                rootMember.images.length > 0
                  ? rootMember.images
                  : collectImagesFromProduct(rawProductJson),
              rawProductJson: rootMember.rawProductJson ?? rawProductJson ?? {},
              html: undefined,
              ok: true,
            }
          : {
              productId: rootProductId,
              url,
              finalUrl,
              color: rootFallbackColor,
              images: collectImagesFromProduct(rawProductJson),
              rawProductJson: rawProductJson ?? {},
              ok: true,
            };
        colorFamilyMembers = [rootEntry, ...siblings];
        console.log(`[ColorFamilyDebug] final members=${colorFamilyMembers.length}`);
      }
    });

    const jsonLd = extractJsonLdFromHtml(pageHtml);

    return res.json({
      ok: true,
      url,
      finalUrl,
      status: statusCode,
      html: pageHtml,
      jsonLd,
      rawProductJson: rawProductJson ?? {},
      colorSiblingCandidates,
      colorFamilyMembers,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const category = categorizePlaywrightError(err);
    const status = category === "invalid-url" ? 400 : 422;
    return res.status(status).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCategory: category,
      durationMs: Date.now() - start,
    });
  }
});

async function boot() {
  try {
    await ensureBrowser();
    console.log("Browser Worker: Chromium hazır");
  } catch (err) {
    browserReady = false;
    console.error("Browser Worker: Chromium başlatılamadı", err instanceof Error ? err.message : err);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Browser Worker running on http://0.0.0.0:${PORT}`);
    console.log("  GET  /health");
    console.log("  POST /scrape/html");
    console.log("  POST /scrape/trendyol");
  });
}

boot().catch((err) => {
  console.error("Browser Worker fatal:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  if (browser) await browser.close().catch(() => undefined);
  process.exit(0);
});
