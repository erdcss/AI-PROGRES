import { parse } from "csv-parse/sync";
import {
  shopifyAdminFetch,
  shopifyAdminGraphql,
  parseShopifyAdminResponse,
} from "./shopify-token-manager";
import { buildUploadLockKey } from "./shopify-source-key";
import type { CanonicalProductForShopify } from "./variant-shape-normalizer";
import { fetchShopifyVariantMappings } from "./services/shopify-variant-fetch.service";
import {
  buildAutomaticProductTags,
  buildLegacySourceLookupTag,
  buildSourceLookupTag,
  joinShopifyTags,
} from "@shared/shopify-tag-sanitizer";

export type UpsertMode = "created" | "updated" | "skipped";

export interface UpsertResult {
  success: boolean;
  mode?: UpsertMode;
  productId?: string;
  productGid?: string;
  handle?: string;
  message: string;
  createdVariants?: number;
  updatedVariants?: number;
  skippedVariants?: number;
  skippedDuplicateVariants?: number;
  variantMappings?: Array<{
    sourceVariantKey: string;
    sku: string;
    option1?: string;
    option2?: string;
    shopifyVariantId: string;
    shopifyVariantGid?: string;
    inventoryItemId?: string;
  }>;
  imageResults?: Array<{ src: string; status: string }>;
  metafieldResults?: Array<{ key: string; status: string }>;
  warnings?: string[];
  httpStatus?: number;
}

const uploadLocks = new Map<string, { startedAt: number }>();
const LOCK_TTL_MS = 120_000;

export function acquireUploadLock(sourceKey: string): { acquired: boolean; lockKey: string } {
  const lockKey = buildUploadLockKey(sourceKey);
  const existing = uploadLocks.get(lockKey);
  if (existing && Date.now() - existing.startedAt < LOCK_TTL_MS) {
    return { acquired: false, lockKey };
  }
  uploadLocks.set(lockKey, { startedAt: Date.now() });
  return { acquired: true, lockKey };
}

export function releaseUploadLock(lockKey: string): void {
  uploadLocks.delete(lockKey);
}

interface ExistingProductMatch {
  id: string;
  handle: string;
  variants: Array<{ id: string; sku: string; option1?: string; option2?: string }>;
  imageUrls: Set<string>;
}

