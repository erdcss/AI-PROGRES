import { randomUUID } from "node:crypto";
import { pool } from "../db";
import type { DetectedChange } from "@shared/schema";

/** M.A.Y.K-only, authenticated iOS push outbox. Never block product tracking. */
export type MaykPushEvent = {
  key: string;
  type: string;
  title: string;
  body: string;
  productId?: number | null;
  changeId?: number | null;
};

function dbPool() {
  if (!pool) throw new Error("DATABASE_URL missing");
  return pool;
}
const CREATE_TABLES = [
  "CREATE TABLE IF NOT EXISTS mayk_push_devices (" +
  "expo_token TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE," +
  "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE TABLE IF NOT EXISTS mayk_push_events (" +
  "event_key TEXT PRIMARY KEY, event_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL," +
  "data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  "CREATE TABLE IF NOT EXISTS mayk_push_deliveries (" +
  "event_key TEXT NOT NULL REFERENCES mayk_push_events(event_key) ON DELETE CASCADE," +
  "expo_token TEXT NOT NULL REFERENCES mayk_push_devices(expo_token) ON DELETE CASCADE," +
  "state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0," +
  "next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), receipt_id TEXT, last_error TEXT," +
  "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(event_key,expo_token))",
  "CREATE INDEX IF NOT EXISTS mayk_push_due_idx ON mayk_push_deliveries(state,next_attempt_at)",
];
let init: Promise<void> | null = null;
async function ensureTables() {
  if (!init) {
    init = (async () => {
      for (const statement of CREATE_TABLES) await dbPool().query(statement);
    })().catch(error => { init = null; throw error; });
  }
  await init;
}
const short = (value: unknown, max = 180) =>
  String(value ?? "").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim().slice(0,max);
function oldNew(v: unknown) {
  if (v == null) return "—";
  if (typeof v !== "object") return short(v,40);
  const r = v as Record<string, unknown>;
  for (const k of ["price","stock","available","value","color","size"]) {
    if (r[k] != null) return short(r[k],40);
  }
  return "Güncellendi";
}
export function mapMaykChangeEvent(change: Pick<DetectedChange,
"status"|"changeType"|"approvedBy">) {
  const s = change.status;
  if (s === "applied") return { type:"applied",title: /^(auto|startup-auto)$/i.test(change.approvedBy || "")
    ? "MarktGO otomatik düzeltildi" : "MarktGO manuel düzeltildi" };
  const statuses: Record<string,string> = {
    manual_review:"Manuel inceleme gerekli", approved:"Değişiklik onaylandı",
    rejected:"Değişiklik reddedildi",ignored:"Değişiklik yok sayıldı",
    failed:"MarktGO düzeltmesi başarısız",applying:"MarktGO düzeltmesi başladı",
    superseded:"Yeni veriyle güncellendi",seen:"Değişiklik görüldü",
  };
  if (statuses[s]) return {type:s,title:statuses[s]};
  const t = change.changeType;
  return {type:"pending",title:
    t.includes("price") ? "Fiyat değişikliği" :
    t.includes("stock") ? "Stok değişikliği" :
    t.includes("variant") || t.includes("color") || t.includes("size") ? "Varyant değişikliği" :
    t.includes("removed") ? "Ürün kaldırıldı" :
    t.includes("title") ? "Ürün adı değişti" : "Yeni ürün değişikliği"};
}
export function buildMaykChangeEvent(change: Pick<DetectedChange,
"id"|"trackedProductId"|"status"|"changeType"|"oldValue"|"newValue"|"approvedBy"|"updatedAt">,
productTitle: string): MaykPushEvent {
  const state = mapMaykChangeEvent(change);
  const detail = state.type === "pending" || state.type === "manual_review"
    ? " · " + oldNew(change.oldValue) + " → " + oldNew(change.newValue)
    : " · " + state.title;
  const timestamp = change.updatedAt ? new Date(change.updatedAt).toISOString() : "initial";
  return {
    key: "change:" + change.id + ":" + state.type + ":" + timestamp,
    type:state.type,title:state.title,
    body:short(productTitle + detail,200),
    productId:change.trackedProductId,changeId:change.id,
  };
}

export async function registerMaykDevice(token: string, userId: string) {
  const trimmed=String(token || "").trim();
  if (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,}\]$/.test(trimmed) || trimmed.length>260)
    throw new Error("Geçersiz Expo push tokenı");
  await ensureTables();
  await dbPool().query(
    "INSERT INTO mayk_push_devices(expo_token,owner_user_id,enabled) VALUES($1,$2,TRUE) " +
    "ON CONFLICT(expo_token) DO UPDATE SET owner_user_id=EXCLUDED.owner_user_id, enabled=TRUE, updated_at=NOW()",
    [trimmed,userId],
  );
}
export async function unregisterMaykDevice(token:string,userId:string) {
  await ensureTables();
  await dbPool().query(
    "UPDATE mayk_push_devices SET enabled=FALSE,updated_at=NOW() WHERE expo_token=$1 AND owner_user_id=$2",
    [token,userId],
  );
}
export async function countMaykDevices(userId:string) {
  await ensureTables();
  const r=await dbPool().query(
    "SELECT COUNT(*)::int AS count FROM mayk_push_devices WHERE enabled=TRUE AND owner_user_id=$1",
    [userId],
  );
  return Number(r.rows[0]?.count || 0);
}
export async function listMaykEvents(limit=40) {
  await ensureTables();
  const n=Math.max(1,Math.min(80,Math.floor(limit)||40));
  const r=await dbPool().query(
    'SELECT event_key AS id,event_type AS type,title,body,created_at AS "createdAt" FROM mayk_push_events ORDER BY created_at DESC LIMIT $1',
    [n],
  );
  return r.rows;
}
export async function emitMaykEvent(event: MaykPushEvent): Promise<boolean> {
  await ensureTables();
  const key=short(event.key,220);
  if (!key || !event.type) throw new Error("Bildirim anahtarı eksik");
  const data=JSON.stringify({
    type:event.type,productId:String(event.productId ?? ""),changeId:String(event.changeId ?? ""),
    path:"/urun-takip",
  });
  const result=await dbPool().query(
    "INSERT INTO mayk_push_events(event_key,event_type,title,body,data) " +
    "VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING event_key",
    [key,short(event.type,70),short(event.title,90),short(event.body,200),data],
  );
  if (!result.rowCount) return false;
  await dbPool().query(
    "INSERT INTO mayk_push_deliveries(event_key,expo_token) " +
    "SELECT $1,expo_token FROM mayk_push_devices WHERE enabled=TRUE ON CONFLICT DO NOTHING",
    [key],
  );
  void processMaykQueue().catch(err => console.warn("[mayk-push] queue:",(err as Error).message));
  return true;
}
export function scheduleMaykEvent(event: MaykPushEvent) {
  void emitMaykEvent(event).catch(err=>console.warn("[mayk-push] event:",(err as Error).message));
}
export function scheduleMaykChange(change: DetectedChange, productTitle?: string) {
  scheduleMaykEvent(buildMaykChangeEvent(
    change,productTitle || "Ürün #" + change.trackedProductId,
  ));
}
export function scheduleMaykChangeWithLookup(change:DetectedChange) {
  void (async()=>{
    const r=await dbPool().query("SELECT source_title FROM tracked_products WHERE id=$1",[change.trackedProductId]);
    scheduleMaykChange(change,r.rows[0]?.source_title || "Ürün #" + change.trackedProductId);
  })().catch(err=>console.warn("[mayk-push] change lookup:",(err as Error).message));
}
export function scheduleMaykTrackingState(input:{
  productId:number;productTitle:string;state:string;at?:Date|null;detail?:string;
}) {
  const stateTitles:Record<string,string>={
    active:"Ürün takibi açıldı",disabled:"Ürün takibi duraklatıldı",
    error:"Ürün kontrol hatası",recovered:"Takip kontrolü düzeldi",
    source_warning:"Kaynak veri doğrulanamadı",
  };
  const timestamp=input.at ? new Date(input.at).toISOString() : new Date().toISOString();
  scheduleMaykEvent({
    key:"product:"+input.productId+":"+input.state+":"+timestamp,
    type:input.state,title:stateTitles[input.state] || "Ürün takip durumu",
    body:short(input.productTitle+(input.detail?" · "+input.detail:""),200),
    productId:input.productId,
  });
}
export async function queueMaykTest(userId:string):Promise<boolean> {
  return emitMaykEvent({
    key:"test:"+userId+":"+randomUUID(),type:"test",
    title:"M.A.Y.K test bildirimi",body:"Ürün takip bildirimleri hazır.",
  });
}

