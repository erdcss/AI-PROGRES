import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plug } from "lucide-react";

type Connection = {
  id: number;
  name: string;
  apiBaseUrl: string;
  environment: string;
  status: string;
  statusLabel: string;
  tokenMasked: string;
  missingScopes: string[];
  lastError: string | null;
};

export default function MarktGoSettingsDialog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("MARKT-GO");
  const [apiBaseUrl, setApiBaseUrl] = useState("https://api.turmarkt.com/api/v1/external");
  const [accessToken, setAccessToken] = useState("");
  const [environment, setEnvironment] = useState("production");

  const { data, isLoading, isFetching } = useQuery<{ connections: Connection[] }>({
    queryKey: ["/api/marktgo/connections"],
    queryFn: async () => {
      const res = await fetch("/api/marktgo/connections", { cache: "no-store" });
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval: open ? 15_000 : 30_000,
  });

  const active = data?.connections?.[0];
  const connected =
    active?.status === "connected" || active?.status === "connected_limited";
  const triggerLabel = connected
    ? `MARKT-GO · ${active?.statusLabel || "Bağlı"}`
    : isLoading || isFetching
      ? "MARKT-GO · …"
      : "MARKT-GO · Bağlan";

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/marktgo/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: active?.id,
          name,
          apiBaseUrl,
          accessToken: accessToken || undefined,
          environment,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Kayıt başarısız");
      return json.connection as Connection;
    },
    onSuccess: (conn) => {
      qc.invalidateQueries({ queryKey: ["/api/marktgo/connections"] });
      qc.invalidateQueries({ queryKey: ["/api/marktgo/health"] });
      qc.invalidateQueries({ queryKey: ["connection-access"] });
      setAccessToken("");
      toast({
        title: conn.statusLabel || "MARKT-GO",
        description: conn.missingScopes?.length
          ? `Eksik: ${conn.missingScopes.join(", ")}`
          : "Bağlantı kaydedildi",
      });
    },
    onError: (err: Error) => {
      toast({ title: "MARKT-GO hatası", description: err.message, variant: "destructive" });
    },
  });

  const test = useMutation({
    mutationFn: async () => {
      if (!active?.id) throw new Error("Önce bağlantı kaydedin");
      const res = await fetch(`/api/marktgo/connections/${active.id}/test`, { method: "POST" });
      const json = await res.json();
      if (!json.success && !json.connection) throw new Error(json.error || "Test başarısız");
      return json.connection as Connection;
    },
    onSuccess: (conn) => {
      qc.invalidateQueries({ queryKey: ["/api/marktgo/connections"] });
      toast({ title: conn.statusLabel, description: conn.lastError || "Health check tamam" });
    },
    onError: (err: Error) => {
      toast({ title: "MARKT-GO test", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`bg-zinc-800/40 border-zinc-700/60 text-zinc-300 hover:text-white px-3 py-2 max-w-[220px] ${
            connected ? "border-emerald-700/60 text-emerald-300" : ""
          }`}
        >
          <Plug className="w-4 h-4 mr-2 shrink-0" />
          <span className="truncate text-xs sm:text-sm">{triggerLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-neutral-100 max-w-lg">
        <DialogHeader>
          <DialogTitle>MARKT-GO Bağlantısı</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-xs font-bold tracking-wide">
            MG
          </div>
          <div>
            <p className="text-sm font-semibold">Provider: marktgo</p>
            <p className="text-xs text-neutral-500">Shopify Admin API kullanılmaz</p>
          </div>
        </div>
        {isLoading ? (
          <p className="text-sm text-neutral-500">Yükleniyor…</p>
        ) : (
          <p className="text-sm text-neutral-400">
            Durum: {active?.statusLabel || "Bağlı değil"}
            {active?.tokenMasked ? ` · ${active.tokenMasked}` : ""}
          </p>
        )}
        {active?.missingScopes?.length ? (
          <p className="text-xs text-amber-400">Eksik: {active.missingScopes.join(", ")}</p>
        ) : null}
        {active?.lastError ? (
          <p className="text-xs text-red-400">{active.lastError}</p>
        ) : null}

        <div className="space-y-3 mt-2">
          <div>
            <Label>Bağlantı adı</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-neutral-900 border-neutral-700"
            />
          </div>
          <div>
            <Label>API Base URL</Label>
            <Input
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://host/api/v1/external"
              className="bg-neutral-900 border-neutral-700"
            />
          </div>
          <div>
            <Label>Access Token</Label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={active?.tokenMasked || "mgt_live_…"}
              className="bg-neutral-900 border-neutral-700"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Environment</Label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm"
            >
              <option value="production">production</option>
              <option value="test">test</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Kaydet ve test et
            </Button>
            <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              Health
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
