/**
 * Shopify ProductVariant ↔ Media association.
 * Galeriye görsel yüklemek yetmez; variant media bağlanmalı.
 *
 * Güvenilir yol (Shopify community + docs):
 * 1) Benzersiz featured image'leri product media olarak yükle
 * 2) Media READY olunca URL → MediaImage ID map kur
 * 3) productVariantsBulkUpdate ile mediaId ata
 * 4) Read-back verification
 */
import {
  shopifyAdminFetch,
  shopifyAdminGraphql,
  parseShopifyAdminResponse,
} from "./shopify-token-manager";

export type VariantMediaSource = {
  option1?: string;
  option2?: string;
  sku?: string;
  imageUrl?: string;
  mediaGroupKey?: string;
  featuredImage?: string;
};

export type ShopifyVariantRef = {
  shopifyVariantId: string;
  shopifyVariantGid?: string;
  option1?: string;
  option2?: string;
  sku?: string;
};

export type VariantMediaDiagnostics = {
  canonicalVariants: number;
  mediaGroups: number;
  uniqueMediaUrls: number;
  productMediaCreated: number;
  mediaIdMap: Record<string, string>;
  variantsMatched: number;
  variantsAssociated: number;
  variantsMissingMedia: number;
  userErrors: Array<{ field?: string[] | null; message: string }>;
  variantMediaVerification: boolean;
  associationPayloadSample?: Array<{
    variantId: string;
    option1?: string;
    option2?: string;
    mediaId: string;
    imageUrl: string;
  }>;
  readBackSample: Array<{
    title: string;
    option1?: string;
    option2?: string;
    mediaCount: number;
    mediaId?: string;
  }>;
};

export function normalizeMediaUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.pathname = u.pathname.replace(/\/mnresize\/\d+\/\d+\//gi, "/");
    u.search = "";
    u.hash = "";
    return u.toString().toLowerCase();
  } catch {
    return raw.replace(/\?.*$/, "").toLowerCase();
  }
}

