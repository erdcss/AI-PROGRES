import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { integrationCategoryMappings } from "@shared/schema";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import type { MarktGoClient } from "./client";

function normalizeName(s: string): string {
  return String(s || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

function asList(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as Array<Record<string, unknown>>;
    if (Array.isArray(o.categories)) return o.categories as Array<Record<string, unknown>>;
    if (Array.isArray(o.brands)) return o.brands as Array<Record<string, unknown>>;
  }
  return [];
}

export async function resolveCategoryId(
  client: MarktGoClient,
  connectionId: number,
  sourceCategory?: string | null,
): Promise<{ categoryId: number | null; unresolved: boolean; name?: string }> {
  const source = String(sourceCategory || "").trim();
  if (!source) return { categoryId: null, unresolved: false };

  const [mapped] = await db
    .select()
    .from(integrationCategoryMappings)
    .where(
      and(
        eq(integrationCategoryMappings.connectionId, connectionId),
        eq(integrationCategoryMappings.sourceCategory, source),
      ),
    )
    .limit(1);
  if (mapped) {
    const id = Number(mapped.externalCategoryId);
    return { categoryId: Number.isFinite(id) ? id : null, unresolved: false, name: mapped.externalCategoryName || undefined };
  }

  try {
    const raw = await client.get<unknown>("/categories");
    const cats = asList(raw);
    const needle = normalizeName(source);
    const exact = cats.find((c) => {
      const name = String(c.name || c.title || c.label || "");
      return normalizeName(name) === needle;
    });
    if (exact) {
      const id = Number(exact.id);
      if (Number.isFinite(id)) {
        await db.insert(integrationCategoryMappings).values({
          connectionId,
          provider: DESTINATION_PROVIDER.MARKTGO,
          sourceCategory: source,
          externalCategoryId: String(id),
          externalCategoryName: String(exact.name || exact.title || source),
        });
        return { categoryId: id, unresolved: false, name: String(exact.name || "") };
      }
    }
  } catch {
    /* category catalog optional */
  }
  return { categoryId: null, unresolved: true };
}

export async function resolveBrandName(
  client: MarktGoClient,
  sourceBrand?: string | null,
): Promise<string | null> {
  const brand = String(sourceBrand || "").trim();
  if (!brand) return null;
  try {
    const raw = await client.get<unknown>("/brands");
    const brands = asList(raw);
    const needle = normalizeName(brand);
    const hit = brands.find((b) => {
      const name = String(b.name || b.title || b);
      return normalizeName(name) === needle;
    });
    if (hit) return String(hit.name || hit.title || brand);
  } catch {
    /* brand catalog optional */
  }
  return brand;
}
