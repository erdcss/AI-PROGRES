import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ChevronDown,
  FolderTree,
  Home,
  Package,
  RefreshCw,
  Search,
  Tags,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDestinationBrand } from "@/hooks/use-destination-brand";
import { cn } from "@/lib/utils";

type CategorySummary = {
  provider?: string;
  syncedAt: string;
  totalProducts: number;
  taggedProducts: number;
  untaggedProducts: number;
  message?: string;
  tags: Array<{
    tag: string;
    productCount: number;
    collections: Array<{
      id: string | null;
      title: string;
      handle: string | null;
      productCount: number;
    }>;
  }>;
  collections: Array<{
    id: string;
    title: string;
    handle: string;
    taggedProductCount: number;
    tags: string[];
    conditions?: Array<{ field: string; operator: string; value: string }>;
    conditionMatch?: string;
  }>;
};

const POOL_HANDLES = new Set(["urun-havuzu", "ürün-havuzu", "product-pool"]);

function isPoolCollection(row: { title: string; handle?: string | null }): boolean {
  const handle = String(row.handle || "").toLocaleLowerCase("tr-TR");
  const title = String(row.title || "").toLocaleLowerCase("tr-TR");
  return POOL_HANDLES.has(handle) || title === "urun-havuzu" || title === "ürün havuzu";
}

async function fetchCategorySummary(): Promise<CategorySummary> {
  const response = await fetch("/api/marktgo/categories", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "MARKT-GO kategori / koleksiyon verileri alınamadı");
  }
  return body;
}

