import { Router } from "express";
import {
  buildProductPoolDescriptionHtml,
  filterProductImagesForShopify,
  rejectNonJpegProductPlaceholders,
  scrapeProductPoolUrl,
} from "./scrape";

const router = Router();
const PROFIT_MARGIN = 0.1;

function normalizeTags(input: unknown): string[] {
  const raw: string[] = [];
  if (Array.isArray(input)) {
    for (const t of input) raw.push(String(t || ""));
  } else if (typeof input === "string") {
    raw.push(...input.split(/[,;\n]+/));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const cleaned = t.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

async function uploadOneProduct(product: Record<string, unknown>) {
  const { shopifyAdminFetch, parseShopifyAdminResponse } = await import(
    "../shopify-token-manager"
  );

  const cost = Number(product.salePrice);
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error("Geçersiz alış fiyatı");
  }

  const shopifyPrice = Math.round(cost * (1 + PROFIT_MARGIN) * 100) / 100;
  const price = shopifyPrice.toFixed(2);
  const compareAt =
    product.compareAtPrice && Number(product.compareAtPrice) > cost
      ? (Math.round(Number(product.compareAtPrice) * (1 + PROFIT_MARGIN) * 100) / 100).toFixed(2)
      : undefined;

  const bodyHtml = buildProductPoolDescriptionHtml(
    product.features as Array<{ name?: string; value?: string }> | undefined,
  );

  const filtered = filterProductImagesForShopify(
    product.images,
    typeof product.siteLogoUrl === "string" ? product.siteLogoUrl : undefined,
  );
  const safeImages = await rejectNonJpegProductPlaceholders(filtered);
  const images = safeImages.map((src, i) => ({ src, position: i + 1 }));

  const userTags = normalizeTags(product.tags);
  const tags = normalizeTags([
    "urun-havuzu",
    String(product.siteName || ""),
    ...userTags,
  ]).join(", ");

  const poolVariants = Array.isArray(product.variants) ? product.variants : [];
  const poolOptions = Array.isArray(product.variantOptions) ? product.variantOptions : [];

  const shopifyOptions =
    poolOptions.length > 0
      ? poolOptions.slice(0, 3).map((o: { name?: string; values?: string[] }, i: number) => ({
          name: String(o.name || `Seçenek ${i + 1}`),
          values: Array.isArray(o.values) ? o.values.map(String).filter(Boolean) : [],
        }))
      : poolVariants.length > 0
        ? [
            {
              name: "Seçenek",
              values: [
                ...new Set(
                  poolVariants
                    .map((v: { option1?: string; title?: string }) =>
                      String(v.option1 || v.title || "").trim(),
                    )
                    .filter(Boolean),
                ),
              ],
            },
          ]
        : undefined;

  const shopifyVariants =
    poolVariants.length > 0
      ? poolVariants.slice(0, 100).map((v: Record<string, unknown>) => {
          const vPrice = Number(v.price);
          const unit = Number.isFinite(vPrice) && vPrice > 0 ? vPrice : cost;
          const vShopify = Math.round(unit * (1 + PROFIT_MARGIN) * 100) / 100;
          const vCompareRaw = Number(v.compareAtPrice);
          const vCompare =
            Number.isFinite(vCompareRaw) && vCompareRaw > unit
              ? (Math.round(vCompareRaw * (1 + PROFIT_MARGIN) * 100) / 100).toFixed(2)
              : compareAt;
          return {
            option1: String(v.option1 || v.title || "Default").slice(0, 100),
            ...(v.option2 ? { option2: String(v.option2).slice(0, 100) } : {}),
            ...(v.option3 ? { option3: String(v.option3).slice(0, 100) } : {}),
            price: vShopify.toFixed(2),
            ...(vCompare ? { compare_at_price: vCompare } : {}),
            sku: String(v.sku || v.asin || product.sku || "").slice(0, 100) || undefined,
            inventory_management: null,
          };
        })
      : [
          {
            price,
            ...(compareAt ? { compare_at_price: compareAt } : {}),
            sku: product.sku || undefined,
            inventory_management: null,
          },
        ];

  const payload = {
    product: {
      title: String(product.title),
      body_html: bodyHtml,
      vendor: product.brand || product.siteName || "Ürün Havuzu",
      product_type: "Ürün Havuzu",
      tags,
      status: "active",
      published: true,
      ...(shopifyOptions?.length
        ? {
            options: shopifyOptions.filter((o: { values: string[] }) => o.values.length > 0),
          }
        : {}),
      variants: shopifyVariants,
      images,
    },
  };

  const { response } = await shopifyAdminFetch("/products.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await parseShopifyAdminResponse(response)) as {
    product?: { id?: number; handle?: string };
    errors?: unknown;
  };

  if (!response.ok || !body?.product?.id) {
    const err =
      typeof body?.errors === "string"
        ? body.errors
        : body?.errors
          ? JSON.stringify(body.errors)
          : `Shopify yükleme başarısız (HTTP ${response.status})`;
    throw new Error(err);
  }

  try {
    const { publishShopifyTransferToMobile } = await import(
      "../services/shopify-memory-upsert.service"
    );
    await publishShopifyTransferToMobile({
      shopifyProductId: String(body.product.id),
      title: String(product.title),
      handle: body.product.handle,
      vendor: String(product.brand || product.siteName || "Ürün Havuzu"),
      productType: "Ürün Havuzu",
      status: "active",
      price: shopifyPrice,
      images: safeImages,
      variants: Array.isArray(product.variants) ? product.variants : undefined,
      sourceUrl: String(product.sourceUrl || ""),
      sourceLabel: "Ürün havuzu",
      shopifyProduct: (body.product as Record<string, unknown>) || null,
    });
  } catch (err) {
    console.warn("[ProductPool] mobil yayın atlandı:", err);
  }

  try {
    const { markWeboTransferred } = await import("../services/webo.service");
    await markWeboTransferred({
      sourceUrl: String(product.sourceUrl || ""),
      shopifyProductId: String(body.product.id),
    });
  } catch (err) {
    console.warn("[ProductPool] webo mark atlandı:", err);
  }

  return {
    productId: String(body.product.id),
    handle: body.product.handle,
    costPrice: cost,
    shopifyPrice,
    marginPercent: PROFIT_MARGIN * 100,
    status: "active" as const,
    tags,
  };
}

/** Bağımsız ürün havuzu — Trendyol / takip / CSV akışından ayrı */
router.post("/scrape", async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    if (!url) {
      return res.status(400).json({ success: false, error: "url zorunlu" });
    }
    const product = await scrapeProductPoolUrl(url);
    void import("../services/webo.service")
      .then(({ upsertWeboProduct }) =>
        upsertWeboProduct({
          sourceUrl: product.sourceUrl,
          title: product.title,
          siteName: product.siteName,
          siteLogoUrl: product.siteLogoUrl,
          price: product.price,
          salePrice: product.salePrice,
          currency: product.currency,
          imageUrl: product.images?.[0],
          images: product.images,
          brand: product.brand,
          sku: product.sku,
          source: "product-pool",
        }),
      )
      .catch((err) => console.warn("[ProductPool] webo ingest atlandı:", err));
    void import("../telegram-integration")
      .then(({ telegramIntegration }) =>
        telegramIntegration.sendNotification(
          `<b>Yeni ürün</b>\n${product.title}\nÜrün havuzu`,
          "new_product",
          undefined,
          String(product.title || ""),
          { url, source: "product-pool" },
        ),
      )
      .catch((err) => console.warn("[ProductPool] mobil bildirim atlandı:", err));
    return res.json({ success: true, product });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[ProductPool] scrape failed:", message);
    return res.status(422).json({ success: false, error: message });
  }
});

