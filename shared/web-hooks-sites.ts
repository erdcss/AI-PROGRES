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
  return /\/(urun|product|\/p\/|\/dp\/|gp\/product)|\/tr\/p_|-p-\d+|\/[a-z0-9-]+-\d{8,}(?:\?|$)/i.test(
    u,
  );
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
    exampleProductUrl:
      "https://www.trendyol.com/aygoren-home/cok-amacli-multi-ince-temizlik-fircasi-derz-arasi-banyo-mutfak-lavabo-detay-temizleme-fircasi-1-adet-p-797591603",
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
    productUrlRegex: "(?:/urun/|[a-z0-9-]+-\\d{8,})",
    exampleProductUrl:
      "https://www.hepegitim.com/kayip-anilar-ekspresi-9786050850123",
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
      "https://www.idefix.com/kitap-c-3307",
    ],
    productUrlRegex: "(?:/urun/|/[\\w-]+-p-\\d+)",
    exampleProductUrl:
      "https://www.idefix.com/miray-yayinlari-9-sinif-kimya-tematik-konu-ozetli-soru-bankasi-p-3694796",
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
    productUrlRegex: "(?:/urun/|-p-\\d+)",
    exampleProductUrl:
      "https://www.pazarama.com/electrolux-exp34u339hwews01-mobil-klima-12000-btu-pencere-aparatli-p-7332543979592?magaza=mediamarkt",
  },
  {
    id: "beymen",
    name: "Beymen",
    domain: "beymen.com",
    url: "https://www.beymen.com",
    logoUrl: "https://cdn.beymen.com/assets/images/favicon.ico",
    source: "product-pool",
    discoverUrl: "https://www.beymen.com/tr/kadin",
    discoverUrls: [
      "https://www.beymen.com/tr/erkek",
      "https://www.beymen.com/tr/kadin-giyim-elbise-10037",
    ],
    productUrlRegex: "(?:/tr/p_[\\w-]+_\\d+|/p-\\d+|-\\d+\\.html)",
    exampleProductUrl:
      "https://www.beymen.com/tr/p_beymen-club-siyah-midi-ipek-saten-elbise_1922586",
  },
  {
    id: "markafarma",
    name: "Markafarma",
    domain: "markafarma.com",
    url: "https://www.markafarma.com",
    logoUrl: "https://www.markafarma.com/favicon.ico",
    source: "product-pool",
    discoverUrl: "https://www.markafarma.com",
    discoverUrls: [
      "https://www.markafarma.com/bebek-mamasi",
      "https://www.markafarma.com/yeni-kargo-bedava-urunler",
    ],
    productUrlRegex: "/[a-z0-9][a-z0-9-]{3,}(?:\\?.*)?$",
    exampleProductUrl:
      "https://www.markafarma.com/sma-optipro-2-900-gr",
  },
  {
    id: "happy",
    name: "Happy Center",
    domain: "happy.com.tr",
    url: "https://www.happy.com.tr",
    logoUrl: "https://www.happy.com.tr/favicon.ico",
    source: "product-pool",
    discoverUrl: "https://www.happy.com.tr",
    productUrlRegex: "/[a-z0-9][a-z0-9-]{3,}(?:\\?.*)?$",
    exampleProductUrl:
      "https://www.happy.com.tr/vileda-turbo-2in1-temizlik-seti",
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
      "https://www.pttavm.com/yelekli-takim-elbise-erkek-slim-fit-p-1440144055",
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
      "https://www.n11.com/urun/jimmy-key-kobalt-100-keten-duz-yaka-aski-detayli-elbise-6sw067580165-saks-mavisi-133825972?beden=s&magaza=jimmykey",
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
    exampleProductUrl: "https://www.amazon.com.tr/dp/B0DFWW8JZN",
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
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    // Kaynak takip parametreleri ürün kimliğinin parçası değildir.
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "gclid",
      "fbclid",
      "ref",
      "referrer",
    ].forEach((k) => u.searchParams.delete(k));

    // Akakçe/Adjust affiliate parametreleri ürün seçiminin parçası değildir.
    // Desteklenen tüm ürün havuzu sitelerinde bunları temizle; siteye özgü
    // gerçek seçim parametreleri (örn. n11 magaza / renkrenk-kodu) korunur.
    if (PRODUCT_POOL_SITES.some((s) => host === s.domain || host.endsWith(`.${s.domain}`))) {
      for (const key of [...u.searchParams.keys()]) {
        const lower = key.toLowerCase();
        if (
          lower.startsWith("utm_") ||
          lower.startsWith("adj_") ||
          lower === "akakce" ||
          lower === "akakce_ref"
        ) {
          u.searchParams.delete(key);
        }
      }
    }

    // Akakçe yönlendirmesi: desteklenen tüm ürün havuzu sitelerinde ?ref=akakce&v=...
    // ürün kimliğinin parçası değildir. Aynı ürünün farklı tracking URL'leriyle çoğalmasını engelle.
    const matchedPoolSite = PRODUCT_POOL_SITES.find(
      (s) => host === s.domain || host.endsWith(`.${s.domain}`),
    );
    const refValue = String(u.searchParams.get("ref") || "").toLowerCase();
    const versionValue = String(u.searchParams.get("v") || "");
    const looksLikeAkakceRedirect =
      Boolean(matchedPoolSite) &&
      (refValue === "akakce" ||
        (u.searchParams.has("ref") && /^\d+(?:\.\d+){1,4}$/.test(versionValue)) ||
        (u.searchParams.has("ref") && !refValue));

    if (looksLikeAkakceRedirect) {
      u.searchParams.delete("ref");
      u.searchParams.delete("v");
    }

    if (host === "happy.com.tr" || host.endsWith(".happy.com.tr")) {
      u.hostname = "www.happy.com.tr";
      u.protocol = "https:";
    } else if (host === "markafarma.com" || host.endsWith(".markafarma.com")) {
      u.hostname = "www.markafarma.com";
      u.protocol = "https:";
    } else if (host === "n11.com" || host.endsWith(".n11.com")) {
      u.protocol = "https:";
      u.hostname = "www.n11.com";
      // n11 ürün sayfasında yalnız ürün/satıcı/varyant seçimini etkileyen
      // parametreleri tut; affiliate ve ölçüm parametreleri yukarıda silindi.
      const keep = new Set(["magaza", "beden", "renk", "renkrenk-kodu"]);
      for (const key of [...u.searchParams.keys()]) {
        if (!keep.has(key.toLowerCase())) u.searchParams.delete(key);
      }
    } else if (host === "amazon.com.tr" || host.endsWith(".amazon.com.tr")) {
      const asin =
        u.pathname.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() ||
        u.searchParams.get("asin")?.toUpperCase() ||
        "";
      if (asin) {
        u.protocol = "https:";
        u.hostname = "www.amazon.com.tr";
        u.pathname = `/dp/${asin}`;
        u.search = "";
        u.searchParams.set("language", "tr_TR");
      } else {
        [
          "tag",
          "linkCode",
          "camp",
          "creative",
          "creativeASIN",
          "ascsubtag",
          "psc",
          "th",
        ].forEach((k) => u.searchParams.delete(k));
      }
    }

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
