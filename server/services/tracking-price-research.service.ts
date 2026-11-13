import { load } from "cheerio";
import { db } from "../db";
import { productSnapshots } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { discoverDetailedProductOffers, researchSearchLinks } from "./tracking-research-providers.service";
import { pool } from "../db";
import { trackingService } from "./tracking.service";
import type {
  TrackingPriceResearchOffer,
  TrackingPriceResearchReport,
} from "@shared/tracking-price-research";

type SearchHit = { title: string; url: string; snippet: string };

const STORE_DOMAINS = [
  "trendyol.com", "hepsiburada.com", "amazon.com.tr", "amazon.com",
  "n11.com", "pttavm.com", "ciceksepeti.com", "koctas.com.tr",
  "mediamarkt.com.tr", "teknosa.com", "vatanbilgisayar.com",
  "idefix.com", "boyner.com.tr", "ebebek.com", "akakce.com",
  "cimri.com", "karaca.com", "arzum.com.tr", "a101.com.tr",
  "migros.com.tr", "beymen.com", "hepsiglobal.com", "bimeks.com.tr",
  "watsons.com.tr", "gratis.com", "rossmann.com.tr", "sephora.com.tr", "flormar.com.tr", "eveshop.com.tr", "kozvit.com", "dermoeczanem.com",
];

const MAX_RESULTS = 36;
const MAX_PAGE_CHECKS = 12;
const FETCH_TIMEOUT_MS = 7_000;
const activeResearch = new Map<number, Promise<TrackingPriceResearchReport>>();
let tableReady: Promise<void> | undefined;

function normalizedWords(text: string): string[] {
  return text.toLocaleLowerCase("tr-TR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function getModel(text: string): string | null {
  const matches = text.toUpperCase().match(/\b[A-Z]{1,7}[- ]?\d{3,7}[A-Z0-9-]*\b/g);
  return matches?.[0]?.replace(/[- ]/g, "") ?? null;
}

export function matchesTrackedProduct(productTitle: string, resultTitle: string, snippet = ""): boolean {
  const productWords = normalizedWords(productTitle);
  const resultWords = new Set(normalizedWords(resultTitle + " " + snippet));
  const model = getModel(productTitle);
  if (model) {
    const combined = (resultTitle + " " + snippet).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!combined.includes(model)) return false;
    // Model tek başına yeterli değil: başka markanın aynı kodlu ürünü elenir.
    return productWords.length > 0 && resultWords.has(productWords[0]);
  }
  const significant = productWords.filter((w) => w.length >= 4).slice(0, 9);
  const matched = significant.filter((w) => resultWords.has(w)).length;
  return significant.length >= 3 ? matched >= Math.max(2, Math.ceil(significant.length * .5)) :
    matched >= 1;
}

export function parseTurkishPrice(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 && raw < 100_000_000 ? raw : null;
  if (typeof raw !== "string") return null;
  let text = raw.replace(/[\s\u00a0₺]/g, "").replace(/(?:TL|TRY)$/i, "");
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const dot = text.lastIndexOf("."), comma = text.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else {
    const separator = dot >= 0 ? "." : comma >= 0 ? "," : "";
    if (separator) {
      const parts = text.split(separator);
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3))
        text = parts.join("");
      else if (separator === ",") text = text.replace(",", ".");
    }
  }
  const price = Number(text);
  return Number.isFinite(price) && price > 0 && price < 100_000_000 ?
    Math.round(price * 100) / 100 : null;
}

