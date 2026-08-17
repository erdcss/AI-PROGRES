import { useMemo, useState } from "react";
import {
  normalizeProductAttributes,
  type ProductAttributesInput,
} from "@shared/product-attributes";

const INITIAL_VISIBLE_COUNT = 8;

interface ProductAttributesProps {
  attributes?: ProductAttributesInput;
  features?: ProductAttributesInput;
  title?: string;
  className?: string;
  compact?: boolean;
  hideEmpty?: boolean;
}

/**
 * Marketplace-style dynamic attribute chips.
 * Renders whatever real attributes arrive — no hardcoded product values.
 */
export default function ProductAttributes({
  attributes,
  features,
  title = "Ürün Özellikleri",
  className = "",
  compact = false,
  hideEmpty = false,
}: ProductAttributesProps) {
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(
    () => normalizeProductAttributes(attributes ?? features ?? []),
    [attributes, features],
  );

  if (rows.length === 0) {
    if (hideEmpty) return null;
    return (
      <div className={`rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 ${className}`}>
        <h3 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">
          {title}
        </h3>
        <p className="mt-2 text-sm italic text-zinc-500">Ürün özellikleri bulunamadı</p>
      </div>
    );
  }

  if (compact) {
    const compactVisible = rows.slice(0, 6);
    const extra = rows.length - compactVisible.length;
    return (
      <div className={`space-y-1.5 ${className}`}>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          {title} ({rows.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {compactVisible.map((attr) => (
            <span
              key={`${attr.position}-${attr.name}-${attr.value}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px]"
              title={`${attr.name}: ${attr.value}`}
            >
              <span className="text-zinc-500">{attr.name}</span>
              <strong className="max-w-[140px] truncate text-zinc-100">{attr.value}</strong>
            </span>
          ))}
          {extra > 0 ? (
            <span className="inline-flex items-center text-[11px] text-zinc-500">+{extra}</span>
          ) : null}
        </div>
      </div>
    );
  }

  const visible = expanded ? rows : rows.slice(0, INITIAL_VISIBLE_COUNT);
  const canToggle = rows.length > INITIAL_VISIBLE_COUNT;

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">
          {title}
        </h3>
        <span className="text-[11px] text-zinc-500">{rows.length} özellik</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((attr) => (
          <div
            key={`${attr.position}-${attr.name}-${attr.value}`}
            className="flex min-h-[52px] items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-black/50 px-3 py-2.5"
          >
            <span className="min-w-0 shrink text-[12px] leading-snug text-zinc-400 line-clamp-2">
              {attr.name}
            </span>
            <strong className="min-w-0 max-w-[58%] text-right text-[13px] font-semibold leading-snug text-zinc-100 line-clamp-2">
              {attr.value}
            </strong>
          </div>
        ))}
      </div>

      {canToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          {expanded ? "Daha az göster" : "Daha fazla göster"}
        </button>
      ) : null}
    </div>
  );
}
