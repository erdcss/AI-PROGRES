/**
 * Uçtan uca varyant izleme (VARIANT_TRACE).
 *
 * Amaç: Bir scrape isteği boyunca varyant sayısının hangi aşamada teke düştüğünü
 * yapılandırılmış loglarla tespit etmek. Gizli bilgi veya tam HTML BASILMAZ.
 *
 * requestId, AsyncLocalStorage ile request başına taşınır; böylece derin çağrı
 * zincirindeki saf fonksiyonlara imza değişikliği yapmadan trace eklenebilir.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface VariantTraceItem {
  size: string;
  color: string;
  sku: string;
  inStock: boolean | null;
  quantity: number | null;
  source: string;
}

export type VariantTraceStage =
  | "raw_dom"
  | "embedded_state"
  | "sliced_attributes"
  | "all_variants"
  | "merchant_listing"
  | "json_ld"
  | "resolver_input"
  | "resolver_output"
  | "stock_normalizer_input"
  | "stock_normalizer_output"
  | "richer_variant_selection_before"
  | "richer_variant_selection_after"
  | "canonical_product"
  | "csv_rows"
  | "api_response"
  | "client_received"
  | "preview_rendered";

interface StageRecord {
  stage: string;
  count: number;
  uniqueSizes: string[];
}

interface VariantTraceContext {
  requestId: string;
  sourceUrl?: string;
  productId?: string | null;
  richest: { count: number; stage: string; sizes: string[] };
  stages: StageRecord[];
}

const storage = new AsyncLocalStorage<VariantTraceContext>();

/** Trace bağlamı içinde bir fonksiyon çalıştırır (request kapsamı). */
export function runWithVariantTrace<T>(
  init: { requestId: string; sourceUrl?: string; productId?: string | null },
  fn: () => T,
): T {
  const ctx: VariantTraceContext = {
    requestId: init.requestId,
    sourceUrl: sanitizeUrl(init.sourceUrl),
    productId: init.productId ?? extractProductId(init.sourceUrl),
    richest: { count: 0, stage: "none", sizes: [] },
    stages: [],
  };
  return storage.run(ctx, fn);
}

export function getVariantTraceContext(): VariantTraceContext | undefined {
  return storage.getStore();
}

/**
 * Sarmalama yapmadan (ör. IIFE async job içinde) trace bağlamını başlatır.
 * Bu async yürütme ve altındaki tüm await zinciri için geçerli olur.
 */
export function enterVariantTrace(init: {
  requestId: string;
  sourceUrl?: string;
  productId?: string | null;
}): void {
  storage.enterWith({
    requestId: init.requestId,
    sourceUrl: sanitizeUrl(init.sourceUrl),
    productId: init.productId ?? extractProductId(init.sourceUrl),
    richest: { count: 0, stage: "none", sizes: [] },
    stages: [],
  });
}

function sanitizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  // Query string sürücü/merchant id içerebilir ama gizli değil; yine de kısa tut.
  const base = url.split("?")[0];
  return base.length > 160 ? base.slice(0, 160) : base;
}

function extractProductId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/p-(\d+)/);
  return m ? m[1] : null;
}

function asBool(v: unknown): boolean | null {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}

