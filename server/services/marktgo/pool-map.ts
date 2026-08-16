import { createHash } from "crypto";
import type { LocalProductInput } from "../services/marktgo/types";

const PROFIT_MARGIN = 0.1;

export function poolLocalProductId(product: Record<string, unknown>): string {
  const poolId = String(product.poolId || product.id || "").trim();
  if (poolId) return poolId;
  const url = String(product.sourceUrl || "").trim();
  if (url) return `url_${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;
  return `tmp_${Date.now()}`;
}

export function mapPoolProductToMarktGoInput(
  product: Record<string, unknown>,
): LocalProductInput {
  const cost = Number(product.salePrice);
  const sale = Number.isFinite(cost) ? cost : 0;
  const compare =
    product.compareAtPrice != null && Number(product.compareAtPrice) > sale
      ? Number(product.compareAtPrice)
      : null;
  const sellPrice = Math.round(sale * (1 + PROFIT_MARGIN) * 100) / 100;
  const regular = compare
    ? Math.round(compare * (1 + PROFIT_MARGIN) * 100) / 100
    : sellPrice;
  const images = Array.isArray(product.images)
    ? product.images.map(String)
    : product.image
      ? [String(product.image)]
      : [];
  const tags = Array.isArray(product.tags) ? product.tags.map(String) : [];
  const features = Array.isArray(product.features)
    ? (product.features as Array<{ name?: string; value?: string }>)
        .map((f) =>
          f?.name && f?.value ? `<li><strong>${f.name}:</strong> ${f.value}</li>` : "",
        )
        .filter(Boolean)
        .join("")
    : "";
  const description = features ? `<ul>${features}</ul>` : "";
  const variants = Array.isArray(product.variants)
    ? (product.variants as Array<Record<string, unknown>>).map((v, i) => ({
        localVariantId: String(v.id || v.sku || `${i}`),
        option1: v.option1
          ? String(v.option1)
          : v.color
            ? String(v.color)
            : v.title
              ? String(v.title)
              : undefined,
        option2: v.option2 ? String(v.option2) : v.size ? String(v.size) : undefined,
        sku: v.sku ? String(v.sku) : undefined,
        stock:
          v.inStock === false
            ? 0
            : v.stock != null
              ? Math.max(0, Math.floor(Number(v.stock) || 0))
              : 1,
        price: v.price != null ? Number(v.price) : sellPrice,
        imageUrl: v.imageUrl ? String(v.imageUrl) : v.image ? String(v.image) : undefined,
      }))
    : [];

  return {
    localProductId: poolLocalProductId(product),
    title: String(product.title || "Ürün"),
    description,
    brand: product.brand ? String(product.brand) : product.siteName ? String(product.siteName) : null,
    category: product.category ? String(product.category) : null,
    sourceUrl: product.sourceUrl ? String(product.sourceUrl) : null,
    price: regular,
    discountPrice: compare ? sellPrice : null,
    stock: product.inStock === false ? 0 : Math.max(0, Math.floor(Number(product.stock) || 20)),
    images,
    tags: ["urun-havuzu", ...tags],
    variants,
  };
}
