import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Globe, Loader2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type GatewaySettings = {
  gatewayEnabled: boolean;
  proxyFallbackEnabled: boolean;
  providerType: string;
  providerEndpoint: string | null;
  providerApiKeyMasked: string | null;
  proxyUrlMasked: string | null;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  useProxyForHtml: boolean;
  useProxyForImages: boolean;
  useProxyForApi: boolean;
  lastTestAt: string | null;
  lastTestSuccess: boolean | null;
  lastTestMessage: string | null;
};

export default function KaynakErisimPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [testUrl, setTestUrl] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");

  const { data: settings, isLoading } = useQuery<GatewaySettings>({
    queryKey: ["/api/scrape-gateway/settings"],
    queryFn: async () => {
      const r = await fetch("/api/scrape-gateway/settings", { credentials: "include" });
      if (!r.ok) throw new Error("Ayarlar alınamadı");
      return r.json();
    },
  });

  const [form, setForm] = useState<Partial<GatewaySettings>>({});

  const merged = { ...settings, ...form } as GatewaySettings;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        gatewayEnabled: merged.gatewayEnabled,
        proxyFallbackEnabled: merged.proxyFallbackEnabled,
        providerType: merged.providerType,
        providerEndpoint: merged.providerEndpoint,
        timeoutMs: merged.timeoutMs,
        retryCount: merged.retryCount,
        retryDelayMs: merged.retryDelayMs,
        useProxyForHtml: merged.useProxyForHtml,
        useProxyForImages: merged.useProxyForImages,
        useProxyForApi: merged.useProxyForApi,
      };
      if (providerApiKey) body.providerApiKey = providerApiKey;
      if (proxyUrl) body.proxyUrl = proxyUrl;
      const r = await fetch("/api/scrape-gateway/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Kaydedilemedi");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Kaynak erişim ayarları kaydedildi" });
      setProviderApiKey("");
      setProxyUrl("");
      qc.invalidateQueries({ queryKey: ["/api/scrape-gateway/settings"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/scrape-gateway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: testUrl }),
      });
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/scrape-gateway/settings"] });
      toast({
        title: data.success ? "Test başarılı" : "Test başarısız",
        description: data.error || `HTML: ${data.htmlReceived}, fiyat: ${data.priceFound}`,
        variant: data.success ? "default" : "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/scraper")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Globe className="w-6 h-6 text-cyan-400" />
              Kaynak Erişim / Proxy
            </h1>
            <p className="text-sm text-muted-foreground">
              Railway&apos;de Trendyol engeli için proxy veya harici scraping sağlayıcı
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ayarlar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Gateway açık</Label>
              <Switch
                checked={merged.gatewayEnabled ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, gatewayEnabled: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Proxy fallback</Label>
              <Switch
                checked={merged.proxyFallbackEnabled ?? false}
                onCheckedChange={(v) => setForm((f) => ({ ...f, proxyFallbackEnabled: v }))}
              />
            </div>
            <div>
              <Label>Sağlayıcı tipi</Label>
              <Select
                value={merged.providerType || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, providerType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Yok</SelectItem>
                  <SelectItem value="generic_proxy">Generic Proxy</SelectItem>
                  <SelectItem value="scraping_api">Scraping API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Endpoint (scraping API)</Label>
              <Input
                placeholder="https://provider.example.com/scrape?api_key={apiKey}&url={url}"
                value={merged.providerEndpoint || ""}
                onChange={(e) => setForm((f) => ({ ...f, providerEndpoint: e.target.value }))}
              />
            </div>
            <div>
              <Label>API Key {settings?.providerApiKeyMasked && `(mevcut: ${settings.providerApiKeyMasked})`}</Label>
              <Input type="password" value={providerApiKey} onChange={(e) => setProviderApiKey(e.target.value)} placeholder="Değiştirmek için yazın" />
            </div>
            <div>
              <Label>Proxy URL {settings?.proxyUrlMasked && `(mevcut: ${settings.proxyUrlMasked})`}</Label>
              <Input type="password" value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="http://user:pass@host:port" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Timeout (ms)</Label>
                <Input
                  type="number"
                  value={merged.timeoutMs ?? 20000}
                  onChange={(e) => setForm((f) => ({ ...f, timeoutMs: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Retry</Label>
                <Input
                  type="number"
                  value={merged.retryCount ?? 2}
                  onChange={(e) => setForm((f) => ({ ...f, retryCount: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Retry gecikme</Label>
                <Input
                  type="number"
                  value={merged.retryDelayMs ?? 1500}
                  onChange={(e) => setForm((f) => ({ ...f, retryDelayMs: Number(e.target.value) }))}
                />
              </div>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              Kaydet
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Trendyol ürün URL" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />
            <Button onClick={() => testMutation.mutate()} disabled={!testUrl || testMutation.isPending}>
              {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Test Et
            </Button>
            {settings?.lastTestAt && (
              <p className="text-xs text-muted-foreground">
                Son test: {new Date(settings.lastTestAt).toLocaleString("tr-TR")} —{" "}
                {settings.lastTestSuccess ? "başarılı" : "başarısız"} — {settings.lastTestMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
