import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";
import { queryKeys } from "../query-keys";

type TrackingSettings = {
  trackingEnabled: boolean;
  schedulerEnabled: boolean;
  autoShopifySyncEnabled: boolean;
  checkIntervalMinutes: number;
  batchSize: number;
  requestDelayMs: number;
  maxErrorsBeforePause: number;
};

type SchedulerStatus = {
  nextRunAt: string | null;
  safeSchedulerRunning: boolean;
  lastRunAt: string | null;
};

async function fetchSettings() {
  const res = await fetch("/api/tracking/settings", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ayarlar yüklenemedi");
  return data.settings as TrackingSettings;
}

async function fetchSchedulerStatus() {
  const res = await fetch("/api/tracking/scheduler-status", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Durum alınamadı");
  return data as SchedulerStatus;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-TR");
}

export function SettingsTab({ active }: { active: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [settingsForm, setSettingsForm] = useState<Partial<TrackingSettings>>({});

  const settingsQuery = useQuery({
    queryKey: ["tracking-settings"],
    queryFn: fetchSettings,
    enabled: active,
  });

  const statusQuery = useQuery({
    queryKey: ["tracking-scheduler-status"],
    queryFn: fetchSchedulerStatus,
    enabled: active,
    refetchInterval: active ? 30_000 : false,
  });

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<TrackingSettings>) => {
      const res = await fetch("/api/tracking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi");
      return data.settings as TrackingSettings;
    },
    onSuccess: () => {
      toast({ title: "Ayarlar kaydedildi" });
      setSettingsForm({});
      void qc.invalidateQueries({ queryKey: ["tracking-settings"] });
      void qc.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
      void qc.invalidateQueries({ queryKey: queryKeys.all });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const settings = { ...settingsQuery.data, ...settingsForm } as TrackingSettings | undefined;
  const st = statusQuery.data;

  if (!active) return null;
  if (settingsQuery.isLoading) return <p className="text-muted-foreground">Ayarlar yükleniyor…</p>;
  if (settingsQuery.error) return <p className="text-destructive">{(settingsQuery.error as Error).message}</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Takip ve Scheduler Ayarları</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div className="flex items-center justify-between">
          <Label>Takip sistemi açık</Label>
          <Switch
            checked={settings?.trackingEnabled ?? true}
            onCheckedChange={(v) => setSettingsForm((f) => ({ ...f, trackingEnabled: v }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label>Otomatik kontrol (scheduler)</Label>
          <Switch
            checked={settings?.schedulerEnabled ?? true}
            onCheckedChange={(v) => setSettingsForm((f) => ({ ...f, schedulerEnabled: v }))}
          />
        </div>
        <div className="flex items-center justify-between opacity-60">
          <div>
            <Label>Otomatik Shopify güncelleme</Label>
            <p className="text-xs text-muted-foreground">Değişiklikler onay sonrası uygulanır</p>
          </div>
          <Switch checked={false} disabled />
        </div>
        <div>
          <Label>Kontrol aralığı (dakika)</Label>
          <Input
            type="number"
            min={5}
            value={settings?.checkIntervalMinutes ?? 60}
            onChange={(e) =>
              setSettingsForm((f) => ({ ...f, checkIntervalMinutes: Number(e.target.value) }))
            }
          />
        </div>
        <div>
          <Label>Batch size (döngü başına ürün)</Label>
          <Input
            type="number"
            min={1}
            value={settings?.batchSize ?? 5}
            onChange={(e) => setSettingsForm((f) => ({ ...f, batchSize: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>İstek bekleme (ms)</Label>
          <Input
            type="number"
            min={0}
            value={settings?.requestDelayMs ?? 1500}
            onChange={(e) =>
              setSettingsForm((f) => ({ ...f, requestDelayMs: Number(e.target.value) }))
            }
          />
        </div>
        <div>
          <Label>Max hata sonrası duraklat</Label>
          <Input
            type="number"
            min={1}
            value={settings?.maxErrorsBeforePause ?? 5}
            onChange={(e) =>
              setSettingsForm((f) => ({ ...f, maxErrorsBeforePause: Number(e.target.value) }))
            }
          />
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            Scheduler: {st?.safeSchedulerRunning ? "çalışıyor" : "durdu"}
          </div>
          <div>Son çalışma: {formatDate(st?.lastRunAt ?? null)}</div>
          <div>Sonraki çalışma: {formatDate(st?.nextRunAt ?? null)}</div>
        </div>
        <Button
          onClick={() => saveMutation.mutate(settingsForm)}
          disabled={saveMutation.isPending || Object.keys(settingsForm).length === 0}
        >
          Kaydet
        </Button>
      </CardContent>
    </Card>
  );
}
