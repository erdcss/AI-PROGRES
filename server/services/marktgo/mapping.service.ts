import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  integrationProductMappings,
  integrationVariantMappings,
} from "@shared/schema";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import { createHash } from "crypto";

export function stableExternalId(localProductId: string): string {
  const raw = String(localProductId || "").trim();
  if (/^aip_/i.test(raw)) return raw.slice(0, 120);
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  if (safe && safe.length <= 80) return `aip_${safe}`;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 16);
  return `aip_${hash}`;
}

export function idempotencyKeyForProduct(localProductId: string): string {
  return `aip-product-${stableExternalId(localProductId)}`;
}

export async function findProductMapping(opts: {
  connectionId: number;
  localProductId?: string;
  externalId?: string;
  trackedProductId?: number;
  externalProductId?: string;
}) {
  if (opts.localProductId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.localProductId, opts.localProductId),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  if (opts.externalId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.externalId, opts.externalId),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  if (opts.externalProductId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.externalProductId, String(opts.externalProductId)),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  if (opts.trackedProductId) {
    const [row] = await db
      .select()
      .from(integrationProductMappings)
      .where(
        and(
          eq(integrationProductMappings.connectionId, opts.connectionId),
          eq(integrationProductMappings.trackedProductId, opts.trackedProductId),
        ),
      )
      .limit(1);
    if (row) return row;
  }
  return null;
}

export async function upsertProductMapping(input: {
  connectionId: number;
  localProductId: string;
  externalProductId: string;
  externalId: string;
  trackedProductId?: number | null;
  status?: string;
  lastError?: string | null;
  failedSteps?: string[];
}) {
  const existing = await findProductMapping({
    connectionId: input.connectionId,
    localProductId: input.localProductId,
  });
  const patch = {
    provider: DESTINATION_PROVIDER.MARKTGO,
    localProductId: input.localProductId,
    externalProductId: String(input.externalProductId),
    externalId: input.externalId,
    trackedProductId: input.trackedProductId ?? existing?.trackedProductId ?? null,
    status: input.status || "synced",
    lastError: input.lastError ?? null,
    failedSteps: input.failedSteps || [],
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db
      .update(integrationProductMappings)
      .set(patch)
      .where(eq(integrationProductMappings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(integrationProductMappings)
    .values({
      connectionId: input.connectionId,
      ...patch,
    })
    .returning();
  return row;
}

export async function upsertVariantMapping(input: {
  productMappingId: number;
  localVariantId: string;
  externalVariantId: string;
  option1?: string | null;
  option2?: string | null;
}) {
  const [existing] = await db
    .select()
    .from(integrationVariantMappings)
    .where(
      and(
        eq(integrationVariantMappings.productMappingId, input.productMappingId),
        eq(integrationVariantMappings.localVariantId, input.localVariantId),
      ),
    )
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(integrationVariantMappings)
      .set({
        externalVariantId: String(input.externalVariantId),
        option1: input.option1 ?? existing.option1,
        option2: input.option2 ?? existing.option2,
        updatedAt: new Date(),
      })
      .where(eq(integrationVariantMappings.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(integrationVariantMappings)
    .values({
      productMappingId: input.productMappingId,
      localVariantId: input.localVariantId,
      externalVariantId: String(input.externalVariantId),
      option1: input.option1 || null,
      option2: input.option2 || null,
    })
    .returning();
  return row;
}

export async function listVariantMappings(productMappingId: number) {
  return db
    .select()
    .from(integrationVariantMappings)
    .where(eq(integrationVariantMappings.productMappingId, productMappingId));
}

export async function listProductMappings(connectionId: number) {
  return db
    .select()
    .from(integrationProductMappings)
    .where(eq(integrationProductMappings.connectionId, connectionId));
}

export async function deleteProductMapping(id: number) {
  await db.delete(integrationProductMappings).where(eq(integrationProductMappings.id, id));
}

export async function findMappingForTrackedProduct(trackedProductId: number) {
  const [row] = await db
    .select()
    .from(integrationProductMappings)
    .where(
      and(
        eq(integrationProductMappings.trackedProductId, trackedProductId),
        eq(integrationProductMappings.provider, DESTINATION_PROVIDER.MARKTGO),
      ),
    )
    .limit(1);
  return row || null;
}
