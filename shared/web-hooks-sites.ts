/** Web sitesi kancaları — ürün havuzu + Trendyol destekli kaynaklar */

export type WebHookSite = {
  id: string;
  name: string;
  domain: string;
  url: string;
  logoUrl: string;
  source: "product-pool" | "trendyol";
};

export const WEB_HOOK_SITES: WebHookSite[] = [
  {
    id: "trendyol",
    name: "Trendyol",
    domain: "trendyol.com",
    url: "https://www.trendyol.com",
    logoUrl: "https://cdn.dsmcdn.com/web/production/favicon.ico",
    source: "trendyol",
  },
  {
    id: "hepegitim",
    name: "Hepegitim",
    domain: "hepegitim.com",
    url: "https://www.hepegitim.com",
    logoUrl: "https://www.hepegitim.com/skins/shared/images/logo.png",
    source: "product-pool",
  },
  {
    id: "idefix",
    name: "idefix",
    domain: "idefix.com",
    url: "https://www.idefix.com",
    logoUrl: "https://www.idefix.com/images/app-icons/logo.svg",
    source: "product-pool",
  },
  {
    id: "pazarama",
    name: "Pazarama",
    domain: "pazarama.com",
    url: "https://www.pazarama.com",
    logoUrl: "https://img.pzrmcdn.com/mnresize/128/128/asset/icons/pwa.png",
    source: "product-pool",
  },
  {
    id: "beymen",
    name: "Beymen",
    domain: "beymen.com",
    url: "https://www.beymen.com",
    logoUrl: "https://cdn.beymen.com/assets/images/favicon.ico",
    source: "product-pool",
  },
  {
    id: "pttavm",
    name: "PTT AVM",
    domain: "pttavm.com",
    url: "https://www.pttavm.com",
    logoUrl: "https://www.pttavm.com/favicon.ico",
    source: "product-pool",
  },
  {
    id: "n11",
    name: "n11",
    domain: "n11.com",
    url: "https://www.n11.com",
    logoUrl: "https://www.n11.com/favicon.ico",
    source: "product-pool",
  },
  {
    id: "amazon",
    name: "Amazon",
    domain: "amazon.com.tr",
    url: "https://www.amazon.com.tr",
    logoUrl: "https://www.amazon.com.tr/favicon.ico",
    source: "product-pool",
  },
];

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
