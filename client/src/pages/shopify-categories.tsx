import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderTree, Package, RefreshCw, Search, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDestinationBrand } from "@/hooks/use-destination-brand";

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

async function fetchCategorySummary(): Promise<CategorySummary> {
  const response = await fetch("/api/marktgo/categories", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "MARKT-GO kategori / koleksiyon verileri alınamadı");
  }
  return body;
}

export default function ShopifyCategoriesPage() {
  const brand = useDestinationBrand();
  const dest = brand.destinationName || "MARKT-GO";
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["marktgo-category-summary"],
    queryFn: fetchCategorySummary,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const tags = useMemo(
    () =>
      (query.data?.tags ?? []).filter(
        (row) =>
          !normalizedSearch ||
          row.tag.toLocaleLowerCase("tr-TR").includes(normalizedSearch) ||
          row.collections.some((collection) =>
            collection.title.toLocaleLowerCase("tr-TR").includes(normalizedSearch),
          ),
      ),
    [normalizedSearch, query.data?.tags],
  );
  const collections = useMemo(
    () =>
      (query.data?.collections ?? []).filter(
        (row) =>
          !normalizedSearch ||
          row.title.toLocaleLowerCase("tr-TR").includes(normalizedSearch) ||
          row.tags.some((tag) => tag.toLocaleLowerCase("tr-TR").includes(normalizedSearch)),
      ),
    [normalizedSearch, query.data?.collections],
  );
  const summaryCards = [
    { label: "Toplam ürün", value: query.data?.totalProducts ?? 0, icon: Package },
    { label: "Etiketli ürün", value: query.data?.taggedProducts ?? 0, icon: Tags },
    { label: "Etiket sayısı", value: query.data?.tags.length ?? 0, icon: Tags },
    { label: "Koleksiyon", value: query.data?.collections.length ?? 0, icon: FolderTree },
  ];

  return (
    <main className="container mx-auto px-4 py-8 space-y-6 text-slate-100">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FolderTree className="h-8 w-8 text-blue-400" />
            Kategoriler
          </h1>
          <p className="text-slate-400 mt-1">
            {dest} etiketleri, koleksiyonlar ve ürün koşulları
          </p>
        </div>
        <Button
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="bg-blue-600 hover:bg-blue-500"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          {dest} ile Senkronize Et
        </Button>
      </div>

      {query.error && (
        <div className="rounded-xl border border-red-700/50 bg-red-950/40 p-4 text-red-300">
          {query.error instanceof Error ? query.error.message : "Senkronizasyon başarısız"}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-slate-700 bg-slate-900/85">
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{label}</p>
                <p className="text-3xl font-bold text-white">{value}</p>
              </div>
              <Icon className="h-8 w-8 text-blue-400" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Etiket veya koleksiyon ara..."
          className="pl-9 border-slate-700 bg-slate-900"
        />
      </div>

      <Card className="border-slate-700 bg-slate-900/90">
        <CardHeader>
          <CardTitle>Koleksiyonlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <p className="text-slate-400">{dest} koleksiyonları yükleniyor...</p>
          ) : collections.length === 0 ? (
            <p className="text-slate-400">Eşleşen koleksiyon bulunamadı.</p>
          ) : (
            collections.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{row.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {row.taggedProductCount} ürün
                      {row.conditionMatch ? ` · koşul: ${row.conditionMatch}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(row.tags.length ? row.tags : ["etiket yok"]).map((tag) => (
                      <Badge
                        key={`${row.id}-${tag}`}
                        className="bg-emerald-700/30 text-emerald-200 border-emerald-700/40"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-700 bg-slate-900/90">
        <CardHeader>
          <CardTitle>Etiketlere göre ürün dağılımı</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <p className="text-slate-400">{dest} etiketleri yükleniyor...</p>
          ) : tags.length === 0 ? (
            <p className="text-slate-400">Eşleşen etiket bulunamadı.</p>
          ) : (
            tags.map((row) => (
              <div
                key={row.tag}
                className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-600/30 text-blue-200 border-blue-600/40">
                      {row.tag}
                    </Badge>
                    <span className="font-semibold">{row.productCount} ürün</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.collections.map((collection) => (
                      <Badge
                        key={collection.id ?? "__unassigned__"}
                        variant="outline"
                        className="border-slate-600 text-slate-300"
                      >
                        {collection.title}: {collection.productCount}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {query.data?.syncedAt && (
        <p className="text-xs text-slate-500">
          Son {dest} senkronu: {new Date(query.data.syncedAt).toLocaleString("tr-TR")}
          {query.data.message ? ` · ${query.data.message}` : ""}
        </p>
      )}
    </main>
  );
}
