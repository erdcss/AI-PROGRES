/**
 * Shopify Admin GraphQL ProductVariantsBulkInput builder.
 * 2024-10+ şeması: sku üst alanda değil; optionValues.value yok.
 *
 * Doğru:
 *   inventoryItem: { sku, tracked }
 *   optionValues: [{ optionName: "Renk", name: "Füme" }]
 */

export type BulkVariantOptionValue = {
  /** Seçenek adı (ör. Renk, Beden) */
  optionName: string;
  /** Seçenek değeri (ör. Füme, M) */
  name: string;
  /** Varsa ProductOption GID */
  optionId?: string;
};

export type BulkVariantSource = {
  price: string | number;
  sku?: string | null;
  compareAtPrice?: string | number | null;
  inventoryPolicy?: "DENY" | "CONTINUE" | "deny" | "continue";
  tracked?: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};

export type BulkVariantOptionNames = {
  option1Name?: string | null;
  option2Name?: string | null;
  option3Name?: string | null;
  /** option name → ProductOption GID */
  optionIdsByName?: Record<string, string>;
};

/** VariantOptionValueInput — `value` alanı YOK */
export function buildVariantOptionValues(
  source: BulkVariantSource,
  names: BulkVariantOptionNames,
): BulkVariantOptionValue[] {
  const out: BulkVariantOptionValue[] = [];
  const pairs: Array<[string | null | undefined, string | null | undefined]> = [
    [names.option1Name, source.option1],
    [names.option2Name, source.option2],
    [names.option3Name, source.option3],
  ];
  for (const [optionName, value] of pairs) {
    const on = String(optionName ?? "").trim();
    const val = String(value ?? "").trim();
    if (!on || !val) continue;
    const entry: BulkVariantOptionValue = { optionName: on, name: val };
    const oid = names.optionIdsByName?.[on];
    if (oid) entry.optionId = oid;
    out.push(entry);
  }
  return out;
}

/** ProductVariantsBulkInput — üst seviye `sku` YOK */
export function buildProductVariantsBulkInput(
  source: BulkVariantSource,
  names: BulkVariantOptionNames,
): Record<string, unknown> {
  const policyRaw = String(source.inventoryPolicy ?? "DENY").toUpperCase();
  const inventoryPolicy = policyRaw === "CONTINUE" ? "CONTINUE" : "DENY";
  const sku = String(source.sku ?? "").trim();

  const input: Record<string, unknown> = {
    price: String(source.price ?? "0"),
    inventoryPolicy,
    inventoryItem: {
      tracked: source.tracked !== false,
      ...(sku ? { sku } : {}),
    },
  };

  const compare = source.compareAtPrice;
  if (compare != null && String(compare).trim() !== "") {
    const n = Number.parseFloat(String(compare));
    if (Number.isFinite(n) && n > 0) input.compareAtPrice = String(compare);
  }

  const optionValues = buildVariantOptionValues(source, names);
  if (optionValues.length > 0) input.optionValues = optionValues;

  return input;
}

export const PRODUCT_VARIANTS_BULK_CREATE_MUTATION = `
  mutation productVariantsBulkCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
    $strategy: ProductVariantsBulkCreateStrategy
  ) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
      productVariants {
        id
        selectedOptions { name value }
      }
      userErrors { field message }
    }
  }
`;
