import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ProductPoolFeature, ProductPoolProduct } from "./types";

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
  if (cleaned.includes(",") && cleaned.includes(".")) {
    return Number.parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }
  if (cleaned.includes(",")) {
    return Number.parseFloat(cleaned.replace(",", "."));
  }
  return Number.parseFloat(cleaned);
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

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
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

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Sayfa alınamadı (HTTP ${res.status})`);
  }
  return await res.text();
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

  const html = await fetchHtml(trimmed);
  const host = hostnameOf(trimmed).toLowerCase();

  if (host.includes("hepegitim.com")) {
    return scrapeHepegitim(html, trimmed);
  }
  if (host.includes("idefix.com")) {
    return scrapeIdefix(html, trimmed);
  }
  if (host.includes("pazarama.com")) {
    return scrapePazarama(html, trimmed);
  }

  return scrapeGeneric(html, trimmed);
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