/** Shopify'da mevcut ürün ara: tag → handle → SKU prefix */
export async function findExistingShopifyProduct(opts: {
  sourceProductId: string;
  handle?: string;
  skuPrefix?: string;
}): Promise<ExistingProductMatch | null> {
  const lookupTags = [
    buildSourceLookupTag(opts.sourceProductId),
    buildLegacySourceLookupTag(opts.sourceProductId),
  ];

  for (const tag of lookupTags) {
    const gqlByTag = `{
    products(first: 3, query: "tag:${tag}") {
      edges {
        node {
          id
          handle
          variants(first: 100) {
            edges { node { id sku selectedOptions { name value } } }
          }
          images(first: 50) { edges { node { url } } }
        }
      }
    }
  }`;

    try {
      const tagResult = await shopifyAdminGraphql(gqlByTag);
      const edges = tagResult?.data?.products?.edges ?? [];
      if (edges.length > 0) {
        return mapGraphqlProduct(edges[0].node);
      }
    } catch (err) {
      console.warn(`[ShopifyUpsert] tag search failed (${tag}):`, err);
    }
  }

  if (opts.handle) {
    try {
      const { response } = await shopifyAdminFetch(
        `/products.json?handle=${encodeURIComponent(opts.handle)}&limit=1`,
      );
      if (response.ok) {
        const data = (await parseShopifyAdminResponse(response)) as {
          products?: Array<Record<string, unknown>>;
        };
        const p = data.products?.[0];
        if (p) return mapRestProduct(p);
      }
    } catch {
      /* ignore */
    }
  }

  if (opts.skuPrefix) {
    try {
      const gqlBySku = `{
        productVariants(first: 1, query: "sku:${opts.skuPrefix}*") {
          edges {
            node {
              product {
                id
                handle
                variants(first: 100) {
                  edges { node { id sku selectedOptions { name value } } }
                }
                images(first: 50) { edges { node { url } } }
              }
            }
          }
        }
      }`;
      const skuResult = await shopifyAdminGraphql(gqlBySku);
      const variantEdges = skuResult?.data?.productVariants?.edges ?? [];
      if (variantEdges.length > 0) {
        return mapGraphqlProduct(variantEdges[0].node.product);
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

function mapGraphqlProduct(node: Record<string, unknown>): ExistingProductMatch {
  const gid = String(node.id ?? "");
  const numericId = gid.replace(/\D/g, "");
  const variants =
    ((node.variants as { edges?: Array<{ node: Record<string, unknown> }> })?.edges ?? []).map(
      (e) => {
        const n = e.node;
        const opts = (n.selectedOptions as Array<{ name: string; value: string }>) ?? [];
        return {
          id: String(n.id ?? "").replace(/\D/g, ""),
          sku: String(n.sku ?? ""),
          option1: opts[0]?.value,
          option2: opts[1]?.value,
        };
      },
    );
  const imageUrls = new Set<string>(
    ((node.images as { edges?: Array<{ node: { url: string } }> })?.edges ?? []).map(
      (e) => e.node.url,
    ),
  );
  return { id: numericId, handle: String(node.handle ?? ""), variants, imageUrls };
}

function mapRestProduct(p: Record<string, unknown>): ExistingProductMatch {
  const variants = ((p.variants as Array<Record<string, unknown>>) ?? []).map((v) => ({
    id: String(v.id ?? ""),
    sku: String(v.sku ?? ""),
    option1: v.option1 != null ? String(v.option1) : undefined,
    option2: v.option2 != null ? String(v.option2) : undefined,
  }));
  const imageUrls = new Set<string>(
    ((p.images as Array<{ src: string }>) ?? []).map((i) => i.src),
  );
  return {
    id: String(p.id ?? ""),
    handle: String(p.handle ?? ""),
    variants,
    imageUrls,
  };
}

async function setSourceMetafields(
  productId: string,
  canonical: CanonicalProductForShopify,
): Promise<void> {
  const fields = [
    { key: "source_platform", value: canonical.sourcePlatform },
    { key: "source_product_id", value: canonical.sourceProductId },
    { key: "source_url", value: canonical.sourceUrl },
    { key: "trendyol_url_product_id", value: canonical.urlProductId ?? "" },
    { key: "trendyol_parsed_product_id", value: canonical.parsedProductId ?? "" },
  ];
  for (const field of fields) {
    try {
      await shopifyAdminFetch(`/products/${productId}/metafields.json`, {
        method: "POST",
        body: JSON.stringify({
          metafield: {
            namespace: "custom",
            key: field.key,
            value: field.value,
            type: "single_line_text_field",
          },
        }),
      });
    } catch {
      /* non-critical */
    }
  }
}

function col(record: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    if (record[n] !== undefined && record[n] !== null && record[n] !== "") return record[n];
  }
  return "";
}

function parseCsvVariants(csvContent: string) {
  const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Record<
    string,
    string
  >[];
  const first = records[0] ?? {};
  const handle = col(first, "URL handle", "Handle");
  const title = first.Title || "Product";
  const bodyHtml = col(first, "Description", "Body (HTML)");
  const vendor = first.Vendor || "";
  const tags = first.Tags || "";

  const variants = records
    .filter((r) => col(r, "SKU", "Variant SKU").trim())
    .map((r) => ({
      option1: col(r, "Option1 value", "Option1 Value"),
      option2: col(r, "Option2 value", "Option2 Value"),
      price: col(r, "Price", "Variant Price") || "0",
      compareAtPrice: col(r, "Compare-at price", "Variant Compare At Price"),
      sku: col(r, "SKU", "Variant SKU"),
      inventoryQty: parseInt(col(r, "Inventory quantity", "Variant Inventory Qty"), 10) || 0,
      image: col(r, "Variant image URL", "Product image URL", "Image Src"),
    }));

  const images = records
    .filter((r) => {
      const src = col(r, "Product image URL", "Image Src");
      return src.startsWith("http");
    })
    .map((r, i) => ({
      src: col(r, "Product image URL", "Image Src"),
      alt: col(r, "Image alt text", "Image Alt Text") || title,
      position: parseInt(col(r, "Image position", "Image Position"), 10) || i + 1,
    }));

  const option1Name = col(first, "Option1 name", "Option1 Name");
  const option2Name = col(first, "Option2 name", "Option2 Name");

  return { handle, title, bodyHtml, vendor, tags, variants, images, option1Name, option2Name };
}

/** Idempotent create/update — aynı sourceKey için ikinci create engellenir */
export async function upsertProductFromSource(
  csvContent: string,
  canonical: CanonicalProductForShopify,
): Promise<UpsertResult> {
  const { acquired, lockKey } = acquireUploadLock(canonical.sourceKey);
  if (!acquired) {
    return {
      success: false,
      mode: "skipped",
      message: "Bu ürün şu anda işleniyor — lütfen bekleyin",
      httpStatus: 409,
    };
  }

  try {
    const parsed = parseCsvVariants(csvContent);
    const skuPrefix = `TY-${canonical.sourceProductId}`;

    const existing = await findExistingShopifyProduct({
      sourceProductId: canonical.sourceProductId,
      handle: parsed.handle || canonical.handle,
      skuPrefix,
    });

    const sourceTags = joinShopifyTags([
      ...buildAutomaticProductTags(canonical.sourceProductId),
      ...(parsed.tags ? parsed.tags.split(",").map((t) => t.trim()) : []),
    ]);

    if (existing) {
      console.log(`[ShopifyUpsert] existingProductId=${existing.id}`);
      const updateResult = await updateExistingProduct(
        existing,
        parsed,
        sourceTags,
        canonical,
      );
      await setSourceMetafields(existing.id, canonical);
      console.log(`[ShopifyUpsert] mode=updated`);
      return updateResult;
    }

    const createResult = await createNewProduct(parsed, sourceTags, canonical);
    if (createResult.productId) {
      await setSourceMetafields(createResult.productId, canonical);
    }
    console.log(`[ShopifyUpsert] mode=created productId=${createResult.productId}`);
    return createResult;
  } finally {
    releaseUploadLock(lockKey);
  }
}

const REST_VARIANT_CREATE_LIMIT = 100;
const GRAPHQL_VARIANT_BATCH_SIZE = 100;

async function createNewProductViaGraphQL(
  parsed: ReturnType<typeof parseCsvVariants>,
  tags: string,
  canonical: CanonicalProductForShopify,
): Promise<UpsertResult> {
  const opt1Values = [...new Set(parsed.variants.map((v) => v.option1).filter(Boolean))];
  const opt2Values = [...new Set(parsed.variants.map((v) => v.option2).filter(Boolean))];

  const productOptionsInput: Array<{ name: string; values: Array<{ name: string }> }> = [];
  if (opt1Values.length && parsed.option1Name) {
    productOptionsInput.push({
      name: parsed.option1Name,
      values: opt1Values.map((v) => ({ name: v })),
    });
  }
  if (opt2Values.length && parsed.option2Name) {
    productOptionsInput.push({
      name: parsed.option2Name,
      values: opt2Values.map((v) => ({ name: v })),
    });
  }

  const createMutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id handle }
        userErrors { field message }
      }
    }
  `;

  const productInput: Record<string, unknown> = {
    title: parsed.title,
    descriptionHtml: parsed.bodyHtml,
    vendor: parsed.vendor || canonical.brand,
    tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    handle: parsed.handle || canonical.handle,
    status: "ACTIVE",
  };
  if (productOptionsInput.length > 0) productInput.productOptions = productOptionsInput;

  const createResult = await shopifyAdminGraphql<{
    productCreate?: {
      product?: { id: string; handle: string };
      userErrors?: Array<{ message: string }>;
    };
  }>(createMutation, { input: productInput }, false, "2024-10");

  if (!createResult.response.ok) {
    return {
      success: false,
      message: `GraphQL HTTP hatası: ${createResult.response.status}`,
      httpStatus: createResult.response.status,
    };
  }

  const userErrors = createResult.data?.productCreate?.userErrors || [];
  if (createResult.errors || userErrors.length > 0) {
    const errMsg = createResult.errors
      ? JSON.stringify(createResult.errors)
      : userErrors.map((e) => e.message).join(", ");
    return {
      success: false,
      message: `GraphQL ürün oluşturma hatası: ${errMsg}`,
      httpStatus: 422,
    };
  }

  const createdProduct = createResult.data?.productCreate?.product;
  if (!createdProduct?.id) {
    return { success: false, message: "GraphQL ürün oluşturma yanıtı eksik", httpStatus: 422 };
  }

  const productGid = createdProduct.id;
  const productId = productGid.split("/").pop()!;
  console.log(`[ShopifyUpsert] GraphQL ürün oluşturuldu ID=${productId} (${parsed.variants.length} varyant)`);

  if (parsed.images.length > 0) {
    const IMAGE_BATCH_SIZE = 5;
    for (let b = 0; b < parsed.images.length; b += IMAGE_BATCH_SIZE) {
      const batch = parsed.images.slice(b, b + IMAGE_BATCH_SIZE);
      await Promise.all(
        batch.map(async (image) => {
          try {
            await shopifyAdminFetch(`/products/${productId}/images.json`, {
              method: "POST",
              body: JSON.stringify({
                image: { src: image.src, alt: image.alt, position: image.position },
              }),
            });
          } catch {
            /* non-critical */
          }
        }),
      );
    }
  }

  const bulkVariantMutation = `
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }
  `;

  let createdVariantCount = 0;
  for (let i = 0; i < parsed.variants.length; i += GRAPHQL_VARIANT_BATCH_SIZE) {
    const batch = parsed.variants.slice(i, i + GRAPHQL_VARIANT_BATCH_SIZE);
    const variantsInput = batch.map((v) => {
      const vi: Record<string, unknown> = {
        price: v.price,
        sku: v.sku,
        inventoryPolicy: v.inventoryQty > 0 ? "CONTINUE" : "DENY",
        inventoryItem: { tracked: true },
      };
      if (v.compareAtPrice && parseFloat(v.compareAtPrice) > 0) {
        vi.compareAtPrice = v.compareAtPrice;
      }
      const optionValues: { name: string; value: string }[] = [];
      if (v.option1?.trim() && parsed.option1Name) {
        optionValues.push({ name: parsed.option1Name, value: v.option1 });
      }
      if (v.option2?.trim() && parsed.option2Name) {
        optionValues.push({ name: parsed.option2Name, value: v.option2 });
      }
      if (optionValues.length > 0) vi.optionValues = optionValues;
      return vi;
    });

    const varResult = await shopifyAdminGraphql<{
      productVariantsBulkCreate?: {
        productVariants?: Array<{ id: string }>;
        userErrors?: Array<{ message: string }>;
      };
    }>(
      bulkVariantMutation,
      { productId: productGid, variants: variantsInput },
      false,
      "2024-10",
    );

    if (!varResult.response.ok) {
      return {
        success: false,
        message: `GraphQL varyant batch hatası (HTTP ${varResult.response.status})`,
        httpStatus: varResult.response.status,
        productId,
      };
    }

    const vErrors = varResult.data?.productVariantsBulkCreate?.userErrors || [];
    if (varResult.errors || vErrors.length > 0) {
      const errMsg = varResult.errors
        ? JSON.stringify(varResult.errors)
        : vErrors.map((e) => e.message).join(", ");
      return {
        success: false,
        message: `GraphQL varyant oluşturma hatası: ${errMsg}`,
        httpStatus: 422,
        productId,
      };
    }

    createdVariantCount += varResult.data?.productVariantsBulkCreate?.productVariants?.length ?? 0;
  }

  const variantMappings = await fetchShopifyVariantMappings(productId);

  return {
    success: true,
    mode: "created",
    productId,
    productGid,
    handle: createdProduct.handle,
    message: `GraphQL ile oluşturuldu (${createdVariantCount} varyant)`,
    createdVariants: createdVariantCount,
    updatedVariants: 0,
    skippedDuplicateVariants: 0,
    variantMappings,
  };
}

async function createNewProduct(
  parsed: ReturnType<typeof parseCsvVariants>,
  tags: string,
  canonical: CanonicalProductForShopify,
): Promise<UpsertResult> {
  if (parsed.variants.length > REST_VARIANT_CREATE_LIMIT) {
    console.log(
      `[ShopifyUpsert] ${parsed.variants.length} varyant > ${REST_VARIANT_CREATE_LIMIT} — GraphQL kullanılıyor`,
    );
    return createNewProductViaGraphQL(parsed, tags, canonical);
  }

  const options: Array<{ name: string; values: string[] }> = [];
  const opt1Values = [...new Set(parsed.variants.map((v) => v.option1).filter(Boolean))];
  const opt2Values = [...new Set(parsed.variants.map((v) => v.option2).filter(Boolean))];
  if (opt1Values.length && parsed.option1Name) {
    options.push({ name: parsed.option1Name, values: opt1Values });
  }
  if (opt2Values.length && parsed.option2Name) {
    options.push({ name: parsed.option2Name, values: opt2Values });
  }

  const payload = {
    product: {
      title: parsed.title,
      body_html: parsed.bodyHtml,
      vendor: parsed.vendor || canonical.brand,
      tags,
      handle: parsed.handle || canonical.handle,
      status: "active",
      options: options.length ? options : undefined,
      variants: parsed.variants.map((v) => {
        const row: Record<string, unknown> = {
          price: v.price,
          sku: v.sku,
          inventory_quantity: v.inventoryQty,
          inventory_management: "shopify",
          inventory_policy: v.inventoryQty > 0 ? "continue" : "deny",
          requires_shipping: true,
          taxable: true,
        };
        if (v.compareAtPrice && parseFloat(v.compareAtPrice) > 0) {
          row.compare_at_price = v.compareAtPrice;
        }
        if (v.option1) row.option1 = v.option1;
        if (v.option2) row.option2 = v.option2;
        return row;
      }),
      images: parsed.images.map((img) => ({
        src: img.src,
        alt: img.alt,
        position: img.position,
      })),
    },
  };

  const { response } = await shopifyAdminFetch("/products.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await parseShopifyAdminResponse(response);
    const errStr = JSON.stringify(err);
    if (
      parsed.variants.length > REST_VARIANT_CREATE_LIMIT &&
      errStr.includes("more than 100 variants")
    ) {
      return createNewProductViaGraphQL(parsed, tags, canonical);
    }
    return {
      success: false,
      message: `Shopify create hatası: ${errStr}`,
      httpStatus: response.status,
    };
  }

  const result = (await parseShopifyAdminResponse(response)) as {
    product: { id: number; handle: string };
  };

  const productId = String(result.product.id);
  const variantMappings = await fetchShopifyVariantMappings(productId);

  return {
    success: true,
    mode: "created",
    productId,
    productGid: `gid://shopify/Product/${productId}`,
    handle: result.product.handle,
    message: "Ürün oluşturuldu",
    createdVariants: parsed.variants.length,
    updatedVariants: 0,
    skippedDuplicateVariants: 0,
    variantMappings,
  };
}

