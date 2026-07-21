import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderTree, Package, RefreshCw, Search, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type CategorySummary = {
  syncedAt: string;
  totalProducts: number;
  taggedProducts: number;
  untaggedProducts: number;
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
  }>;
};

async function fetchCategorySummary(): Promise<CategorySummary> {
  const response = await fetch("/api/shopify/categories", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Shopify kategori verileri alınamadı");
  return body;
}

export default function ShopifyCategoriesPage() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["shopify-category-summary"],
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
            Shopify etiketleri, ürün sayıları ve bağlı koleksiyonlar
          </p>
        </div>
        <Button
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="bg-blue-600 hover:bg-blue-500"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Shopify ile Senkronize Et
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
          <CardTitle>Etiketlere göre ürün dağılımı</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <p className="text-slate-400">Shopify verileri yükleniyor...</p>
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
          Son Shopify senkronu: {new Date(query.data.syncedAt).toLocaleString("tr-TR")}
        </p>
      )}
    </main>
  );
}