router.post("/shopify-upload", async (req, res) => {
  try {
    const product = req.body?.product;
    if (!product?.title || product?.salePrice == null) {
      return res.status(400).json({ success: false, error: "product.title ve salePrice zorunlu" });
    }
    const result = await uploadOneProduct(product);
    return res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[ProductPool] shopify upload failed:", message);
    return res.status(500).json({ success: false, error: message });
  }
});

router.post("/shopify-upload-bulk", async (req, res) => {
  try {
    const products = Array.isArray(req.body?.products) ? req.body.products : [];
    const sharedTags = normalizeTags(req.body?.tags);
    if (!products.length) {
      return res.status(400).json({ success: false, error: "products zorunlu" });
    }

    const results: Array<{
      sourceUrl?: string;
      title?: string;
      success: boolean;
      productId?: string;
      shopifyPrice?: number;
      error?: string;
    }> = [];

    for (const raw of products) {
      try {
        const merged = {
          ...raw,
          tags: [...sharedTags, ...normalizeTags(raw?.tags)],
        };
        const uploaded = await uploadOneProduct(merged);
        results.push({
          sourceUrl: raw?.sourceUrl,
          title: raw?.title,
          success: true,
          productId: uploaded.productId,
          shopifyPrice: uploaded.shopifyPrice,
        });
      } catch (err) {
        results.push({
          sourceUrl: raw?.sourceUrl,
          title: raw?.title,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ok = results.filter((r) => r.success).length;
    return res.json({
      success: ok > 0,
      ok,
      fail: results.length - ok,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[ProductPool] bulk upload failed:", message);
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;