export function extractVerifiedTryPrice(html: string): number | null {
  const $ = load(html);
  const prices: number[] = [];
  const scan = (obj: unknown, depth = 0): void => {
    if (!obj || depth > 8) return;
    if (Array.isArray(obj)) {
      obj.slice(0, 25).forEach((entry) => scan(entry, depth + 1));
      return;
    }
    if (typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;
    const types = [record["@type"]].flat().map(String).map((x) => x.toLowerCase());
    if (types.some((x) => x.endsWith("offer")) && !types.some((x) => x.includes("aggregate"))) {
      const spec = record.priceSpecification as Record<string, unknown> | undefined;
      const currency = String(record.priceCurrency ?? spec?.priceCurrency ?? "").toUpperCase();
      const candidate = parseTurkishPrice(record.price ?? spec?.price);
      if (currency === "TRY" && candidate != null) prices.push(candidate);
    }
    for (const key of ["@graph", "offers", "mainEntity", "itemOffered", "hasVariant"]) {
      if (record[key]) scan(record[key], depth + 1);
    }
  };
  $('script[type="application/ld+json"]').each((_i, script) => {
    try { scan(JSON.parse($(script).html() || "")); } catch { /* malformed JSON-LD */ }
  });
  if (prices.length > 0) return prices[0];
  const metaCurrency = String(
    $('meta[property="product:price:currency"]').attr("content") ??
    $('meta[itemprop="priceCurrency"]').attr("content") ?? "",
  ).toUpperCase();
  if (metaCurrency === "TRY") {
    const metaPrice = $('meta[property="product:price:amount"]').attr("content") ??
      $('meta[itemprop="price"]').attr("content") ??
      $('[itemprop="price"]').first().attr("content");
    return parseTurkishPrice(metaPrice);
  }
  return null;
}

function publicHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        (parsed.port && parsed.port !== "443") || !host.includes(".") ||
        host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
        /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch { return null; }
}

function isTrustedStore(value: string): boolean {
  const url = publicHttpsUrl(value);
  if (!url) return false;
  const host = new URL(url).hostname.toLowerCase();
  return STORE_DOMAINS.some((domain) => host === domain || host.endsWith("." + domain));
}


function identityTerms(value: string): string[] {
  return value.toLocaleLowerCase("tr-TR")
    .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
    .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
}
export function deepProductMatch(expected: string, candidate: string): number {
  const query = identityTerms(expected), page = new Set(identityTerms(candidate));
  if (!query[0] || !page.has(query[0])) return 0;
  const model = getModel(expected);
  if (model && !candidate.toUpperCase().replace(/[^A-Z0-9]/g,"").includes(model)) return 0;
  const keywords = query.filter((w) => w.length>=4 && w !== query[0] &&
    !["fiyati","fiyat","turkiye","satin","yeni","urun"].includes(w));
  const overlap = keywords.filter((w) => page.has(w)).length;
  if (!model && keywords.length >= 2 && overlap < 2) return 0;
  const value = model ? 0.75 + 0.25 * overlap/Math.max(1,keywords.length) :
    .25 + .75 * overlap/Math.max(1,keywords.length);
  return Math.round(Math.min(1,value)*100)/100;
}
export function variantConflict(expected: string, candidate: string): boolean {
  const a = identityTerms(expected), b = identityTerms(candidate);
  return [
    ["siyah","kahverengi"],["black","brown"],["siyah","brown"],
    ["black","kahverengi"],["kirmizi","mavi"],["pembe","siyah"],
  ].some(([x,y]) => a.includes(x)&&b.includes(y) || a.includes(y)&&b.includes(x));
}
async function getStoredProductImage(id: number): Promise<string|null> {
  try {
    const rows = await db.select({images:productSnapshots.images}).from(productSnapshots)
      .where(eq(productSnapshots.trackedProductId,id))
      .orderBy(desc(productSnapshots.createdAt)).limit(5);
    for(const row of rows) {
      const images = Array.isArray(row.images) ? row.images : [];
      for(const item of images) {
        const src = typeof item === "string" ? item :
          item && typeof item === "object" ? String(
            (item as Record<string,unknown>).url ||
            (item as Record<string,unknown>).src ||
            (item as Record<string,unknown>).imageUrl || "") : "";
        if(publicHttpsUrl(src)) return src;
      }
    }
  }catch{/* source image is optional */}
  return null;
}

function sourceName(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch { return "Bilinmeyen kaynak"; }
}

function buildQueries(title: string): string[] {
  const model = getModel(title);
  const words = title.trim().split(/\s+/);
  const shortened = words.slice(0, 13).join(" ");
  const query = model ? [words[0], model, "fiyat", "satın al"].join(" ") :
    shortened + " fiyat";
  return [...new Set([query, shortened + " fiyat Türkiye"])];
}

async function fetchSearchJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error("Arama servisi HTTP " + response.status);
  return response.json();
}

