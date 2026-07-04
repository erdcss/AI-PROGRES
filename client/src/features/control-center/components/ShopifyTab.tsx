import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "../query-keys";
import { fetchControlCenterHealth } from "../api";

type ShopifyHealth = {
  ok?: boolean;
  shopDomain?: string;
  shopName?: string;
  tokenSource?: string;
  hasAccessToken?: boolean;
  scopesOk?: boolean;
  missingScopes?: string[];
  apiVersion?: string;
  lastSuccessfulRequestAt?: string;
  lastErrorMessage?: string;
};

export function ShopifyTab({ active }: { active: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery<ShopifyHealth>({
    queryKey: queryKeys.shopifyHealth(),
    queryFn: async () => {
      const health = await fetchControlCenterHealth();
      return (health.shopify ?? {}) as ShopifyHealth;
    },
    enabled: active,
    refetchInterval: active ? 30000 : false,
  });

  const testConnection = async () => {
    await fetch("/api/shopify/connection-test", { method: "POST" });
    void refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => testConnection()} disabled={isFetching}>
          Bağlantıyı Test Et
        </Button>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Health Yenile
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Shopify durumu yükleniyor…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {data.shopName ?? "Shopify"}
              <Badge variant={data.ok ? "default" : "destructive"}>
                {data.ok ? "Bağlı" : "Sorunlu"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Domain: </span>
              {data.shopDomain ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Token kaynağı: </span>
              {data.tokenSource ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Erişim tokenı: </span>
              {data.hasAccessToken ? "Var (gizli)" : "Yok"}
            </div>
            <div>
              <span className="text-muted-foreground">Scope: </span>
              {data.scopesOk ? "Tamam" : "Eksik"}
            </div>
            {data.missingScopes && data.missingScopes.length > 0 && (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Eksik scope: </span>
                {data.missingScopes.join(", ")}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">API sürümü: </span>
              {data.apiVersion ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Son hata: </span>
              {data.lastErrorMessage ?? "—"}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
