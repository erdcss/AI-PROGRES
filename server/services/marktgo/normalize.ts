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

function collectImageUrls(raw: unknown, out: string[], depth = 0): void {
  if (raw == null || depth > 6) return;
  if (typeof raw === "string") {
    const url = raw.trim();
    if (/^https?:\/\//i.test(url)) out.push(url);
    return;
  }
  if (Array.isArray(raw)) {
    raw.forEach((item) => collectImageUrls(item, out, depth + 1));
    return;
  }
  if (typeof raw !== "object") return;

  const row = raw as Record<string, unknown>;
  for (const key of [
    "url",
    "src",
    "publicUrl",
    "imageUrl",
    "image",
    "featuredImage",
    "images",
    "imageUrls",
    "gallery",
    "media",
    "photos",
    "pictures",
    "original",
    "large",
  ]) {
    if (row[key] != null) collectImageUrls(row[key], out, depth + 1);
  }
}

function imagesFrom(...rawValues: unknown[]): string[] {
  const out: string[] = [];
  rawValues.forEach((raw) => collectImageUrls(raw, out));
  return [...new Set(out)];
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
    images: imagesFrom(
      p.images,
      p.image,
      p.imageUrl,
      p.featuredImage,
      p.imageUrls,
      p.gallery,
      p.media,
      p.photos,
      p.pictures,
      root.images,
      root.image,
      root.imageUrl,
    ),
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

export function extractExternalId(payload: unknown): string | null {
  const root = asObj(payload);
  const p = asObj(root.data && typeof root.data === "object" ? root.data : root.product || root);
  return str(p.externalId || p.external_id || root.externalId);
}

export function extractTags(payload: unknown): string[] {
  const root = asObj(payload);
  const p = asObj(root.data && typeof root.data === "object" ? root.data : root.product || root);
  const raw = Array.isArray(p.tags) ? p.tags : Array.isArray(root.tags) ? root.tags : [];
  return raw.map((t) => String(t || "").trim()).filter(Boolean);
}

export function listItemsFromPayload(payload: unknown): unknown[] {
  const root = asObj(payload);
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.data)) return root.data;
  if (Array.isArray(payload)) return payload;
  return [];
}
