import { useState, useEffect } from "react";
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
import { Settings, CheckCircle, XCircle, ExternalLink, Loader2, Key, AlertTriangle, Image } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CredentialsStatus {
  connected: boolean;
  shopDomain?: string;
  apiKey?: string;
  hasToken?: boolean;
  tokenInvalid?: boolean;
  updatedAt?: string;
  source?: string;
}

interface LiveTestResult {
  success: boolean;
  message: string;
  store?: string;
}

interface CanvaStatus {
  connected: boolean;
}

export default function ShopifySettingsDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [liveTest, setLiveTest] = useState<LiveTestResult | null>(null);
  const [liveTestLoading, setLiveTestLoading] = useState(false);

  // OAuth tab
  const [shopDomain, setShopDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  // Direct token tab
  const [directDomain, setDirectDomain] = useState("");
  const [directToken, setDirectToken] = useState("");

  // Canva connect loading
  const [canvaConnecting, setCanvaConnecting] = useState(false);
  const [canvaDisconnecting, setCanvaDisconnecting] = useState(false);

  const { data: status, isLoading } = useQuery<CredentialsStatus>({
    queryKey: ["/api/shopify/credentials"],
    refetchInterval: open ? 8000 : false,
  });

  const { data: canvaStatus, refetch: refetchCanva } = useQuery<CanvaStatus>({
    queryKey: ["/api/canva/status"],
    refetchInterval: open ? 5000 : false,
  });

  // Check for canva_success or canva_error in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canva_success")) {
      toast({ title: "Canva Bağlandı ✅", description: "Ürün görselleri artık Canva'ya otomatik yüklenecek." });
      refetchCanva();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("canva_error")) {
      toast({ title: "Canva Hatası ❌", description: params.get("canva_error") || "Bağlantı başarısız", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Auto-test connection when dialog opens
  useEffect(() => {
    if (open && status?.hasToken) {
      runLiveTest();
    }
    if (!open) {
      setLiveTest(null);
    }
  }, [open]);

  useEffect(() => {
    if (status?.shopDomain) {
      setShopDomain(status.shopDomain);
      setDirectDomain(status.shopDomain);
    }
    if (status?.apiKey) setApiKey(status.apiKey);
  }, [status]);

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

  async function connectCanva() {
    setCanvaConnecting(true);
    try {
      const res = await fetch("/api/canva/auth");
      const data = await res.json();
      if (data.url) {
        // Open in a popup window — Canva refuses to load inside iframes
        window.open(data.url, "canva-auth", "width=620,height=700,left=200,top=100");
        toast({
          title: "Canva yetkilendirme açıldı",
          description: "Açılan pencerede Canva'ya giriş yapıp izin verin.",
        });
        // Poll every 2s for up to 3 minutes until connected
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const r = await fetch("/api/canva/status");
            const d = await r.json();
            if (d.connected) {
              clearInterval(poll);
              setCanvaConnecting(false);
              refetchCanva();
              toast({ title: "Canva Bağlandı ✅", description: "Ürün görselleri artık Canva'ya otomatik yüklenecek." });
            } else if (attempts >= 90) {
              clearInterval(poll);
              setCanvaConnecting(false);
            }
          } catch {
            if (attempts >= 90) { clearInterval(poll); setCanvaConnecting(false); }
          }
        }, 2000);
      } else {
        toast({ title: "Hata", description: data.error || "Yetkilendirme URL'si alınamadı", variant: "destructive" });
        setCanvaConnecting(false);
      }
    } catch (e) {
      toast({ title: "Hata", description: "Canva bağlantısı başlatılamadı", variant: "destructive" });
      setCanvaConnecting(false);
    }
  }

  async function disconnectCanva() {
    setCanvaDisconnecting(true);
    try {
      await fetch("/api/canva/disconnect", { method: "POST" });
      refetchCanva();
      toast({ title: "Canva bağlantısı kesildi", description: "Artık görseller Canva'ya yüklenmeyecek." });
    } catch {
      toast({ title: "Hata", description: "Bağlantı kesilemedi", variant: "destructive" });
    } finally {
      setCanvaDisconnecting(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain, apiKey, apiSecret }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Kayıt başarısız");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
      toast({ title: "Kaydedildi", description: "Kimlik bilgileri kaydedildi. Şimdi Shopify'a bağlanın." });
    },
    onError: (err: Error) => {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    },
  });

  const directTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/direct-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain: directDomain, accessToken: directToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Token kaydedilemedi");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
      setDirectToken("");
      setLiveTest({ success: true, message: `${data.storeName || data.shopDomain} mağazasına bağlanıldı.`, store: data.storeName });
      toast({
        title: "Bağlantı Başarılı ✅",
        description: `${data.storeName || data.shopDomain} mağazasına bağlanıldı.`
      });
    },
    onError: (err: Error) => {
      setLiveTest({ success: false, message: err.message });
      toast({ title: "Token Hatası ❌", description: err.message, variant: "destructive" });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/auth-url");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "URL alınamadı");
      }
      return res.json() as Promise<{ authUrl: string }>;
    },
    onSuccess: (data) => {
      window.open(data.authUrl, "_blank");
      toast({
        title: "Shopify Yetkilendirme",
        description: "Açılan pencerede Shopify'a giriş yaparak uygulamayı onaylayın.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain: status?.shopDomain }),
      });
      if (!res.ok) throw new Error("Silme başarısız");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials"] });
      setShopDomain(""); setApiKey(""); setApiSecret(""); setDirectToken("");
      setLiveTest(null);
      toast({ title: "Bağlantı kesildi", description: "Shopify kimlik bilgileri silindi." });
    },
  });

  const isActuallyConnected = liveTest?.success === true;
  const isActuallyFailed = liveTest?.success === false;
  const hasCredentials = status?.hasToken;

  const badgeStatus = liveTest
    ? (liveTest.success ? "connected" : "failed")
    : (hasCredentials ? "unknown" : "none");

  const canvaConnected = canvaStatus?.connected === true;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Shopify Bağlantısı
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : badgeStatus === "connected" ? (
            <Badge className="bg-green-500 text-white text-xs px-1 py-0">Bağlı</Badge>
          ) : badgeStatus === "failed" ? (
            <Badge className="bg-red-500 text-white text-xs px-1 py-0">Hata</Badge>
          ) : badgeStatus === "unknown" ? (
            <Badge className="bg-orange-500 text-white text-xs px-1 py-0">Kontrol Et</Badge>
          ) : (
            <Badge variant="destructive" className="text-xs px-1 py-0">Bağlı Değil</Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" aria-describedby="shopify-dialog-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Bağlantı Ayarları
          </DialogTitle>
        </DialogHeader>
        <p id="shopify-dialog-desc" className="sr-only">Shopify ve Canva bağlantı ayarları</p>

        <Tabs defaultValue="shopify">
          <TabsList className="w-full">
            <TabsTrigger value="shopify" className="flex-1">
              Shopify
              {badgeStatus === "connected" && <span className="ml-1 w-2 h-2 rounded-full bg-green-500 inline-block" />}
              {badgeStatus === "failed" && <span className="ml-1 w-2 h-2 rounded-full bg-red-500 inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="canva" className="flex-1">
              <Image className="h-3 w-3 mr-1" />
              Canva
              {canvaConnected && <span className="ml-1 w-2 h-2 rounded-full bg-green-500 inline-block" />}
            </TabsTrigger>
          </TabsList>

          {/* ── Shopify Tab ── */}
          <TabsContent value="shopify" className="space-y-4 mt-3">
            {/* Canlı Bağlantı Durumu */}
            <div className={`flex items-center gap-2 p-3 rounded-lg border ${
              liveTestLoading ? 'bg-muted border-muted-foreground/20' :
              isActuallyConnected ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' :
              isActuallyFailed ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' :
              'bg-muted border-muted-foreground/20'
            }`}>
              {liveTestLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Bağlantı test ediliyor...</p>
                    <p className="text-xs text-muted-foreground">{status?.shopDomain}</p>
                  </div>
                </>
              ) : isActuallyConnected ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Shopify'a Bağlı ✅</p>
                    <p className="text-xs text-muted-foreground">{liveTest?.store || status?.shopDomain}</p>
                  </div>
                </>
              ) : isActuallyFailed ? (
                <>
                  <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Bağlantı Başarısız ❌</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{liveTest?.message}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                      {hasCredentials ? "Token mevcut — bağlantı henüz test edilmedi" : "Token yok"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hasCredentials ? status?.shopDomain : "Admin Token sekmesinden token girin"}
                    </p>
                  </div>
                </>
              )}
            </div>

            {isActuallyFailed && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-1">Yeni token nasıl alınır?</p>
                <ol className="list-decimal list-inside space-y-0.5 text-amber-700 dark:text-amber-300">
                  <li>Shopify Admin'e giriş yapın</li>
                  <li>Uygulamalar → Uygulamaları ve satış kanallarını geliştirin</li>
                  <li>Uygulama oluştur → Özel uygulama</li>
                  <li>Admin API erişimini yapılandır → Kaydet</li>
                  <li>"Admin API erişim token'ı" kopyalayın (<code>shpat_...</code>)</li>
                </ol>
              </div>
            )}

            <Tabs defaultValue="direct">
              <TabsList className="w-full">
                <TabsTrigger value="direct" className="flex-1">
                  <Key className="h-3 w-3 mr-1" />
                  Admin Token
                </TabsTrigger>
                <TabsTrigger value="oauth" className="flex-1">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  OAuth
                </TabsTrigger>
              </TabsList>

              <TabsContent value="direct" className="space-y-3 mt-3">
                <p className="text-xs text-muted-foreground">
                  Shopify Admin'de özel uygulama oluşturup aldığınız <code className="bg-muted px-1 rounded">shpat_...</code> token'ı buraya yapıştırın.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="directDomain">Mağaza Adresi</Label>
                  <Input
                    id="directDomain"
                    placeholder="mağazanız.myshopify.com"
                    value={directDomain}
                    onChange={(e) => setDirectDomain(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="directToken">Admin API Access Token</Label>
                  <Input
                    id="directToken"
                    type="password"
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                    value={directToken}
                    onChange={(e) => setDirectToken(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => directTokenMutation.mutate()}
                  disabled={!directDomain || !directToken || directTokenMutation.isPending}
                >
                  {directTokenMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <Key className="h-4 w-4 mr-2" />}
                  Token'ı Doğrula ve Kaydet
                </Button>
              </TabsContent>

              <TabsContent value="oauth" className="space-y-3 mt-3">
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Adım 1 — Kimlik bilgilerini girin</p>
                  <div className="space-y-1">
                    <Label htmlFor="shopDomain">Mağaza Adresi</Label>
                    <Input
                      id="shopDomain"
                      placeholder="mağazanız.myshopify.com"
                      value={shopDomain}
                      onChange={(e) => setShopDomain(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="apiKey">İstemci Kimliği (Client ID)</Label>
                    <Input
                      id="apiKey"
                      placeholder="API Key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="apiSecret">Gizli Anahtar (Client Secret)</Label>
                    <Input
                      id="apiSecret"
                      type="password"
                      placeholder="API Secret..."
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => saveMutation.mutate()}
                    disabled={!shopDomain || !apiKey || !apiSecret || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Kaydet
                  </Button>
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-sm font-semibold">Adım 2 — Shopify'da yetkilendir</p>
                  <Button
                    variant="secondary"
                    className="w-full gap-2"
                    onClick={() => connectMutation.mutate()}
                    disabled={!status?.shopDomain || connectMutation.isPending}
                  >
                    {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Shopify'da Yetkilendir
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 pt-1 border-t">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={runLiveTest}
                disabled={liveTestLoading}
              >
                {liveTestLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Bağlantıyı Test Et
              </Button>
              {status?.shopDomain && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  Bağlantıyı Kes
                </Button>
              )}
            </div>
          </TabsContent>

          {/* ── Canva Tab ── */}
          <TabsContent value="canva" className="space-y-4 mt-3">
            {/* Canva bağlantı durumu */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              canvaConnected
                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                : 'bg-muted border-muted-foreground/20'
            }`}>
              {canvaConnected ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Canva'ya Bağlı ✅</p>
                    <p className="text-xs text-muted-foreground">Ürün görselleri otomatik yükleniyor</p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Canva Bağlı Değil</p>
                    <p className="text-xs text-muted-foreground">Bağlandıktan sonra aktarılan ürün görselleri Canva'ya yüklenecek</p>
                  </div>
                </>
              )}
            </div>

            {!canvaConnected ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-semibold">Canva nasıl bağlanır?</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-700 dark:text-blue-300">
                    <li>"Canva ile Bağlan" butonuna tıklayın</li>
                    <li>Canva hesabınıza giriş yapın</li>
                    <li>İzin isteğini onaylayın</li>
                    <li>Otomatik olarak geri döneceksiniz</li>
                  </ol>
                </div>
                <Button
                  className="w-full gap-2 bg-[#7D2AE8] hover:bg-[#6a1fd4] text-white"
                  onClick={connectCanva}
                  disabled={canvaConnecting}
                >
                  {canvaConnecting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Image className="h-4 w-4" />}
                  Canva ile Bağlan
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Bundan sonra Shopify'a aktardığınız her ürünün görselleri otomatik olarak Canva'daki <strong>Yüklemeler</strong> bölümünüze eklenecek.
                </p>
                <Button
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                  onClick={disconnectCanva}
                  disabled={canvaDisconnecting}
                >
                  {canvaDisconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Canva Bağlantısını Kes
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
