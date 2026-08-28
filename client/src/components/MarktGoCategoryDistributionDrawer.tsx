import { useEffect, useState } from "react";
import { ChevronUp, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";

export type CategoryDistributionRow = {
  title: string;
  count: number;
};

const HIDDEN_CATEGORY_TITLES = new Set(["urun-havuzu", "koleksiyonsuz"]);

function normalizeCategoryRows(rows: CategoryDistributionRow[]): CategoryDistributionRow[] {
  const map = new Map<string, CategoryDistributionRow>();
  for (const row of rows) {
    const title = String(row.title || "").trim();
    if (!title || HIDDEN_CATEGORY_TITLES.has(title.toLowerCase())) continue;
    const key = title.toLocaleLowerCase("tr-TR");
    const existing = map.get(key);
    if (existing) {
      existing.count += row.count;
    } else {
      map.set(key, { title, count: row.count });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title, "tr"),
  );
}

export function MarktGoCategoryDistributionDrawer({
  rows,
  open,
  defaultOpen = true,
  onOpenChange,
  className,
}: {
  rows: CategoryDistributionRow[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const normalized = normalizeCategoryRows(rows);
  const [expanded, setExpanded] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : expanded;

  useEffect(() => {
    if (defaultOpen && !isControlled) setExpanded(true);
  }, [defaultOpen, isControlled, rows.length]);

  if (!normalized.length) return null;

  const maxCount = Math.max(1, ...normalized.map((r) => r.count));
  const total = normalized.reduce((sum, r) => sum + r.count, 0);

  const toggle = () => {
    const next = !isOpen;
    if (isControlled) onOpenChange?.(next);
    else setExpanded(next);
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[45] flex flex-col justify-end pointer-events-none",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-auto border-t border-zinc-700/80 bg-zinc-950/98 backdrop-blur-md shadow-[0_-12px_40px_rgba(0,0,0,0.45)] transition-all duration-500 ease-out",
          isOpen ? "max-h-[min(52vh,420px)]" : "max-h-12",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-900/60 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
            <FolderTree className="h-4 w-4 text-violet-400" />
            Kategori dağılımı
            <span className="font-normal normal-case text-zinc-500">({total} ürün)</span>
          </span>
          <ChevronUp
            className={cn(
              "h-4 w-4 text-zinc-400 transition-transform duration-500",
              isOpen ? "rotate-0" : "rotate-180",
            )}
          />
        </button>

        <div
          className={cn(
            "overflow-hidden transition-all duration-500 ease-out",
            isOpen ? "opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="space-y-2 overflow-y-auto px-4 pb-4 max-h-[calc(min(52vh,420px)-3rem)]">
            {normalized.map((row, i) => (
              <div
                key={row.title}
                className="animate-in fade-in slide-in-from-bottom-2 duration-500"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-zinc-200">{row.title}</span>
                  <span className="shrink-0 font-semibold text-emerald-400">{row.count} adet</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-400 transition-all duration-700"
                    style={{ width: `${Math.round((row.count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
