import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Globe,
  Loader2,
  Play,
  Save,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

type GatewaySettings = {
  gatewayEnabled: boolean;
  proxyFallbackEnabled: boolean;
  providerType: string;
  providerEndpoint: string | null;
  localAgentEndpoint: string | null;
  apiKeyMasked: string | null;
  proxyUrlMasked: string | null;
  localAgentTokenMasked: string | null;
  hasApiKey: boolean;
  hasProxyUrl: boolean;
  hasLocalAgentToken: boolean;
  providerConfigured: boolean;
  providerEndpointConfigured: boolean;
  apiKeyConfigured: boolean;
  proxyUrlConfigured: boolean;
  localAgentEndpointConfigured: boolean;
  localAgentTokenConfigured: boolean;
  isReadyForCloudScrape: boolean;
  lastTestStatus: "success" | "failed" | "never";
  lastTestAt: string | null;
  lastTestError: string | null;
  lastWorkingProvider: string | null;
  lastTestUrl: string | null;
  lastTestHtmlSize: number | null;
  lastTestTitleFound: boolean | null;
  lastTestPriceFound: boolean | null;
  lastTestImagesFound: number | null;
  lastTestMessage: string | null;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  useProxyForHtml: boolean;
  useProxyForImages: boolean;
  useProxyForApi: boolean;
};

type TestStage = { name: string; status: string; message?: string; durationMs?: number };

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "destructive"} className="gap-1">
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </Badge>
  );
}