async function updateExistingProduct(
  existing: ExistingProductMatch,
  parsed: ReturnType<typeof parseCsvVariants>,
  tags: string,
  canonical: CanonicalProductForShopify,
): Promise<UpsertResult> {
  await shopifyAdminFetch(`/products/${existing.id}.json`, {
    method: "PUT",
    body: JSON.stringify({
      product: {
        id: existing.id,
        title: parsed.title,
        body_html: parsed.bodyHtml,
        vendor: parsed.vendor || canonical.brand,
        tags,
        status: "active",
      },
    }),
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const skuMap = new Map(existing.variants.map((v) => [v.sku, v]));

  for (const variant of parsed.variants) {
    const existingVariant = skuMap.get(variant.sku);
    if (existingVariant) {
      const { response } = await shopifyAdminFetch(
        `/variants/${existingVariant.id}.json`,
        {
          method: "PUT",
          body: JSON.stringify({
            variant: {
              id: existingVariant.id,
              price: variant.price,
              inventory_quantity: variant.inventoryQty,
              inventory_management: "shopify",
              inventory_policy: variant.inventoryQty > 0 ? "continue" : "deny",
            },
          }),
        },
      );
      if (response.ok) updated++;
      else skipped++;
    } else {
      const { response } = await shopifyAdminFetch(`/products/${existing.id}/variants.json`, {
        method: "POST",
        body: JSON.stringify({
          variant: {
            option1: variant.option1 || undefined,
            option2: variant.option2 || undefined,
            price: variant.price,
            sku: variant.sku,
            inventory_quantity: variant.inventoryQty,
            inventory_management: "shopify",
            inventory_policy: variant.inventoryQty > 0 ? "continue" : "deny",
          },
        }),
      });
      if (response.ok) created++;
      else skipped++;
    }
  }

  for (const img of parsed.images) {
    if (existing.imageUrls.has(img.src)) {
      skipped++;
      continue;
    }
    await shopifyAdminFetch(`/products/${existing.id}/images.json`, {
      method: "POST",
      body: JSON.stringify({ image: { src: img.src, alt: img.alt, position: img.position } }),
    });
  }

  console.log(
    `[ShopifyUpsert] createdVariants=${created} updatedVariants=${updated} skippedDuplicateVariants=${skipped}`,
  );

  const variantMappings = await fetchShopifyVariantMappings(existing.id);

  return {
    success: true,
    mode: "updated",
    productId: existing.id,
    productGid: `gid://shopify/Product/${existing.id}`,
    handle: existing.handle,
    message: "Mevcut ürün güncellendi",
    createdVariants: created,
    updatedVariants: updated,
    skippedVariants: skipped,
    skippedDuplicateVariants: skipped,
    variantMappings,
  };
}