function asQty(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Çeşitli varyant şekillerini ({allVariants|items|sizes|dizi}) trace öğelerine indirger.
 */
export function toTraceItems(variants: unknown, defaultSource = "unknown"): VariantTraceItem[] {
  if (!variants) return [];

  let list: any[] = [];
  if (Array.isArray(variants)) {
    list = variants;
  } else if (typeof variants === "object") {
    const rec = variants as Record<string, unknown>;
    if (Array.isArray(rec.allVariants) && rec.allVariants.length > 0) {
      list = rec.allVariants as any[];
    } else if (Array.isArray(rec.items) && rec.items.length > 0) {
      list = rec.items as any[];
    } else if (Array.isArray(rec.variants) && rec.variants.length > 0) {
      list = rec.variants as any[];
    } else if (Array.isArray(rec.sizes) && rec.sizes.length > 0) {
      // Yalnızca beden listesi
      list = (rec.sizes as unknown[]).map((s) => ({ size: s, color: "" }));
    }
  }

  return list.map((v) => {
    if (v == null) {
      return { size: "", color: "", sku: "", inStock: null, quantity: null, source: defaultSource };
    }
    if (typeof v === "string") {
      return { size: v, color: "", sku: "", inStock: null, quantity: null, source: defaultSource };
    }
    const rec = v as Record<string, unknown>;
    const size = String(
      rec.size ?? rec.sizeName ?? rec.option2 ?? rec.option2Value ?? rec.value ?? rec.name ?? "",
    ).trim();
    const color = String(rec.color ?? rec.colorName ?? rec.option1 ?? rec.option1Value ?? "").trim();
    const sku = String(rec.sku ?? rec.barcode ?? rec.key ?? "").trim();
    const inStock = asBool(rec.inStock ?? rec.available ?? rec.isAvailable);
    const quantity = asQty(rec.quantity ?? rec.stock ?? rec.stockCount ?? rec.inventoryQty);
    const source = String(rec.source ?? defaultSource);
    return { size, color, sku, inStock, quantity, source };
  });
}

function uniqueSizes(items: VariantTraceItem[]): string[] {
  return [...new Set(items.map((i) => i.size).filter((s) => s && s.trim() !== ""))];
}

/**
 * Bir aşamadaki varyantları yapılandırılmış olarak loglar ve bağlama kaydeder.
 */
export function traceVariants(
  stage: VariantTraceStage | string,
  variants: unknown,
  opts?: { source?: string; options?: unknown },
): void {
  const ctx = storage.getStore();
  const items = toTraceItems(variants, opts?.source ?? stage);
  const sizes = uniqueSizes(items);

  const payload = {
    requestId: ctx?.requestId ?? "no-context",
    stage,
    sourceUrl: ctx?.sourceUrl,
    productId: ctx?.productId,
    count: items.length,
    uniqueSizeCount: sizes.length,
    options: opts?.options,
    variants: items.slice(0, 50), // güvenlik: aşırı büyük listeyi kırp
  };

  // eslint-disable-next-line no-console
  console.log(`[VARIANT_TRACE] ${JSON.stringify(payload)}`);

  if (ctx) {
    ctx.stages.push({ stage: String(stage), count: items.length, uniqueSizes: sizes });
    // "Zenginlik" beden çeşitliliği ile ölçülür (asıl teke düşme bedende yaşanıyor).
    const richness = Math.max(items.length, sizes.length);
    const currentRichness = Math.max(ctx.richest.count, ctx.richest.sizes.length);
    if (richness > currentRichness) {
      ctx.richest = { count: items.length, stage: String(stage), sizes };
    }
  }
}

export interface VariantCollapseReport {
  collapsed: boolean;
  richestCount: number;
  richestStage: string;
  richestSizes: string[];
  finalCount: number;
  finalUniqueSizes: number;
  collapsedAt: string;
  stages: StageRecord[];
}

/**
 * Final kalite kapısı: önceki aşamalarda ≥2 benzersiz varyant/beden bulunduysa fakat
 * final aşamada 1'e düştüyse teke-düşme raporu üretir.
 */
export function evaluateVariantCollapse(finalVariants: unknown): VariantCollapseReport {
  const ctx = storage.getStore();
  const finalItems = toTraceItems(finalVariants, "final");
  const finalUnique = uniqueSizes(finalItems).length;
  const finalCount = Math.max(finalItems.length, finalUnique);

  const richestSizes = ctx?.richest.sizes ?? [];
  const richestCount = Math.max(ctx?.richest.count ?? 0, richestSizes.length);
  const richestStage = ctx?.richest.stage ?? "none";

  // Teke düşme: bir önceki aşamada ≥2 benzersiz beden/varyant vardı, final 1 (veya 0).
  const collapsed = richestCount >= 2 && finalCount <= 1;

  let collapsedAt = "none";
  if (collapsed && ctx) {
    // İlk defa richest'ten düşük seviyeye inen aşamayı bul.
    for (const s of ctx.stages) {
      const level = Math.max(s.count, s.uniqueSizes.length);
      if (level <= 1) {
        collapsedAt = s.stage;
        break;
      }
    }
    if (collapsedAt === "none") collapsedAt = "final";
  }

  return {
    collapsed,
    richestCount,
    richestStage,
    richestSizes,
    finalCount,
    finalUniqueSizes: finalUnique,
    collapsedAt,
    stages: ctx?.stages ?? [],
  };
}
