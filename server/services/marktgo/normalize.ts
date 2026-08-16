import type { NormalizedRemoteProduct } from "./types";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function imagesFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.startsWith("http")) out.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const u = String(o.url || o.src || o.publicUrl || o.imageUrl || "");
      if (u.startsWith("http")) out.push(u);
    }
  }
  return out;
}

export function normalizeMarktGoProduct(payload: unknown): NormalizedRemoteProduct {
  const root = asObj(payload);
  const p = asObj(root.data && typeof root.data === "object" ? root.data : root.product || root);
  const boxed = asObj(p.variants);
  const variantsRaw = Array.isArray(p.variants)
    ? p.variants
    : Array.isArray(boxed.skus)
      ? boxed.skus
      : [];
  return {
    title: str(p.name || p.title) || "",
    description: str(p.description || p.bodyHtml),
    price: num(p.price ?? asObj(p.pricing).price),
    discountPrice: num(p.discountPrice ?? asObj(p.pricing).discountPrice),
    stock: num(p.stock ?? asObj(p.inventory).stock),
    images: imagesFrom(p.images),
    variants: variantsRaw.map((v) => {
      const o = asObj(v);
      return {
        id: str(o.id) || undefined,
        option1: str(o.option1) || undefined,
        option2: str(o.option2) || undefined,
        sku: str(o.sku) || undefined,
        stock: num(o.stock),
        price: num(o.price),
        imageUrl: str(o.imageUrl || o.image),
      };
    }),
    category: str(asObj(p.category).name || p.categoryName),
    brand: str(p.brand || asObj(p.brand).name),
    updatedAt: str(p.updatedAt || p.updated_at),
  };
}

export function extractId(payload: unknown): string | null {
  const root = asObj(payload);
  const p = asObj(root.data && typeof root.data === "object" ? root.data : root.product || root);
  const id = p.id ?? root.id;
  return id != null ? String(id) : null;
}
