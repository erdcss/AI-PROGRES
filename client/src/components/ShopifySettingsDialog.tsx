import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Settings, CheckCircle, XCircle, Loader2, Key, Image, RefreshCw } from "lucide-react";

interface CredentialsStatus {
  connected: boolean;
  shopDomain?: string;
  apiKey?: string;
  hasToken?: boolean;
  oauthReady?: boolean;
  needsAdminToken?: boolean;
  secretLooksLikeSharedSecret?: boolean;
  bootstrapMessage?: string;
  error?: string;
}

interface LiveTestResult {
  success: boolean;
  message: string;
  store?: string;
}

interface CanvaStatus {
  connected: boolean;
}

interface TokenRefreshStatus {
  connected?: boolean;
  liveConnected?: boolean;
  hasActiveToken?: boolean;
  clientSecretUsableForRefresh?: boolean;
  secretLooksLikeSharedSecret?: boolean;
  shopDomain?: string | null;
  lastError?: string | null;
  envVarsConfigured?: {
    SHOPIFY_CLIENT_ID?: boolean;
    SHOPIFY_CLIENT_SECRET_USABLE?: boolean;
    SHOPIFY_CLIENT_SECRET_IS_SHARED_SECRET?: boolean;
  };
}

export default function ShopifySettingsDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [liveTest, setLiveTest] = useState<LiveTestResult | null>(null);
  const [liveTestLoading, setLiveTestLoading] = useState(false);

  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [canvaConnecting, setCanvaConnecting] = useState(false);
  const [canvaDisconnecting, setCanvaDisconnecting] = useState(false);
  const bootstrapRan = useRef(false);

  const { data: status, isLoading } = useQuery<CredentialsStatus>({
    queryKey: ["/api/shopify/credentials"],
    refetchInterval: open ? 10_000 : 60_000,
    staleTime: 30_000,
  });

  const { data: canvaStatus, refetch: refetchCanva } = useQuery<CanvaStatus>({
    queryKey: ["/api/canva/status"],
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const { data: tokenStatus, refetch: refetchTokenStatus } = useQuery<TokenRefreshStatus>({
    queryKey: ["/api/shopify/token-status"],
    refetchInterval: 45_000,
    staleTime: 20_000,
  });

  async function runLiveTest() {
    setLiveTestLoading(true);
    try {
      const res = await fetch("/api/shopify/status");
      const data: LiveTestResult = await res.json();
      setLiveTest(data);
    } catch {
      setLiveTest({ success: false, message: "Bağlantı testi yapılamadı" });
    } finally {
      setLiveTestLoading(false);
    }
  }

  async function refreshToken(): Promise<void> {
    const res = await fetch("/api/shopify/rotate-token", { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || "Token alınamadı");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canva_success")) {
      toast({ title: "Canva Bağlandı", description: "Görseller Canva'ya yüklenebilir." });
      refetchCanva();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("canva_error")) {
      toast({
        title: "Canva Hatası",
        description: params.get("canva_error") || "Bağlantı başarısız",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("shopify") === "connected") {
      toast({ title: "Shopify Bağlandı", description: "Token kaydedildi." });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/token-status"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (bootstrapRan.current) return;
    bootstrapRan.current = true;
    fetch("/api/shopify/bootstrap", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
        queryClient.invalidateQueries({ queryKey: ["/api/shopify/token-status"] });
        runLiveTest();
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    runLiveTest();
  }, [open]);

  useEffect(() => {
    if (status?.shopDomain) setShopDomain(status.shopDomain);
    if (status?.apiKey) setClientId(status.apiKey);
  }, [status]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const saveRes = await fetch("/api/shopify/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain,
          apiKey: clientId,
          apiSecret: clientSecret,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || "Kimlik bilgileri kaydedilemedi");

      await refreshToken();
      return saveData;
    },
    onSuccess: async () => {
      setClientSecret("");
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/token-status"] });
      await runLiveTest();
      toast({
        title: "Shopify bağlandı",
        description: "24 saatlik access token alındı. Süre dolunca otomatik yenilenir.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Bağlantı başarısız", description: err.message, variant: "destructive" });
    },
  });

  const adminTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/direct-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain, accessToken: adminToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Token kaydedilemedi");
      return data;
    },
    onSuccess: async (data) => {
      setAdminToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/token-status"] });
      setLiveTest({
        success: true,
        message: `${data.storeName || data.shopDomain} bağlandı`,
        store: data.storeName,
      });
      toast({ title: "Shopify bağlandı", description: "Admin token kaydedildi." });
    },
    onError: (err: Error) => {
      toast({ title: "Token hatası", description: err.message, variant: "destructive" });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: refreshToken,
    onSuccess: async () => {
      refetchTokenStatus();
      await runLiveTest();
      toast({ title: "Token yenilendi", description: "Yeni 24 saatlik token alındı." });
    },
    onError: (err: Error) => {
      toast({ title: "Yenileme başarısız", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain: status?.shopDomain || shopDomain }),
      });
      if (!res.ok) throw new Error("Silme başarısız");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
      setClientSecret("");
      setAdminToken("");
      setLiveTest(null);
      toast({ title: "Bağlantı kesildi" });
    },
  });

  async function connectCanva() {
    setCanvaConnecting(true);
    try {
      const res = await fetch("/api/canva/auth");
      const data = await res.json();
      if (!data.url) {
        toast({ title: "Hata", description: data.error || "URL alınamadı", variant: "destructive" });
        setCanvaConnecting(false);
        return;
      }
      window.open(data.url, "canva-auth", "width=620,height=700,left=200,top=100");
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts += 1;
        try {
          const r = await fetch("/api/canva/status");
          const d = await r.json();
          if (d.connected) {
            clearInterval(poll);
            setCanvaConnecting(false);
            refetchCanva();
            toast({ title: "Canva bağlandı" });
          } else if (attempts >= 90) {
            clearInterval(poll);
            setCanvaConnecting(false);
          }
        } catch {
          if (attempts >= 90) {
            clearInterval(poll);
            setCanvaConnecting(false);
          }
        }
      }, 2000);
    } catch {
      toast({ title: "Hata", description: "Canva bağlantısı başlatılamadı", variant: "destructive" });
      setCanvaConnecting(false);
    }
  }

  async function disconnectCanva() {
    setCanvaDisconnecting(true);
    try {
      await fetch("/api/canva/disconnect", { method: "POST" });
      refetchCanva();
      toast({ title: "Canva bağlantısı kesildi" });
    } catch {
      toast({ title: "Hata", description: "Bağlantı kesilemedi", variant: "destructive" });
    } finally {
      setCanvaDisconnecting(false);
    }
  }

  const connected =
    liveTest?.success === true ||
    tokenStatus?.connected === true ||
    tokenStatus?.liveConnected === true;
  const canvaConnected = canvaStatus?.connected === true;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Shopify
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : connected ? (
            <Badge className="!bg-emerald-600 !text-white border-transparent text-[10px] px-1.5 py-0">
              Bağlı
            </Badge>
          ) : (
            <Badge className="!bg-red-700 !text-white border-transparent text-[10px] px-1.5 py-0">
              Bağlı Değil
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" aria-describedby="shopify-dialog-desc">
        <DialogHeader>
          <DialogTitle>Bağlantı Ayarları</DialogTitle>
        </DialogHeader>
        <p id="shopify-dialog-desc" className="sr-only">
          Shopify ve Canva bağlantı ayarları
        </p>

        <Tabs defaultValue="shopify">
          <TabsList className="w-full">
            <TabsTrigger value="shopify" className="flex-1">
              Shopify
            </TabsTrigger>
            <TabsTrigger value="canva" className="flex-1">
              Canva
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shopify" className="mt-3 space-y-4">
            <div
              className={`flex items-start gap-2 rounded-lg border p-3 ${
                connected
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                  : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
              }`}
            >
              {liveTestLoading ? (
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
              ) : connected ? (
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {liveTestLoading
                    ? "Kontrol ediliyor..."
                    : connected
                      ? "Shopify bağlı"
                      : "Shopify bağlı değil"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {connected
                    ? liveTest?.store || status?.shopDomain || shopDomain
                    : liveTest?.message ||
                      "Mağaza + Client ID + Client Secret ile 24 saatlik token alınır."}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="shop-domain">Mağaza</Label>
                <Input
                  id="shop-domain"
                  placeholder="magaza.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="client-id">Client ID</Label>
                <Input
                  id="client-id"
                  placeholder="Dev Dashboard Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="client-secret">Client Secret</Label>
                <Input
                  id="client-secret"
                  type="password"
                  placeholder="shpss_... veya shpsec_..."
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Postman ile aynı: client_id + client_secret + grant_type=client_credentials → ~24s token.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => connectMutation.mutate()}
                disabled={
                  !shopDomain ||
                  !clientId ||
                  !clientSecret ||
                  connectMutation.isPending
                }
              >
                {connectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Key className="mr-2 h-4 w-4" />
                )}
                Kaydet ve Bağlan
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => rotateMutation.mutate()}
                disabled={rotateMutation.isPending}
              >
                {rotateMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                Token Yenile
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={runLiveTest}
                disabled={liveTestLoading}
              >
                {liveTestLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Test Et
              </Button>
            </div>

            <div className="border-t pt-2">
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Gelişmiş seçenekleri gizle" : "Gelişmiş: kalıcı Admin Token"}
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-2">
                  <Input
                    type="password"
                    placeholder="shpat_..."
                    value={adminToken}
                    onChange={(e) => setAdminToken(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    className="w-full"
                    size="sm"
                    onClick={() => adminTokenMutation.mutate()}
                    disabled={!shopDomain || !adminToken || adminTokenMutation.isPending}
                  >
                    {adminTokenMutation.isPending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : null}
                    Admin Token Kaydet
                  </Button>
                  {(status?.shopDomain || shopDomain) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-red-600"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                    >
                      Bağlantıyı Kes
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="canva" className="mt-3 space-y-4">
            <div
              className={`flex items-center gap-2 rounded-lg border p-3 ${
                canvaConnected
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                  : "bg-muted"
              }`}
            >
              {canvaConnected ? (
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {canvaConnected ? "Canva bağlı" : "Canva bağlı değil"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {canvaConnected
                    ? "Ürün görselleri Canva’ya yüklenebilir"
                    : "Bağlandıktan sonra görseller otomatik gider"}
                </p>
              </div>
            </div>
            {!canvaConnected ? (
              <Button
                className="w-full gap-2 bg-[#7D2AE8] text-white hover:bg-[#6a1fd4]"
                onClick={connectCanva}
                disabled={canvaConnecting}
              >
                {canvaConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Image className="h-4 w-4" />
                )}
                Canva ile Bağlan
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full text-red-600"
                onClick={disconnectCanva}
                disabled={canvaDisconnecting}
              >
                {canvaDisconnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Canva Bağlantısını Kes
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