async function searchWeb(query: string): Promise<{ hits: SearchHit[]; provider: string }> {
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const data = await fetchSearchJson("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "tr", hl: "tr", num: 20 }),
      });
      return {
        provider: "Google (Serper)",
        hits: (Array.isArray(data.organic) ? data.organic : []).map((hit: any) => ({
          title: String(hit.title ?? ""), url: String(hit.link ?? ""),
          snippet: String(hit.snippet ?? ""),
        })),
      };
    } catch (err) { console.warn("[price-research] Serper:", (err as Error).message); }
  }
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("country", "TR");
      url.searchParams.set("search_lang", "tr");
      url.searchParams.set("count", "20");
      const data = await fetchSearchJson(url.toString(), {
        headers: { Accept: "application/json", "X-Subscription-Token": braveKey },
      });
      return {
        provider: "Brave Search",
        hits: (Array.isArray(data.web?.results) ? data.web.results : []).map((hit: any) => ({
          title: String(hit.title ?? ""), url: String(hit.url ?? ""),
          snippet: String(hit.description ?? ""),
        })),
      };
    } catch (err) { console.warn("[price-research] Brave:", (err as Error).message); }
  }
  const rss = new URL("https://www.bing.com/search");
  rss.searchParams.set("q", query);
  rss.searchParams.set("format", "rss");
  rss.searchParams.set("mkt", "tr-TR");
  const response = await fetch(rss, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AIProgresPriceResearch/1.0)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Web araması şu anda yanıt vermiyor (HTTP " + response.status + ")");
  const xml = await response.text();
  if (!xml.includes("<rss") && !xml.includes("<item>"))
    throw new Error("Web araması geçerli sonuç döndürmedi");
  const $ = load(xml, { xmlMode: true });
  const hits: SearchHit[] = [];
  $("item").each((_i, el) => {
    hits.push({
      title: $(el).find("title").first().text().trim(),
      url: $(el).find("link").first().text().trim(),
      snippet: $(el).find("description").first().text().replace(/<[^>]+>/g, " ").trim(),
    });
  });
  return { hits, provider: "Bing RSS" };
}

type VerifiedPage = { price: number | null; imageUrl: string | null; note: string; unavailable: boolean };
async function fetchLivePrice(url: string, expectedTitle: string): Promise<VerifiedPage> {
  const empty = (note:string):VerifiedPage => ({price:null,imageUrl:null,note,unavailable:false});
  if (!isTrustedStore(url)) return empty("Bu bağlantı mağaza ürünü olarak doğrulanamadı.");
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9",
      }, redirect:"manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if(!response.ok)return empty("Mağaza sayfası erişimi kısıtlı (HTTP " + response.status + ").");
    if(!String(response.headers.get("content-type") ?? "").includes("html"))
      return empty("Mağaza HTML ürün sayfası döndürmedi.");
    if(Number(response.headers.get("content-length")||0)>3_000_000)
      return empty("Mağaza sayfası boyut sınırını aştı.");
    const html=(await response.text()).slice(0,3_000_000);
    const $=load(html);
    const actualTitle=String(
      $('meta[property="og:title"]').attr("content") ||
      $("h1").first().text() || $("title").text() || "").trim();
    if(actualTitle && (deepProductMatch(expectedTitle,actualTitle)<.42 ||
      variantConflict(expectedTitle,actualTitle)))
      return empty("Ürün başlığı veya varyantı kaynak ürünle eşleşmiyor.");
    const imageUrl=publicHttpsUrl(String(
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") || "" ));
    const price=extractVerifiedTryPrice(html);
    const unavailable=/schema\.org\/OutOfStock/i.test(html);
    return {
      price, imageUrl, unavailable,
      note:price===null?"Sayfa fiyatını yapılandırılmış TRY verisiyle doğrulayamıyoruz.":
        unavailable?"Ürün sayfası stokta yok diyor; fiyat ortalamaya dahil edilmedi.":
        "Güncel fiyat mağazanın ürün sayfasındaki yapılandırılmış veriden doğrulandı.",
    };
  }catch{return empty("Mağaza erişimi engellendi veya zaman aşımı yaşandı.");}
}

