import { createHash } from "crypto";
import type { CanonicalProduct } from "@shared/canonical-product";
import { findExistingShopifyProduct } from "../shopify-upsert-service";
import type { CanonicalProductForShopify } from "../variant-shape-normalizer";
import { dedupeTrendyolImages } from "../trendyol-image-identity";

export type ShopifyDryRunResult = {
  mode: "create" | "update";
  approvalState: "required" | "approved";
  safeToApply: boolean;
  blockers: string[];
  existingProduct: { id: string; handle: string; title: string } | null;
  productChanges: Array<{ field: string; current: unknown; proposed: unknown }>;
  variantChanges: {
    create: Array<{ sku: string; option1?: string; option2?: string; evidenceSource?: string }>;
    update: Array<{ sku: string; shopifyVariantId: string; fields: string[] }>;
    deactivate: Array<{ sku: string; reason: string }>;
    unchanged: Array<{ sku: string }>;
    blockedCandidates: Array<{ sku: string; reason: string }>;
  };
  imageChanges: {
    add: string[];
    skipDuplicate: string[];
    removeSuggested: string[];
  };
  metafieldChanges: Array<{ key: string; action: string }>;
  priceChanges: Array<{ sku: string; from: string | null; to: string }>;
  inventoryChanges: Array<{ sku: string; available: boolean; qty: number | null; exactQty: boolean }>;
  warnings: string[];
};

export function hashCanonicalProduct(canonical: CanonicalProduct | Record<string, unknown>): string {
  const payload = JSON.stringify(canonical);
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function hashShopifySnapshot(snapshot: Record<string, unknown> | null): string | null {
  if (!snapshot) return null;
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 16);
}

function confirmedVariants(canonical: CanonicalProduct) {
  return canonical.variants.filter(
    (v) =>
      !v.synthetic &&
      v.evidence?.synthetic !== true &&
      v.evidence?.evidenceSource !== "color_size_cross",
  );
}

export async function runShopifyDryRun(
  canonical: CanonicalProduct,
  shopifyCanonical: CanonicalProductForShopify | null,
): Promise<ShopifyDryRunResult> {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const verified = confirmedVariants(canonical);

  const skuPrefix = canonical.sourceProductId ? `TY-${canonical.sourceProductId}` : "TY-unknown";

  const existing = await findExistingShopifyProduct({
    sourceProductId: canonical.sourceProductId || "",
    handle: shopifyCanonical?.handle || "",
    skuPrefix,
  });

  const mode = existing ? "update" : "create";
  const variantChanges = {
    create: [] as ShopifyDryRunResult["variantChanges"]["create"],
    update: [] as ShopifyDryRunResult["variantChanges"]["update"],
    deactivate: [] as ShopifyDryRunResult["variantChanges"]["deactivate"],
    unchanged: [] as ShopifyDryRunResult["variantChanges"]["unchanged"],
    blockedCandidates: [] as ShopifyDryRunResult["variantChanges"]["blockedCandidates"],
  };

  const exportVariants = shopifyCanonical?.variants?.length
    ? shopifyCanonical.variants
    : verified.map((v) => ({
        sku: v.sku || "",
        option1Value: v.option1Value || undefined,
        option2Value: v.option2Value || undefined,
        price: String(v.calculatedShopifyPrice ?? v.sourcePrice ?? ""),
        inStock: v.available === true,
        inventoryQty: v.stockQuantityVerified ? (v.stockQuantity ?? 0) : undefined,
      }));

  const existingSkus = new Set((existing?.variants || []).map((v) => v.sku));
  const proposedSkus = new Set(exportVariants.map((v) => v.sku).filter(Boolean));

  for (const v of exportVariants) {
    if (!v.sku) continue;
    if (existingSkus.has(v.sku)) {
      const ev = existing!.variants.find((x) => x.sku === v.sku);
      variantChanges.update.push({
        sku: v.sku,
        shopifyVariantId: ev?.id || "",
        fields: ["price", "inventory"],
      });
    } else {
      variantChanges.create.push({
        sku: v.sku,
        option1: v.option1Value,
        option2: v.option2Value,
      });
    }
  }

  for (const blocked of canonical.blockedVariants || []) {
    if (blocked.sku) {
      variantChanges.blockedCandidates.push({
        sku: blocked.sku,
        reason: blocked.evidence?.evidenceSource || "unverified",
      });
    }
  }

  for (const ev of existing?.variants || []) {
    if (!proposedSkus.has(ev.sku)) {
      variantChanges.deactivate.push({ sku: ev.sku, reason: "not_in_source" });
    }
  }

  const deduped = dedupeTrendyolImages(canonical.images || []);
  const proposedImages = deduped.map((i) => i.url);
  const existingImages = existing?.imageUrls || new Set<string>();
  const imageChanges = {
    add: proposedImages.filter((img) => !existingImages.has(img)),
    skipDuplicate: proposedImages.filter((img) => existingImages.has(img)),
    removeSuggested: [] as string[],
  };

  if (canonical.quality?.status === "blocked") {
    blockers.push("quality_blocked");
    for (const b of canonical.quality.blockers || canonical.quality.reasons) {
      blockers.push(b);
    }
  }
  if (canonical.quality?.status === "manual_review") {
    blockers.push("manual_approval_required");
  }
  if (canonical.quality?.titleSource === "url-slug") {
    blockers.push("title_url_slug_only");
  }
  if (canonical.diagnostics?.suspectedSyntheticMatrix) {
    blockers.push("suspected_synthetic_variant_matrix");
  }

  const approvalState =
    canonical.quality?.status === "approved" ? "approved" : "required";

  const safeToApply =
    blockers.length === 0 &&
    approvalState === "approved" &&
    verified.length > 0 &&
    !(shopifyCanonical?.shopifyUploadBlocked ?? false);

  return {
    mode,
    approvalState,
    safeToApply,
    blockers: [...new Set(blockers)],
    existingProduct: existing
      ? { id: existing.id, handle: existing.handle, title: shopifyCanonical?.title || canonical.title || "" }
      : null,
    productChanges: existing
      ? [{ field: "title", current: existing.handle, proposed: canonical.title }]
      : [{ field: "title", current: null, proposed: canonical.title }],
    variantChanges,
    imageChanges,
    metafieldChanges: [
      { key: "custom.source_platform", action: "set" },
      { key: "custom.source_product_id", action: "set" },
    ],
    priceChanges: verified.map((v) => ({
      sku: v.sku || "",
      from: null,
      to: String(v.calculatedShopifyPrice ?? v.sourcePrice ?? ""),
    })),
    inventoryChanges: verified.map((v) => ({
      sku: v.sku || "",
      available: v.available === true,
      qty: v.stockQuantityVerified ? v.stockQuantity : null,
      exactQty: v.stockQuantityVerified === true,
    })),
    warnings,
  };
}

export function buildShopifySnapshotForHash(existing: Awaited<ReturnType<typeof findExistingShopifyProduct>>) {
  if (!existing) return null;
  return {
    id: existing.id,
    handle: existing.handle,
    variants: existing.variants,
    imageUrls: [...(existing.imageUrls || [])],
  };
}
