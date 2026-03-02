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
import { useToast } from "@/hooks/use-toast";
import { Settings, CheckCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";

interface CredentialsStatus {
  connected: boolean;
  shopDomain?: string;
  apiKey?: string;
  hasToken?: boolean;
  updatedAt?: string;
}

export default function ShopifySettingsDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  const { data: status, isLoading } = useQuery<CredentialsStatus>({
    queryKey: ["/api/shopify/credentials"],
    refetchInterval: open ? 5000 : false,
  });

  useEffect(() => {
    if (status?.shopDomain) setShopDomain(status.shopDomain);
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
      setShopDomain(""); setApiKey(""); setApiSecret("");
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
          {/* Durum */}
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
                    {status?.shopDomain ? "Token alınmamış - adım 2'yi tamamlayın" : "Kimlik bilgisi girilmemiş"}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Adım 1 */}
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

          {/* Adım 2 */}
          <div className="space-y-2 pt-2 border-t">
            <p className="text-sm font-semibold text-foreground">Adım 2 — Shopify'da yetkilendir</p>
            <p className="text-xs text-muted-foreground">
              Aşağıdaki butona tıklayarak Shopify'a yönlendirileceksiniz. Onayladıktan sonra otomatik olarak bağlanacaksınız.
            </p>
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
