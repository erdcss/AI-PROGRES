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
import { Settings, CheckCircle, XCircle, ExternalLink, Loader2, Key } from "lucide-react";

interface CredentialsStatus {
  connected: boolean;
  shopDomain?: string;
  apiKey?: string;
  hasToken?: boolean;
  updatedAt?: string;
  source?: string;
}

export default function ShopifySettingsDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // OAuth tab
  const [shopDomain, setShopDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  // Direct token tab
  const [directDomain, setDirectDomain] = useState("");
  const [directToken, setDirectToken] = useState("");

  const { data: status, isLoading } = useQuery<CredentialsStatus>({
    queryKey: ["/api/shopify/credentials"],
    refetchInterval: open ? 5000 : false,
  });

  useEffect(() => {
    if (status?.shopDomain) {
      setShopDomain(status.shopDomain);
      setDirectDomain(status.shopDomain);
    }
    if (status?.apiKey) setApiKey(status.apiKey);
  }, [status]);

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
      toast({
        title: "Bağlantı Başarılı ✅",
        description: `${data.storeName || data.shopDomain} mağazasına bağlanıldı.`
      });
    },
    onError: (err: Error) => {
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

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/status");
      return res.json() as Promise<{ success: boolean; message: string; store?: string }>;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Bağlantı Başarılı ✅", description: data.message });
      } else {
        toast({ title: "Bağlantı Hatası ❌", description: data.message, variant: "destructive" });
      }
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
      toast({ title: "Bağlantı kesildi", description: "Shopify kimlik bilgileri silindi." });
    },
  });

  const isConnected = status?.connected && status?.hasToken;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Shopify Bağlantısı
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isConnected ? (
            <Badge className="bg-green-500 text-white text-xs px-1 py-0">Bağlı</Badge>
          ) : (
            <Badge variant="destructive" className="text-xs px-1 py-0">Bağlı Değil</Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Shopify API Bağlantısı
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bağlantı Durumu */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
            {isConnected ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Shopify'a Bağlı</p>
                  <p className="text-xs text-muted-foreground">{status?.shopDomain}</p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Bağlantı Yok</p>
                  <p className="text-xs text-muted-foreground">
                    Aşağıdan bağlanma yöntemini seçin
                  </p>
                </div>
              </>
            )}
          </div>

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

            {/* Doğrudan Token Sekmesi */}
            <TabsContent value="direct" className="space-y-3 mt-3">
              <p className="text-xs text-muted-foreground">
                Shopify Admin → Uygulamalar → Özel Uygulamalar'dan oluşturduğunuz Admin API access token'ı girin.
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
                {directTokenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
                Token'ı Doğrula ve Kaydet
              </Button>
            </TabsContent>

            {/* OAuth Sekmesi */}
            <TabsContent value="oauth" className="space-y-3 mt-3">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Adım 1 — Kimlik bilgilerini girin</p>

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
                <p className="text-sm font-semibold text-foreground">Adım 2 — Shopify'da yetkilendir</p>
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

          {/* Test & Sil */}
          <div className="flex gap-2 pt-1 border-t">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
