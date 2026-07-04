import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";

import { queryKeys } from "../query-keys";

import { fetchControlCenterHealth } from "../api";

import { RefreshCw, Trash2 } from "lucide-react";



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

  oauthUrl?: string;

};



type DeletedSyncResult = {

  success: boolean;

  message: string;

  shopifyProductCount?: number;

  trackedDisabled?: number;

  transferredUpdated?: number;

  memoryRemoved?: number;

  changesSuperseded?: number;

  items?: Array<{ title: string; shopifyProductId: string }>;

  error?: string;

};



export function ShopifyTab({ active }: { active: boolean }) {

  const { toast } = useToast();

  const { data, isLoading, error, refetch, isFetching } = useQuery<ShopifyHealth>({

    queryKey: queryKeys.shopifyHealth(),

    queryFn: async () => {

      const health = await fetchControlCenterHealth();

      return (health.shopify ?? {}) as ShopifyHealth;

    },

    enabled: active,

    refetchInterval: active ? 30_000 : false,

  });



  const syncDeletedMutation = useMutation({

    mutationFn: async () => {

      const res = await fetch("/api/control-center/shopify/sync-deleted", { method: "POST" });

      const body = (await res.json()) as DeletedSyncResult;

      if (!res.ok) throw new Error(body.error || body.message || "Senkronizasyon başarısız");

      return body;

    },

    onSuccess: (result) => {

      toast({

        title: "Shopify senkron tamam",

        description: result.message,

      });

      void refetch();

    },

    onError: (e: Error) => {

      toast({ title: e.message, variant: "destructive" });

    },

  });



  const startOAuth = async () => {

    try {

      const res = await fetch("/api/shopify/auth-url");

      const body = await res.json();

      if (!res.ok) throw new Error(body.error || "OAuth URL alınamadı");

      if (body.authUrl) window.location.href = body.authUrl;

    } catch (e) {

      toast({ title: (e as Error).message, variant: "destructive" });

    }

  };



  const testConnection = async () => {

    try {

      const res = await fetch("/api/shopify/connection-test", { method: "POST" });

      const body = await res.json();

      if (!res.ok) throw new Error(body.message || body.error || "Test başarısız");

      toast({

        title: "Shopify bağlantısı başarılı",

        description: body.shopName || body.shopDomain || undefined,

      });

    } catch (e) {

      toast({ title: (e as Error).message, variant: "destructive" });

    } finally {

      void refetch();

    }

  };



  if (!active) return null;



  return (

    <div className="space-y-4">

      <div className="flex flex-wrap gap-2">

        <Button size="sm" onClick={() => testConnection()} disabled={isFetching}>

          Bağlantıyı Test Et

        </Button>

        <Button

          size="sm"

          variant="secondary"

          disabled={syncDeletedMutation.isPending || !data?.hasAccessToken}

          onClick={() => syncDeletedMutation.mutate()}

          title={!data?.hasAccessToken ? "Önce Shopify OAuth bağlantısı gerekli" : undefined}

        >

          <Trash2 className="w-4 h-4 mr-1" />

          {syncDeletedMutation.isPending ? "Senkronize ediliyor…" : "Silinen Ürünleri Senkronize Et"}

        </Button>

        <Button variant="outline" size="sm" onClick={() => refetch()}>

          <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />

          Health Yenile

        </Button>

        {!data?.hasAccessToken && (

          <Button size="sm" variant="outline" onClick={() => startOAuth()}>

            OAuth ile Bağlan

          </Button>

        )}

      </div>



      <p className="text-sm text-muted-foreground">

        Shopify mağazasından silinen ürünlerin takip kayıtlarını devre dışı bırakır ve bekleyen

        değişiklikleri temizler.

      </p>



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

              {data.hasAccessToken ? "Var (gizli)" : "Yok — OAuth gerekli"}

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

              <span className="text-muted-foreground">Son başarılı istek: </span>

              {data.lastSuccessfulRequestAt

                ? new Date(data.lastSuccessfulRequestAt).toLocaleString("tr-TR")

                : "—"}

            </div>

            <div className="md:col-span-2">

              <span className="text-muted-foreground">Son hata: </span>

              {data.lastErrorMessage ?? "—"}

            </div>

          </CardContent>

        </Card>

      )}

    </div>

  );

}