async function syncCategorySummary(): Promise<CategorySummary> {
  const response = await fetch("/api/marktgo/categories/sync", {
    method: "POST",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "MARKT-GO senkronizasyonu başarısız");
  }
  return body;
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Package;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">
            {value.toLocaleString("tr-TR")}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  title,
  productCount,
  tags,
  conditionMatch,
  defaultOpen = false,
}: {
  title: string;
  productCount: number;
  tags: string[];
  conditionMatch?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const tagList = tags.length > 0 ? tags : [];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-900/80 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-100">{title}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {conditionMatch ? `Koşul: ${conditionMatch}` : "Kategori koleksiyonu"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-zinc-100">
            {productCount.toLocaleString("tr-TR")}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">ürün</p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-300",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-zinc-800/80 px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Atanan etiketler ({tagList.length})
            </p>
            {tagList.length === 0 ? (
              <p className="text-xs text-zinc-600">Bu kategoriye etiket atanmamış.</p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {tagList.map((tag) => (
                  <li
                    key={tag}
                    className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300"
                  >
                    <Tags className="h-3 w-3 shrink-0 text-zinc-600" />
                    <span className="truncate">{tag}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShopifyCategoriesPage() {
  const brand = useDestinationBrand();
  const dest = brand.destinationName || "MARKT-GO";
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["marktgo-category-summary"],
    queryFn: fetchCategorySummary,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");

  const { categoryRows, poolRows } = useMemo(() => {
    const all = [...(query.data?.collections ?? [])].sort(
      (a, b) =>
        b.taggedProductCount - a.taggedProductCount ||
        a.title.localeCompare(b.title, "tr"),
    );
    const filtered = all.filter((row) => {
      if (!normalizedSearch) return true;
      return (
        row.title.toLocaleLowerCase("tr-TR").includes(normalizedSearch) ||
        row.tags.some((tag) => tag.toLocaleLowerCase("tr-TR").includes(normalizedSearch))
      );
    });
    return {
      categoryRows: filtered.filter((row) => !isPoolCollection(row)),
      poolRows: filtered.filter((row) => isPoolCollection(row)),
    };
  }, [normalizedSearch, query.data?.collections]);

  const tagRows = useMemo(() => {
    const rows = [...(query.data?.tags ?? [])].sort(
      (a, b) => b.productCount - a.productCount || a.tag.localeCompare(b.tag, "tr"),
    );
    if (!normalizedSearch) return rows;
    return rows.filter(
      (row) =>
        row.tag.toLocaleLowerCase("tr-TR").includes(normalizedSearch) ||
        row.collections.some((c) =>
          c.title.toLocaleLowerCase("tr-TR").includes(normalizedSearch),
        ),
    );
  }, [normalizedSearch, query.data?.tags]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const summary = await syncCategorySummary();
      qc.setQueryData(["marktgo-category-summary"], summary);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Senkronizasyon başarısız");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950/80 text-zinc-100">
      <div className="border-b border-zinc-800/80 bg-zinc-950/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => setLocation("/")}
              variant="outline"
              className="business-button px-4 py-2"
            >
              <Home className="mr-2 h-4 w-4" />
              Ana Sayfa
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
                <FolderTree className="h-5 w-5 text-zinc-400" />
                Kategoriler
              </h1>
              <p className="text-xs text-zinc-500">
                {dest} koleksiyonları · ürün sayıları · atanan etiketler
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || query.isFetching}
            className="bg-zinc-100 text-zinc-900 hover:bg-white"
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", syncing || query.isFetching ? "animate-spin" : "")}
            />
            {dest} ile Senkronize Et
          </Button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {(syncError || query.error) && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {syncError ||
              (query.error instanceof Error
                ? query.error.message
                : "Kategori verileri alınamadı")}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Toplam ürün" value={query.data?.totalProducts ?? 0} icon={Package} />
          <Kpi label="Etiketli ürün" value={query.data?.taggedProducts ?? 0} icon={Tags} />
          <Kpi label="Etiket sayısı" value={query.data?.tags.length ?? 0} icon={Tags} />
          <Kpi
            label="Kategori"
            value={
              query.data?.collections.filter((c) => !isPoolCollection(c)).length ?? 0
            }
            icon={FolderTree}
          />
        </div>

        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kategori veya etiket ara…"
            className="h-10 border-zinc-800 bg-zinc-900 pl-9 text-zinc-200 placeholder:text-zinc-600"
          />
        </div>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Kategoriler</h2>
              <p className="text-xs text-zinc-500">
                Her satırda ürün adedi ve o kategoriye atanan etiketler
              </p>
            </div>
            <p className="text-xs tabular-nums text-zinc-500">
              {categoryRows.length.toLocaleString("tr-TR")} kategori
            </p>
          </div>

          {query.isLoading ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500">
              {dest} kategorileri yükleniyor…
            </div>
          ) : categoryRows.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500">
              Eşleşen kategori bulunamadı.
            </div>
          ) : (
            <div className="space-y-2">
              {categoryRows.map((row, index) => (
                <CategoryRow
                  key={row.id}
                  title={row.title}
                  productCount={row.taggedProductCount}
                  tags={row.tags}
                  conditionMatch={row.conditionMatch}
                  defaultOpen={index < 3}
                />
              ))}
            </div>
          )}
        </section>

        {poolRows.length > 0 ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Genel ürün havuzu</h2>
              <p className="text-xs text-zinc-500">
                Tüm etiketli ürünleri toplayan koleksiyon — ayrı tutulur
              </p>
            </div>
            {poolRows.map((row) => (
              <CategoryRow
                key={row.id}
                title={row.title}
                productCount={row.taggedProductCount}
                tags={row.tags}
                conditionMatch={row.conditionMatch}
                defaultOpen={false}
              />
            ))}
          </section>
        ) : null}

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Etiket → ürün</h2>
            <p className="text-xs text-zinc-500">
              Her etiketin kaç üründe geçtiği ve hangi kategorilerde göründüğü
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <div className="grid grid-cols-[minmax(0,1.2fr)_5.5rem_minmax(0,1.5fr)] gap-2 border-b border-zinc-800 bg-zinc-900/80 px-4 py-2 text-[11px] uppercase tracking-wide text-zinc-500">
              <span>Etiket</span>
              <span className="text-right">Ürün</span>
              <span>Kategoriler</span>
            </div>
            {query.isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Yükleniyor…</p>
            ) : tagRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Etiket yok.</p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-zinc-800/80 overflow-y-auto">
                {tagRows.map((row) => (
                  <li
                    key={row.tag}
                    className="grid grid-cols-[minmax(0,1.2fr)_5.5rem_minmax(0,1.5fr)] gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="truncate text-zinc-200">{row.tag}</span>
                    <span className="text-right tabular-nums text-zinc-300">
                      {row.productCount.toLocaleString("tr-TR")}
                    </span>
                    <span className="truncate text-xs text-zinc-500">
                      {row.collections.length
                        ? row.collections
                            .map((c) => `${c.title} (${c.productCount})`)
                            .join(" · ")
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {query.data?.syncedAt ? (
          <p className="text-xs text-zinc-600">
            Son {dest} senkronu: {new Date(query.data.syncedAt).toLocaleString("tr-TR")}
            {query.data.message ? ` · ${query.data.message}` : ""}
          </p>
        ) : null}
      </main>
    </div>
  );
}
