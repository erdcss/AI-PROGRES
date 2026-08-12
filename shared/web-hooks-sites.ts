/** Web sitesi kancaları — ürün havuzu + Trendyol destekli kaynaklar */

export type WebHookSite = {
  id: string;
  name: string;
  domain: string;
  url: string;
  logoUrl: string;
  source: "product-pool" | "trendyol";
  /** Periyodik keşif için liste/arama sayfası */
  discoverUrl?: string;
  /** Ek keşif sayfaları (sırayla denenir) */
  discoverUrls?: string[];
  /** Ürün URL eşleşmesi — yeni siteler için zorunlu */
  productUrlRegex?: string;
  /** Ürün havuzu UI — örnek çalışan ürün linki */
  exampleProductUrl?: string;
};

/** Kayıtlı veya yeni site için ürün URL kontrolü */
export function isWebHookProductUrl(url: string, site: WebHookSite): boolean {
  const u = String(url || "").toLowerCase();
  if (!u.includes(site.domain)) return false;
  if (site.productUrlRegex) {
    try {
      return new RegExp(site.productUrlRegex, "i").test(url);
    } catch {
      /* ignore bad pattern */
    }
  }
  return /\/(urun|product|\/p\/|\/dp\/|gp\/product)|-p-\d+/i.test(u);
}

export function buildWebHookProductUrlRegex(site: WebHookSite): RegExp | null {
  if (!site.productUrlRegex) return null;
  try {
    const dom = site.domain.replace(/\./g, "\\.");
    return new RegExp(
      `https?:\\/\\/(?:www\\.)?${dom}[^\\s"'<>]*${site.productUrlRegex}`,
      "gi",
    );
  } catch {
    return null;
  }
}

export const WEB_HOOK_SITES: WebHookSite[] = [
  {
    id: "trendyol",
    name: "Trendyol",
    domain: "trendyol.com",
    url: "https://www.trendyol.com",
    logoUrl: "https://cdn.dsmcdn.com/web/production/favicon.ico",
    source: "trendyol",
    discoverUrl: "https://www.trendyol.com/sr?wg=1&wc=82",
    discoverUrls: [
      "https://www.trendyol.com/sr?q=yeni",
      "https://www.trendyol.com/sr?st=new",
    ],
    productUrlRegex: "-p-\\d+",
  },
  {
    id: "hepegitim",
    name: "Hepegitim",
    domain: "hepegitim.com",
    url: "https://www.hepegitim.com",
    logoUrl: "https://www.hepegitim.com/skins/shared/images/logo.png",
    source: "product-pool",
    discoverUrl: "https://www.hepegitim.com",
    discoverUrls: ["https://www.hepegitim.com/arama?q=populer"],
    productUrlRegex: "(?:/urun/|product)",
  },
  {
    id: "idefix",
    name: "idefix",
    domain: "idefix.com",
    url: "https://www.idefix.com",
    logoUrl: "https://www.idefix.com/images/app-icons/logo.svg",
    source: "product-pool",
    discoverUrl: "https://www.idefix.com",
    discoverUrls: [
      "https://www.idefix.com/arama?q=cok+satanlar",
      "https://www.idefix.com/kategori/kitap",
    ],
    productUrlRegex: "/urun/",
  },
  {
    id: "pazarama",
    name: "Pazarama",
    domain: "pazarama.com",
    url: "https://www.pazarama.com",
    logoUrl: "https://img.pzrmcdn.com/mnresize/128/128/asset/icons/pwa.png",
    source: "product-pool",
    discoverUrl: "https://www.pazarama.com",
    discoverUrls: [
      "https://www.pazarama.com/arama?q=yeni",
      "https://www.pazarama.com/kategori/elektronik",
    ],
    productUrlRegex: "/urun/",
  },
  {
    id: "beymen",
    name: "Beymen",
    domain: "beymen.com",
    url: "https://www.beymen.com",
    logoUrl: "https://cdn.beymen.com/assets/images/favicon.ico",
    source: "product-pool",
    discoverUrl: "https://www.beymen.com/kadin",
    discoverUrls: ["https://www.beymen.com/erkek", "https://www.beymen.com/cocuk"],
    productUrlRegex: "(?:/p-\\d+|-\\d+\\.html)",
  },
  {
    id: "pttavm",
    name: "PTT AVM",
    domain: "pttavm.com",
    url: "https://www.pttavm.com",
    logoUrl: "https://www.pttavm.com/favicon.ico",
    source: "product-pool",
    discoverUrl: "https://www.pttavm.com",
    discoverUrls: ["https://www.pttavm.com/arama?q=yeni"],
    productUrlRegex: "(?:-p-\\d+|/urun/)",
    exampleProductUrl:
      "https://www.pttavm.com/samsung-galaxy-tab-s10-fe-plus-sm-x620-gri-128-gb-131-tablet-p-1469512560",
  },
  {
    id: "n11",
    name: "n11",
    domain: "n11.com",
    url: "https://www.n11.com",
    logoUrl: "https://www.n11.com/favicon.ico",
    source: "product-pool",
    discoverUrl: "https://www.n11.com/arama?q=yeni",
    discoverUrls: ["https://www.n11.com/arama?q=populer", "https://www.n11.com/arama?q=indirim"],
    productUrlRegex: "(?:/urun/|-P\\d+|-\\d{6,})",
    exampleProductUrl:
      "https://www.n11.com/urun/casio-pro-trek-prg-340t-7dr-erkek-kol-saati-33731520?magaza=menaithalat",
  },
  {
    id: "amazon",
    name: "Amazon",
    domain: "amazon.com.tr",
    url: "https://www.amazon.com.tr",
    logoUrl: "https://www.amazon.com.tr/favicon.ico",
    source: "product-pool",
    discoverUrl: "https://www.amazon.com.tr/gp/new-releases/",
    discoverUrls: [
      "https://www.amazon.com.tr/s?k=yeni+urunler",
      "https://www.amazon.com.tr/gp/bestsellers/",
    ],
    productUrlRegex: "(?:/dp/|/gp/product/)[A-Z0-9]{10}",
  },
];

/** Ürün havuzu — Trendyol hariç desteklenen siteler */
export const PRODUCT_POOL_SITES: WebHookSite[] = WEB_HOOK_SITES.filter(
  (s) => s.source === "product-pool",
);

/** Ürün havuzuna eklenebilir URL (domain + ürün deseni) */
export function isProductPoolUrl(raw: string): boolean {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return false;
  try {
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const host = new URL(href).hostname.replace(/^www\./, "").toLowerCase();
    const site = PRODUCT_POOL_SITES.find(
      (s) => host === s.domain || host.endsWith(`.${s.domain}`),
    );
    if (!site) return false;
    return isWebHookProductUrl(href, site);
  } catch {
    return false;
  }
}

export function matchWebHookSite(sourceUrl: string): WebHookSite | null {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
    return (
      WEB_HOOK_SITES.find(
        (s) => host === s.domain || host.endsWith(`.${s.domain}`),
      ) || null
    );
  } catch {
    return null;
  }
}

export function normalizeSourceUrl(raw: string): string {
  try {
    const u = new URL(String(raw || "").trim());
    u.hash = "";
    // Trendyol / Amazon tracking parametrelerini sadeleştir
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"].forEach(
      (k) => u.searchParams.delete(k),
    );
    return u.toString().replace(/\/$/, "");
  } catch {
    return String(raw || "").trim();
  }
}

export function normalizeProductTitle(title: string): string {
  return String(title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}
