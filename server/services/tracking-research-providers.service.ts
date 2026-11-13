import { load } from "cheerio";

export type ResearchHit = {
  title: string; url: string; snippet: string;
  imageUrl?: string | null; method: "web" | "visual" | "image";
};
export type ResearchDiscovery = {
  hits: ResearchHit[]; provider: string[]; visualAnalysis: string | null;
  visualUsed: boolean; reverseImageUsed: boolean; warnings: string[];
};
const safe = (v: unknown): string | null => {
  try {
    if (typeof v !== "string") return null;
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".") ||
        /^(\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) || u.hostname.includes(":") ||
        u.port && u.port !== "443") return null;
    u.hash = ""; return u.href;
  } catch { return null; }
};
async function post(url: string, body: object, headerName: string, key: string, ms = 24000): Promise<any> {
  const res = await fetch(url,{method:"POST",
    headers:{"Content-Type":"application/json",[headerName]:key},
    body:JSON.stringify(body),signal:AbortSignal.timeout(ms)});
  if (!res.ok) throw new Error("Araştırma sağlayıcısı HTTP " + res.status);
  return res.json();
}
function pick(obj:any,...keys:string[]):any[] {
  for(const key of keys) if(Array.isArray(obj?.[key]))return obj[key];
  return [];
}
function parseJson(raw:string):any {
  const s=raw.trim().replace(/^\x60{3}(?:json)?\s*/i,"").replace(/\x60{3}$/,"").trim();
  try{return JSON.parse(s);}catch{
    const a=s.indexOf("{"),b=s.lastIndexOf("}");
    if(a>=0&&b>a)try{return JSON.parse(s.slice(a,b+1));}catch{}
  }
  return {};
}
async function aiSearch(title:string,imageUrl:string|null):Promise<{hits:ResearchHit[];description:string|null;visualUsed:boolean}>{
  const key=process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_NEW;
  if(!key)throw new Error("OPENAI_API_KEY tanımlı değil");
  const prompt=[
    "Türkiye'de satılan bu ürünün aynısını internet genelinde araştır; e-ticaret ürün sayfalarını bul.",
    "Ürün varyantı, renk, marka, model ve hacim tam aynı olmalı.",
    "Görsel verilmişse ambalaj ve marka üzerindeki bilgileri de analiz ederek eşleştir.",
    "Web araması yap; bağlantıları ASLA tahmin etme veya uydurma.",
    "Trendyol, Hepsiburada, Amazon Türkiye, n11, Watsons, Gratis, Akakçe, Cimri ve diğer mağazaları karşılaştır.",
    "Sadece gerçek ürün sayfası URL'si döndür; özet, arama sayfası ve anasayfa URL'sini ekleme.",
    "Yalnızca JSON formatında cevap ver:",
    '{"visualAnalysis":"görsel açıklaması veya null","offers":[{"title":"ürün adı","url":"https://gerçek-ürün-url"}]}',
    "Ürün: "+title.slice(0,320),
  ].join(" ");
  const content:any[]=[{type:"input_text",text:prompt}];
  if(imageUrl)content.push({type:"input_image",image_url:imageUrl,detail:"low"});
  const body:any={
    model:process.env.TRACKING_RESEARCH_OPENAI_MODEL || "gpt-4.1-mini",
    tools:[{type:"web_search",search_context_size:"medium",
      user_location:{type:"approximate",country:"TR",timezone:"Europe/Istanbul"}}],
    tool_choice:"required",include:["web_search_call.action.sources"],store:false,
    max_output_tokens:1600,input:[{role:"user",content}],
  };
  let data:any;
  try {data=await post("https://api.openai.com/v1/responses",body,"Authorization","Bearer "+key,26000);}
  catch(err){
    if(!imageUrl)throw err;
    body.input[0].content=content.slice(0,1);
    data=await post("https://api.openai.com/v1/responses",body,"Authorization","Bearer "+key,22000);
    imageUrl=null;
  }
  const output=pick(data,"output"),strings:string[]=[];
  const hits:ResearchHit[]=[];
  for(const part of output){
    for(const msg of pick(part,"content"))if(msg.type==="output_text"){
      strings.push(String(msg.text||""));
    }
  }
  const obj=parseJson(strings.join("\n"));
  for(const item of pick(obj,"offers","results").slice(0,25)){
    const url=safe(item.url||item.link);
    if(!url)continue;
    hits.push({title:String(item.title||"").slice(0,250),url,snippet:"",
      imageUrl:safe(item.imageUrl),method:"web"});
  }
  return {hits,description:typeof obj.visualAnalysis==="string"?obj.visualAnalysis.slice(0,290):null,
    visualUsed:Boolean(imageUrl)};
}
async function serperSearch(title:string,image:string|null):Promise<{hits:ResearchHit[];provider:string[];reverse:boolean}>{
  const key=process.env.SERPER_API_KEY;
  if(!key)return {hits:[],provider:[],reverse:false};
  const tasks:Array<{name:string,request:Promise<any>}>=[];
  if(image)tasks.push({name:"Google Lens",request:post("https://google.serper.dev/lens",
    {url:image,gl:"tr",hl:"tr"},"X-API-KEY",key,10000)});
  tasks.push({name:"Google Görseller",request:post("https://google.serper.dev/images",
    {q:title.slice(0,160),gl:"tr",hl:"tr",num:15},"X-API-KEY",key,10000)});
  tasks.push({name:"Google",request:post("https://google.serper.dev/search",
    {q:title.slice(0,160)+" fiyat",gl:"tr",hl:"tr",num:20},"X-API-KEY",key,10000)});
  const results=await Promise.allSettled(tasks.map(t=>t.request));
  const hits:ResearchHit[]=[],provider:string[]=[];
  let reverse=false;
  results.forEach((r,i)=>{
    if(r.status!=="fulfilled")return;
    const kind=tasks[i].name;provider.push(kind);
    if(kind==="Google Lens")reverse=true;
    for(const item of pick(r.value,"organic","visualMatches","visual_matches","images","results").slice(0,25)){
      const url=safe(item.link||item.url||item.sourceUrl);
      if(!url)continue;
      hits.push({title:String(item.title||item.name||"").slice(0,250),url,
        snippet:String(item.snippet||item.source||""),
        imageUrl:safe(item.thumbnailUrl||item.thumbnail||item.imageUrl||item.image),
        method:kind==="Google Lens"?"visual":kind==="Google Görseller"?"image":"web"});
    }
  });
  return {hits,provider,reverse};
}
async function googleHtml(query:string):Promise<ResearchHit[]>{
  const u=new URL("https://www.google.com/search");
  u.searchParams.set("q",query);u.searchParams.set("num","20");u.searchParams.set("hl","tr");
  const res=await fetch(u,{signal:AbortSignal.timeout(7000),headers:{
    "User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept":"text/html","Accept-Language":"tr-TR,tr;q=0.9",
  }});
  if(!res.ok)throw new Error("Google HTML HTTP "+res.status);
  const $=load((await res.text()).slice(0,900000)),hits:ResearchHit[]=[];
  $('a[href^="/url?q="],a[href^="https://"]').each((_i,anchor)=>{
    const href=$(anchor).attr("href")||"";
    const url=href.startsWith("/url?")?new URLSearchParams(href.slice(5)).get("q"):href;
    const title=$(anchor).find("h3").first().text().trim();
    if(title&&safe(url))hits.push({title,url:url!,snippet:"",method:"web"});
  });
  return hits.slice(0,25);
}
export async function discoverDetailedProductOffers(title:string,imageUrl:string|null):Promise<ResearchDiscovery>{
  const tasks=await Promise.allSettled([
    aiSearch(title,imageUrl),serperSearch(title,imageUrl),
    googleHtml(title.slice(0,150)+" fiyat"),
  ]);
  const result:ResearchDiscovery={hits:[],provider:[],visualAnalysis:null,
    visualUsed:false,reverseImageUsed:false,warnings:[]};
  if(tasks[0].status==="fulfilled"){
    result.hits.push(...tasks[0].value.hits);result.provider.push("OpenAI Web Search");
    result.visualAnalysis=tasks[0].value.description;result.visualUsed=tasks[0].value.visualUsed;
  }else{
    result.warnings.push("Yapay zekâ destekli web araştırması yanıt vermedi; alternatif kaynaklar kullanıldı.");
    console.warn("[deep-research] AI:",String(tasks[0].reason).slice(0,180));
  }
  if(tasks[1].status==="fulfilled"){
    result.hits.push(...tasks[1].value.hits);result.provider.push(...tasks[1].value.provider);
    result.reverseImageUsed=tasks[1].value.reverse;
  }
  if(tasks[2].status==="fulfilled"){
    result.hits.push(...tasks[2].value);result.provider.push("Google HTML");
  }
  return result;
}
export function researchSearchLinks(title:string):Array<{label:string;url:string}>{
  const q=encodeURIComponent(title.split(/\s+/).slice(0,13).join(" "));
  return [
    {label:"Google Alışveriş",url:"https://www.google.com/search?tbm=shop&q="+q},
    {label:"Google Görseller",url:"https://www.google.com/search?tbm=isch&q="+q},
    {label:"Trendyol",url:"https://www.trendyol.com/sr?q="+q},
    {label:"Hepsiburada",url:"https://www.hepsiburada.com/ara?q="+q},
    {label:"Amazon",url:"https://www.amazon.com.tr/s?k="+q},
    {label:"n11",url:"https://www.n11.com/arama?q="+q},
    {label:"Akakçe",url:"https://www.akakce.com/arama/?q="+q},
    {label:"Cimri",url:"https://www.cimri.com/arama?q="+q},
  ];
}