type PushTicket = {
  status?: string;id?:string;message?:string;details?:{error?:string};
};
async function expoPost(endpoint:string,payload:object) {
  const headers:Record<string,string>={Accept:"application/json","Content-Type":"application/json"};
  const token=process.env.EXPO_ACCESS_TOKEN?.trim();
  if(token)headers.Authorization="Bearer "+token;
  const response=await fetch("https://exp.host/--/api/v2/push/"+endpoint,{
    method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(12000),
  });
  const json=await response.json().catch(()=>({})) as {
    data?:PushTicket|Record<string,PushTicket>;errors?:Array<{message?:string}>;
  };
  if(!response.ok)throw new Error(json.errors?.[0]?.message || "Expo HTTP "+response.status);
  return json;
}
async function setDelivery(eventKey:string,expoToken:string,state:string,error?:string,receiptId?:string,attempt=1) {
  const invalid=/DeviceNotRegistered|not a registered push notification recipient/i.test(error || "");
  const delay=state==="accepted"?900:Math.min(1800,45*(2**Math.min(5,attempt)));
  await dbPool().query(
    "UPDATE mayk_push_deliveries SET state=$3,receipt_id=$4,last_error=$5,updated_at=NOW()," +
    "next_attempt_at=NOW()+($6::int*INTERVAL '1 second') WHERE event_key=$1 AND expo_token=$2",
    [eventKey,expoToken,invalid?"invalid":state,receiptId || null,error?short(error,140):null,delay],
  );
  if(invalid)await dbPool().query("UPDATE mayk_push_devices SET enabled=FALSE WHERE expo_token=$1",[expoToken]);
}
let busy=false;
export async function processMaykQueue() {
  if(busy)return;
  busy=true;
  try{
    await ensureTables();
    const r=await dbPool().query(
      "WITH due AS (SELECT event_key,expo_token FROM mayk_push_deliveries " +
      "WHERE state IN ('pending','retry','sending') AND next_attempt_at<=NOW() AND attempts<5 " +
      "ORDER BY next_attempt_at LIMIT 16 FOR UPDATE SKIP LOCKED) " +
      "UPDATE mayk_push_deliveries d SET state='sending',attempts=d.attempts+1," +
      "next_attempt_at=NOW()+INTERVAL '2 minutes',updated_at=NOW() FROM due " +
      "WHERE d.event_key=due.event_key AND d.expo_token=due.expo_token " +
      "RETURNING d.event_key,d.expo_token,d.attempts",
    );
    for(const row of r.rows) {
      try {
        const e=await dbPool().query(
          "SELECT title,body,data FROM mayk_push_events WHERE event_key=$1",[row.event_key],
        );
        if(!e.rows[0])continue;
        const response=await expoPost("send",{
          to:row.expo_token,title:e.rows[0].title,body:e.rows[0].body,
          sound:"default",priority:"high",data:e.rows[0].data,
        });
        const ticket=response.data as PushTicket|undefined;
        if(ticket?.status==="ok"&&ticket.id) {
          await setDelivery(row.event_key,row.expo_token,"accepted",undefined,ticket.id,row.attempts);
        } else {
          await setDelivery(row.event_key,row.expo_token,"retry",
            ticket?.details?.error||ticket?.message||"Expo ticket missing",undefined,row.attempts);
        }
      }catch(error) {
        await setDelivery(row.event_key,row.expo_token,"retry",
          error instanceof Error?error.message:String(error),undefined,row.attempts);
      }
    }
    const pending=await dbPool().query(
      "SELECT event_key,expo_token,receipt_id,attempts FROM mayk_push_deliveries " +
      "WHERE state='accepted' AND receipt_id IS NOT NULL AND next_attempt_at<=NOW() LIMIT 50",
    );
    if(pending.rowCount) {
      const receipts=await expoPost("getReceipts",{ids:pending.rows.map(r=>r.receipt_id)});
      const data=receipts.data as Record<string,PushTicket>|undefined;
      for(const row of pending.rows) {
        const receipt=data?.[row.receipt_id];
        if(!receipt) {
          await dbPool().query("UPDATE mayk_push_deliveries SET next_attempt_at=NOW()+INTERVAL '20 minutes' WHERE event_key=$1 AND expo_token=$2",
            [row.event_key,row.expo_token]);
        } else if(receipt.status==="ok") {
          await dbPool().query("UPDATE mayk_push_deliveries SET state='delivered',updated_at=NOW() WHERE event_key=$1 AND expo_token=$2",
            [row.event_key,row.expo_token]);
        } else {
          await setDelivery(row.event_key,row.expo_token,"retry",
            receipt.details?.error||receipt.message||"Expo receipt error",undefined,row.attempts);
        }
      }
    }
  }catch(error){
    console.warn("[mayk-push] dispatch:",error instanceof Error?error.message:String(error));
  }finally{busy=false;}
}
let timer:ReturnType<typeof setInterval>|null=null;
export function startMaykPushWorker(){
  if(timer)return;
  timer=setInterval(()=>void processMaykQueue(),20000);
  timer.unref?.();
  void processMaykQueue();
}
