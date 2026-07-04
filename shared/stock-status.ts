export type StockStatus = "in_stock" | "out_of_stock" | "unknown";

export type StockSource =
  | "trendyol_initial_state"
  | "trendyol_api"
  | "scenario_dom"
  | "browser_worker"
  | "local_agent"
  | "stock_map"
  | "all_variants"
  | "api_listing"
  | "inferred"
  | "unknown";

export type StockConfidence = "high" | "medium" | "low";

export interface VariantStockFields {
  inStock: boolean;
  inventoryQty: number;
  stockStatus: StockStatus;
  stockSource: StockSource;
  stockConfidence: StockConfidence;
}

export function resolveVariantAvailability(raw: Record<string, unknown>): boolean | null {
  if (raw.inStock === false || raw.inStock === "false") return false;
  if (raw.inStock === true || raw.inStock === "true") return true;

  const status = String(raw.stockStatus ?? raw.stockState ?? "").toLowerCase();
  if (
    status.includes("out") ||
    status.includes("sold") ||
    status === "out_of_stock" ||
    raw.soldOut === true ||
    raw.isSellable === false ||
    raw.sellable === false
  ) {
    return false;
  }
  if (
    status.includes("in") ||
    status === "in_stock" ||
    raw.isSellable === true ||
    raw.sellable === true ||
    raw.hasStock === true
  ) {
    return true;
  }

  if (typeof raw.stockCount === "number") {
    return raw.stockCount > 0;
  }
  if (typeof raw.quantity === "number") {
    return raw.quantity > 0;
  }

  return null;
}

export function toStockStatus(available: boolean | null): StockStatus {
  if (available === true) return "in_stock";
  if (available === false) return "out_of_stock";
  return "unknown";
}

export function buildVariantStockFields(
  raw: Record<string, unknown>,
  opts?: {
    stockSource?: StockSource;
    stockConfidence?: StockConfidence;
    defaultInStockQty?: number;
  },
): VariantStockFields {
  const available = resolveVariantAvailability(raw);
  const stockStatus = toStockStatus(available);
  const stockSource = opts?.stockSource ?? "unknown";
  const stockConfidence =
    available == null ? "low" : (opts?.stockConfidence ?? "medium");

  if (stockStatus === "in_stock") {
    const qty =
      typeof raw.stockCount === "number" && raw.stockCount > 0
        ? raw.stockCount
        : typeof raw.inventoryQty === "number" && raw.inventoryQty > 0
          ? raw.inventoryQty
          : opts?.defaultInStockQty ?? 10;
    return {
      inStock: true,
      inventoryQty: qty,
      stockStatus,
      stockSource,
      stockConfidence,
    };
  }

  if (stockStatus === "out_of_stock") {
    return {
      inStock: false,
      inventoryQty: 0,
      stockStatus,
      stockSource,
      stockConfidence,
    };
  }

  return {
    inStock: false,
    inventoryQty: 0,
    stockStatus: "unknown",
    stockSource,
    stockConfidence: "low",
  };
}

export interface StockSummary {
  totalVariants: number;
  inStockVariants: number;
  outOfStockVariants: number;
  unknownStockVariants: number;
}

export function summarizeStockFromVariants(
  variants: Array<{ stockStatus?: StockStatus; inStock?: boolean }>,
): StockSummary {
  let inStockVariants = 0;
  let outOfStockVariants = 0;
  let unknownStockVariants = 0;

  for (const v of variants) {
    const status =
      v.stockStatus ??
      (v.inStock === true ? "in_stock" : v.inStock === false ? "out_of_stock" : "unknown");
    if (status === "in_stock") inStockVariants++;
    else if (status === "out_of_stock") outOfStockVariants++;
    else unknownStockVariants++;
  }

  return {
    totalVariants: variants.length,
    inStockVariants,
    outOfStockVariants,
    unknownStockVariants,
  };
}

export type ProductStockLabel = "in_stock" | "partial_stock" | "out_of_stock" | "unknown_stock";

export function deriveProductStockLabel(summary: StockSummary): ProductStockLabel {
  if (summary.totalVariants === 0) return "unknown_stock";
  if (summary.inStockVariants === 0 && summary.outOfStockVariants > 0) return "out_of_stock";
  if (summary.unknownStockVariants > 0 && summary.inStockVariants === 0) return "unknown_stock";
  if (summary.inStockVariants > 0 && summary.outOfStockVariants > 0) return "partial_stock";
  if (summary.inStockVariants > 0 && summary.unknownStockVariants === 0) return "in_stock";
  if (summary.unknownStockVariants > 0) return "unknown_stock";
  return "out_of_stock";
}