export function resolveVariantImageUrl(v: VariantMediaSource): string {
  const url = String(v.featuredImage || v.imageUrl || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

export function variantMatchKey(opt1?: string, opt2?: string, sku?: string): string {
  const n = (s?: string) =>
    String(s || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
  const s = n(sku);
  if (s) return `sku:${s}`;
  return `opt:${n(opt1)}|${n(opt2)}`;
}

export function matchShopifyVariant(
  source: VariantMediaSource,
  shopifyVariants: ShopifyVariantRef[],
): ShopifyVariantRef | undefined {
  if (source.sku?.trim()) {
    const bySku = variantMatchKey(undefined, undefined, source.sku);
    const hit = shopifyVariants.find(
      (sv) => variantMatchKey(undefined, undefined, sv.sku) === bySku,
    );
    if (hit) return hit;
  }
  const byOpt = variantMatchKey(source.option1, source.option2);
  return shopifyVariants.find(
    (sv) => variantMatchKey(sv.option1, sv.option2) === byOpt,
  );
}

/** Aynı mediaGroupKey → aynı mediaId (URL map üzerinden) */
export function planVariantMediaAssociations(
  sourceVariants: VariantMediaSource[],
  shopifyVariants: ShopifyVariantRef[],
  mediaIdByUrl: Map<string, string>,
): {
  associations: Array<{
    variantGid: string;
    mediaId: string;
    imageUrl: string;
    option1?: string;
    option2?: string;
    mediaGroupKey?: string;
  }>;
  matched: number;
  missingImage: number;
  missingMatch: number;
  missingMediaId: number;
} {
  const associations: Array<{
    variantGid: string;
    mediaId: string;
    imageUrl: string;
    option1?: string;
    option2?: string;
    mediaGroupKey?: string;
  }> = [];
  let matched = 0;
  let missingImage = 0;
  let missingMatch = 0;
  let missingMediaId = 0;

  for (const src of sourceVariants) {
    const imageUrl = resolveVariantImageUrl(src);
    if (!imageUrl) {
      missingImage++;
      continue;
    }
    const shopify = matchShopifyVariant(src, shopifyVariants);
    if (!shopify) {
      missingMatch++;
      continue;
    }
    matched++;
    const mediaId = mediaIdByUrl.get(normalizeMediaUrl(imageUrl));
    if (!mediaId) {
      missingMediaId++;
      continue;
    }
    associations.push({
      variantGid: toVariantGid(shopify.shopifyVariantGid || shopify.shopifyVariantId),
      mediaId,
      imageUrl,
      option1: src.option1,
      option2: src.option2,
      mediaGroupKey: src.mediaGroupKey,
    });
  }

  return { associations, matched, missingImage, missingMatch, missingMediaId };
}

export function evaluateAssociationSuccess(opts: {
  expectedAssociations: number;
  associatedOnReadBack: number;
  userErrors: unknown[];
}): { success: boolean; variantMediaVerification: boolean } {
  if (opts.expectedAssociations === 0) {
    return { success: true, variantMediaVerification: true };
  }
  const variantMediaVerification =
    opts.associatedOnReadBack >= opts.expectedAssociations &&
    opts.userErrors.length === 0;
  return {
    success: variantMediaVerification,
    variantMediaVerification,
  };
}

function toProductGid(productId: string): string {
  return productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;
}

function toVariantGid(id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`;
}

function numericProductId(productId: string): string {
  return productId.includes("/") ? productId.split("/").pop()! : productId;
}

const PRODUCT_CREATE_MEDIA = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        id
        mediaContentType
        preview { status }
        ... on MediaImage { image { url } }
      }
      mediaUserErrors { field message }
      product { id }
    }
  }
`;

const PRODUCT_MEDIA_QUERY = `
  query ProductMedia($id: ID!) {
    product(id: $id) {
      id
      media(first: 100) {
        nodes {
          id
          mediaContentType
          preview { status }
          ... on MediaImage { image { url } }
        }
      }
    }
  }
`;

const BULK_UPDATE_MUTATION = `
  mutation AssociateVariantMedia(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(
      productId: $productId
      variants: $variants
      allowPartialUpdates: true
    ) {
      productVariants {
        id
        title
        selectedOptions { name value }
        media(first: 3) {
          nodes { id mediaContentType }
        }
      }
      userErrors { field message }
    }
  }
`;

const READ_BACK_QUERY = `
  query VariantMediaReadBack($id: ID!) {
    product(id: $id) {
      id
      media(first: 50) {
        nodes {
          id
          mediaContentType
          preview { status }
          ... on MediaImage { image { url } }
        }
      }
      variants(first: 100) {
        nodes {
          id
          title
          selectedOptions { name value }
          media(first: 3) {
            nodes { id mediaContentType }
          }
        }
      }
    }
  }
`;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function ensureProductMedia(
  productId: string,
  imageUrls: string[],
  diagnostics: VariantMediaDiagnostics,
): Promise<Map<string, string>> {
  const productGid = toProductGid(productId);
  const numericId = numericProductId(productId);
  const mediaIdByUrl = new Map<string, string>();

  const existing = await shopifyAdminGraphql<{
    product?: {
      media?: {
        nodes?: Array<{
          id: string;
          preview?: { status?: string } | null;
          image?: { url?: string } | null;
        }>;
      };
    };
  }>(PRODUCT_MEDIA_QUERY, { id: productGid }, false, "2024-10");

  for (const node of existing.data?.product?.media?.nodes || []) {
    const url = node.image?.url;
    if (url && node.id) mediaIdByUrl.set(normalizeMediaUrl(url), node.id);
  }

  const missing = imageUrls.filter((u) => !mediaIdByUrl.has(normalizeMediaUrl(u)));
  if (missing.length === 0) {
    diagnostics.productMediaCreated = mediaIdByUrl.size;
    diagnostics.mediaIdMap = Object.fromEntries(mediaIdByUrl);
    return mediaIdByUrl;
  }

  const mediaInput = missing.map((url) => ({
    originalSource: url,
    mediaContentType: "IMAGE",
    alt: "Variant image",
  }));

  const createMedia = await shopifyAdminGraphql<{
    productCreateMedia?: {
      media?: Array<{
        id?: string;
        preview?: { status?: string } | null;
        image?: { url?: string } | null;
      }>;
      mediaUserErrors?: Array<{ field?: string[] | null; message: string }>;
    };
  }>(
    PRODUCT_CREATE_MEDIA,
    { productId: productGid, media: mediaInput },
    false,
    "2024-10",
  );

  const mediaUserErrors = createMedia.data?.productCreateMedia?.mediaUserErrors || [];
  if (mediaUserErrors.length) {
    diagnostics.userErrors.push(...mediaUserErrors);
    console.error("[SHOPIFY VARIANT MEDIA] productCreateMedia userErrors", mediaUserErrors);
  }

  // ÖNEMLİ: Shopify CDN URL'si orijinal Trendyol URL'sinden farklıdır.
  // mediaCreate yanıtını INDEX ile originalSource → mediaId map'le.
  const createdNodes = createMedia.data?.productCreateMedia?.media || [];
  for (let i = 0; i < missing.length; i++) {
    const node = createdNodes[i];
    if (node?.id) {
      mediaIdByUrl.set(normalizeMediaUrl(missing[i]), node.id);
      if (node.image?.url) {
        mediaIdByUrl.set(normalizeMediaUrl(node.image.url), node.id);
      }
    }
  }

  const stillMissing = missing.filter((u) => !mediaIdByUrl.has(normalizeMediaUrl(u)));
  for (const url of stillMissing) {
    try {
      const { response } = await shopifyAdminFetch(`/products/${numericId}/images.json`, {
        method: "POST",
        body: JSON.stringify({ image: { src: url, alt: "Variant image" } }),
      });
      const data = (await parseShopifyAdminResponse(response)) as {
        image?: { id?: number; src?: string };
        errors?: unknown;
      };
      if (!response.ok) {
        diagnostics.userErrors.push({
          message: `REST image upload failed: ${JSON.stringify(data)}`,
        });
      }
      // MediaImage GID poll ile alınacak (REST Image id ≠ MediaImage id olabilir)
    } catch (e) {
      diagnostics.userErrors.push({
        message: `REST image upload error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const needed = new Set(imageUrls.map(normalizeMediaUrl));
  const basename = (u: string) => {
    try {
      const p = new URL(u).pathname;
      return p.split("/").filter(Boolean).pop()?.toLowerCase() || "";
    } catch {
      return u.split("/").pop()?.toLowerCase() || "";
    }
  };
  const neededByBase = new Map(imageUrls.map((u) => [basename(u), normalizeMediaUrl(u)]));

  for (let attempt = 0; attempt < 8; attempt++) {
    const poll = await shopifyAdminGraphql<{
      product?: {
        media?: {
          nodes?: Array<{
            id: string;
            preview?: { status?: string } | null;
            image?: { url?: string } | null;
          }>;
        };
      };
    }>(PRODUCT_MEDIA_QUERY, { id: productGid }, false, "2024-10");

    let readyForNeeded = 0;
    for (const node of poll.data?.product?.media?.nodes || []) {
      const url = node.image?.url;
      if (!url || !node.id) continue;
      mediaIdByUrl.set(normalizeMediaUrl(url), node.id);
      const base = basename(url);
      const originalNorm = neededByBase.get(base);
      if (originalNorm) {
        mediaIdByUrl.set(originalNorm, node.id);
      }
      if (needed.has(normalizeMediaUrl(url)) || (originalNorm && needed.has(originalNorm))) {
        const status = node.preview?.status || "";
        if (!status || status === "READY") readyForNeeded++;
      }
    }

    const allMapped = [...needed].every((n) => mediaIdByUrl.has(n));
    if (allMapped && readyForNeeded >= needed.size) break;
    if (allMapped && attempt >= 2) break;
    await sleep(700 + attempt * 300);
  }

  diagnostics.productMediaCreated = mediaIdByUrl.size;
  diagnostics.mediaIdMap = Object.fromEntries(mediaIdByUrl);
  return mediaIdByUrl;
}

export async function associateVariantMedia(opts: {
  productId: string;
  sourceVariants: VariantMediaSource[];
  shopifyVariants: ShopifyVariantRef[];
  mediaGroupCount?: number;
}): Promise<VariantMediaDiagnostics> {
  const { productId, sourceVariants, shopifyVariants } = opts;
  const productGid = toProductGid(productId);

  const diagnostics: VariantMediaDiagnostics = {
    canonicalVariants: sourceVariants.length,
    mediaGroups: opts.mediaGroupCount ?? 0,
    uniqueMediaUrls: 0,
    productMediaCreated: 0,
    mediaIdMap: {},
    variantsMatched: 0,
    variantsAssociated: 0,
    variantsMissingMedia: 0,
    userErrors: [],
    variantMediaVerification: false,
    associationPayloadSample: [],
    readBackSample: [],
  };

  for (const src of sourceVariants) {
    const imageUrl = resolveVariantImageUrl(src);
    const label = `${src.option1 || ""} / ${src.option2 || ""}`.trim();
    console.log(
      `[SHOPIFY VARIANT MEDIA INPUT]\n${label}\nmediaGroupKey=${src.mediaGroupKey || "-"}\nfeaturedImage=${imageUrl || "(empty)"}`,
    );
  }

  const uniqueUrls = [
    ...new Set(
      sourceVariants.map(resolveVariantImageUrl).filter((u): u is string => Boolean(u)),
    ),
  ];
  diagnostics.uniqueMediaUrls = uniqueUrls.length;

  if (uniqueUrls.length === 0) {
    console.warn("[SHOPIFY VARIANT MEDIA] no featuredImage on variants — skip association");
    diagnostics.variantsMissingMedia = sourceVariants.length;
    return diagnostics;
  }

  const mediaIdByUrl = await ensureProductMedia(productId, uniqueUrls, diagnostics);

  const plan = planVariantMediaAssociations(sourceVariants, shopifyVariants, mediaIdByUrl);
  diagnostics.variantsMatched = plan.matched;
  diagnostics.variantsMissingMedia =
    plan.missingImage + plan.missingMatch + plan.missingMediaId;

  if (plan.associations.length === 0) {
    console.warn("[SHOPIFY VARIANT MEDIA] no associations to apply", {
      missingImage: plan.missingImage,
      missingMatch: plan.missingMatch,
      missingMediaId: plan.missingMediaId,
    });
    return diagnostics;
  }

  diagnostics.associationPayloadSample = plan.associations.slice(0, 12).map((a) => ({
    variantId: a.variantGid,
    option1: a.option1,
    option2: a.option2,
    mediaId: a.mediaId,
    imageUrl: a.imageUrl,
  }));

  const BATCH = 25;
  for (let i = 0; i < plan.associations.length; i += BATCH) {
    const batch = plan.associations.slice(i, i + BATCH);
    const variants = batch.map((b) => ({
      id: b.variantGid,
      mediaId: b.mediaId,
    }));

    console.log(
      `[SHOPIFY VARIANT MEDIA PAYLOAD] batch=${i / BATCH + 1} count=${variants.length}`,
      JSON.stringify(variants.slice(0, 3)),
    );

    const result = await shopifyAdminGraphql<{
      productVariantsBulkUpdate?: {
        productVariants?: Array<{
          id: string;
          title?: string;
          selectedOptions?: Array<{ name: string; value: string }>;
          media?: { nodes?: Array<{ id: string }> };
        }>;
        userErrors?: Array<{ field?: string[] | null; message: string }>;
      };
    }>(BULK_UPDATE_MUTATION, { productId: productGid, variants }, false, "2024-10");

    if (!result.response.ok) {
      diagnostics.userErrors.push({
        message: `HTTP ${result.response.status} on productVariantsBulkUpdate`,
      });
      console.error("[SHOPIFY VARIANT MEDIA RESULT] HTTP", result.response.status);
      continue;
    }

    if (result.errors) {
      const errMsg =
        typeof result.errors === "string" ? result.errors : JSON.stringify(result.errors);
      diagnostics.userErrors.push({ message: errMsg });
      console.error("[SHOPIFY VARIANT MEDIA RESULT] GraphQL errors", result.errors);
    }

    const payload = result.data?.productVariantsBulkUpdate;
    const userErrors = payload?.userErrors || [];
    if (userErrors.length) {
      diagnostics.userErrors.push(...userErrors);
      console.error("[SHOPIFY VARIANT MEDIA RESULT] userErrors", userErrors);
    }

    for (const pv of payload?.productVariants || []) {
      const mediaCount = pv.media?.nodes?.length || 0;
      const opt1 = pv.selectedOptions?.[0]?.value;
      const opt2 = pv.selectedOptions?.[1]?.value;
      console.log(
        `[SHOPIFY VARIANT MEDIA RESULT]\nproductId=${productId}\nvariantId=${pv.id}\noptions=${opt1 || ""} / ${opt2 || ""}\nrequestedMediaId=${batch.find((b) => b.variantGid === pv.id)?.mediaId || "-"}\nmediaCount=${mediaCount}\nmediaId=${pv.media?.nodes?.[0]?.id || "-"}`,
      );
    }
  }

  await sleep(500);
  const readBack = await shopifyAdminGraphql<{
    product?: {
      id: string;
      variants?: {
        nodes?: Array<{
          id: string;
          title?: string;
          selectedOptions?: Array<{ name: string; value: string }>;
          media?: { nodes?: Array<{ id: string }> };
        }>;
      };
    };
  }>(READ_BACK_QUERY, { id: productGid }, false, "2024-10");

  const rbVariants = readBack.data?.product?.variants?.nodes || [];
  const rbByGid = new Map(rbVariants.map((v) => [v.id, v]));
  let associatedOnReadBack = 0;

  for (const a of plan.associations) {
    const rb = rbByGid.get(a.variantGid);
    const mediaCount = rb?.media?.nodes?.length || 0;
    if (mediaCount > 0) associatedOnReadBack++;
  }

  for (const v of rbVariants) {
    diagnostics.readBackSample.push({
      title: v.title || "",
      option1: v.selectedOptions?.[0]?.value,
      option2: v.selectedOptions?.[1]?.value,
      mediaCount: v.media?.nodes?.length || 0,
      mediaId: v.media?.nodes?.[0]?.id,
    });
  }

  diagnostics.variantsAssociated = associatedOnReadBack;
  diagnostics.variantsMissingMedia = Math.max(
    diagnostics.variantsMissingMedia,
    plan.associations.length - associatedOnReadBack,
  );

  const evalResult = evaluateAssociationSuccess({
    expectedAssociations: plan.associations.length,
    associatedOnReadBack,
    userErrors: diagnostics.userErrors,
  });
  diagnostics.variantMediaVerification = evalResult.variantMediaVerification;

  // GraphQL association sonrası read-back başarısızsa REST image_id fallback
  if (!diagnostics.variantMediaVerification && plan.associations.length > 0) {
    console.warn("[SHOPIFY VARIANT MEDIA] GraphQL verification failed — REST image_id fallback");
    await associateViaRestImageId({
      productId: numericProductId(productId),
      associations: plan.associations,
      diagnostics,
    });

    // Read-back tekrar
    await sleep(500);
    const readBack2 = await shopifyAdminGraphql<{
      product?: {
        variants?: {
          nodes?: Array<{
            id: string;
            title?: string;
            selectedOptions?: Array<{ name: string; value: string }>;
            media?: { nodes?: Array<{ id: string }> };
          }>;
        };
      };
    }>(READ_BACK_QUERY, { id: productGid }, false, "2024-10");

    const rb2 = readBack2.data?.product?.variants?.nodes || [];
    const rb2ByGid = new Map(rb2.map((v) => [v.id, v]));
    let associated2 = 0;
    diagnostics.readBackSample = [];
    for (const a of plan.associations) {
      const rb = rb2ByGid.get(a.variantGid);
      if ((rb?.media?.nodes?.length || 0) > 0) associated2++;
    }
    for (const v of rb2) {
      diagnostics.readBackSample.push({
        title: v.title || "",
        option1: v.selectedOptions?.[0]?.value,
        option2: v.selectedOptions?.[1]?.value,
        mediaCount: v.media?.nodes?.length || 0,
        mediaId: v.media?.nodes?.[0]?.id,
      });
    }
    diagnostics.variantsAssociated = associated2;
    diagnostics.variantsMissingMedia = Math.max(
      0,
      plan.associations.length - associated2,
    );
    const eval2 = evaluateAssociationSuccess({
      expectedAssociations: plan.associations.length,
      associatedOnReadBack: associated2,
      userErrors: diagnostics.userErrors.filter(
        (e) => !String(e.message || "").includes("REST image"),
      ),
    });
    // REST fallback sonrası userErrors GraphQL kaynaklı olabilir; read-back esas alınır
    diagnostics.variantMediaVerification =
      associated2 >= plan.associations.length && associated2 > 0;
  }

  console.log(
    `[SHOPIFY VARIANT MEDIA SUMMARY] matched=${diagnostics.variantsMatched} associated=${diagnostics.variantsAssociated} missing=${diagnostics.variantsMissingMedia} verification=${diagnostics.variantMediaVerification} userErrors=${diagnostics.userErrors.length}`,
  );

  return diagnostics;
}

async function associateViaRestImageId(opts: {
  productId: string;
  associations: Array<{
    variantGid: string;
    mediaId: string;
    imageUrl: string;
    option1?: string;
    option2?: string;
  }>;
  diagnostics: VariantMediaDiagnostics;
}): Promise<void> {
  const { productId, associations, diagnostics } = opts;
  const { response } = await shopifyAdminFetch(`/products/${productId}/images.json`);
  if (!response.ok) {
    diagnostics.userErrors.push({ message: `REST images list failed: ${response.status}` });
    return;
  }
  const data = (await parseShopifyAdminResponse(response)) as {
    images?: Array<{ id: number; src?: string }>;
  };
  const images = data.images || [];

  const basename = (u: string) => {
    try {
      return new URL(u).pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";
    } catch {
      return u.split("/").pop()?.toLowerCase() || "";
    }
  };

  const imageIdByUrl = new Map<string, number>();
  for (const img of images) {
    if (!img.src || !img.id) continue;
    imageIdByUrl.set(normalizeMediaUrl(img.src), img.id);
    const b = basename(img.src);
    if (b) imageIdByUrl.set(`base:${b}`, img.id);
  }

  for (const a of associations) {
    const variantId = a.variantGid.split("/").pop();
    if (!variantId) continue;
    let imageId =
      imageIdByUrl.get(normalizeMediaUrl(a.imageUrl)) ||
      imageIdByUrl.get(`base:${basename(a.imageUrl)}`);

    // mediaId numeric fallback (MediaImage / Image aynı id olabilir)
    if (!imageId) {
      const mid = a.mediaId.split("/").pop();
      if (mid && /^\d+$/.test(mid)) imageId = Number(mid);
    }

    if (!imageId) {
      diagnostics.userErrors.push({
        message: `REST image_id bulunamadı: ${a.option1}/${a.option2}`,
      });
      continue;
    }

    try {
      const upd = await shopifyAdminFetch(`/variants/${variantId}.json`, {
        method: "PUT",
        body: JSON.stringify({
          variant: { id: Number(variantId), image_id: imageId },
        }),
      });
      if (!upd.response.ok) {
        const err = await parseShopifyAdminResponse(upd.response);
        diagnostics.userErrors.push({
          message: `REST variant image_id failed: ${JSON.stringify(err)}`,
        });
        console.error(
          `[SHOPIFY VARIANT MEDIA REST] variant=${variantId} image_id=${imageId} failed`,
          err,
        );
      } else {
        console.log(
          `[SHOPIFY VARIANT MEDIA REST] variant=${variantId} options=${a.option1}/${a.option2} image_id=${imageId}`,
        );
      }
    } catch (e) {
      diagnostics.userErrors.push({
        message: `REST variant update error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
}

/** Canonical / CSV kaynaklarından association input üret */
export function buildSourceVariantsForMedia(opts: {
  csvVariants: Array<{
    option1?: string;
    option2?: string;
    sku?: string;
    image?: string;
  }>;
  canonical?: {
    variants?: Array<{
      color?: string;
      size?: string;
      sku?: string;
      image?: string;
      featuredImage?: string;
      mediaGroupKey?: string;
    }>;
    variantMediaGroups?: Array<{
      key?: string;
      optionValue?: string;
      featuredImage?: string;
      images?: string[];
    }>;
    imagesByColor?: Record<string, string[]>;
  } | null;
}): VariantMediaSource[] {
  const groups = opts.canonical?.variantMediaGroups || [];
  const imagesByColor = opts.canonical?.imagesByColor || {};
  const canonBySku = new Map(
    (opts.canonical?.variants || [])
      .filter((v) => v.sku)
      .map((v) => [String(v.sku).toLowerCase(), v]),
  );
  const canonByOpt = new Map(
    (opts.canonical?.variants || []).map((v) => [
      variantMatchKey(v.color, v.size),
      v,
    ]),
  );

  const colorFeatured = (color?: string): string => {
    if (!color) return "";
    const g = groups.find(
      (x) =>
        String(x.optionValue || "").toLocaleLowerCase("tr-TR") ===
        color.toLocaleLowerCase("tr-TR"),
    );
    if (g?.featuredImage && /^https?:\/\//i.test(g.featuredImage)) return g.featuredImage;
    if (Array.isArray(g?.images) && g.images[0] && /^https?:\/\//i.test(g.images[0])) {
      return g.images[0];
    }
    const gallery =
      imagesByColor[color] ||
      Object.entries(imagesByColor).find(
        ([k]) => k.toLocaleLowerCase("tr-TR") === color.toLocaleLowerCase("tr-TR"),
      )?.[1];
    return gallery?.[0] && /^https?:\/\//i.test(gallery[0]) ? gallery[0] : "";
  };

  return opts.csvVariants.map((cv) => {
    const canon =
      (cv.sku && canonBySku.get(cv.sku.toLowerCase())) ||
      canonByOpt.get(variantMatchKey(cv.option1, cv.option2));
    const group =
      (canon?.mediaGroupKey &&
        groups.find((g) => g.key === canon.mediaGroupKey)) ||
      groups.find(
        (g) =>
          String(g.optionValue || "").toLocaleLowerCase("tr-TR") ===
          String(cv.option1 || canon?.color || "").toLocaleLowerCase("tr-TR"),
      );
    const featuredImage =
      canon?.featuredImage ||
      canon?.image ||
      group?.featuredImage ||
      (Array.isArray(group?.images) ? group.images[0] : "") ||
      cv.image ||
      colorFeatured(cv.option1 || canon?.color) ||
      "";
    return {
      option1: cv.option1 || canon?.color,
      option2: cv.option2 || canon?.size,
      sku: cv.sku || canon?.sku,
      imageUrl: cv.image,
      featuredImage,
      mediaGroupKey: canon?.mediaGroupKey || group?.key,
    };
  });
}