export default function KaynakErisimPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [testUrl, setTestUrl] = useState(
    "https://www.trendyol.com/embeauty/ultra-siyah-dolgunlastirici-maskara-hacim-ve-uzunluk-etkili-p-1016742922",
  );
  const [providerApiKey, setProviderApiKey] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [localAgentToken, setLocalAgentToken] = useState("");
  const [lastTestResult, setLastTestResult] = useState<Record<string, unknown> | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["/api/scrape-gateway/settings"],
    queryFn: async () => {
      const r = await fetch("/api/scrape-gateway/settings", { credentials: "include" });
      if (!r.ok) throw new Error("Ayarlar alınamadı");
      return r.json();
    },
  });

  const settings = (raw?.settings ?? raw) as GatewaySettings | undefined;
  const [form, setForm] = useState<Partial<GatewaySettings>>({});
  const merged = { ...settings, ...form } as GatewaySettings;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        gatewayEnabled: merged.gatewayEnabled,
        proxyFallbackEnabled: merged.proxyFallbackEnabled,
        providerType: merged.providerType,
        providerEndpoint: merged.providerEndpoint,
        localAgentEndpoint: merged.localAgentEndpoint,
        timeoutMs: merged.timeoutMs,
        retryCount: merged.retryCount,
        retryDelayMs: merged.retryDelayMs,
        useProxyForHtml: merged.useProxyForHtml,
        useProxyForImages: merged.useProxyForImages,
        useProxyForApi: merged.useProxyForApi,
      };
      if (providerApiKey) body.providerApiKey = providerApiKey;
      if (proxyUrl) body.proxyUrl = proxyUrl;
      if (localAgentToken) body.localAgentToken = localAgentToken;
      const r = await fetch("/api/scrape-gateway/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Kaydedilemedi");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Kaynak erişim ayarları kaydedildi" });
      setProviderApiKey("");
      setProxyUrl("");
      setLocalAgentToken("");
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
      setLastTestResult(data);
      qc.invalidateQueries({ queryKey: ["/api/scrape-gateway/settings"] });
      toast({
        title: data.success ? "Test başarılı" : "Test başarısız",
        description: data.userMessage || data.error,
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

  const directHtmlOk = settings?.lastTestHtmlSize ? settings.lastTestHtmlSize > 5000 : false;
  const imageOk = (settings?.lastTestImagesFound ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
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
              Railway&apos;de Trendyol engeli için proxy, scraping API veya yerel köprü
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Durum Özeti</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Direct HTML</p>
              <StatusBadge ok={directHtmlOk} label={directHtmlOk ? "başarılı" : "başarısız"} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Image Fetcher</p>
              <StatusBadge ok={imageOk} label={imageOk ? "başarılı" : "başarısız"} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Gateway</p>
              <StatusBadge
                ok={Boolean(settings?.providerConfigured)}
                label={settings?.providerConfigured ? "ayarlı" : "ayarsız"}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Proxy</p>
              <StatusBadge
                ok={Boolean(settings?.proxyUrlConfigured)}
                label={settings?.proxyUrlConfigured ? "ayarlı" : "ayarsız"}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Scraping API</p>
              <StatusBadge
                ok={
                  settings?.providerType === "scraping_api" && Boolean(settings?.providerEndpointConfigured && settings?.apiKeyConfigured)
                }
                label={
                  settings?.providerType === "scraping_api" && settings?.providerEndpointConfigured
                    ? "ayarlı"
                    : "ayarsız"
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Cloud hazır</p>
              <StatusBadge
                ok={Boolean(settings?.isReadyForCloudScrape)}
                label={settings?.isReadyForCloudScrape ? "evet" : "hayır"}
              />
            </div>
          </CardContent>
        </Card>

        {settings?.lastTestAt && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Son Test Sonucu
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>URL: {settings.lastTestUrl || "—"}</p>
              <p>
                Durum: {settings.lastTestStatus} — {settings.lastTestMessage}
              </p>
              <p>HTML: {settings.lastTestHtmlSize ?? 0} byte</p>
              <p>
                Başlık: {settings.lastTestTitleFound ? "var" : "yok"} · Fiyat:{" "}
                {settings.lastTestPriceFound ? "var" : "yok"} · Görsel: {settings.lastTestImagesFound ?? 0}
              </p>
              {settings.lastTestError && (
                <p className="text-red-400 text-xs">{settings.lastTestError}</p>
              )}
            </CardContent>
          </Card>
        )}

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
                  <SelectItem value="local_agent">Yerel Köprü (Local Agent)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {merged.providerType === "local_agent" && (
              <div className="rounded-md border border-cyan-800/40 bg-cyan-950/20 p-3 text-xs space-y-2">
                <p className="font-medium text-cyan-300">Yerel Köprü Modu</p>
                <p>
                  Kendi bilgisayarınızda çalışan bir agent, Trendyol&apos;dan veriyi çekip Railway&apos;e iletir.
                  Agent endpoint: POST {"{endpoint}"}/scrape
                </p>
              </div>
            )}

            <div>
              <Label>Endpoint (scraping API)</Label>
              <Input
                placeholder="https://provider.example.com/scrape?api_key={apiKey}&url={url}"
                value={merged.providerEndpoint || ""}
                onChange={(e) => setForm((f) => ({ ...f, providerEndpoint: e.target.value }))}
              />
            </div>
            <div>
              <Label>
                API Key {settings?.hasApiKey && settings?.apiKeyMasked ? `(mevcut: ${settings.apiKeyMasked})` : ""}
              </Label>
              <Input
                type="password"
                value={providerApiKey}
                onChange={(e) => setProviderApiKey(e.target.value)}
                placeholder="Değiştirmek için yazın"
              />
            </div>
            <div>
              <Label>
                Proxy URL {settings?.hasProxyUrl && settings?.proxyUrlMasked ? `(mevcut: ${settings.proxyUrlMasked})` : ""}
              </Label>
              <Input
                type="password"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://user:pass@host:port"
              />
            </div>
            <div>
              <Label>Yerel Agent Endpoint</Label>
              <Input
                placeholder="https://your-tunnel.example.com"
                value={merged.localAgentEndpoint || ""}
                onChange={(e) => setForm((f) => ({ ...f, localAgentEndpoint: e.target.value }))}
              />
            </div>
            <div>
              <Label>
                Yerel Agent Token{" "}
                {settings?.hasLocalAgentToken && settings?.localAgentTokenMasked
                  ? `(mevcut: ${settings.localAgentTokenMasked})`
                  : ""}
              </Label>
              <Input
                type="password"
                value={localAgentToken}
                onChange={(e) => setLocalAgentToken(e.target.value)}
                placeholder="Agent kimlik token"
              />
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
            <CardTitle>Gateway Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Trendyol ürün URL" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />
            <Button onClick={() => testMutation.mutate()} disabled={!testUrl || testMutation.isPending}>
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Test Et
            </Button>
            {lastTestResult?.stages && Array.isArray(lastTestResult.stages) && (
              <ul className="text-xs space-y-1 mt-3">
                {(lastTestResult.stages as TestStage[]).map((s) => (
                  <li key={s.name} className="flex gap-2">
                    <Badge variant={s.status === "success" ? "outline" : "destructive"} className="text-[10px]">
                      {s.status}
                    </Badge>
                    <span>
                      {s.name}: {s.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
