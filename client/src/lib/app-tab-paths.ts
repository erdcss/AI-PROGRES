/** Sekme başlığı için rota → etiket eşlemesi */
export function defaultTitleForPath(path: string): string {
  const base = (path.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  const map: Record<string, string> = {
    "/": "Ana Sayfa",
    "/marketplace": "Ana Sayfa",
    "/trendyol": "Trendyol Çekim",
    "/scraper/trendyol": "Trendyol Çekim",
    "/urun-havuzu": "Ürün Havuzu",
    "/urun-takip": "Ürün Takip",
    "/kategoriler": "Kategoriler",
    "/control-center": "Kontrol Merkezi",
    "/baglanti-api": "Bağlantı & API",
    "/bildirimler": "Bildirimler",
    "/price-comparison": "Fiyat Karşılaştırma",
    "/data-analysis": "Veri Analizi",
    "/product-data-analysis": "Veri Analizi",
    "/saved-urls": "Kayıtlı URL'ler",
    "/memory-dashboard": "Hafıza Dashboard",
    "/memory-tracking": "Hafıza Takip",
    "/arcelik": "Arçelik",
    "/pttavm": "PttAVM",
    "/ai-enhanced": "AI Enhanced",
    "/telegram": "Telegram",
    "/email": "E-posta",
    "/system-status": "Sistem Durumu",
    "/scheduler": "Zamanlayıcı",
    "/web-hooks": "Web Kancaları",
    "/web-sitesi-kancalari": "Web Kancaları",
  };
  if (map[base]) return map[base];
  if (base.startsWith("/scraper")) return "Ürün Çekimi";
  if (base.startsWith("/coming-soon")) return "Yakında";
  const slug = base.split("/").filter(Boolean).pop();
  return slug ? slug.replace(/-/g, " ") : "Sayfa";
}

export const APP_TAB_HOME_PATH = "/";
