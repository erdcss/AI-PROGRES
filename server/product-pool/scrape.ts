import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type {
  ProductPoolFeature,
  ProductPoolProduct,
  ProductPoolVariant,
  ProductPoolVariantOption,
} from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function parseTrPrice(raw: string): number | null {
  const cleaned = String(raw || "")
    .replace(/[^\d.,]/g, "")
    .trim();
  if (!cleaned) return null;
  // 17.299,50 / 1.234.567,89 → binlik nokta + ondalık virgül
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const n = Number.parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // 17781,12 → ondalık virgül
  if (cleaned.includes(",")) {
    const n = Number.parseFloat(cleaned.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // 17.299 / 1.234.567 → yalnızca binlik nokta (TR)
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const n = Number.parseFloat(cleaned.replace(/\./g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // 17399.00 / 17781.12 → İngilizce ondalık
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function discountPercent(price: number, compareAt: number | null): number {
  if (!compareAt || compareAt <= price || price <= 0) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function faviconFor(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

/** Site logosu / favicon / ikon — ürün galerisine ve Shopify'a girmemeli */
export function isLikelySiteBrandingImage(url: string): boolean {
  const u = String(url || "").toLowerCase().split("?")[0];
  if (!u.startsWith("http")) return true;
  if (/\.svg$/i.test(u) || /\.ico$/i.test(u)) return true;
  if (/favicon|ladybug|sprite|watermark|placeholder|no[-_]?image/i.test(u)) return true;
  if (/\/(?:logo|logos|brand|brands)(?:\/|-|_|\.)/i.test(u)) return true;
  if (/logo[-_]?(?:dark|light|white|black|header|footer)?\.(?:png|jpe?g|webp|gif)$/i.test(u)) {
    return true;
  }
  if (/\/(?:icons?|app-icons|static\/favicon)\//i.test(u)) return true;
  if (/\/custom\/upload\//i.test(u)) return true;
  if (/\/skins\/shared\/images\/logo/i.test(u)) return true;
  if (/badge|banner|\/emblem/i.test(u) && !/\/a1\/org\//i.test(u)) return true;
  // n11: .jpg uzantılı logo placeholder (ürün değil)
  if (/n11scdn\d*-im\.akamaized\.net\/a1\/640\//i.test(u) && !/\/img-\d+/i.test(u)) {
    return true;
  }
  // Amazon site grafikleri (ürün değil)
  if (/media-amazon\.com\/images\/[gs]\//i.test(u)) return true;
  return false;
}

/** Shopify / UI galeri: site logosu hariç yalnızca ürün görselleri */
export function filterProductImagesForShopify(
  images: unknown,
  siteLogoUrl?: string,
): string[] {
  const logoKey = String(siteLogoUrl || "")
    .split("?")[0]
    .toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(images) ? images : [];
  for (const raw of list) {
    if (typeof raw !== "string" || !raw.startsWith("http")) continue;
    const key = raw.split("?")[0].toLowerCase();
    if (seen.has(key)) continue;
    if (logoKey && key === logoKey) continue;
    if (isLikelySiteBrandingImage(raw)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= 8) break;
  }
  return out;
}

export async function rejectNonJpegProductPlaceholders(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (out.length >= 8) break;
    // Sadece şüpheli CDN yollarını byte ile doğrula (hız için)
    const needsProbe =
      /n11scdn/i.test(url) ||
      /\.(png)(\?|$)/i.test(url) ||
      /logo|icon|favicon/i.test(url);
    if (!needsProbe) {
      out.push(url);
      continue;
    }
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Referer: "https://www.n11.com/",
          Accept: "image/*,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const isWebp =
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP";
      const isPng =
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      // n11 / küçük PNG: logo placeholder; büyük PNG ürün olabilir
      if (isPng) {
        if (/n11scdn|logo|icon|favicon/i.test(url) || buf.length < 40_000) continue;
        out.push(url);
        continue;
      }
      if (isJpeg || isWebp) out.push(url);
    } catch {
      /* skip */
    }
  }
  return out;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function buildPoolVariants(
  axes: Array<{ name: string; values: string[] }>,
  salePrice: number,
): { variantOptions: ProductPoolVariantOption[]; variants: ProductPoolVariant[] } {
  const cleanAxes = axes
    .map((a) => ({
      name: cleanText(a.name),
      values: [...new Set(a.values.map((v) => cleanText(v)).filter(Boolean))],
    }))
    .filter((a) => a.name && a.values.length > 0)
    .slice(0, 3);
  if (!cleanAxes.length) return { variantOptions: [], variants: [] };

  const variantOptions: ProductPoolVariantOption[] = cleanAxes.map((a) => ({
    name: a.name,
    values: a.values,
  }));

  const combos: string[][] = [];
  const walk = (depth: number, cur: string[]) => {
    if (depth >= cleanAxes.length) {
      combos.push([...cur]);
      return;
    }
    for (const v of cleanAxes[depth].values) {
      cur.push(v);
      walk(depth + 1, cur);
      cur.pop();
    }
  };
  walk(0, []);

  const variants: ProductPoolVariant[] = combos.slice(0, 100).map((opts) => {
    const title = opts.join(" / ");
    return {
      title,
      option1: opts[0] || undefined,
      option2: opts[1] || undefined,
      option3: opts[2] || undefined,
      price: salePrice,
      inStock: true,
    };
  });

  return { variantOptions, variants };
}

function parseEmbeddedJsonField<T>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  if (typeof val === "object") return val as T;
  return null;
}

function parseN11WindowModel(html: string): Record<string, unknown> | null {
  const start = html.indexOf("window.model = ");
  if (start < 0) return null;

  // Safer: `</script>` yerine, JSON objesini `{...}` parantez derinliğiyle yakala.
  // Bazı HTML’lerde ilk `</script>` görünümü JSON içinde/öncesinde hatalı kesilebilir.
  const jsonStart = html.indexOf("{", start);
  if (jsonStart < 0) return null;

  let depth = 0;
  let inString: '"' | "'" | null = null;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const json = html.slice(jsonStart, i + 1);
      try {
        return JSON.parse(json) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  // Fallback (eski yöntem): `</script>` ile kes.
  const end = html.indexOf("</script>", start);
  if (end < 0) return null;
  let json = html.slice(start + 15, end).trim();
  if (json.endsWith(";")) json = json.slice(0, -1);
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type N11SkuAttribute = {
  name?: string;
  seoName?: string;
  skuDefinition?: { id?: number; name?: string; seoName?: string };
};

type N11Sku = {
  id?: number;
  gtin?: string;
  stock?: number | null;
  currentStock?: number | null;
  outOfStock?: boolean;
  displayPriceNumber?: number | null;
  price?: string | null;
  skuAttributes?: N11SkuAttribute[];
};

type N11AttributeGroup = {
  groupAttributeName?: string;
  products?: Array<{
    groupAttributeValue?: string;
    outOfStock?: boolean;
  }>;
};

function extractN11VariantsFromModel(
  model: Record<string, unknown>,
  salePrice: number,
): { variantOptions: ProductPoolVariantOption[]; variants: ProductPoolVariant[] } {
  const skus = parseEmbeddedJsonField<N11Sku[]>(model.skus) || [];
  const skuDefs =
    parseEmbeddedJsonField<Array<{ id?: number; name?: string; seoName?: string }>>(
      model.skuDefinitions,
    ) || [];

  const axisNames = skuDefs.map((d) => cleanText(d.name || "")).filter(Boolean);
  const axisValues: Record<string, string[]> = {};
  const variants: ProductPoolVariant[] = [];

  for (const sku of skus) {
    const attrs = sku.skuAttributes || [];
    const optsByAxis: Record<string, string> = {};
    for (const attr of attrs) {
      const axisName = cleanText(attr.skuDefinition?.name || "Seçenek");
      const val = cleanText(attr.name || "");
      if (!axisName || !val) continue;
      if (!axisNames.includes(axisName)) axisNames.push(axisName);
      if (!axisValues[axisName]) axisValues[axisName] = [];
      if (!axisValues[axisName].includes(val)) axisValues[axisName].push(val);
      optsByAxis[axisName] = val;
    }

    const optionValues = axisNames.map((n) => optsByAxis[n]).filter(Boolean);
    const title = optionValues.length ? optionValues.join(" / ") : "Varsayılan";
    const skuPrice =
      typeof sku.displayPriceNumber === "number" && sku.displayPriceNumber > 0
        ? sku.displayPriceNumber
        : parseTrPrice(String(sku.price || "")) || salePrice;

    variants.push({
      title,
      sku: sku.gtin || (sku.id ? String(sku.id) : undefined),
      option1: axisNames[0] ? optsByAxis[axisNames[0]] : undefined,
      option2: axisNames[1] ? optsByAxis[axisNames[1]] : undefined,
      option3: axisNames[2] ? optsByAxis[axisNames[2]] : undefined,
      price: skuPrice,
      inStock: !sku.outOfStock,
    });
  }

  const pag =
    parseEmbeddedJsonField<N11AttributeGroup>(model.productAttributeGroup) ||
    parseEmbeddedJsonField<N11AttributeGroup>(
      (model.response as Record<string, unknown> | undefined)?.productAttributeGroup,
    );
  if (pag?.groupAttributeName && pag.products?.length) {
    const colorAxis = cleanText(pag.groupAttributeName);
    const colors = [
      ...new Set(
        pag.products.map((p) => cleanText(p.groupAttributeValue || "")).filter(Boolean),
      ),
    ];
    if (colorAxis && colors.length) {
      if (!axisNames.includes(colorAxis)) axisNames.push(colorAxis);
      axisValues[colorAxis] = colors;
    }
  }

  const variantOptions: ProductPoolVariantOption[] = axisNames
    .slice(0, 3)
    .map((name) => ({
      name,
      values: axisValues[name] || [],
    }))
    .filter((o) => o.values.length > 0);

  if (variantOptions.length || variants.length) {
    return { variantOptions, variants };
  }
  return { variantOptions: [], variants: [] };
}

function extractN11Variants(
  html: string,
  $: CheerioAPI,
  sourceUrl: string,
  salePrice: number,
): { variantOptions: ProductPoolVariantOption[]; variants: ProductPoolVariant[] } {
  const model = parseN11WindowModel(html);
  if (model) {
    const fromModel = extractN11VariantsFromModel(model, salePrice);
    if (fromModel.variantOptions.length || fromModel.variants.length) {
      return fromModel;
    }
  }

  const axes: Array<{ name: string; values: string[] }> = [];
  const pushAxis = (name: string, values: string[]) => {
    const cleanName = cleanText(name);
    const cleanVals = [...new Set(values.map((v) => cleanText(v)).filter(Boolean))];
    if (!cleanName || !cleanVals.length) return;
    const idx = axes.findIndex((a) => a.name.toLowerCase() === cleanName.toLowerCase());
    if (idx >= 0) {
      for (const v of cleanVals) {
        if (!axes[idx].values.includes(v)) axes[idx].values.push(v);
      }
    } else {
      axes.push({ name: cleanName, values: cleanVals });
    }
  };

  try {
    const bedenParam = new URL(sourceUrl).searchParams.get("beden");
    if (bedenParam) {
      const label = bedenParam.length <= 3 ? bedenParam.toUpperCase() : cleanText(bedenParam);
      pushAxis("Beden", [label]);
    }
  } catch {
    /* ignore */
  }

  $('[class*="variant"], [class*="Variant"], .chooseProVariant, [data-variant]').each((_, root) => {
    const label =
      cleanText($(root).find("label, .label, h4, h5, span.title").first().text()) ||
      cleanText($(root).attr("data-label") || "");
    const values: string[] = [];
    $(root)
      .find("a, button, li, option")
      .each((_, el) => {
        const t = cleanText($(el).attr("title") || $(el).text());
        if (t && t.length < 30 && !/seç|sec|choose/i.test(t)) values.push(t);
      });
    if (label && values.length) pushAxis(label, values);
  });

  for (const m of html.matchAll(
    /"name"\s*:\s*"(Beden|Renk|Size|Color)"[^}]*"values"\s*:\s*\[([^\]]+)\]/gi,
  )) {
    const vals = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    pushAxis(m[1] === "Size" ? "Beden" : m[1] === "Color" ? "Renk" : m[1], vals);
  }

  for (const m of html.matchAll(/"attributeName"\s*:\s*"([^"]+)"\s*,\s*"attributeValue"\s*:\s*"([^"]+)"/gi)) {
    pushAxis(m[1], [m[2]]);
  }

  const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch?.[1]) {
    try {
      const data = JSON.parse(nextMatch[1]);
      const walk = (obj: unknown): void => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          obj.forEach(walk);
          return;
        }
        const rec = obj as Record<string, unknown>;
        if (Array.isArray(rec.attributes)) {
          for (const attr of rec.attributes) {
            if (!attr || typeof attr !== "object") continue;
            const a = attr as Record<string, unknown>;
            const name = String(a.name || a.attributeName || "");
            const vals = Array.isArray(a.values)
              ? a.values.map((v) => String(v))
              : a.value
                ? [String(a.value)]
                : [];
            if (name && vals.length) pushAxis(name, vals);
          }
        }
        for (const v of Object.values(rec)) walk(v);
      };
      walk(data);
    } catch {
      /* ignore */
    }
  }

  return buildPoolVariants(axes, salePrice);
}

function pttVariantsToPool(
  raw: {
    colors?: string[];
    sizes?: string[];
    allVariants?: Array<{ color?: string; size?: string; inStock?: boolean }>;
  } | undefined,
  salePrice: number,
): { variantOptions: ProductPoolVariantOption[]; variants: ProductPoolVariant[] } {
  const axes: Array<{ name: string; values: string[] }> = [];
  const sizes =
    raw?.sizes?.length
      ? raw.sizes
      : [...new Set((raw?.allVariants || []).map((v) => v.size).filter(Boolean) as string[])];
  const colors =
    raw?.colors?.length
      ? raw.colors
      : [...new Set((raw?.allVariants || []).map((v) => v.color).filter(Boolean) as string[])];
  if (sizes.length) axes.push({ name: "Beden", values: sizes });
  if (colors.length) axes.push({ name: "Renk", values: colors });
  const built = buildPoolVariants(axes, salePrice);
  if (raw?.allVariants?.length && built.variants.length) {
    for (const v of built.variants) {
      const match = raw.allVariants.find(
        (av) =>
          (av.size ? v.option1 === av.size || v.option2 === av.size : true) &&
          (av.color ? v.option1 === av.color || v.option2 === av.color : true),
      );
      if (match && match.inStock === false) v.inStock = false;
    }
  }
  return built;
}

function extractFeatures($: CheerioAPI): ProductPoolFeature[] {
  const features: ProductPoolFeature[] = [];
  const seen = new Set<string>();

  const push = (name: string, value: string) => {
    const n = cleanText(name).replace(/:$/, "");
    const v = cleanText(value);
    if (!n || !v || n.length > 80 || v.length > 400) return;
    const key = `${n.toLowerCase()}::${v.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    features.push({ name: n, value: v });
  };

  $("table tr").each((_, row) => {
    const cells = $(row).find("th,td");
    if (cells.length >= 2) {
      push($(cells[0]).text(), $(cells[1]).text());
    }
  });

  $("dl").each((_, dl) => {
    const $dl = $(dl);
    $dl.find("dt").each((i, dt) => {
      const dd = $dl.find("dd").eq(i);
      push($(dt).text(), dd.text());
    });
  });

  $(".prop-spec-box li, .product-features li, .product-specs li, .ozellikler li").each((_, li) => {
    const text = cleanText($(li).text());
    const m = text.match(/^([^:–—-]{2,60})\s*[:–—-]\s*(.+)$/);
    if (m) push(m[1], m[2]);
  });

  $("span.product-part-title").each((_, el) => {
    const title = cleanText($(el).text());
    if (!/özellik/i.test(title) && !/hakkında/i.test(title)) return;
    const block = $(el).parent();
    const raw = cleanText(block.text().replace(title, ""));
    if (/özellik/i.test(title) && raw.length > 20) {
      raw
        .split(/(?<=\.)\s+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 12 && p.length < 280)
        .slice(0, 8)
        .forEach((p, i) => push(`Özellik ${i + 1}`, p));
    }
  });

  return features.slice(0, 24);
}

async function fetchHtml(
  url: string,
  options?: { crawlerFallback?: boolean },
): Promise<string> {
  const cleanUrl = url.split("#")[0];
  const userAgents = options?.crawlerFallback
    ? [
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        UA,
      ]
    : [UA];

  let lastErr: Error | null = null;
  for (const userAgent of userAgents) {
    try {
      const res = await fetch(cleanUrl, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
      });
      const html = await res.text();
      const amazonChallenge =
        /validateCaptcha|opfcaptcha|Alışverişe Devam Et|Continue shopping/i.test(html) &&
        html.length < 20_000;
      const blocked =
        !res.ok ||
        amazonChallenge ||
        /Attention Required!|Just a moment|cf-browser-verification|Sorry, you have been blocked/i.test(
          html,
        ) ||
        html.length < 4000;
      if (blocked) {
        lastErr = new Error(`Sayfa alınamadı (HTTP ${res.status})`);
        continue;
      }
      return html;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr || new Error("Sayfa alınamadı");
}

function isUsableProductHtml(html: string): boolean {
  if (!html || html.length < 4000) return false;
  if (/Attention Required!|Just a moment|cf-browser-verification|Sorry, you have been blocked/i.test(html)) {
    return false;
  }
  // Amazon bot/captcha interstitial
  if (
    /validateCaptcha|opfcaptcha|api-services-support@amazon\.|Alışverişe Devam Et|Continue shopping/i.test(
      html,
    ) &&
    html.length < 20_000
  ) {
    return false;
  }
  return true;
}

async function fetchProtectedMarketplaceHtml(
  url: string,
  label: string,
  failMessage: string,
): Promise<string> {
  try {
    return await fetchHtml(url, { crawlerFallback: true });
  } catch (directErr) {
    console.warn(
      `[ProductPool/${label}] Direct fetch blocked, trying browser fallbacks:`,
      directErr instanceof Error ? directErr.message : String(directErr),
    );
  }

  try {
    const {
      fetchHtmlWithBrowserWorker,
      isBrowserWorkerConfigured,
    } = await import("../services/browser-worker-client.service");
    if (isBrowserWorkerConfigured()) {
      const bw = await fetchHtmlWithBrowserWorker(url);
      if (bw.success && bw.html && isUsableProductHtml(bw.html)) {
        console.log(`[ProductPool/${label}] Browser Worker HTML ok (${bw.html.length} bytes)`);
        return bw.html;
      }
      console.warn(
        `[ProductPool/${label}] Browser Worker failed:`,
        bw.error || bw.errorCategory || "empty",
      );
    }
  } catch (err) {
    console.warn(
      `[ProductPool/${label}] Browser Worker error:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  const stealthHtml = await fetchHtmlWithStealthBrowser(url);
  if (stealthHtml && isUsableProductHtml(stealthHtml)) {
    console.log(`[ProductPool/${label}] Stealth Chromium HTML ok (${stealthHtml.length} bytes)`);
    return stealthHtml;
  }

  throw new Error(failMessage);
}

/** n11: önce crawler UA; canlı CF engelinde Browser Worker → yerel stealth Chromium */
async function fetchN11Html(url: string): Promise<string> {
  return fetchProtectedMarketplaceHtml(
    url,
    "n11",
    "n11 sayfası alınamadı (Cloudflare). Canlıda BROWSER_WORKER_URL yapılandırın veya daha sonra tekrar deneyin.",
  );
}

async function fetchAmazonHtml(url: string): Promise<string> {
  return fetchProtectedMarketplaceHtml(
    url,
    "amazon",
    "Amazon sayfası alınamadı (bot koruması). Canlıda BROWSER_WORKER_URL yapılandırın veya daha sonra tekrar deneyin.",
  );
}

/** Webo keşif — liste/arama sayfaları (bot koruması bypass) */
export async function fetchMarketplaceListingHtml(url: string, siteId?: string): Promise<string> {
  const id = String(siteId || "").toLowerCase();
  if (id === "n11") return fetchN11Html(url);
  if (id === "amazon") return fetchAmazonHtml(url);
  if (id === "pttavm") {
    return fetchProtectedMarketplaceHtml(url, "pttavm-listing", "PTT AVM liste alınamadı");
  }
  if (id === "trendyol") {
    try {
      return await fetchHtml(url, { crawlerFallback: true });
    } catch {
      return fetchProtectedMarketplaceHtml(url, "trendyol-listing", "Trendyol liste alınamadı");
    }
  }
  return fetchProtectedMarketplaceHtml(
    url,
    id || "listing",
    `${id || "Site"} liste sayfası alınamadı`,
  );
}

async function fetchHtmlWithStealthBrowser(url: string): Promise<string | null> {
  try {
    const { createRequire } = await import("module");
    const { getChromiumPath } = await import("../puppeteer-config");
    const require = createRequire(import.meta.url);
    const puppeteerExtraLib = require("puppeteer-extra");
    const StealthPlugin = require("puppeteer-extra-plugin-stealth");
    const puppeteerExtra = puppeteerExtraLib.default || puppeteerExtraLib;
    puppeteerExtra.use(StealthPlugin());

    const chromePath = getChromiumPath();
    let browser: { close: () => Promise<void> } | null = null;
    let page: {
      setViewport: (v: object) => Promise<void>;
      setUserAgent: (ua: string) => Promise<void>;
      setExtraHTTPHeaders: (h: Record<string, string>) => Promise<void>;
      setRequestInterception: (v: boolean) => Promise<void>;
      on: (ev: string, fn: (req: { resourceType: () => string; abort: () => void; continue: () => void }) => void) => void;
      goto: (u: string, o: object) => Promise<unknown>;
      content: () => Promise<string>;
      close: () => Promise<void>;
    } | null = null;

    try {
      browser = await puppeteerExtra.launch({
        headless: true,
        executablePath: chromePath,
        protocolTimeout: 120000,
        timeout: 120000,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
          "--lang=tr-TR,tr",
          "--window-size=1366,768",
        ],
      });
      page = await (browser as any).newPage();
      if (!page) return null;
      await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
      await page.setUserAgent(UA);
      await page.setExtraHTTPHeaders({
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const rt = req.resourceType();
        if (["image", "font", "media"].includes(rt)) req.abort();
        else req.continue();
      });

      // magaza/renk query korunur
      await page.goto(url.split("#")[0], { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 5000));
      let html = await page.content();
      if (/Just a moment|cf-browser-verification|cf-wrapper/i.test(html)) {
        await new Promise((r) => setTimeout(r, 12000));
        html = await page.content();
      }
      return html;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          /* ignore */
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.warn(
      "[ProductPool/n11] Stealth Chromium failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function isLikelyN11ProductImage(url: string, productId = ""): boolean {
  const u = url.toLowerCase();
  if (!u.startsWith("http")) return false;
  if (/\.svg(\?|$)/i.test(u)) return false;
  if (/noimage|favicon|logo|icon|ladybug|sprite|badge|banner/i.test(u)) return false;
  if (/\/custom\/upload\//i.test(u)) return false;
  if (/\/public\/images\//i.test(u)) return false;
  if (!/n11scdn\d*(?:-im)?\.akamaized\.net\/a1\//i.test(u)) return false;
  // Asıl ürün fotoğrafları genelde jpg/webp; png çoğu branding
  if (/\.(jpe?g|webp)(\?|$)/i.test(u)) return true;
  if (productId && u.includes(productId.toLowerCase()) && /\.png(\?|$)/i.test(u)) return true;
  return false;
}

/** LD/640 yolları bazen .jpg uzantılı n11 logosunu (küçük PNG) döndürür; org+IMG güvenilir. */
function n11ImageScore(url: string, productId = ""): number {
  if (!isLikelyN11ProductImage(url, productId)) return -1;
  const u = url.toLowerCase();
  let score = 0;
  if (/\/a1\/org\//i.test(u)) score += 50;
  if (/\/img-\d+/i.test(u)) score += 40;
  if (productId && u.includes(productId.toLowerCase())) score += 15;
  if (/\.jpe?g(\?|$)/i.test(u)) score += 10;
  if (/n11scdn\d+-im\./i.test(u)) score -= 35;
  if (/\/a1\/640\//i.test(u) && !/\/img-/i.test(u)) score -= 25;
  return score;
}

async function filterRealN11Images(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (out.length >= 12) break;
    try {
  const res = await fetch(url, {
        method: "GET",
    headers: {
      "User-Agent": UA,
          Referer: "https://www.n11.com/",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) continue;
      const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      const isWebp =
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP";
      const isPng =
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      // .jpg diye sunulan küçük/orta PNG = n11 logo placeholder
      if (isPng) continue;
      if (isJpeg || isWebp) out.push(url);
    } catch {
      /* skip broken */
    }
  }
  // Canlı CDN sunucu IP'sini engelleyebilir — güvenilir org/IMG yollarını yine de bırak
  if (!out.length) {
    return urls
      .filter((u) => /\/a1\/org\//i.test(u) || /\/img-\d+/i.test(u))
      .filter((u) => !isLikelySiteBrandingImage(u))
      .slice(0, 12);
  }
  return out;
}

async function scrapeN11(html: string, sourceUrl: string): Promise<ProductPoolProduct> {
  const $ = cheerio.load(html);
  const cleanUrl = sourceUrl.split("?")[0];
  const productIdMatch = cleanUrl.match(/-(\d{6,})(?:\?|$)/);
  const productId = productIdMatch?.[1] || "";

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let inStock = true;
  let ldProductImage = "";
  let siteLogoFromLd = "";
  const features: ProductPoolFeature[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).html() || "");
      const nodes = Array.isArray(raw)
        ? raw
        : Array.isArray(raw["@graph"])
          ? raw["@graph"]
          : [raw];
      for (const node of nodes) {
        const type = String(node?.["@type"] || "");
        if (type === "Organization" && typeof node.logo === "string" && node.logo.startsWith("http")) {
          siteLogoFromLd = node.logo;
        }
        if (type !== "Product") continue;
        title = cleanText(String(node.name || ""));
        sku = String(node.sku || sku || "");
        const brandVal = node.brand;
        if (typeof brandVal === "string") brand = brandVal;
        else if (brandVal && typeof brandVal === "object") {
          brand = String((brandVal as { name?: string }).name || "");
        }
        const img = node.image;
        if (typeof img === "string" && n11ImageScore(img, productId) >= 40) {
          ldProductImage = img.split("?")[0];
        } else if (Array.isArray(img)) {
          for (const i of img) {
            if (typeof i === "string" && n11ImageScore(i, productId) >= 40) {
              ldProductImage = i.split("?")[0];
              break;
            }
          }
        }
        const color = cleanText(String(node.color || ""));
        if (color) features.push({ name: "Renk", value: color });
        const props = Array.isArray(node.additionalProperty) ? node.additionalProperty : [];
        for (const p of props) {
          const n = cleanText(String(p?.name || ""));
          const v = cleanText(String(p?.value || ""));
          if (n && v) features.push({ name: n, value: v });
        }
        const offer = node.offers as Record<string, unknown> | undefined;
        if (offer) {
          const p =
            parseTrPrice(String(offer.price ?? "")) ||
            parseTrPrice(String(offer.lowPrice ?? "")) ||
            parseTrPrice(String(offer.highPrice ?? ""));
          if (p && p > 0) salePrice = p;
          const avail = String(offer.availability || "");
          if (/OutOfStock|SoldOut/i.test(avail)) inStock = false;
        }
      }
    } catch {
      /* next */
    }
  });

  // Embedded JSON prices: "17.299 TL", "17399.00", "19.351,50 TL"
  const priceCandidates: number[] = [];
  const listCandidates: number[] = [];
  for (const m of html.matchAll(/"price"\s*:\s*"([^"]+)"/gi)) {
    const p = parseTrPrice(m[1]);
    if (p && p > 0 && p < 1_000_000) priceCandidates.push(p);
  }
  for (const m of html.matchAll(/"displayPrice"\s*:\s*"([^"]+)"/gi)) {
    const p = parseTrPrice(m[1]);
    if (p && p > 0 && p < 1_000_000) listCandidates.push(p);
  }
  // Aykırı küçük değerleri ele (yanlış parse / kargo vb.)
  const sanePrices = (arr: number[]) => {
    if (!arr.length) return [] as number[];
    const max = Math.max(...arr);
    return arr.filter((p) => p >= Math.max(50, max * 0.15));
  };
  const salePool = sanePrices(priceCandidates);
  const listPool = sanePrices(listCandidates);
  // Satıcı JSON fiyatları AggregateOffer.lowPrice'tan daha spesifik (magaza=...)
  if (salePool.length) {
    const minSale = Math.min(...salePool);
    if (!salePrice || minSale <= salePrice) salePrice = minSale;
  }
  if (listPool.length) {
    listPrice = Math.max(...listPool);
  }
  if (!listPrice && salePool.length > 1) {
    listPrice = Math.max(...salePool);
  }
  if (listPrice > 0 && salePrice > 0 && listPrice < salePrice) {
    const tmp = listPrice;
    listPrice = salePrice;
    salePrice = tmp;
  }

  const galleryRaw = [
    ...html.matchAll(
      /https:\/\/n11scdn\d*(?:-im)?\.akamaized\.net\/a1\/(?:org|640|500_750|400_600)[^"'\\\s]+\.(?:jpg|jpeg|png|webp)/gi,
    ),
  ].map((m) => m[0].split("?")[0]);

  const gallery = galleryRaw
    .filter((u) => n11ImageScore(u, productId) >= 40)
    .sort((a, b) => n11ImageScore(b, productId) - n11ImageScore(a, productId));

  const candidates: string[] = [];
  if (ldProductImage) candidates.push(ldProductImage);
  for (const u of gallery) {
    if (!candidates.includes(u)) candidates.push(u);
  }
  // Skor yetmezse yine de adayları doğrulamaya gönder
  if (!candidates.length) {
    for (const u of galleryRaw) {
      if (isLikelyN11ProductImage(u, productId) && !candidates.includes(u)) candidates.push(u);
    }
  }

  const uniqueImages = await filterRealN11Images(
    [...new Set(candidates)].sort(
      (a, b) => n11ImageScore(b, productId) - n11ImageScore(a, productId),
    ),
  );

  if (!title) {
    title =
      cleanText($("h1").first().text()) ||
      cleanText($('meta[property="og:title"]').attr("content") || "") ||
      cleanText($("title").text()) ||
      "Ürün";
  }
  title = title
    .replace(/\s*Fiyatları ve Özellikleri\s*$/i, "")
    .replace(/\s*[|-]\s*n11.*$/i, "")
    .trim();

  if (!brand) {
    brand =
      html.match(/"brandName"\s*:\s*"([^"]+)"/)?.[1] ||
      html.match(/"brand"\s*:\s*"([^"]{2,40})"/)?.[1] ||
      "";
  }
  if (!sku) {
    sku = html.match(/"sku"\s*:\s*"([^"]+)"/)?.[1] || "";
  }

  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      parseTrPrice($("[itemprop='price']").attr("content") || "") ||
      0;
  }

  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: cleanText(brand) });
  }
  if (sku && !features.some((f) => /sku|barkod/i.test(f.name))) {
    features.push({ name: "SKU", value: sku });
  }

  const magaza = new URL(sourceUrl).searchParams.get("magaza");
  const bedenQ = new URL(sourceUrl).searchParams.get("beden");
  if (magaza) features.push({ name: "Mağaza", value: magaza });
  if (bedenQ) features.push({ name: "Beden (URL)", value: bedenQ });

  const compareAt = listPrice > salePrice ? listPrice : null;

  const { variantOptions, variants } = extractN11Variants(html, $, sourceUrl, salePrice);

  const outUrl = new URL(cleanUrl);
  if (magaza) outUrl.searchParams.set("magaza", magaza);
  if (bedenQ) outUrl.searchParams.set("beden", bedenQ);

  // Site rozeti: SVG custom/upload tarayıcıda kırılabiliyor — sabit favicon
  const siteLogoUrl =
    (siteLogoFromLd && !/\/custom\/upload\//i.test(siteLogoFromLd) ? siteLogoFromLd : "") ||
    "https://www.n11.com/favicon.ico";

  return {
    title,
    sourceUrl: outUrl.toString().replace(/\/$/, ""),
    siteName: "n11",
    siteLogoUrl,
    brand: brand ? cleanText(brand) : undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: discountPercent(salePrice, compareAt),
    salePrice,
    images: uniqueImages,
    features: features.slice(0, 24),
    inStock,
    variantOptions: variantOptions.length ? variantOptions : undefined,
    variants: variants.length ? variants : undefined,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapeHepegitim(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;

  let productId = "";
  let modelName = "";
  let sku = "";
  let brand = "";
  let priceFromJson: number | null = null;
  let imageFromJson = "";

  const scripts = $("script")
    .map((_, el) => $(el).html() || "")
    .get()
    .join("\n");
  const jspMatch = scripts.match(/jspValue\s*=\s*(\{[\s\S]*?\});/);
  if (jspMatch) {
    try {
      const data = JSON.parse(jspMatch[1]) as Record<string, unknown>;
      productId = String(data.ProductID || "");
      modelName = String(data.ModelName || "");
      sku = String(data.SKU || data.Barcode || "");
      brand = String(data.Brand || "");
      const p = Number.parseFloat(String(data.Price ?? ""));
      if (Number.isFinite(p)) priceFromJson = p;
      if (typeof data.ImageUrl === "string" && data.ImageUrl) {
        imageFromJson = absoluteUrl(origin, data.ImageUrl.replace("/middle/", "/big/"));
      }
    } catch {
      /* ignore */
    }
  }

  const title =
    modelName ||
    $("h1.product-title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "Ürün";

  const salesText = $(".product-price .price-sales").first().text();
  const standardText = $(".product-price .price-standard").first().text();
  const salePrice =
    parseTrPrice(salesText) ??
    priceFromJson ??
    parseTrPrice($(".price-sales").first().text()) ??
    0;
  const compareAt =
    parseTrPrice(standardText) ??
    (salePrice > 0 && priceFromJson && priceFromJson > salePrice ? priceFromJson : null);

  const images = new Set<string>();
  if (imageFromJson) images.add(imageFromJson);
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) images.add(absoluteUrl(origin, ogImage));

  $('img[src*="productimages/"], img[data-src*="productimages/"]').each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (!src) return;
    if (productId && !src.includes(`/productimages/${productId}/`)) return;
    const abs = absoluteUrl(origin, src.replace("/middle/", "/big/").replace("/original/", "/big/"));
    images.add(abs);
  });

  const logoSrc =
    $(".navbar-brand img").first().attr("src") ||
    $('img[alt*="Hepegitim" i]').first().attr("src") ||
    "/skins/shared/images/logo.png";

  const siteLogoUrl = absoluteUrl(origin, logoSrc);
  const price = compareAt && compareAt > salePrice ? compareAt : salePrice;
  const finalSale = salePrice || price;
  const disc = discountPercent(finalSale, compareAt && compareAt > finalSale ? compareAt : null);
  const features = extractFeatures($);
  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: brand });
  }
  if (sku && !features.some((f) => /sku|barkod|barcode/i.test(f.name))) {
    features.push({ name: "Barkod", value: sku });
  }

  return {
    title,
    sourceUrl,
    siteName: "Hepegitim",
    siteLogoUrl,
    brand: brand || undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: price || finalSale,
    compareAtPrice: compareAt && compareAt > finalSale ? compareAt : null,
    discountPercent: disc,
    salePrice: finalSale,
    images: [...images].slice(0, 12),
    features,
    inStock: true,
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchTrendyolHtml(url: string): Promise<string> {
  return fetchProtectedMarketplaceHtml(
    url,
    "trendyol",
    "Trendyol sayfası alınamadı (bot koruması). Canlıda BROWSER_WORKER_URL yapılandırın veya daha sonra tekrar deneyin.",
  );
}

function scrapeTrendyolPool(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let inStock = true;
  const images: string[] = [];
  const features: ProductPoolFeature[] = [];
  const axes: Array<{ name: string; values: string[] }> = [];

  // JSON-LD Product
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).html() || "");
      const nodes = Array.isArray(raw) ? raw : Array.isArray(raw["@graph"]) ? raw["@graph"] : [raw];
      for (const node of nodes) {
        if (String(node?.["@type"] || "") !== "Product") continue;
        if (!title) title = cleanText(String(node.name || ""));
        const b = node.brand;
        if (!brand) brand = typeof b === "string" ? b : cleanText(String((b as { name?: string })?.name || ""));
        if (!sku) sku = String(node.sku || node.mpn || "");
        const img = node.image;
        const imgs = Array.isArray(img) ? img : img ? [img] : [];
        for (const i of imgs) {
          if (typeof i === "string" && i.startsWith("http") && !images.includes(i)) images.push(i);
        }
        const offer = node.offers as Record<string, unknown> | undefined;
        if (offer) {
          const p = parseTrPrice(String(offer.price ?? "")) || parseTrPrice(String(offer.lowPrice ?? ""));
          if (p && p > 0) salePrice = p;
          if (/OutOfStock|SoldOut/i.test(String(offer.availability || ""))) inStock = false;
        }
        const color = cleanText(String(node.color || ""));
        if (color) features.push({ name: "Renk", value: color });
        for (const p of Array.isArray(node.additionalProperty) ? node.additionalProperty : []) {
          const n = cleanText(String(p?.name || ""));
          const v = cleanText(String(p?.value || ""));
          if (n && v) features.push({ name: n, value: v });
        }
      }
    } catch { /* ignore */ }
  });

  // window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ veya benzeri gömülü JSON
  for (const m of html.matchAll(/window\.__(?:PRODUCT_DETAIL_APP_INITIAL_STATE|state|INITIAL_STATE)__\s*=\s*(\{[\s\S]{20,}?\});\s*(?:window|var|let|const|<\/script>)/gi)) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>;
      const pd = (data.product || data.productDetail || data) as Record<string, unknown> | null;
      if (!pd) continue;
      if (!title && pd.name) title = cleanText(String(pd.name));
      if (!brand && pd.brand) brand = cleanText(String(typeof pd.brand === "object" ? (pd.brand as Record<string, unknown>).name ?? "" : pd.brand));
      if (!sku && pd.id) sku = String(pd.id);
      const price = Number(pd.price ?? (pd as Record<string, unknown>).priceInfo);
      if (!salePrice && price > 0) salePrice = price;

      // Varyant eksenleri
      const allVariants = (pd.allVariants || pd.variants || []) as Array<Record<string, unknown>>;
      for (const v of allVariants) {
        const attribs = (v.attributes || v.attributeList || []) as Array<Record<string, unknown>>;
        for (const att of attribs) {
          const axisName = cleanText(String(att.name || att.attributeName || ""));
          const val = cleanText(String(att.value || att.attributeValue || ""));
          if (!axisName || !val) continue;
          const idx = axes.findIndex((a) => a.name.toLowerCase() === axisName.toLowerCase());
          if (idx >= 0) { if (!axes[idx].values.includes(val)) axes[idx].values.push(val); }
          else axes.push({ name: axisName, values: [val] });
        }
      }
      break;
    } catch { /* ignore */ }
  }

  // og: meta fallback
  if (!title) title = cleanText($('meta[property="og:title"]').attr("content") || $("h1").first().text() || "Ürün");
  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      parseTrPrice($("[data-price]").attr("data-price") || "") ||
      parseTrPrice($(".product-price-container, .pr-bx-pr-dsc, .prc-dsc").first().text()) || 0;
  }
  if (!images.length) {
    const ogImg = $('meta[property="og:image"]').attr("content");
    if (ogImg) images.push(ogImg);
    $("img[src*='trendyol-mbu']").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (src.startsWith("http") && !images.includes(src)) images.push(src);
    });
  }
  const inStockMeta = $('meta[property="product:availability"]').attr("content");
  if (inStockMeta && /out.of.stock/i.test(inStockMeta)) inStock = false;

  const compareAt = listPrice > salePrice ? listPrice : null;
  const { variantOptions, variants } = buildPoolVariants(axes, salePrice);

  if (brand && !features.some((f) => /marka/i.test(f.name))) features.unshift({ name: "Marka", value: brand });
  if (sku && !features.some((f) => /sku|model/i.test(f.name))) features.push({ name: "Model Kodu", value: sku });

  return {
    title: title || "Trendyol Ürün",
    sourceUrl,
    siteName: "trendyol",
    siteLogoUrl: "https://www.trendyol.com/favicon.ico",
    brand: brand || undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: discountPercent(salePrice, compareAt),
    salePrice,
    images: images.slice(0, 12),
    features: features.slice(0, 24),
    inStock,
    variantOptions: variantOptions.length ? variantOptions : undefined,
    variants: variants.length ? variants : undefined,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapeGeneric(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;
  const host = hostnameOf(sourceUrl);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Ürün";

  const ogImage = $('meta[property="og:image"]').attr("content");
  const images: string[] = [];
  if (ogImage) images.push(absoluteUrl(origin, ogImage));

  const priceMeta =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[itemprop="price"]').attr("content") ||
    $('[itemprop="price"]').attr("content") ||
    $(".price").first().text();
  const salePrice = parseTrPrice(String(priceMeta || "")) ?? 0;

  const logo =
    $('link[rel="icon"]').attr("href") ||
    $('meta[property="og:image"]').attr("content") ||
    faviconFor(sourceUrl);

  return {
    title,
    sourceUrl,
    siteName: host,
    siteLogoUrl: logo ? absoluteUrl(origin, logo) : faviconFor(sourceUrl),
    currency: "TRY",
    price: salePrice,
    compareAtPrice: null,
    discountPercent: 0,
    salePrice,
    images: images.slice(0, 12),
    features: extractFeatures($),
    inStock: true,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapeBeymen(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let color = "";
  let inStock = true;
  const images: string[] = [];
  const features: ProductPoolFeature[] = [];

  const marker = "BEYMEN.productMain = ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx >= 0) {
    const start = markerIdx + marker.length;
    let depth = 0;
    let end = -1;
    for (let p = start; p < html.length; p++) {
      const c = html[p];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = p + 1;
          break;
        }
      }
    }
    if (end > start) {
      try {
        const data = JSON.parse(html.slice(start, end)) as Record<string, unknown>;
        const displayName = cleanText(String(data.displayName || ""));
        brand = cleanText(String(data.brandName || ""));
        color = cleanText(String(data.colorName || ""));
        sku = String(data.productId || "");
        title = brand && displayName ? `${brand} ${displayName}` : displayName || brand;

        const actual = Number(data.actualPrice);
        if (Number.isFinite(actual) && actual > 0) salePrice = actual;

        if (data.isStrikeThroughPriceExist && data.strikeThroughPriceText) {
          const struck = parseTrPrice(String(data.strikeThroughPriceText));
          if (struck && struck > salePrice) listPrice = struck;
        }

        const imgs = (data.images as { default?: unknown } | undefined)?.default;
        if (Array.isArray(imgs)) {
          for (const img of imgs) {
            if (typeof img === "string" && img.startsWith("http")) images.push(img);
          }
        }
      } catch {
        /* fall through */
      }
    }
  }

  // JSON-LD yedek (kontrol karakterleri olabilir — temizle)
  if (!salePrice || !title) {
    const ldMatch = html.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
    );
    if (ldMatch) {
      try {
        const cleaned = ldMatch[1]
          .replace(/[\u0000-\u001f]+/g, " ")
          .replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
        const data = JSON.parse(cleaned) as Record<string, unknown>;
        if (String(data["@type"] || "") === "Product") {
          if (!title) title = cleanText(String(data.name || ""));
          const brandVal = data.brand;
          if (!brand) {
            if (typeof brandVal === "string") brand = brandVal;
            else if (brandVal && typeof brandVal === "object") {
              brand = cleanText(String((brandVal as { name?: string }).name || ""));
            }
          }
          const offer = data.offers as Record<string, unknown> | undefined;
          if (offer) {
            const p = Number(offer.price);
            if (!salePrice && Number.isFinite(p) && p > 0) salePrice = p;
            const avail = String(offer.availability || "");
            if (/OutOfStock|SoldOut/i.test(avail)) inStock = false;
          }
          const img = data.image;
          if (typeof img === "string" && img) images.push(img);
          else if (Array.isArray(img)) {
            for (const i of img) if (typeof i === "string" && i) images.push(i);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!title) {
    title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Ürün";
    title = title
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\s*[|-]\s*Beymen.*$/i, "")
      .trim();
  }

  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      parseTrPrice($(".o-productDetail__price").first().text()) ||
      0;
  }

  if (!images.length) {
    const og = $('meta[property="og:image"]').attr("content");
    if (og) images.push(absoluteUrl(origin, og));
  }

  // Sepette kampanya fiyatı (bilgi; alış fiyatı productMain.actualPrice)
  const basketMatch =
    html.match(/Sepette[^0-9]{0,80}?(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL/i) ||
    cleanText($("body").text()).match(/Sepette\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL/i);
  if (basketMatch) {
    const basket = parseTrPrice(basketMatch[1]);
    if (basket && basket > 0 && basket < salePrice) {
      features.push({ name: "Sepette fiyat", value: `${basket.toLocaleString("tr-TR")} TL` });
    }
  }

  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: brand });
  }
  if (color) features.push({ name: "Renk", value: color });
  if (sku) features.push({ name: "Ürün ID", value: sku });

  const compareAt = listPrice > salePrice ? listPrice : null;
  const siteLogoUrl = absoluteUrl(origin, "//cdn.beymen.com/assets/images/favicon.ico");

  return {
    title: cleanText(title),
    sourceUrl,
    siteName: "Beymen",
    siteLogoUrl,
    brand: brand || undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: discountPercent(salePrice, compareAt),
    salePrice,
    images: [...new Set(images)].slice(0, 12),
    features: features.slice(0, 24),
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapePazarama(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let currency = "TRY";
  let inStock = true;
  const features: ProductPoolFeature[] = [];
  const images: string[] = [];

  const ldBlocks = [...html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )];
  for (const m of ldBlocks) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>;
      if (String(data["@type"] || "") !== "Product") continue;

      title = cleanText(String(data.name || ""));
      sku = String(data.sku || "");
      const brandVal = data.brand;
      if (typeof brandVal === "string") brand = brandVal;
      else if (brandVal && typeof brandVal === "object") {
        brand = String((brandVal as { name?: string }).name || "");
      }

      const offer = data.offers as Record<string, unknown> | undefined;
      if (offer) {
        const p = Number(offer.price);
        if (Number.isFinite(p) && p > 0) salePrice = p;
        if (typeof offer.priceCurrency === "string" && offer.priceCurrency) {
          currency = offer.priceCurrency;
        }
        const avail = String(offer.availability || "");
        if (/OutOfStock|SoldOut/i.test(avail)) inStock = false;
        const seller = cleanText(String(offer.seller || ""));
        if (seller) features.push({ name: "Satıcı", value: seller });
      }

      const img = data.image;
      if (typeof img === "string" && img) images.push(img);
      else if (Array.isArray(img)) {
        for (const i of img) if (typeof i === "string" && i) images.push(i);
      }

      for (const key of ["color", "weight", "width", "height", "depth", "material"] as const) {
        const v = cleanText(String(data[key] ?? ""));
        if (!v || /^yok$/i.test(v)) continue;
        const labels: Record<string, string> = {
          color: "Renk",
          weight: "Ağırlık",
          width: "Genişlik",
          height: "Yükseklik",
          depth: "Derinlik",
          material: "Materyal",
        };
        features.push({ name: labels[key], value: v });
      }
      break;
    } catch {
      /* next block */
    }
  }

  // Nuxt payload: listPrice:{...value:32340...}
  const listMatch = html.match(/listPrice\s*:\s*\{[^}]*?\bvalue\s*:\s*(\d+(?:\.\d+)?)/);
  if (listMatch) {
    const lp = Number(listMatch[1]);
    if (Number.isFinite(lp) && lp > salePrice) listPrice = lp;
  }

  const discMatch = html.match(/discountRate\s*:\s*\{\s*discountRate\s*:\s*"(\d+)"/);
  let discountPct = 0;
  if (discMatch) {
    const d = Number(discMatch[1]);
    if (Number.isFinite(d) && d > 0) discountPct = d;
  }

  // URL'deki ürün kodundan galeri görselleri
  const codeMatch = sourceUrl.match(/-p-(\d{6,})/i) || sourceUrl.match(/\/(\d{10,})(?:\?|$)/);
  const productCode = codeMatch?.[1] || "";
  if (productCode) {
    const re = new RegExp(
      `https://img\\.pzrmcdn\\.com[^"'\\\\\\s]*${productCode}[^"'\\\\\\s]+\\.(?:jpg|jpeg|png|webp)`,
      "gi",
    );
    const found = html.match(re) || [];
    for (const raw of found) {
      const full = raw.replace(/\/mnresize\/\d+\/\d+\//i, "/");
      if (!/\/icons\//i.test(full)) images.push(full);
    }
  }

  if (!title) {
    title =
      $('meta[property="og:title"], meta[name="og:title"]').attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Ürün";
    title = title.replace(/\s*[|-]\s*Pazarama.*$/i, "").trim() || title;
  }

  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      0;
  }

  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: brand });
  }
  if (sku && !features.some((f) => /sku|barkod|barcode/i.test(f.name))) {
    features.push({ name: "SKU", value: sku });
  }

  const uniqueImages = [...new Set(images)].slice(0, 12);
  const compareAt = listPrice > salePrice ? listPrice : null;
  const disc = discountPct || discountPercent(salePrice, compareAt);

  const logoHref =
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel="icon"]').attr("href") ||
    "https://img.pzrmcdn.com/mnresize/64/64/asset/icons/pwa.png";

  return {
    title,
    sourceUrl,
    siteName: "Pazarama",
    siteLogoUrl: absoluteUrl(origin, logoHref),
    brand: brand || undefined,
    sku: sku || undefined,
    currency,
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: disc,
    salePrice,
    images: uniqueImages,
    features: features.slice(0, 24),
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

function scrapeIdefix(html: string, sourceUrl: string): ProductPoolProduct {
  const $ = cheerio.load(html);
  const origin = new URL(sourceUrl).origin;

  let title = "";
  let brand = "";
  let sku = "";
  let salePrice = 0;
  let listPrice = 0;
  let discountPct = 0;
  const images: string[] = [];
  const features: ProductPoolFeature[] = [];

  const nextMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (nextMatch) {
    try {
      const next = JSON.parse(nextMatch[1]) as {
        props?: { pageProps?: { productDetail?: Record<string, unknown> } };
      };
      const pd = next.props?.pageProps?.productDetail;
      if (pd) {
        title = String(pd.title || "");
        brand = String(pd.brandName || "");
        sku = String(pd.barcode || "");
        const cp = pd.currentPrice as Record<string, unknown> | undefined;
        if (cp) {
          const effective = Number(cp.effectivePrice ?? cp.discountedPrice ?? 0);
          const base = Number(cp.price ?? 0);
          if (Number.isFinite(effective) && effective > 0) salePrice = effective;
          if (Number.isFinite(base) && base > 0) listPrice = base;
          const dp = Number(cp.discountPercentage ?? 0);
          if (Number.isFinite(dp) && dp > 0) discountPct = Math.round(dp);
          const varianters = Array.isArray(cp.varianters) ? cp.varianters : [];
          for (const v of varianters) {
            const row = v as Record<string, unknown>;
            const name = cleanText(String(row.attributeName || ""));
            const value = cleanText(String(row.attributeValueName || ""));
            if (name && value) features.push({ name, value });
          }
        }
        const imgs = Array.isArray(pd.images) ? pd.images : [];
        for (const img of imgs) {
          const src = String((img as { src?: string })?.src || "");
          if (!src) continue;
          images.push(
            src.replace("{size}", "800/0/").replace(/\/resize\/\{size\}/, "/resize/800/0/"),
          );
        }
        const descHtml = String(pd.description || "");
        if (descHtml) {
          const $desc = cheerio.load(descHtml);
          const paras = $desc("p")
            .map((_, el) => cleanText($desc(el).text()))
            .get()
            .filter((t) => t.length > 20 && t.length < 280)
            .slice(0, 8);
          paras.forEach((p, i) => {
            if (!features.some((f) => f.value === p)) {
              features.push({ name: `Özellik ${i + 1}`, value: p });
            }
          });
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (!title) {
    title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "Ürün";
  }

  if (!images.length) {
    const og = $('meta[property="og:image"]').attr("content");
    if (og) images.push(absoluteUrl(origin, og));
  }

  if (!salePrice) {
    salePrice =
      parseTrPrice($('meta[property="product:price:amount"]').attr("content") || "") ||
      parseTrPrice($("[data-testid*='price']").first().text()) ||
      0;
  }

  if (brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: brand });
  }
  if (sku && !features.some((f) => /barkod|sku/i.test(f.name))) {
    features.push({ name: "Barkod", value: sku });
  }

  const compareAt = listPrice > salePrice ? listPrice : null;
  const disc =
    discountPct ||
    discountPercent(salePrice, compareAt);

  const siteLogoUrl = absoluteUrl(origin, "/images/app-icons/logo.svg");

  return {
    title,
    sourceUrl,
    siteName: "idefix",
    siteLogoUrl,
    brand: brand || undefined,
    sku: sku || undefined,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: disc,
    salePrice,
    images: [...new Set(images)].slice(0, 12),
    features: features.slice(0, 24),
    inStock: true,
    scrapedAt: new Date().toISOString(),
  };
}

export async function scrapeProductPoolUrl(url: string): Promise<ProductPoolProduct> {
  const trimmed = String(url || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Geçerli bir http(s) URL girin");
  }

  const host = hostnameOf(trimmed).toLowerCase();

  let product: ProductPoolProduct;

  // PTT AVM Cloudflare korumalı — mevcut stealth scraper (axios UA + Puppeteer)
  if (host.includes("pttavm.com")) {
    product = await scrapePttavmPool(trimmed);
  } else if (host.includes("n11.com")) {
    // n11 Cloudflare — crawler UA → Browser Worker → stealth Chromium
    const html = await fetchN11Html(trimmed);
    product = await scrapeN11(html, trimmed);
    if (!(product.salePrice > 0)) {
      throw new Error("n11 ürün fiyatı alınamadı");
    }
  } else if (host.includes("trendyol.com")) {
    // Trendyol bot korumalı — Browser Worker → stealth Chromium fallback
    const html = await fetchTrendyolHtml(trimmed);
    product = scrapeTrendyolPool(html, trimmed);
    if (!(product.salePrice > 0)) {
      throw new Error("Trendyol ürün fiyatı alınamadı");
    }
  } else if (host.includes("amazon.")) {
    product = await scrapeAmazonPool(trimmed);
  } else {
    const html = await fetchHtml(trimmed);

  if (host.includes("hepegitim.com")) {
      product = scrapeHepegitim(html, trimmed);
    } else if (host.includes("idefix.com")) {
      product = scrapeIdefix(html, trimmed);
    } else if (host.includes("pazarama.com")) {
      product = scrapePazarama(html, trimmed);
    } else if (host.includes("beymen.com")) {
      product = scrapeBeymen(html, trimmed);
      if (!(product.salePrice > 0)) {
        throw new Error("Beymen ürün fiyatı alınamadı");
      }
    } else {
      product = scrapeGeneric(html, trimmed);
    }
  }

  const result = {
    ...product,
    images: filterProductImagesForShopify(product.images, product.siteLogoUrl),
  };

  // Supabase mobile mirror — fire-and-forget; scrape sonucunu etkilemez
  void import("../services/mobile-sync.service")
    .then(({ upsertMobileProduct }) => {
      const sourceKey =
        result.sku ||
        result.sourceUrl?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] ||
        result.sourceUrl?.match(/-(\d{6,})(?:\?|$)/)?.[1] ||
        result.sourceUrl;
      return upsertMobileProduct({
        sourceProductId: String(sourceKey || result.sourceUrl),
        source: String(result.siteName || host || "unknown").toLowerCase(),
        title: result.title,
        imageUrl: result.images?.[0] || null,
        sourceUrl: result.sourceUrl,
        price: result.salePrice,
        currency: result.currency || "TRY",
        variantCount: 0,
        stockStatus: result.inStock ? "in_stock" : "out_of_stock",
        shopifyStatus: "none",
        scrapedAt: result.scrapedAt,
      });
    })
    .catch((err) =>
      console.warn(
        "[mobile-sync] pool scrape upsert skipped:",
        err instanceof Error ? err.message : String(err),
      ),
    );

  return result;
}

function normalizeAmazonProductUrl(sourceUrl: string): { asin: string; cleanUrl: string } {
  const asinMatch =
    sourceUrl.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i) ||
    sourceUrl.match(/[?&]asin=([A-Z0-9]{10})/i);
  const asin = asinMatch?.[1]?.toUpperCase() || "";
  if (!asin) {
    throw new Error("Amazon ASIN bulunamadı (ör. /dp/B07L7RCGJC)");
  }
  let host = "www.amazon.com.tr";
  try {
    host = new URL(sourceUrl).hostname || host;
  } catch {
    /* keep default */
  }
  if (!/amazon\./i.test(host)) host = "www.amazon.com.tr";
  return {
    asin,
    cleanUrl: `https://${host}/dp/${asin}?language=tr_TR`,
  };
}

function amazonImageScore(url: string): number {
  const sl = url.match(/_SL(\d+)_/i)?.[1];
  if (sl) return Number(sl);
  const ux = url.match(/_UX(\d+)_/i)?.[1];
  if (ux) return Number(ux);
  const sx = url.match(/_SX(\d+)_/i)?.[1];
  if (sx) return Number(sx);
  return 200;
}

function preferAmazonProductImages(urls: string[]): string[] {
  const byId = new Map<string, string>();
  for (const raw of urls) {
    if (!raw.startsWith("http")) continue;
    const u = raw.replace(/\\u002F/gi, "/").split("?")[0];
    if (isLikelySiteBrandingImage(u)) continue;
    if (!/media-amazon\.com\/images\/I\//i.test(u)) continue;
    const id = u.match(/\/images\/I\/([^./]+)/i)?.[1];
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || amazonImageScore(u) > amazonImageScore(prev)) byId.set(id, u);
  }
  return [...byId.values()]
    .sort((a, b) => amazonImageScore(b) - amazonImageScore(a))
    .slice(0, 12);
}

function amazonOptionLabel(key: string): string {
  const k = String(key || "").toLowerCase();
  if (/size|beden|numara|shoe/i.test(k)) return "Beden";
  if (/color|renk|colour/i.test(k)) return "Renk";
  if (/style|stil/i.test(k)) return "Stil";
  if (/pattern|desen/i.test(k)) return "Desen";
  if (/material|materyal|kumaş|kumas/i.test(k)) return "Materyal";
  if (/fit|kalıp|kalip/i.test(k)) return "Kalıp";
  const pretty = String(key || "")
    .replace(/_name$/i, "")
    .replace(/_/g, " ")
    .trim();
  return pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : "Seçenek";
}

function extractJsonObjectAfterKey(html: string, key: string): unknown | null {
  const re = new RegExp(`"${key}"\\s*:\\s*\\{`);
  const m = html.match(re);
  if (!m || m.index == null) return null;
  const start = html.indexOf("{", m.index + m[0].length - 1);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length && i < start + 400_000; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

type AmazonVariantExtract = {
  variantOptions: ProductPoolVariantOption[];
  variants: ProductPoolVariant[];
};

function extractAmazonVariants(
  html: string,
  $: CheerioAPI,
  opts: { currentAsin: string; salePrice: number; compareAt: number | null },
): AmazonVariantExtract {
  const labelsRaw =
    (extractJsonObjectAfterKey(html, "variationDisplayLabels") as Record<string, string> | null) ||
    {};
  const dimValues =
    (extractJsonObjectAfterKey(html, "dimensionValuesDisplayData") as Record<
      string,
      string[]
    > | null) || {};
  const asinVariationValues =
    (extractJsonObjectAfterKey(html, "asinVariationValues") as Record<
      string,
      Record<string, string>
    > | null) || {};
  const dimensionToAsinMap =
    (extractJsonObjectAfterKey(html, "dimensionToAsinMap") as Record<string, string> | null) ||
    {};

  // Amazon'da değer sırası `dimensions` dizisine göredir (labels key sırasına değil).
  let dimensionsOrder: string[] = [];
  const dimsArrMatch = html.match(/"dimensions"\s*:\s*\[([^\]]{0,400})\]/);
  if (dimsArrMatch?.[1]) {
    dimensionsOrder = [...dimsArrMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }

  let dimKeys: string[] =
    dimensionsOrder.length > 0 ? dimensionsOrder : Object.keys(labelsRaw);
  const sampleAsin = Object.keys(dimValues)[0];
  const sampleDims = sampleAsin ? dimValues[sampleAsin] : null;

  if (!dimKeys.length) {
    const firstVar = Object.values(asinVariationValues)[0];
    if (firstVar && typeof firstVar === "object") {
      dimKeys = Object.keys(firstVar).filter((k) => !/^(asin|ASIN)$/i.test(k));
    }
  }

  const domAxes: Array<{ name: string; values: string[]; asins: Map<string, string> }> = [];
  const pushDomAxis = (name: string, values: string[], asins: Map<string, string>) => {
    const cleanVals = [...new Set(values.map((v) => cleanText(v)).filter(Boolean))];
    if (!cleanVals.length) return;
    if (domAxes.some((a) => a.name.toLowerCase() === name.toLowerCase())) return;
    domAxes.push({ name, values: cleanVals, asins });
  };

  const twisterBlocks = [
    { sel: "#variation_size_name, #inline-twister-row-size_name", label: "Beden" },
    { sel: "#variation_color_name, #inline-twister-row-color_name", label: "Renk" },
    { sel: "#variation_style_name, #inline-twister-row-style_name", label: "Stil" },
  ];
  for (const block of twisterBlocks) {
    const root = $(block.sel).first();
    if (!root.length) continue;
    const values: string[] = [];
    const asins = new Map<string, string>();
    root.find("li").each((_, el) => {
      const $el = $(el);
      const asin = String($el.attr("data-defaultasin") || $el.attr("data-asin") || "").trim();
      let label =
        cleanText($el.attr("title") || "") ||
        cleanText($el.find("img").attr("alt") || "") ||
        cleanText($el.find(".swatch-title-text-display, .a-size-base").first().text()) ||
        cleanText($el.text());
      label = label
        .replace(/tıkla.*$/i, "")
        .replace(/click to.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!label || label.length > 60) return;
      if (/seçildi|selected|unavailable|mevcut değil/i.test(label) && label.length < 12) return;
      values.push(label);
      if (asin) asins.set(label, asin);
    });
    pushDomAxis(block.label, values, asins);
  }

  const optionNames: string[] = [];
  const optionValues: string[][] = [];

  if (dimKeys.length && sampleDims && Array.isArray(sampleDims)) {
    for (let i = 0; i < Math.min(3, sampleDims.length); i++) {
      const key = dimKeys[i] || `option_${i + 1}`;
      const name = amazonOptionLabel(labelsRaw[key] || key);
      const values = new Set<string>();
      for (const dims of Object.values(dimValues)) {
        if (Array.isArray(dims) && dims[i]) values.add(cleanText(String(dims[i])));
      }
      const list = [...values].filter(Boolean);
      if (!list.length) continue;
      optionNames.push(name);
      optionValues.push(list);
    }
  } else if (Object.keys(asinVariationValues).length) {
    for (const key of dimKeys.slice(0, 3)) {
      const name = amazonOptionLabel(labelsRaw[key] || key);
      const values = new Set<string>();
      for (const row of Object.values(asinVariationValues)) {
        const v = row?.[key];
        if (v) values.add(cleanText(String(v)));
      }
      const list = [...values].filter(Boolean);
      if (!list.length) continue;
      optionNames.push(name);
      optionValues.push(list);
    }
  }

  if (!optionNames.length && domAxes.length) {
    for (const axis of domAxes.slice(0, 3)) {
      optionNames.push(axis.name);
      optionValues.push(axis.values);
    }
  } else if (optionNames.length && domAxes.length) {
    // DOM'dan yalnızca aynı isimli eksene değer ekle; yanlış etiket karışmasını önle
    for (const axis of domAxes) {
      const idx = optionNames.findIndex((n) => n.toLowerCase() === axis.name.toLowerCase());
      if (idx < 0) continue;
      const looksLikeNav = (v: string) =>
        /^(←|→|‹|›|\d+|next|prev|önceki|sonraki)$/i.test(v.trim());
      optionValues[idx] = [
        ...new Set([...optionValues[idx], ...axis.values.filter((v) => !looksLikeNav(v))]),
      ];
    }
  }

  if (!optionNames.length) {
    return { variantOptions: [], variants: [] };
  }

  const variantOptions: ProductPoolVariantOption[] = optionNames.map((name, i) => ({
    name,
    values: optionValues[i] || [],
  }));

  const variants: ProductPoolVariant[] = [];
  const seen = new Set<string>();
  const pushVariant = (v: ProductPoolVariant) => {
    const optKey = `${v.option1 || ""}|${v.option2 || ""}|${v.option3 || ""}`;
    const asinKey = v.asin ? `asin:${v.asin}` : "";
    if (seen.has(optKey) || (asinKey && seen.has(asinKey))) {
      // Aynı seçenek varsa ASIN'i olanı tercih et
      if (v.asin) {
        const idx = variants.findIndex(
          (x) =>
            `${x.option1 || ""}|${x.option2 || ""}|${x.option3 || ""}` === optKey && !x.asin,
        );
        if (idx >= 0) {
          variants[idx] = { ...variants[idx], ...v };
          seen.add(asinKey);
        }
      }
      return;
    }
    seen.add(optKey);
    if (asinKey) seen.add(asinKey);
    variants.push(v);
  };

  for (const [asin, dims] of Object.entries(dimValues)) {
    if (!Array.isArray(dims) || !dims.length) continue;
    const option1 = cleanText(String(dims[0] || ""));
    const option2 = cleanText(String(dims[1] || ""));
    const option3 = cleanText(String(dims[2] || ""));
    if (!option1 && !option2) continue;
    const titleParts = [option1, option2, option3].filter(Boolean);
    pushVariant({
      title: titleParts.join(" / ") || asin,
      asin,
      sku: asin,
      option1: option1 || undefined,
      option2: option2 || undefined,
      option3: option3 || undefined,
      price: opts.salePrice,
      compareAtPrice: opts.compareAt,
      inStock: true,
    });
  }

  if (!variants.length) {
    for (const [asin, row] of Object.entries(asinVariationValues)) {
      if (!row || typeof row !== "object") continue;
      const vals = dimKeys.slice(0, 3).map((k) => cleanText(String(row[k] || "")));
      if (!vals.some(Boolean)) continue;
      pushVariant({
        title: vals.filter(Boolean).join(" / ") || asin,
        asin,
        sku: asin,
        option1: vals[0] || undefined,
        option2: vals[1] || undefined,
        option3: vals[2] || undefined,
        price: opts.salePrice,
        compareAtPrice: opts.compareAt,
        inStock: true,
      });
    }
  }

  if (!variants.length && Object.keys(dimensionToAsinMap).length && optionValues.length) {
    for (const [combo, asin] of Object.entries(dimensionToAsinMap)) {
      const idxs = String(combo).split("_").map((x) => Number(x));
      const vals = idxs.map((i, axis) => optionValues[axis]?.[i] || "").filter(Boolean);
      if (!vals.length) continue;
      pushVariant({
        title: vals.join(" / "),
        asin: String(asin),
        sku: String(asin),
        option1: vals[0],
        option2: vals[1],
        option3: vals[2],
        price: opts.salePrice,
        compareAtPrice: opts.compareAt,
        inStock: true,
      });
    }
  }

  if (!variants.length && domAxes.length === 1) {
    const axis = domAxes[0];
    for (const val of axis.values) {
      const asin = axis.asins.get(val) || (val === axis.values[0] ? opts.currentAsin : undefined);
      pushVariant({
        title: val,
        asin,
        sku: asin,
        option1: val,
        price: opts.salePrice,
        compareAtPrice: opts.compareAt,
        inStock: true,
      });
    }
  } else if (!variants.length && optionValues.length === 1) {
    for (const val of optionValues[0]) {
      pushVariant({
        title: val,
        option1: val,
        sku: opts.currentAsin,
        asin: opts.currentAsin,
        price: opts.salePrice,
        compareAtPrice: opts.compareAt,
        inStock: true,
      });
    }
  }

  // JSON yalnızca mevcut ASIN kombinasyonlarını verir; eksik seçenekleri eksenlerden tamamla
  if (optionValues.length >= 1 && variants.length > 0) {
    const expected = optionValues.reduce((n, vals) => n * Math.max(1, vals.length), 1);
    if (expected <= 40 && variants.length < expected) {
      const combos: string[][] = [[]];
      for (const vals of optionValues.slice(0, 3)) {
        const next: string[][] = [];
        for (const prefix of combos) {
          for (const v of vals) next.push([...prefix, v]);
        }
        combos.length = 0;
        combos.push(...next);
      }
      for (const parts of combos) {
        pushVariant({
          title: parts.join(" / "),
          option1: parts[0],
          option2: parts[1],
          option3: parts[2],
          price: opts.salePrice,
          compareAtPrice: opts.compareAt,
          inStock: true,
        });
      }
    }
  }

  return { variantOptions, variants: variants.slice(0, 100) };
}

function scrapeAmazon(html: string, sourceUrl: string): ProductPoolProduct {
  const { asin, cleanUrl } = normalizeAmazonProductUrl(sourceUrl);
  const $ = cheerio.load(html);

  let title =
    cleanText($("#productTitle").text()) ||
    cleanText($('meta[property="og:title"]').attr("content") || "") ||
    cleanText($("#title").text()) ||
    cleanText($("title").text());
  title = title
    .replace(/\s*:\s*Amazon\.com\.tr.*$/i, "")
    .replace(/\s*[|-]\s*Amazon.*$/i, "")
    .trim();

  let brand =
    cleanText($("#bylineInfo").text()) ||
    cleanText($("a#bylineInfo").text()) ||
    html.match(/"brand"\s*:\s*"([^"]{2,80})"/i)?.[1] ||
    "";
  brand = brand
    .replace(/^(Marka\s*:|Brand\s*:|Visit the|Store)\s*/i, "")
    .replace(/\s+Store$/i, "")
    .trim();

  const priceCandidates: number[] = [];
  const listCandidates: number[] = [];

  $("#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen, .apexPriceToPay .a-offscreen")
    .each((_, el) => {
      const p = parseTrPrice($(el).text());
      if (p && p > 0 && p < 5_000_000) priceCandidates.push(p);
    });
  $(".a-price.a-text-price .a-offscreen, #listPrice, span.a-price.a-text-price span[aria-hidden]")
    .each((_, el) => {
      const p = parseTrPrice($(el).text());
      if (p && p > 0 && p < 5_000_000) listCandidates.push(p);
    });

  // Fallback: all offscreen prices (first is usually sale)
  if (!priceCandidates.length) {
    $(".a-price .a-offscreen").each((_, el) => {
      const p = parseTrPrice($(el).text());
      if (p && p > 0 && p < 5_000_000) priceCandidates.push(p);
    });
  }

  const ldPrices: number[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = JSON.parse($(el).html() || "");
      const nodes = Array.isArray(raw) ? raw : [raw];
      for (const node of nodes) {
        if (String(node?.["@type"] || "") !== "Product") continue;
        if (!title && node.name) title = cleanText(String(node.name));
        const brandVal = node.brand;
        if (!brand) {
          if (typeof brandVal === "string") brand = brandVal;
          else if (brandVal && typeof brandVal === "object") {
            brand = String((brandVal as { name?: string }).name || "");
          }
        }
        const offer = node.offers;
        const offers = Array.isArray(offer) ? offer : offer ? [offer] : [];
        for (const o of offers) {
          const p = parseTrPrice(String(o?.price ?? o?.lowPrice ?? ""));
          if (p && p > 0) ldPrices.push(p);
        }
      }
    } catch {
      /* next */
    }
  });

  let salePrice =
    (priceCandidates.length ? Math.min(...priceCandidates) : 0) ||
    (ldPrices.length ? Math.min(...ldPrices) : 0);
  let listPrice = listCandidates.length ? Math.max(...listCandidates) : 0;
  if (listPrice > 0 && salePrice > 0 && listPrice < salePrice) {
    const tmp = listPrice;
    listPrice = salePrice;
    salePrice = tmp;
  }

  const imageUrls: string[] = [];
  const landing =
    $("#landingImage").attr("data-old-hires") ||
    $("#imgTagWrapperId img").attr("data-old-hires") ||
    $("#landingImage").attr("src") ||
    $('meta[property="og:image"]').attr("content") ||
    "";
  if (landing.startsWith("http")) imageUrls.push(landing);
  try {
    const dyn = $("#landingImage").attr("data-a-dynamic-image");
    if (dyn) {
      const map = JSON.parse(dyn) as Record<string, unknown>;
      for (const u of Object.keys(map)) {
        if (u.startsWith("http")) imageUrls.push(u);
      }
    }
  } catch {
    /* ignore */
  }
  for (const m of html.matchAll(/"(?:hiRes|large|mainUrl)"\s*:\s*"(https:[^"]+)"/g)) {
    imageUrls.push(m[1].replace(/\\u002F/gi, "/"));
  }
  const images = preferAmazonProductImages(imageUrls);

  const features: ProductPoolFeature[] = [];
  const pushFeat = (name: string, value: string) => {
    const n = cleanText(name).replace(/:$/, "");
    const v = cleanText(value);
    if (!n || !v || n.length > 80 || v.length > 400) return;
    if (features.some((f) => f.name === n && f.value === v)) return;
    features.push({ name: n, value: v });
  };

  $("#feature-bullets li span.a-list-item").each((_, el) => {
    const t = cleanText($(el).text());
    if (!t || t.length < 8) return;
    if (/Bu ürünle ilgili|Make sure|Garanti bilgisini/i.test(t)) return;
    pushFeat("Özellik", t);
  });
  $("#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr").each(
    (_, tr) => {
      const $tr = $(tr);
      const th = cleanText($tr.find("th").first().text() || $tr.find("td").eq(0).text());
      const td = cleanText($tr.find("td").last().text());
      if (th && td && th !== td) pushFeat(th, td);
    },
  );
  if (brand) pushFeat("Marka", brand);
  pushFeat("ASIN", asin);

  const availText = cleanText($("#availability").text() || $("#availability_feature_div").text());
  const inStock = !/stokta\s*yok|şu anda mevcut değil|currently unavailable|out of stock/i.test(
    availText,
  );

  const compareAt = listPrice > salePrice ? listPrice : null;
  const { variantOptions, variants } = extractAmazonVariants(html, $, {
    currentAsin: asin,
    salePrice,
    compareAt,
  });

  return {
    title: title || `Amazon ${asin}`,
    sourceUrl: cleanUrl,
    siteName: "Amazon",
    siteLogoUrl: "https://www.amazon.com.tr/favicon.ico",
    brand: brand || undefined,
    sku: asin,
    currency: "TRY",
    price: compareAt || salePrice,
    compareAtPrice: compareAt,
    discountPercent: discountPercent(salePrice, compareAt),
    salePrice,
    images,
    features: features.slice(0, 24),
    variantOptions: variantOptions.length ? variantOptions : undefined,
    variants: variants.length ? variants : undefined,
    inStock,
    scrapedAt: new Date().toISOString(),
  };
}