async function ensureReportTable(): Promise<void> {
  if (!pool) throw new Error("Veritabanı bağlantısı olmadan rapor saklanamaz");
  if (!tableReady) {
    tableReady = pool.query(
      "CREATE TABLE IF NOT EXISTS tracking_price_research_reports (" +
      "tracked_product_id INTEGER PRIMARY KEY REFERENCES tracked_products(id) ON DELETE CASCADE, " +
      "report JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    ).then(() => undefined).catch((err) => { tableReady = undefined; throw err; });
  }
  return tableReady;
}

export async function getStoredPriceResearch(trackedProductId: number): Promise<TrackingPriceResearchReport | null> {
  await ensureReportTable();
  const result = await pool!.query<{ report: TrackingPriceResearchReport }>(
    "SELECT report FROM tracking_price_research_reports WHERE tracked_product_id = $1",
    [trackedProductId],
  );
  return result.rows[0]?.report ?? null;
}

async function generateReport(trackedProductId: number): Promise<TrackingPriceResearchReport> {
  const product=await trackingService.getProduct(trackedProductId);
  if(!product)throw new Error("Ürün bulunamadı");
  const title=String(product.sourceTitle??"").trim();
  if(!title)throw new Error("Araştırılacak ürünün başlığı eksik.");
  const referenceImageUrl=await getStoredProductImage(trackedProductId);
  const queries=buildQueries(title);
  // AI vision + cited web discovery runs alongside the public-search fallbacks.
  const [deepResult,...fallbacks]=await Promise.allSettled([
    discoverDetailedProductOffers(title,referenceImageUrl),
    ...queries.map(searchWeb),
  ]);
  const found: Array<SearchHit & {isSource:boolean;imageUrl?:string|null;listedPrice?:number|null;
    discoveryMethod?:"source"|"web"|"visual"|"marketplace"}>=[];
  const sourceUrl=publicHttpsUrl(String(product.sourceUrl??""));
  if(sourceUrl)found.push({title,url:sourceUrl,snippet:"",isSource:true,
    imageUrl:referenceImageUrl,discoveryMethod:"source"});
  const names:string[]=[];
  const warnings:string[]=[];
  let visualAnalysis:string|null=null,visualSearchPerformed=false,visualMatchProvider:string|null=null;
  if(deepResult.status==="fulfilled"){
    const data=deepResult.value;
    names.push(...data.provider);
    warnings.push(...data.warnings);
    visualAnalysis=data.visualAnalysis;
    visualSearchPerformed=data.visualUsed || data.reverseImageUsed;
    if(data.reverseImageUsed)visualMatchProvider="Google Lens";
    for(const hit of data.hits){
      if(!isTrustedStore(hit.url))continue;
      if(variantConflict(title,hit.title))continue;
      const similarity=deepProductMatch(title,hit.title+" "+hit.snippet);
      if(similarity<.46 && !matchesTrackedProduct(title,hit.title,hit.snippet))continue;
      found.push({...hit,isSource:false,discoveryMethod:
        hit.method==="visual"?"visual":hit.method==="image"?"marketplace":"web"});
    }
  }else warnings.push("Yapay zekâ ve görsel arama geçici olarak yanıt vermedi.");
  for(const r of fallbacks){
    if(r.status!=="fulfilled")continue;
    names.push(r.value.provider);
    for(const hit of r.value.hits){
      if(!isTrustedStore(hit.url) || variantConflict(title,hit.title))continue;
      if(deepProductMatch(title,hit.title+" "+hit.snippet)<.46 &&
        !matchesTrackedProduct(title,hit.title,hit.snippet))continue;
      found.push({...hit,isSource:false,discoveryMethod:"web"});
    }
  }
  const unique=new Map<string,TrackingPriceResearchOffer>();
  for(const hit of found){
    const url=publicHttpsUrl(hit.url);
    if(!url)continue;
    const parsed=new URL(url);
    // Remove ad-tracking params from dedupe; retain actual product/variant params.
    const canonical=parsed.hostname+parsed.pathname.replace(/\/$/,"")+
      [...parsed.searchParams.entries()].filter(([key])=>/^(variant|color|renk|size|beden|sku)$/i.test(key))
        .map(([key,value])=>key+"="+value).sort().join("&");
    const candidate:TrackingPriceResearchOffer={
      site:sourceName(url),title:hit.title.slice(0,240),url,
      price:null,currency:null,verified:false,
      isSource:hit.isSource,checkedAt:null,
      imageUrl:publicHttpsUrl(hit.imageUrl||""),
      listedPrice:parseTurkishPrice(hit.listedPrice),
      discoveryMethod:hit.discoveryMethod??"web",
      matchScore:hit.isSource?1:deepProductMatch(title,hit.title+" "+hit.snippet),
      availability:"unknown",verificationNote:null,
    };
    const previous=unique.get(canonical);
    if(previous){
      if(!previous.imageUrl && candidate.imageUrl)previous.imageUrl=candidate.imageUrl;
      if(candidate.discoveryMethod==="visual")previous.discoveryMethod="visual";
      continue;
    }
    unique.set(canonical,candidate);
    if(unique.size>=MAX_RESULTS)break;
  }
  const offers=[...unique.values()];
  const checks=offers.filter(o=>isTrustedStore(o.url)).slice(0,MAX_PAGE_CHECKS);
  for(let i=0;i<checks.length;i+=6){
    const batch=checks.slice(i,i+6);
    const parsed=await Promise.all(batch.map(o=>fetchLivePrice(o.url,title)));
    parsed.forEach((data,j)=>{
      const offer=batch[j];
      offer.checkedAt=new Date().toISOString();
      offer.verificationNote=data.note;
      if(data.imageUrl)offer.imageUrl=data.imageUrl;
      offer.availability=data.unavailable?"out_of_stock":"unknown";
      if(data.price!==null){
        offer.verified=true;offer.price=data.price;offer.currency="TRY";
      }
    });
  }
  offers.sort((a,b)=>Number(b.verified)-Number(a.verified) ||
    (a.price??Infinity)-(b.price??Infinity) || Number(b.isSource)-Number(a.isSource));
  const prices=offers.flatMap(o=>o.verified && o.price!=null && o.availability!=="out_of_stock"?[o.price]:[]);
  const summary={
    verifiedCount:prices.length,lowestPrice:prices.length?Math.min(...prices):null,
    highestPrice:prices.length?Math.max(...prices):null,
    averagePrice:prices.length?
      Math.round(prices.reduce((a,b)=>a+b,0)/prices.length*100)/100:null,
  };
  if(!prices.length)warnings.push(
    "Mağazalardan fiyat doğrulanamadı; yanlış fiyat göstermemek için yalnızca gerçek bağlantılar listelendi."
  );
  if(offers.length<2)warnings.push(
    "Bağımsız ürün eşleşmesi sınırlı. Altta diğer mağazaların hazır ürün aramalarını açabilirsiniz."
  );
  if(referenceImageUrl && !visualSearchPerformed)
    warnings.push("Görsel tespit edildi ancak görsel araması sağlayıcısı yanıt vermedi.");
  const report:TrackingPriceResearchReport={
    trackedProductId,productTitle:title,sourceUrl:sourceUrl??"",
    sourcePrice:parseTurkishPrice(product.currentSourcePrice),
    searchedAt:new Date().toISOString(),
    provider:[...new Set(names)].join(", ")||"Web araması kullanılamadı",
    queries,resultsFound:offers.length,checkedCount:checks.length,offers,summary,warnings,
    referenceImageUrl,visualAnalysis,visualSearchPerformed,visualMatchProvider,
    researchLinks:researchSearchLinks(title),
    searchedSites:new Set(offers.map(o=>o.site)).size,
    researchVersion:2,
  };
  await ensureReportTable();
  await pool!.query(
    "INSERT INTO tracking_price_research_reports (tracked_product_id, report, updated_at) " +
    "VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (tracked_product_id) " +
    "DO UPDATE SET report = EXCLUDED.report, updated_at = NOW()",
    [trackedProductId,JSON.stringify(report)],
  );
  return report;
}

export async function researchTrackingProductPrice(trackedProductId: number): Promise<TrackingPriceResearchReport> {
  const existing = activeResearch.get(trackedProductId);
  if (existing) return existing;
  const pending = generateReport(trackedProductId).finally(() => activeResearch.delete(trackedProductId));
  activeResearch.set(trackedProductId, pending);
  return pending;
}