async function scrapeAmazonPool(sourceUrl: string): Promise<ProductPoolProduct> {
  const { cleanUrl } = normalizeAmazonProductUrl(sourceUrl);
  const html = await fetchAmazonHtml(cleanUrl);
  const product = scrapeAmazon(html, cleanUrl);
  if (!product.title || product.title === `Amazon ${product.sku}`) {
    throw new Error("Amazon ürün başlığı alınamadı");
  }
  if (!(product.salePrice > 0)) {
    throw new Error("Amazon ürün fiyatı alınamadı");
  }
  return product;
}

/** PTT AVM → ürün havuzu (Cloudflare bypass için pttavm-scraper) */
async function scrapePttavmPool(sourceUrl: string): Promise<ProductPoolProduct> {
  const cleanUrl = sourceUrl.split("?")[0];
  const { scrapePttAvm } = await import("../pttavm-scraper");
  const result = await scrapePttAvm(cleanUrl);

  if (!result.success || !result.title?.trim()) {
    throw new Error(
      result.message ||
        "PTT AVM ürünü çekilemedi (Cloudflare engeli). Daha sonra tekrar deneyin.",
    );
  }

  let salePrice = Number(result.price?.original) || 0;
  const formatted = String(result.price?.formatted || "");
  const fromFormatted = parseTrPrice(formatted);
  if (fromFormatted && fromFormatted > salePrice * 10) {
    salePrice = fromFormatted;
  }
  // TR binlik nokta yanlış parse: 20.936 → 20936
  if (salePrice > 0 && salePrice < 500 && Number.isFinite(salePrice)) {
    const scaled = Math.round(salePrice * 1000);
    if (scaled >= 1000 && scaled < 10_000_000) salePrice = scaled;
  }
  if (!(salePrice > 0)) {
    throw new Error("PTT AVM fiyatı alınamadı");
  }
  salePrice = Math.round(salePrice * 100) / 100;

  const images = (result.images || [])
    .map((img) => (typeof img === "string" ? img : img?.url || ""))
    .filter((u) => typeof u === "string" && u.startsWith("http") && !u.endsWith(".svg"))
    .map((u) => u.split("?")[0]);

  const features: ProductPoolFeature[] = (result.features || [])
    .map((f) => ({
      name: cleanText(String(f.key || "")),
      value: cleanText(String(f.value || "")),
    }))
    .filter((f) => f.name && f.value)
    .slice(0, 24);

  if (result.brand && !features.some((f) => /marka/i.test(f.name))) {
    features.unshift({ name: "Marka", value: cleanText(result.brand) });
  }
  if (result.category && !features.some((f) => /kategori/i.test(f.name))) {
    features.push({ name: "Kategori", value: cleanText(result.category) });
  }

  const inStock =
    Array.isArray(result.variants?.allVariants) && result.variants.allVariants.length > 0
      ? result.variants.allVariants.some((v) => v.inStock)
      : true;

  const { variantOptions, variants } = pttVariantsToPool(result.variants, salePrice);

  return {
    title: cleanText(result.title),
    sourceUrl: cleanUrl,
    siteName: "PTT AVM",
    siteLogoUrl: "https://www.pttavm.com/favicon.ico",
    brand: result.brand ? cleanText(result.brand) : undefined,
    currency: "TRY",
    price: salePrice,
    compareAtPrice: null,
    discountPercent: 0,
    salePrice,
    images: [...new Set(images)].slice(0, 12),
    features,
    inStock,
    variantOptions: variantOptions.length ? variantOptions : undefined,
    variants: variants.length ? variants : undefined,
    scrapedAt: new Date().toISOString(),
  };
}

/** Shopify açıklaması — yalnızca özellikler; yoksa boş */
export function buildProductPoolDescriptionHtml(
  features: Array<{ name?: string; value?: string }> | null | undefined,
): string {
  const rows = (features || [])
    .map((f) => ({
      name: cleanText(String(f?.name || "")),
      value: cleanText(String(f?.value || "")),
    }))
    .filter((f) => f.name && f.value);
  if (!rows.length) return "";

  const items = rows
    .map(
      (f) =>
        `<li><strong>${escapeHtml(f.name)}:</strong> ${escapeHtml(f.value)}</li>`,
    )
    .join("");
  return `<h3>Ürün Özellikleri</h3><ul>${items}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
